"""Orchestrator agent - main state machine loop."""

import time
from typing import TYPE_CHECKING

import structlog

from cad_agent.app.models.agent_result import AgentResult, AgentRole
from cad_agent.app.models.design_job import DesignJob, JobState
from cad_agent.app.rules.retry_policy import RetryPolicy

if TYPE_CHECKING:
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

    def __init__(self, retry_policy: RetryPolicy | None = None):
        """Initialize orchestrator."""
        self.retry_policy = retry_policy or RetryPolicy()
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
                next_state = self.retry_policy.get_next_state_after_failure(job)
                job.transition_to(next_state)
            elif result.success:
                job.transition_to(JobState(result.state_reached))

        duration_ms = int((time.time() - start_time) * 1000)
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

    def _is_terminal_state(self, state: JobState) -> bool:
        """Check if state is terminal (no further processing)."""
        terminal_states = {
            JobState.ACCEPTED,
            JobState.DELIVERED,
            JobState.ARCHIVED,
            JobState.HUMAN_REVIEW,
            JobState.CANCELLED,
        }
        return state in terminal_states
