import pytest
from unittest.mock import AsyncMock

from cad_agent.app.agents.orchestrator import OrchestratorAgent
from cad_agent.app.models.agent_result import AgentResult, AgentRole
from cad_agent.app.models.design_job import DesignJob, JobState, RoutingDecision


@pytest.fixture
def mock_research_agent():
    agent = AsyncMock()
    agent.research.return_value = type(
        "ResearchPayload",
        (),
        {
            "part_family": "spur_gear",
            "error_message": None,
            "model_dump": lambda self=None, mode="json": {"part_family": "spur_gear"},
        },
    )()
    return agent


@pytest.fixture
def mock_intake_agent():
    agent = AsyncMock()
    agent.process.return_value = AgentResult(
        success=True,
        agent=AgentRole.INTAKE,
        state_reached="SPEC_PARSED",
        data={"dimensions": {"outer_diameter": 30.0}},
    )
    agent.accept.return_value = AgentResult(
        success=True,
        agent=AgentRole.INTAKE,
        state_reached="ACCEPTED",
        data={},
    )
    return agent


@pytest.fixture
def mock_intent_agent():
    agent = AsyncMock()
    agent.resolve.return_value = type(
        "IntentPayload",
        (),
        {
            "part_family": "spur_gear",
            "error_message": None,
            "model_dump": lambda self=None, mode="json": {"part_family": "spur_gear"},
        },
    )()
    return agent


@pytest.fixture
def mock_design_agent():
    agent = AsyncMock()
    agent.design.return_value = type(
        "DesignPayload",
        (),
        {
            "error_message": None,
            "model_dump": lambda self=None, mode="json": {"design_intent_summary": "gear"},
        },
    )()
    return agent


@pytest.fixture
def mock_parameters_agent():
    agent = AsyncMock()
    agent.build_schema.return_value = type(
        "ParameterPayload",
        (),
        {
            "error_message": None,
            "model_dump": lambda self=None, mode="json": {
                "request": "gear",
                "part_family": "spur_gear",
                "schema_version": "v1",
                "design_summary": "gear",
                "parameters": [
                    {
                        "key": "teeth",
                        "label": "Teeth",
                        "kind": "integer",
                        "unit": "",
                        "value": 17,
                        "min": 6,
                        "max": 60,
                        "step": 1,
                        "source": "user",
                        "editable": True,
                        "description": "",
                        "group": "gear",
                        "choices": [],
                        "derived_from": [],
                    }
                ],
                "user_parameters": ["teeth"],
                "inferred_parameters": [],
                "design_derived_parameters": [],
                "notes": [],
                "error_message": None,
            },
        },
    )()
    return agent


@pytest.fixture
def mock_generator_agent():
    agent = AsyncMock()
    agent.generate.return_value = AgentResult(
        success=True,
        agent=AgentRole.GENERATOR,
        state_reached="SCAD_GENERATED",
        data={"scad_source": "// gear"},
    )
    agent.repair.return_value = AgentResult(
        success=True,
        agent=AgentRole.GENERATOR,
        state_reached="SCAD_GENERATED",
        data={"scad_source": "// repaired gear"},
    )
    return agent


@pytest.fixture
def mock_executor_agent():
    agent = AsyncMock()
    agent.execute.return_value = AgentResult(
        success=True,
        agent=AgentRole.EXECUTOR,
        state_reached="RENDERED",
        data={"stl_path": "/output/test.stl"},
    )
    return agent


@pytest.fixture
def mock_validator_agent():
    agent = AsyncMock()
    agent.validate.return_value = AgentResult(
        success=True,
        agent=AgentRole.VALIDATOR,
        state_reached="REVIEWED",
        data={"validation_passed": True},
    )
    return agent


@pytest.fixture
def mock_debug_agent():
    agent = AsyncMock()
    agent.diagnose.return_value = AgentResult(
        success=True,
        agent=AgentRole.DEBUG,
        state_reached="DEBUGGING",
        data={},
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
    mock_research_agent,
    mock_intake_agent,
    mock_intent_agent,
    mock_design_agent,
    mock_parameters_agent,
    mock_generator_agent,
    mock_executor_agent,
    mock_validator_agent,
    mock_debug_agent,
    mock_report_agent,
):
    orch = OrchestratorAgent()
    orch.set_agents(
        research=mock_research_agent,
        intake=mock_intake_agent,
        intent=mock_intent_agent,
        design=mock_design_agent,
        parameters=mock_parameters_agent,
        generator=mock_generator_agent,
        executor=mock_executor_agent,
        validator=mock_validator_agent,
        debug=mock_debug_agent,
        report=mock_report_agent,
    )
    return orch


