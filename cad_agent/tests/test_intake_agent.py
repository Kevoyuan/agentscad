"""Tests for IntakeAgent natural language parsing."""

import pytest

from cad_agent.app.agents.intake_agent import IntakeAgent
from cad_agent.app.models.design_job import DesignJob, JobState, SpecResult


class TestIntakeAgentProcess:
    """Test IntakeAgent.process() method."""

    @pytest.mark.asyncio
    async def test_process_sets_spec_on_success(self):
        """Process should set job.spec on successful parse."""
        agent = IntakeAgent()
        job = DesignJob(input_request="Create a hook with 30mm length")

        result = await agent.process(job)

        assert result.success is True
        assert job.spec is not None
        assert job.spec.success is True

    @pytest.mark.asyncio
    async def test_process_transitions_to_spec_parsed(self):
        """Process should transition to SPEC_PARSED on success."""
        agent = IntakeAgent()
        job = DesignJob(input_request="Create a hook with 30mm length")

        await agent.process(job)

        assert job.state == JobState.SPEC_PARSED

    @pytest.mark.asyncio
    async def test_process_sets_confidence(self):
        """Process should calculate confidence based on extraction."""
        job = DesignJob(input_request="Create a hook 30mm by 10mm")

        agent = IntakeAgent()
        await agent.process(job)

        assert job.spec is not None
        assert 0.0 <= job.spec.confidence <= 1.0

    @pytest.mark.asyncio
    async def test_process_uses_llm_spec_parser_when_available(self):
        """Process should use the injected LLM parser before regex fallback."""

        class StubSpecParser:
            async def parse(self, request: str) -> SpecResult:
                return SpecResult(
                    success=True,
                    request_summary=request,
                    geometric_type="bracket",
                    dimensions={"length": 42.0},
                    material="PETG",
                    tolerance=0.2,
                    surface_finish="matte",
                    functional_requirements=["mountable"],
                    raw_request=request,
                    confidence=0.91,
                )

        agent = IntakeAgent(spec_parser=StubSpecParser())
        job = DesignJob(input_request="Create a mounting bracket")

        await agent.process(job)

        assert job.spec is not None
        assert job.spec.geometric_type == "bracket"
        assert job.spec.material == "PETG"

    @pytest.mark.asyncio
    async def test_process_falls_back_when_llm_spec_parser_fails(self):
        """Process should fall back to regex parsing when the LLM parser fails."""

        class FailingSpecParser:
            async def parse(self, request: str) -> SpecResult:
                raise RuntimeError("provider unavailable")

        agent = IntakeAgent(spec_parser=FailingSpecParser())
        job = DesignJob(input_request="Create a hook with 30mm length")

        await agent.process(job)

        assert job.spec is not None
        assert job.spec.geometric_type == "hook"


