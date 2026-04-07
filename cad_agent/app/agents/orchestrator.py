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
    from cad_agent.app.agents.intake_agent import IntakeAgent
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
        intake: "IntakeAgent",
        template: "TemplateAgent",
        generator: "GeneratorAgent",
        executor: "ExecutorAgent",
        validator: "ValidatorAgent",
        debug: "DebugAgent",
        report: "ReportAgent",
    ) -> None:
        """Set all agent references for delegation."""
        self._agents = {
            "intake": intake,
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

    async def _route_to_agent(self, job: DesignJob) -> AgentResult:
        """Route job to appropriate agent based on current state.

        Args:
            job: The DesignJob to route

        Returns:
            AgentResult from the called agent
        """
        state_to_agent = {
            JobState.NEW: ("intake", "process"),
            JobState.SPEC_PARSED: ("template", "select"),
            JobState.TEMPLATE_SELECTED: ("generator", "generate"),
            JobState.SCAD_GENERATED: ("executor", "execute"),
            JobState.RENDERED: ("validator", "validate"),
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
        result = await method(job)

        job.add_log(
            {
                "agent": agent_name,
                "action": method_name,
                "success": result.success,
                "state_reached": result.state_reached,
            }
        )

        return result

    def _store_success_case(self, job: DesignJob) -> None:
        """Persist successful jobs into case memory for future reuse."""
        if not self.case_memory or not job.spec or not job.template_choice:
            return

        case = Case(
            id=job.case_id or job.id,
            input_request=job.input_request,
            spec_summary=f"{job.spec.geometric_type} {job.spec.dimensions}",
            template_name=job.template_choice.template_name,
            final_parameters=job.template_choice.parameters,
            outcome="delivered",
            tags=[job.spec.geometric_type, job.template_choice.template_name],
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
