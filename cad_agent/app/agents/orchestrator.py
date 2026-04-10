"""Orchestrator agent - main state machine loop."""

from __future__ import annotations

import time
from typing import TYPE_CHECKING, Optional

import structlog

from cad_agent.app.llm.geometry_intent import infer_geometry_intent
from cad_agent.app.llm.object_model import enrich_object_model_from_spec
from cad_agent.app.llm.pipeline_utils import has_resolved_part_family
from cad_agent.app.models.agent_result import AgentResult, AgentRole
from cad_agent.app.models.case import Case
from cad_agent.app.models.design_job import DesignJob, JobState, ParameterSchema
from cad_agent.app.rules.retry_policy import RetryPolicy

if TYPE_CHECKING:
    from cad_agent.app.services.case_memory import CaseMemoryService
    from cad_agent.app.agents.research_agent import ResearchAgent
    from cad_agent.app.agents.intake_agent import IntakeAgent
    from cad_agent.app.agents.intent_agent import IntentAgent
    from cad_agent.app.agents.design_agent import DesignAgent
    from cad_agent.app.agents.parameter_schema_agent import ParameterSchemaAgent
    from cad_agent.app.agents.template_agent import TemplateAgent
    from cad_agent.app.agents.generator_agent import GeneratorAgent
    from cad_agent.app.agents.executor_agent import ExecutorAgent
    from cad_agent.app.agents.validator_agent import ValidatorAgent
    from cad_agent.app.agents.debug_agent import DebugAgent
    from cad_agent.app.agents.report_agent import ReportAgent

logger = structlog.get_logger()


