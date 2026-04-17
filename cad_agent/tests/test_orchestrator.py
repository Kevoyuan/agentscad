from unittest.mock import AsyncMock

import pytest

from cad_agent.app.agents.orchestrator import OrchestratorAgent
from cad_agent.app.models.agent_result import AgentResult, AgentRole
from cad_agent.app.models.design_job import DesignJob, JobState


@pytest.fixture
def mock_generator_agent():
    agent = AsyncMock()

    async def _generate(job: DesignJob):
        job.scad_source = "// generated"
        return AgentResult(
            success=True,
            agent=AgentRole.GENERATOR,
            state_reached=JobState.SCAD_GENERATED.value,
            data={"scad_source": job.scad_source},
        )

    async def _repair(job: DesignJob):
        job.scad_source = "// repaired"
        return AgentResult(
            success=True,
            agent=AgentRole.GENERATOR,
            state_reached=JobState.SCAD_GENERATED.value,
            data={"scad_source": job.scad_source},
        )

    agent.generate.side_effect = _generate
    agent.repair.side_effect = _repair
    return agent


@pytest.fixture
def mock_executor_agent():
    agent = AsyncMock()
    agent.execute.return_value = AgentResult(
        success=True,
        agent=AgentRole.EXECUTOR,
        state_reached=JobState.RENDERED.value,
        data={"stl_path": "/tmp/test.stl"},
    )
    return agent


@pytest.fixture
def mock_validator_agent():
    agent = AsyncMock()
    agent.validate.return_value = AgentResult(
        success=True,
        agent=AgentRole.VALIDATOR,
        state_reached=JobState.VALIDATED.value,
        data={"validation_passed": True},
    )
    return agent


@pytest.fixture
def mock_debug_agent():
    agent = AsyncMock()
    agent.diagnose.return_value = AgentResult(
        success=True,
        agent=AgentRole.DEBUG,
        state_reached=JobState.REPAIRING.value,
        data={"diagnosis": "retry with repair loop"},
    )
    return agent


@pytest.fixture
def mock_report_agent():
    agent = AsyncMock()
    agent.generate.return_value = AgentResult(
        success=True,
        agent=AgentRole.REPORT,
        state_reached=JobState.DELIVERED.value,
        data={"report": {"status": "DELIVERED"}},
    )
    return agent


@pytest.fixture
def orchestrator(
    mock_generator_agent,
    mock_executor_agent,
    mock_validator_agent,
    mock_debug_agent,
    mock_report_agent,
):
    orch = OrchestratorAgent()
    orch.set_agents(
        generator=mock_generator_agent,
        executor=mock_executor_agent,
        validator=mock_validator_agent,
        debug=mock_debug_agent,
        report=mock_report_agent,
    )
    return orch


class TestOrchestratorAgent:
    def test_set_agents_registers_single_pass_harness(self, orchestrator):
        assert orchestrator._agents["generator"] is not None
        assert orchestrator._agents["executor"] is not None
        assert orchestrator._agents["validator"] is not None
        assert orchestrator._agents["report"] is not None

    @pytest.mark.asyncio
    async def test_process_new_job_runs_single_pass_pipeline(
        self,
        orchestrator,
        sample_job,
        mock_generator_agent,
        mock_executor_agent,
        mock_validator_agent,
        mock_report_agent,
    ):
        result = await orchestrator.process(sample_job)

        assert result.success is True
        assert sample_job.state == JobState.DELIVERED
        mock_generator_agent.generate.assert_awaited_once_with(sample_job)
        mock_executor_agent.execute.assert_awaited_once_with(sample_job)
        mock_validator_agent.validate.assert_awaited_once_with(sample_job)
        mock_report_agent.generate.assert_awaited_once_with(sample_job)

    @pytest.mark.asyncio
    async def test_process_failed_generation_retries_then_hands_off(
        self,
        orchestrator,
        sample_job,
        mock_generator_agent,
    ):
        async def _fail_generate(job: DesignJob):
            return AgentResult(
                success=False,
                agent=AgentRole.GENERATOR,
                state_reached=JobState.GEOMETRY_FAILED.value,
                error="generation failed",
            )

        mock_generator_agent.generate.side_effect = _fail_generate

        result = await orchestrator.process(sample_job)

        assert result.success is True
        assert sample_job.state == JobState.HUMAN_REVIEW
        assert sample_job.retry_count == 1

    @pytest.mark.asyncio
    async def test_process_validation_failure_uses_debug_then_repair(
        self,
        orchestrator,
        sample_job,
        mock_validator_agent,
        mock_debug_agent,
        mock_generator_agent,
        mock_report_agent,
    ):
        mock_validator_agent.validate.side_effect = [
            AgentResult(
                success=False,
                agent=AgentRole.VALIDATOR,
                state_reached=JobState.VALIDATION_FAILED.value,
                error="wall too thin",
            ),
            AgentResult(
                success=True,
                agent=AgentRole.VALIDATOR,
                state_reached=JobState.VALIDATED.value,
                data={"validation_passed": True},
            ),
        ]

        result = await orchestrator.process(sample_job)

        assert result.success is True
        assert sample_job.state == JobState.DELIVERED
        mock_debug_agent.diagnose.assert_awaited_once_with(sample_job)
        assert mock_generator_agent.repair.await_count == 1
        mock_report_agent.generate.assert_awaited_once_with(sample_job)

    @pytest.mark.asyncio
    async def test_process_preview_stops_after_render(
        self,
        orchestrator,
        sample_job,
        mock_generator_agent,
        mock_executor_agent,
        mock_validator_agent,
        mock_report_agent,
    ):
        result = await orchestrator.process_preview(sample_job)

        assert result.success is True
        assert sample_job.state == JobState.RENDERED
        mock_generator_agent.generate.assert_awaited_once_with(sample_job)
        mock_executor_agent.execute.assert_awaited_once_with(sample_job)
        mock_validator_agent.validate.assert_not_called()
        mock_report_agent.generate.assert_not_called()

    @pytest.mark.asyncio
    async def test_route_unknown_state_returns_orchestrator_error(self, orchestrator, sample_job):
        sample_job.state = JobState.SPEC_PARSED

        result = await orchestrator._route_to_agent(sample_job)

        assert result.success is False
        assert result.agent == AgentRole.ORCHESTRATOR
        assert "No agent defined" in (result.error or "")


@pytest.mark.asyncio
async def test_orchestrator_process_logs_each_harness_stage(orchestrator, sample_job):
    await orchestrator.process(sample_job)

    actions = [(log.agent, log.action) for log in sample_job.execution_logs]
    assert actions == [
        ("generator", "generate"),
        ("executor", "execute"),
        ("validator", "validate"),
        ("report", "generate"),
    ]
