"""Tests for EngineeringRulesEngine."""

import pytest

from cad_agent.app.rules.engineering_rules import EngineeringRulesEngine, RuleType
from cad_agent.app.models.validation import ValidationLevel, ValidationResult


class TestEngineeringRulesEngine:
    """Test EngineeringRulesEngine validation rules."""

    @pytest.fixture
    def engine(self) -> EngineeringRulesEngine:
        """Provide EngineeringRulesEngine instance."""
        return EngineeringRulesEngine()

    def test_r001_minimum_wall_thickness_pass(self, engine):
        """R001 should pass when wall_thickness >= 1.2."""
        results = engine.validate(
            dimensions={"wall_thickness": 1.5},
            geometric_type="box",
        )
        r001 = next(r for r in results if r.rule_id == "R001")
        assert r001.passed is True

    def test_r001_minimum_wall_thickness_fail(self, engine):
        """R001 should fail when wall_thickness < 1.2."""
        results = engine.validate(
            dimensions={"wall_thickness": 1.0},
            geometric_type="box",
        )
        r001 = next(r for r in results if r.rule_id == "R001")
        assert r001.passed is False
        assert r001.severity == "error"

    def test_r002_max_dimensions_pass(self, engine):
        """R002 should pass when all dimensions <= 200."""
        results = engine.validate(
            dimensions={"length": 100, "width": 150, "height": 180},
            geometric_type="box",
        )
        r002 = next(r for r in results if r.rule_id == "R002")
        assert r002.passed is True

    def test_r002_max_dimensions_fail(self, engine):
        """R002 should fail when any dimension > 200."""
        results = engine.validate(
            dimensions={"length": 250, "width": 100, "height": 100},
            geometric_type="box",
        )
        r002 = next(r for r in results if r.rule_id == "R002")
        assert r002.passed is False
        assert r002.severity == "error"

    def test_r003_self_supporting_pass(self, engine):
        """R003 should pass when overhang_angle >= 45."""
        results = engine.validate(
            dimensions={"overhang_angle": 50},
            geometric_type="hook",
        )
        r003 = next(r for r in results if r.rule_id == "R003")
        assert r003.passed is True

    def test_r003_self_supporting_fail(self, engine):
        """R003 should fail when overhang_angle < 45."""
        results = engine.validate(
            dimensions={"overhang_angle": 30},
            geometric_type="hook",
        )
        r003 = next(r for r in results if r.rule_id == "R003")
        assert r003.passed is False
        assert r003.severity == "warning"

    def test_r004_thread_wall_thickness_pass(self, engine):
        """R004 should pass when thread_wall_thickness >= 3.0."""
        results = engine.validate(
            dimensions={"thread_wall_thickness": 4.0},
            geometric_type="threaded_part",
        )
        r004 = next(r for r in results if r.rule_id == "R004")
        assert r004.passed is True

    def test_r004_thread_wall_thickness_fail(self, engine):
        """R004 should fail when thread_wall_thickness < 3.0."""
        results = engine.validate(
            dimensions={"thread_wall_thickness": 2.5},
            geometric_type="threaded_part",
        )
        r004 = next(r for r in results if r.rule_id == "R004")
        assert r004.passed is False

    def test_r005_aspect_ratio_pass(self, engine):
        """R005 should pass when height/width <= 4.0."""
        results = engine.validate(
            dimensions={"height": 80, "width": 30},
            geometric_type="tower",
        )
        r005 = next(r for r in results if r.rule_id == "R005")
        assert r005.passed is True

    def test_r005_aspect_ratio_fail(self, engine):
        """R005 should fail when height/width > 4.0."""
        results = engine.validate(
            dimensions={"height": 100, "width": 20},
            geometric_type="tower",
        )
        r005 = next(r for r in results if r.rule_id == "R005")
        assert r005.passed is False

    def test_r006_tolerance_fit_pass(self, engine):
        """R006 should pass when tolerance >= 0.1."""
        results = engine.validate(
            dimensions={"tolerance": 0.15},
            geometric_type="box",
        )
        r006 = next(r for r in results if r.rule_id == "R006")
        assert r006.passed is True

    def test_r006_tolerance_fit_fail(self, engine):
        """R006 should fail when tolerance < 0.1."""
        results = engine.validate(
            dimensions={"tolerance": 0.05},
            geometric_type="box",
        )
        r006 = next(r for r in results if r.rule_id == "R006")
        assert r006.passed is False

    def test_all_six_rules_returned(self, engine):
        """Validate should return results for all 6 rules."""
        results = engine.validate(
            dimensions={"wall_thickness": 2.0},
            geometric_type="box",
        )
        rule_ids = {r.rule_id for r in results}
        assert rule_ids == {"R001", "R002", "R003", "R004", "R005", "R006"}

    def test_validation_level_is_engineering(self, engine):
        """All results should have ENGINEERING validation level."""
        results = engine.validate(
            dimensions={"wall_thickness": 2.0},
            geometric_type="box",
        )
        for result in results:
            assert result.level == ValidationLevel.ENGINEERING

    def test_rule_type_mapping(self, engine):
        """Rule types should be correctly mapped."""
        results = engine.validate(
            dimensions={"wall_thickness": 2.0},
            geometric_type="box",
        )
        r001 = next(r for r in results if r.rule_id == "R001")
        assert r001.rule_type == RuleType.WALL_THICKNESS

    def test_measured_value_extraction(self, engine):
        """Measured values should be extracted correctly."""
        results = engine.validate(
            dimensions={"wall_thickness": 2.5, "height": 100, "width": 30},
            geometric_type="box",
        )
        r001 = next(r for r in results if r.rule_id == "R001")
        assert r001.measured_value == 2.5

        r005 = next(r for r in results if r.rule_id == "R005")
        assert r005.measured_value == pytest.approx(100 / 30, rel=0.01)


class TestValidationResult:
    """Test ValidationResult model."""

    def test_is_critical_true_for_failed_error(self):
        """is_critical should be True for failed error severity."""
        result = ValidationResult(
            rule_id="R001",
            rule_name="Wall Thickness",
            level=ValidationLevel.ENGINEERING,
            rule_type=RuleType.WALL_THICKNESS,
            passed=False,
            severity="error",
        )
        assert result.is_critical is True

    def test_is_critical_false_for_failed_warning(self):
        """is_critical should be False for failed warning severity."""
        result = ValidationResult(
            rule_id="R003",
            rule_name="Self-Supporting",
            level=ValidationLevel.ENGINEERING,
            rule_type=RuleType.SELF_SUPPORTING,
            passed=False,
            severity="warning",
        )
        assert result.is_critical is False

    def test_is_critical_false_for_passed(self):
        """is_critical should be False when passed even with error severity."""
        result = ValidationResult(
            rule_id="R001",
            rule_name="Wall Thickness",
            level=ValidationLevel.ENGINEERING,
            rule_type=RuleType.WALL_THICKNESS,
            passed=True,
            severity="error",
        )
        assert result.is_critical is False