class OrchestratorAgent:
    """Main orchestration agent that drives the state machine."""

    def __init__(
        self,
        retry_policy: RetryPolicy | None = None,
        case_memory: Optional["CaseMemoryService"] = None,
    ):
        """Initialize orchestrator."""
        self.retry_policy = retry_policy or RetryPolicy()
        self.case_memory = case_memory
        self._agents: dict[str, object] = {}

    def set_agents(
        self,
        research: "ResearchAgent",
        intake: "IntakeAgent",
        intent: "IntentAgent",
        design: "DesignAgent",
        parameters: "ParameterSchemaAgent",
        template: "TemplateAgent",
        generator: "GeneratorAgent",
        executor: "ExecutorAgent",
        validator: "ValidatorAgent",
        debug: "DebugAgent",
        report: "ReportAgent",
    ) -> None:
        """Set all agent references for delegation."""
        self._agents = {
            "research": research,
            "intake": intake,
            "intent": intent,
            "design": design,
            "parameters": parameters,
            "template": template,
            "generator": generator,
            "executor": executor,
            "validator": validator,
            "debug": debug,
            "report": report,
        }

    def set_case_memory(self, case_memory: Optional["CaseMemoryService"]) -> None:
        """Set the optional case memory service."""
        self.case_memory = case_memory

    async def process(self, job: DesignJob) -> AgentResult:
        """Main orchestration loop - process a job through states.

        Args:
            job: The DesignJob to process

        Returns:
            AgentResult with final state and any output data
        """
        start_time = time.time()
        logger.info("orchestrator_started", job_id=job.id, state=job.state.value)

        while not self._is_terminal_state(job.state):
            if self.retry_policy.should_human_handoff(job):
                job.transition_to(JobState.HUMAN_REVIEW)
                break

            result = await self._route_to_agent(job)

            if not result.success and job.should_retry():
                job.increment_retry()
                next_state = self.retry_policy.get_next_state_after_failure(
                    job,
                    result.state_reached,
                )
                job.transition_to(next_state)
            elif not result.success:
                job.transition_to(JobState.HUMAN_REVIEW)
            elif result.success:
                job.transition_to(JobState(result.state_reached))

        duration_ms = int((time.time() - start_time) * 1000)
        if self._is_terminal_state(job.state):
            self._store_success_case(job)
        return AgentResult(
            success=self._is_terminal_state(job.state),
            agent=AgentRole.ORCHESTRATOR,
            state_reached=job.state.value,
            data={"job_id": job.id, "final_state": job.state.value},
            duration_ms=duration_ms,
        )

    async def process_preview(self, job: DesignJob) -> AgentResult:
        """Run a lightweight preview path and stop after the render step."""
        start_time = time.time()
        logger.info("orchestrator_preview_started", job_id=job.id, state=job.state.value)

        if not job.business_context:
            job.business_context = {}
        job.business_context["preview_mode"] = True

        preview_terminal_states = {
            JobState.RENDERED,
            JobState.GEOMETRY_FAILED,
            JobState.RENDER_FAILED,
            JobState.SPEC_FAILED,
            JobState.TEMPLATE_FAILED,
            JobState.HUMAN_REVIEW,
            JobState.CANCELLED,
        }

        try:
            while job.state not in preview_terminal_states:
                result = await self._route_to_agent(job)

                if result.success:
                    job.transition_to(JobState(result.state_reached))
                    continue

                if result.state_reached in JobState._value2member_map_:
                    job.transition_to(JobState(result.state_reached))
                else:
                    job.transition_to(JobState.RENDER_FAILED)
                break
        finally:
            job.business_context.pop("preview_mode", None)

        duration_ms = int((time.time() - start_time) * 1000)
        success = job.state == JobState.RENDERED
        return AgentResult(
            success=success,
            agent=AgentRole.ORCHESTRATOR,
            state_reached=job.state.value,
            data={"job_id": job.id, "final_state": job.state.value, "preview_mode": True},
            duration_ms=duration_ms,
            error=None if success else f"Preview render stopped at {job.state.value}",
        )

    async def _route_to_agent(self, job: DesignJob) -> AgentResult:
        """Route job to appropriate agent based on current state.

        Args:
            job: The DesignJob to route

        Returns:
            AgentResult from the called agent
        """
        state_to_agent = {
            JobState.NEW: ("research", "research"),
            JobState.RESEARCHED: ("intake", "process"),
            JobState.SPEC_PARSED: ("intent", "resolve"),
            JobState.INTENT_RESOLVED: ("design", "design"),
            JobState.DESIGN_RESOLVED: ("parameters", "build_schema"),
            JobState.PARAMETERS_GENERATED: ("generator", "generate"),
            JobState.TEMPLATE_SELECTED: ("generator", "generate"),
            JobState.GEOMETRY_BUILT: ("executor", "execute"),
            JobState.SCAD_GENERATED: ("executor", "execute"),
            JobState.RENDERED: ("validator", "validate"),
            JobState.REVIEWED: ("intake", "accept"),
            JobState.VALIDATED: ("intake", "accept"),
            JobState.ACCEPTED: ("report", "generate"),
            JobState.DEBUGGING: ("debug", "diagnose"),
            JobState.REPAIRING: ("generator", "repair"),
        }

        if job.state not in state_to_agent:
            return AgentResult(
                success=False,
                agent=AgentRole.ORCHESTRATOR,
                state_reached=job.state.value,
                error=f"No agent defined for state: {job.state.value}",
            )

        agent_name, method_name = state_to_agent[job.state]
        agent = self._agents.get(agent_name)

        if not agent:
            return AgentResult(
                success=False,
                agent=AgentRole.ORCHESTRATOR,
                state_reached=job.state.value,
                error=f"Agent not found: {agent_name}",
            )

        method = getattr(agent, method_name, None)
        if not method:
            return AgentResult(
                success=False,
                agent=AgentRole.ORCHESTRATOR,
                state_reached=job.state.value,
                error=f"Method not found: {agent_name}.{method_name}",
            )

        logger.info("routing_to_agent", job_id=job.id, agent=agent_name, state=job.state.value)
        if agent_name == "research":
            payload = await method(job.input_request, job.part_family)
            job.research_result = payload
            if getattr(payload, "part_family", None):
                job.part_family = str(payload.part_family.value if hasattr(payload.part_family, "value") else payload.part_family)
            if getattr(payload, "object_model", None):
                if not job.business_context:
                    job.business_context = {}
                job.business_context["object_model"] = dict(payload.object_model)
            result = AgentResult(
                success=not bool(getattr(payload, "error_message", None)),
                agent=AgentRole.RESEARCH,
                state_reached=JobState.RESEARCHED.value if not getattr(payload, "error_message", None) else JobState.RESEARCH_FAILED.value,
                data={"research_result": payload.model_dump(mode="json")},
                error=getattr(payload, "error_message", None),
            )
        elif agent_name == "intake" and method_name == "process":
            result = await method(job)
            geometry_intent = infer_geometry_intent(
                job.input_request,
                job.spec.dimensions if job.spec else None,
                job.spec.geometric_type if job.spec else "",
            )
            if geometry_intent:
                if not job.business_context:
                    job.business_context = {}
                job.business_context["geometry_intent"] = geometry_intent
            if job.spec and job.research_result:
                merged_object_model = enrich_object_model_from_spec(
                    getattr(job.research_result, "object_model", None),
                    job.spec.dimensions,
                )
                if merged_object_model:
                    job.research_result.object_model = merged_object_model
                    if not job.business_context:
                        job.business_context = {}
                    job.business_context["object_model"] = merged_object_model
        elif agent_name == "intent":
            payload = await method(job.input_request, job.research_result)
            job.intent_result = payload
            if getattr(payload, "part_family", None):
                job.part_family = str(payload.part_family.value if hasattr(payload.part_family, "value") else payload.part_family)
            result = AgentResult(
                success=not bool(getattr(payload, "error_message", None)),
                agent=AgentRole.INTENT,
                state_reached=JobState.INTENT_RESOLVED.value if not getattr(payload, "error_message", None) else JobState.INTENT_FAILED.value,
                data={"intent_result": payload.model_dump(mode="json")},
                error=getattr(payload, "error_message", None),
            )
        elif agent_name == "design":
            payload = await method(job.intent_result, job.research_result)
            job.design_result = payload
            result = AgentResult(
                success=not bool(getattr(payload, "error_message", None)),
                agent=AgentRole.DESIGN,
                state_reached=JobState.DESIGN_RESOLVED.value if not getattr(payload, "error_message", None) else JobState.DESIGN_FAILED.value,
                data={"design_result": payload.model_dump(mode="json")},
                error=getattr(payload, "error_message", None),
            )
        elif agent_name == "parameters":
            payload = await method(job.input_request, job.intent_result, job.design_result, job.research_result, job.spec)
            job.parameter_schema = ParameterSchema.model_validate(payload.model_dump(mode="json"))
            job.set_parameter_values(job.parameter_schema.parameter_values())
            result = AgentResult(
                success=not bool(getattr(payload, "error_message", None)),
                agent=AgentRole.PARAMETERS,
                state_reached=JobState.PARAMETERS_GENERATED.value if not getattr(payload, "error_message", None) else JobState.PARAMETER_FAILED.value,
                data={"parameter_schema": payload.model_dump(mode="json")},
                error=getattr(payload, "error_message", None),
            )
        else:
            result = await method(job)

        job.add_log(
            {
                "agent": agent_name,
                "action": method_name,
                "success": result.success,
                "state_reached": result.state_reached,
                "error_message": result.error,
                "output_data": result.data,
                "duration_ms": result.duration_ms,
            }
        )

        return result

    def _store_success_case(self, job: DesignJob) -> None:
        """Persist successful jobs into case memory for future reuse."""
        if not self.case_memory:
            return

        template_name = "unknown"
        final_parameters: dict[str, object] = {}
        tags: list[str] = []

        if job.template_choice:
            template_name = job.template_choice.template_name
            final_parameters = job.template_choice.parameters
        elif job.part_family:
            template_name = job.builder_name or job.part_family
            final_parameters = job.get_effective_parameter_values()

        if job.spec:
            tags.append(job.spec.geometric_type)
        if template_name:
            tags.append(template_name)

        case = Case(
            id=job.case_id or job.id,
            input_request=job.input_request,
            spec_summary=f"{job.spec.geometric_type} {job.spec.dimensions}" if job.spec else (job.part_family or "unknown"),
            template_name=template_name,
            final_parameters=final_parameters,
            outcome="delivered",
            tags=tags,
        )
        self.case_memory.store(case)

    def _is_terminal_state(self, state: JobState) -> bool:
        """Check if state is terminal (no further processing)."""
        terminal_states = {
            JobState.DELIVERED,
            JobState.ARCHIVED,
            JobState.HUMAN_REVIEW,
            JobState.CANCELLED,
        }
        return state in terminal_states
