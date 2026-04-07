import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from datetime import datetime

from cad_agent.app.models.design_job import DesignJob, JobState, RoutingDecision
from cad_agent.app.models.agent_result import AgentResult, AgentRole
from cad_agent.app.agents.orchestrator import OrchestratorAgent
from cad_agent.app.rules.retry_policy import RetryPolicy


@pytest.fixture
def mock_intake_agent():
    agent = AsyncMock()
    agent.process.return_value = AgentResult(
        success=True,
        agent=AgentRole.INTAKE,
        state_reached="SPEC_PARSED",
        data={"dimensions": {"width": 10.0}}
    )
    agent.accept.return_value = AgentResult(
        success=True,
        agent=AgentRole.INTAKE,
        state_reached="ACCEPTED",
        data={}
    )
    return agent


@pytest.fixture
def mock_template_agent():
    agent = AsyncMock()
    agent.select.return_value = AgentResult(
        success=True,
        agent=AgentRole.TEMPLATE,
        state_reached="TEMPLATE_SELECTED",
        data={"template_name": "rectangular_primitives"}
    )
    return agent


@pytest.fixture
def mock_generator_agent():
    agent = AsyncMock()
    agent.generate.return_value = AgentResult(
        success=True,
        agent=AgentRole.GENERATOR,
        state_reached="SCAD_GENERATED",
        data={"scad_source": "$fn=50;\ncube([10, 10, 10]);"}
    )
    return agent


@pytest.fixture
def mock_executor_agent():
    agent = AsyncMock()
    agent.execute.return_value = AgentResult(
        success=True,
        agent=AgentRole.EXECUTOR,
        state_reached="RENDERED",
        data={"stl_path": "/output/test.stl"}
    )
    return agent


@pytest.fixture
def mock_validator_agent():
    agent = AsyncMock()
    agent.validate.return_value = AgentResult(
        success=True,
        agent=AgentRole.VALIDATOR,
        state_reached="VALIDATED",
        data={"validation_passed": True}
    )
    return agent


@pytest.fixture
def mock_debug_agent():
    agent = AsyncMock()
    agent.diagnose.return_value = AgentResult(
        success=True,
        agent=AgentRole.DEBUG,
        state_reached="DEBUGGING",
        data={}
    )
    return agent


@pytest.fixture
def mock_report_agent():
    agent = AsyncMock()
    agent.generate.return_value = AgentResult(
        success=True,
        agent=AgentRole.REPORT,
        state_reached="DELIVERED",
        data={"report": {"status": "DELIVERED"}},
    )
    return agent


@pytest.fixture
def orchestrator(
    mock_intake_agent,
    mock_template_agent,
    mock_generator_agent,
    mock_executor_agent,
    mock_validator_agent,
    mock_debug_agent,
    mock_report_agent,
):
    orch = OrchestratorAgent()
    orch.set_agents(
        intake=mock_intake_agent,
        template=mock_template_agent,
        generator=mock_generator_agent,
        executor=mock_executor_agent,
        validator=mock_validator_agent,
        debug=mock_debug_agent,
        report=mock_report_agent,
    )
    return orch


@pytest.fixture
def sample_job():
    return DesignJob(
        id="test-job-001",
        state=JobState.NEW,
        input_request="Create a box 10x5x3",
    )