@pytest.mark.asyncio
async def test_orchestrator_routes_intake_before_parameters(orchestrator):
    call_order = []

    async def record_research(*args, **kwargs):
        call_order.append("research")
        return type(
            "ResearchPayload",
            (),
            {
                "part_family": "device_stand",
                "error_message": None,
                "model_dump": lambda self=None, mode="json": {"part_family": "device_stand"},
            },
        )()

    async def record_intake(job):
        call_order.append("intake")
        from cad_agent.app.models.design_job import SpecResult
        job.spec = SpecResult(
            success=True,
            geometric_type="平台式底座",
            dimensions={"width": 240.0, "depth": 240.0, "height": 45.0},
            material="PLA",
            tolerance=0.1,
        )
        return AgentResult(
            success=True,
            agent=AgentRole.INTAKE,
            state_reached="SPEC_PARSED",
            data={"spec": job.spec.model_dump()},
        )

    async def record_intent(*args, **kwargs):
        call_order.append("intent")
        return type(
            "IntentPayload",
            (),
            {
                "part_family": "device_stand",
                "error_message": None,
                "model_dump": lambda self=None, mode="json": {"part_family": "device_stand"},
            },
        )()

    async def record_design(*args, **kwargs):
        call_order.append("design")
        return type(
            "DesignPayload",
            (),
            {
                "error_message": None,
                "model_dump": lambda self=None, mode="json": {"design_intent_summary": "stand"},
            },
        )()

    async def record_parameters(*args, **kwargs):
        call_order.append("parameters")
        return type(
            "ParameterPayload",
            (),
            {
                "error_message": None,
                "model_dump": lambda self=None, mode="json": {
                    "request": "stand",
                    "part_family": "device_stand",
                    "schema_version": "v1",
                    "design_summary": "stand",
                    "parameters": [],
                    "user_parameters": [],
                    "inferred_parameters": [],
                    "design_derived_parameters": [],
                    "notes": [],
                    "error_message": None,
                },
            },
        )()

    async def record_generator(job):
        call_order.append("generator")
        return AgentResult(
            success=True,
            agent=AgentRole.GENERATOR,
            state_reached="SCAD_GENERATED",
            data={"scad_source": "// stand"},
        )

    async def record_executor(job):
        call_order.append("executor")
        return AgentResult(
            success=True,
            agent=AgentRole.EXECUTOR,
            state_reached="RENDERED",
            data={},
        )

    async def record_validator(job):
        call_order.append("validator")
        return AgentResult(
            success=True,
            agent=AgentRole.VALIDATOR,
            state_reached="VALIDATED",
            data={},
        )

    async def record_accept(job):
        call_order.append("accept")
        return AgentResult(
            success=True,
            agent=AgentRole.INTAKE,
            state_reached="ACCEPTED",
            data={},
        )

    async def record_report(job):
        call_order.append("report")
        return AgentResult(
            success=True,
            agent=AgentRole.REPORT,
            state_reached="DELIVERED",
            data={},
        )

    orchestrator._agents["research"].research.side_effect = record_research
    orchestrator._agents["intake"].process.side_effect = record_intake
    orchestrator._agents["intent"].resolve.side_effect = record_intent
    orchestrator._agents["design"].design.side_effect = record_design
    orchestrator._agents["parameters"].build_schema.side_effect = record_parameters
    orchestrator._agents["generator"].generate.side_effect = record_generator
    orchestrator._agents["executor"].execute.side_effect = record_executor
    orchestrator._agents["validator"].validate.side_effect = record_validator
    orchestrator._agents["intake"].accept.side_effect = record_accept
    orchestrator._agents["report"].generate.side_effect = record_report

    job = DesignJob(input_request="帮我设计一个mac studio m3底座")
    result = await orchestrator.process(job)

    assert result.success is True
    assert call_order[:5] == ["research", "intake", "intent", "design", "parameters"]


@pytest.fixture
def sample_job():
    return DesignJob(
        id="test-job-001",
        state=JobState.NEW,
        input_request="设计一个17齿的齿轮，外径30mm，内径10mm，厚3mm",
    )