class TestParseExtractions:
    """Test individual extraction methods."""

    def test_extract_type_hook(self):
        """Should extract 'hook' type."""
        agent = IntakeAgent()
        result = agent._parse_request("Create a hook for hanging")
        assert result.geometric_type == "hook"

    def test_extract_type_box(self):
        """Should extract 'box' type."""
        agent = IntakeAgent()
        result = agent._parse_request("I need a box 20mm by 20mm")
        assert result.geometric_type == "box"

    def test_extract_type_clip(self):
        """Should extract 'clip' type."""
        agent = IntakeAgent()
        result = agent._parse_request("Make a clip to hold cables")
        assert result.geometric_type == "clip"

    def test_extract_type_gear_from_chinese(self):
        """Should extract gear type from Chinese requests."""
        agent = IntakeAgent()
        result = agent._parse_request("做一个17齿的齿轮")
        assert result.geometric_type == "gear"

    def test_extract_type_defaults_to_box(self):
        """Should default to 'box' if no type found."""
        agent = IntakeAgent()
        result = agent._parse_request("Create something generic")
        assert result.geometric_type == "box"

    def test_extract_dimensions_length(self):
        """Should extract length dimension."""
        agent = IntakeAgent()
        result = agent._parse_request("30mm length hook")
        assert result.dimensions.get("length") == 30.0

    def test_extract_dimensions_width(self):
        """Should extract width dimension."""
        agent = IntakeAgent()
        result = agent._parse_request("Hook with width of 15mm")
        assert result.dimensions.get("width") == 15.0

    def test_extract_dimensions_height(self):
        """Should extract height dimension."""
        agent = IntakeAgent()
        result = agent._parse_request("20mm height bracket")
        assert result.dimensions.get("height") == 20.0

    def test_extract_dimensions_multiple(self):
        """Should extract multiple dimensions."""
        agent = IntakeAgent()
        result = agent._parse_request(
            "Box 30mm length, 20mm width, 15mm height"
        )
        dims = result.dimensions
        assert dims.get("length") == 30.0
        assert dims.get("width") == 20.0
        assert dims.get("height") == 15.0

    def test_extract_gear_dimensions_from_chinese(self):
        """Should map Chinese gear dimensions into gear-specific fields."""
        agent = IntakeAgent()
        result = agent._parse_request("做一个17齿，10mm外径，5mm内径，高3mm的齿轮")
        dims = result.dimensions
        assert dims.get("outer_diameter") == 10.0
        assert dims.get("inner_diameter") == 5.0
        assert dims.get("height") == 3.0
        assert "length" not in dims

    def test_extract_dimensions_with_unit_millimeter(self):
        """Should handle millimeter unit."""
        agent = IntakeAgent()
        result = agent._parse_request("25 millimeter length hook")
        assert result.dimensions.get("length") == 25.0

    def test_extract_material_pla(self):
        """Should extract PLA material."""
        agent = IntakeAgent()
        result = agent._parse_request("Hook made of PLA")
        assert result.material == "PLA"

    def test_extract_material_petg(self):
        """Should extract PETG material."""
        agent = IntakeAgent()
        result = agent._parse_request("PETG material clip")
        assert result.material == "PETG"

    def test_extract_material_abs(self):
        """Should extract ABS material."""
        agent = IntakeAgent()
        result = agent._parse_request("ABS box design")
        assert result.material == "ABS"

    def test_extract_material_defaults_to_pla(self):
        """Should default to PLA if no material specified."""
        agent = IntakeAgent()
        result = agent._parse_request("Simple hook design")
        assert result.material == "PLA"

    def test_extract_tolerance(self):
        """Should extract tolerance value."""
        agent = IntakeAgent()
        result = agent._parse_request("Hook with tolerance of 0.2mm")
        assert result.tolerance == 0.2

    def test_extract_tolerance_defaults(self):
        """Should default tolerance to 0.1."""
        agent = IntakeAgent()
        result = agent._parse_request("Simple hook")
        assert result.tolerance == 0.1

    def test_extract_functional_requirements_threaded(self):
        """Should extract threaded requirement."""
        agent = IntakeAgent()
        result = agent._parse_request("Threaded mount for screw")
        assert "threaded" in result.functional_requirements

    def test_extract_functional_requirements_snap_fit(self):
        """Should extract snap-fit requirement."""
        agent = IntakeAgent()
        result = agent._parse_request("Snap-fit connector")
        assert "snap-fit" in result.functional_requirements

    def test_extract_quantity(self):
        """Should extract quantity."""
        agent = IntakeAgent()
        result = agent._parse_request("5 units of hook design")
        assert result.quantity == 5

    def test_extract_quantity_defaults_to_one(self):
        """Should default quantity to 1."""
        agent = IntakeAgent()
        result = agent._parse_request("Hook design")
        assert result.quantity == 1

    def test_extract_cost_target(self):
        """Should extract cost target."""
        agent = IntakeAgent()
        result = agent._parse_request("Keep cost under $5.00")
        assert result.cost_target == 5.00

    def test_extract_surface_finish(self):
        """Should extract surface finish."""
        agent = IntakeAgent()
        result = agent._parse_request("Glossy finish box")
        assert result.surface_finish == "glossy"

    def test_wall_thickness_extraction(self):
        """Should extract wall thickness."""
        agent = IntakeAgent()
        result = agent._parse_request("Wall thickness of 2mm box")
        assert result.dimensions.get("wall_thickness") == 2.0


class TestIntakeAgentAccept:
    """Test IntakeAgent.accept() method."""

    @pytest.mark.asyncio
    async def test_accept_requires_validation_results(self):
        """Accept should fail without validation results."""
        agent = IntakeAgent()
        job = DesignJob(input_request="test")
        job.transition_to(JobState.VALIDATED)

        result = await agent.accept(job)

        assert result.success is False
        assert "No validation results" in result.error

    @pytest.mark.asyncio
    async def test_accept_fails_with_critical_validation(self):
        """Accept should fail if critical validation errors exist."""
        from cad_agent.app.models.validation import ValidationResult, ValidationLevel, RuleType

        agent = IntakeAgent()
        job = DesignJob(input_request="test")
        job.transition_to(JobState.VALIDATED)
        job.validation_results = [
            ValidationResult(
                rule_id="R001",
                rule_name="Wall Thickness",
                level=ValidationLevel.ENGINEERING,
                rule_type=RuleType.WALL_THICKNESS,
                passed=False,
                severity="error",
            )
        ]

        result = await agent.accept(job)

        assert result.success is False
        assert "Critical failures" in result.error

    @pytest.mark.asyncio
    async def test_accept_succeeds_with_only_warnings(self):
        """Accept should succeed with only warning validation results."""
        from cad_agent.app.models.validation import ValidationResult, ValidationLevel, RuleType

        agent = IntakeAgent()
        job = DesignJob(input_request="test")
        job.transition_to(JobState.VALIDATED)
        job.validation_results = [
            ValidationResult(
                rule_id="R003",
                rule_name="Self-Supporting",
                level=ValidationLevel.ENGINEERING,
                rule_type=RuleType.SELF_SUPPORTING,
                passed=False,
                severity="warning",
            )
        ]

        result = await agent.accept(job)

        assert result.success is True
        assert job.state == JobState.ACCEPTED