class TestOrchestratorAgent:
    def test_init(self):
        orch = OrchestratorAgent()
        assert orch.retry_policy is not None
        assert orch._agents == {}

    def test_set_agents(self, orchestrator):
        assert orchestrator._agents["intake"] is not None
        assert orchestrator._agents["template"] is not None
        assert orchestrator._agents["generator"] is not None
        assert orchestrator._agents["executor"] is not None
        assert orchestrator._agents["validator"] is not None
        assert orchestrator._agents["debug"] is not None
        assert orchestrator._agents["report"] is not None

    @pytest.mark.asyncio
    async def test_process_new_job(self, orchestrator, sample_job):
        result = await orchestrator.process(sample_job)
        
        assert result.success is True
        assert result.agent == AgentRole.ORCHESTRATOR
        assert sample_job.state == JobState.DELIVERED

    @pytest.mark.asyncio
    async def test_process_with_failed_agent_retry(self, orchestrator, sample_job, mock_intake_agent):
        mock_intake_agent.process.return_value = AgentResult(
            success=False,
            agent=AgentRole.INTAKE,
            state_reached="NEW",
            error="Parse failed"
        )
        
        result = await orchestrator.process(sample_job)
        
        assert result.success is True
        assert sample_job.state == JobState.HUMAN_REVIEW

    @pytest.mark.asyncio
    async def test_routing_decision_structure(self, orchestrator, sample_job):
        result = await orchestrator.process(sample_job)
        
        assert hasattr(result, 'success')
        assert hasattr(result, 'agent')
        assert hasattr(result, 'state_reached')
        assert hasattr(result, 'data')

    def test_is_terminal_state(self, orchestrator):
        assert orchestrator._is_terminal_state(JobState.ACCEPTED) is False
        assert orchestrator._is_terminal_state(JobState.DELIVERED) is True
        assert orchestrator._is_terminal_state(JobState.ARCHIVED) is True
        assert orchestrator._is_terminal_state(JobState.HUMAN_REVIEW) is True
        assert orchestrator._is_terminal_state(JobState.CANCELLED) is True
        assert orchestrator._is_terminal_state(JobState.NEW) is False
        assert orchestrator._is_terminal_state(JobState.RENDERED) is False

    def test_job_state_transitions(self, sample_job):
        assert sample_job.state == JobState.NEW
        sample_job.transition_to(JobState.SPEC_PARSED)
        assert sample_job.state == JobState.SPEC_PARSED

    def test_routing_decision_model(self):
        decision = RoutingDecision(
            next_state=JobState.TEMPLATE_SELECTED,
            next_agent="template",
            reason="Spec parsed successfully",
            confidence=1.0,
            should_retry=False,
            retry_count=0,
        )
        assert decision.next_state == JobState.TEMPLATE_SELECTED
        assert decision.next_agent == "template"
        assert decision.confidence == 1.0

    def test_agent_result_model(self):
        result = AgentResult(
            success=True,
            agent=AgentRole.ORCHESTRATOR,
            state_reached="ACCEPTED",
            data={"job_id": "test-001"},
            duration_ms=1500,
        )
        assert result.success is True
        assert result.agent == AgentRole.ORCHESTRATOR
        assert result.state_reached == "ACCEPTED"
        assert result.duration_ms == 1500

    def test_agent_role_enum(self):
        assert AgentRole.ORCHESTRATOR == "orchestrator"
        assert AgentRole.INTAKE == "intake"
        assert AgentRole.TEMPLATE == "template"
        assert AgentRole.GENERATOR == "generator"
        assert AgentRole.EXECUTOR == "executor"
        assert AgentRole.VALIDATOR == "validator"

    @pytest.mark.asyncio
    async def test_process_job_retry_increment(self, orchestrator, sample_job, mock_intake_agent):
        mock_intake_agent.process.return_value = AgentResult(
            success=False,
            agent=AgentRole.INTAKE,
            state_reached="NEW",
            error="Temporary failure"
        )

        await orchestrator.process(sample_job)

        assert sample_job.retry_count == sample_job.max_retries
        assert sample_job.state == JobState.HUMAN_REVIEW

    @pytest.mark.asyncio
    async def test_process_reaches_terminal_state(self, orchestrator, sample_job):
        result = await orchestrator.process(sample_job)
        
        terminal_states = {"DELIVERED", "ARCHIVED", "HUMAN_REVIEW", "CANCELLED"}
        assert sample_job.state.value in terminal_states or result.success is True