class TestOrchestratorAgent:
    def test_init(self):
        orch = OrchestratorAgent()
        assert orch.retry_policy is not None
        assert orch._agents == {}

    def test_set_agents(self, orchestrator):
        assert orchestrator._agents["research"] is not None
        assert orchestrator._agents["intent"] is not None
        assert orchestrator._agents["design"] is not None
        assert orchestrator._agents["parameters"] is not None
        assert orchestrator._agents["generator"] is not None

    @pytest.mark.asyncio
    async def test_process_new_job(self, orchestrator, sample_job):
        result = await orchestrator.process(sample_job)

        assert result.success is True
        assert result.agent == AgentRole.ORCHESTRATOR
        assert sample_job.state == JobState.DELIVERED
        assert sample_job.part_family == "spur_gear"

    @pytest.mark.asyncio
    async def test_process_with_failed_agent_retry(self, orchestrator, sample_job, mock_research_agent):
        mock_research_agent.research.return_value = type(
            "ResearchPayload",
            (),
            {
                "part_family": "unknown",
                "error_message": "research failed",
                "model_dump": lambda self=None, mode="json": {"part_family": "unknown"},
            },
        )()

        result = await orchestrator.process(sample_job)

        assert result.success is True
        assert sample_job.state == JobState.HUMAN_REVIEW

    @pytest.mark.asyncio
    async def test_routing_decision_structure(self, orchestrator, sample_job):
        result = await orchestrator.process(sample_job)

        assert hasattr(result, "success")
        assert hasattr(result, "agent")
        assert hasattr(result, "state_reached")
        assert hasattr(result, "data")

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
        sample_job.transition_to(JobState.RESEARCHED)
        assert sample_job.state == JobState.RESEARCHED

    def test_routing_decision_model(self):
        decision = RoutingDecision(
            next_state=JobState.PARAMETERS_GENERATED,
            next_agent="parameters",
            reason="Design resolved successfully",
            confidence=1.0,
            should_retry=False,
            retry_count=0,
        )
        assert decision.next_state == JobState.PARAMETERS_GENERATED
        assert decision.next_agent == "parameters"
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
        assert AgentRole.RESEARCH == "research"
        assert AgentRole.INTENT == "intent"
        assert AgentRole.DESIGN == "design"
        assert AgentRole.PARAMETERS == "parameters"

    @pytest.mark.asyncio
    async def test_process_job_retry_increment(self, orchestrator, sample_job, mock_research_agent):
        mock_research_agent.research.return_value = type(
            "ResearchPayload",
            (),
            {
                "part_family": "unknown",
                "error_message": "temporary failure",
                "model_dump": lambda self=None, mode="json": {"part_family": "unknown"},
            },
        )()

        await orchestrator.process(sample_job)

        assert sample_job.retry_count == 1
        assert sample_job.state == JobState.HUMAN_REVIEW

    @pytest.mark.asyncio
    async def test_process_reaches_terminal_state(self, orchestrator, sample_job):
        result = await orchestrator.process(sample_job)

        terminal_states = {"DELIVERED", "ARCHIVED", "HUMAN_REVIEW", "CANCELLED"}
        assert sample_job.state.value in terminal_states or result.success is True

    @pytest.mark.asyncio
    async def test_process_preview_stops_after_render(self, orchestrator, sample_job, mock_validator_agent, mock_report_agent):
        sample_job.state = JobState.SPEC_PARSED
        sample_job.part_family = "spur_gear"

        result = await orchestrator.process_preview(sample_job)

        assert result.success is True
        assert sample_job.state == JobState.RENDERED
        mock_validator_agent.validate.assert_not_called()
        mock_report_agent.generate.assert_not_called()

    @pytest.mark.asyncio
    async def test_spec_parsed_routes_to_intent_before_template_or_generator(
        self,
        orchestrator,
        sample_job,
        mock_generator_agent,
        mock_intent_agent,
    ):
        from cad_agent.app.models.design_job import SpecResult

        sample_job.state = JobState.SPEC_PARSED
        sample_job.part_family = "unknown"
        sample_job.spec = SpecResult(
            success=True,
            request_summary="phone case",
            geometric_type="phone case",
            dimensions={"length": 150.0, "width": 75.0, "height": 10.0},
            material="TPU",
            tolerance=0.2,
            functional_requirements=[],
        )

        result = await orchestrator._route_to_agent(sample_job)

        assert result.agent == AgentRole.INTENT
        mock_intent_agent.resolve.assert_awaited_once()
        mock_generator_agent.generate.assert_not_awaited()
