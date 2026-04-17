"""Orchestrator agent - main state machine loop."""

from __future__ import annotations

import time
from typing import TYPE_CHECKING, Optional

import structlog

from cad_agent.app.models.agent_result import AgentResult, AgentRole
from cad_agent.app.models.case import Case
from cad_agent.app.models.design_job import DesignJob, JobState
from cad_agent.app.rules.retry_policy import RetryPolicy

if TYPE_CHECKING:
    from cad_agent.app.services.case_memory import CaseMemoryService
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
        self.on_update = None  # Async callback: func(job: DesignJob)
        self._agents: dict[str, object] = {}

    def set_agents(
        self,
        research: object | None = None,
        intake: object | None = None,
        intent: object | None = None,
        design: object | None = None,
        parameters: object | None = None,
        generator: "GeneratorAgent" | None = None,
        executor: "ExecutorAgent" | None = None,
        validator: "ValidatorAgent" | None = None,
        debug: "DebugAgent" | None = None,
        report: "ReportAgent" | None = None,
    ) -> None:
        """Set agent references for delegation.

        Legacy arguments are accepted for API compatibility, but only the
        single-pass generator harness is used by the current pipeline.
        """
        self._agents = {
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
        """Main orchestration loop - process a job through states."""
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
            else:
                job.transition_to(JobState(result.state_reached))

            if self.on_update:
                await self.on_update(job)

        duration_ms = int((time.time() - start_time) * 1000)
        if job.state == JobState.DELIVERED:
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
        """Route job to appropriate agent based on current state."""
        state_to_agent = {
            JobState.NEW: ("generator", "generate"),
            JobState.SCAD_GENERATED: ("executor", "execute"),
            JobState.RENDERED: ("validator", "validate"),
            JobState.VALIDATED: ("report", "generate"),
            JobState.REVIEWED: ("report", "generate"),
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

        template_name = job.generation_path or "direct_llm_parametric"
        final_parameters = job.get_effective_parameter_values()
        tags: list[str] = [template_name]

        if job.parameter_schema and job.parameter_schema.design_summary:
            tags.append("parametric")

        case = Case(
            id=job.case_id or job.id,
            input_request=job.input_request,
            spec_summary=(job.business_context or {}).get("generation_summary", template_name),
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
