"""Engineering rules engine for CAD validation."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any

from cad_agent.app.models.validation import ValidationLevel, ValidationResult


class RuleType(str, Enum):
    """Engineering rule types."""

    WALL_THICKNESS = "wall_thickness"
    MAX_DIMENSIONS = "max_dimensions"
    SELF_SUPPORTING = "self_supporting"
    THREAD_WALL_THICKNESS = "thread_wall_thickness"
    ASPECT_RATIO = "aspect_ratio"


# Keys that represent physical envelope dimensions for R002 checks.
# Only these keys are tested against the 200mm FDM limit.
_ENVELOPE_DIMENSION_KEYS = frozenset({
    "length", "width", "height", "depth",
    "outer_width", "outer_depth", "outer_height",
    "device_width", "device_depth", "stand_height",
    "outer_diameter", "outer_dia",
    "_max_x", "_max_y", "_max_z",
})

# Maximum single-axis dimension for FDM printing (mm).
MAX_FDM_DIMENSION_MM: float = 200.0


@dataclass
class Rule:
    """A single engineering validation rule."""

    id: str
    name: str
    description: str
    severity: str
    check_fn: callable


class EngineeringRulesEngine:
    """Validates CAD designs against engineering rules."""

    @staticmethod
    def _requires_thread_rule(dimensions: dict[str, Any], geometric_type: str) -> bool:
        """Apply thread checks only to parts that actually include threads."""
        geometric_type_lower = geometric_type.lower()
        if "thread" in geometric_type_lower:
            return True
        return any(
            key in dimensions
            for key in ("thread_wall_thickness", "thread_diameter", "thread_pitch")
        )

    @staticmethod
    def _envelope_values(dims: dict[str, Any]) -> list[float]:
        """Extract only the envelope dimension values from a dimensions dict."""
        return [
            float(v)
            for k, v in dims.items()
            if k in _ENVELOPE_DIMENSION_KEYS and isinstance(v, (int, float))
        ]

    RULES = [
        Rule(
            id="R001",
            name="Minimum Wall Thickness",
            description="Wall thickness must be >= 1.2mm for structural integrity",
            severity="error",
            check_fn=lambda dims: dims.get("wall_thickness", 0) >= 1.2,
        ),
        Rule(
            id="R002",
            name="Maximum Dimensions",
            description=f"No dimension should exceed {MAX_FDM_DIMENSION_MM}mm for FDM printing",
            severity="error",
            check_fn=lambda dims: all(
                v <= MAX_FDM_DIMENSION_MM
                for v in EngineeringRulesEngine._envelope_values(dims)
            ) if EngineeringRulesEngine._envelope_values(dims) else True,
        ),
        Rule(
            id="R003",
            name="Self-Supporting Design",
            description="Model should not require support material for printing",
            severity="warning",
            check_fn=lambda dims: dims.get("overhang_angle", 45) >= 45,
        ),
        Rule(
            id="R004",
            name="Thread Wall Thickness",
            description="For threaded parts, wall thickness >= 3mm around thread",
            severity="error",
            check_fn=lambda dims: dims.get("thread_wall_thickness", 0) >= 3.0,
        ),
        Rule(
            id="R005",
            name="Aspect Ratio",
            description="Height-to-width ratio should be <= 4:1 for stability",
            severity="warning",
            check_fn=lambda dims: (
                dims.get("height", 0) / max(dims.get("width", 1), 1) <= 4.0
            ),
        ),
        Rule(
            id="R006",
            name="Tolerance Fit",
            description="Tolerances should be appropriate for the printing method",
            severity="warning",
            check_fn=lambda dims: dims.get("tolerance", 0.1) >= 0.1,
        ),
    ]

    def validate(
        self,
        dimensions: dict[str, Any],
        geometric_type: str,
    ) -> list[ValidationResult]:
        """Run all engineering rules against the given dimensions.

        Args:
            dimensions: Dictionary of dimension values
            geometric_type: Type of geometric shape

        Returns:
            List of ValidationResult objects
        """
        results = []

        for rule in self.RULES:
            try:
                if rule.id == "R004" and not self._requires_thread_rule(dimensions, geometric_type):
                    passed = True
                else:
                    passed = rule.check_fn(dimensions)
                measured = self._extract_measured_value(rule.id, dimensions)

                results.append(
                    ValidationResult(
                        rule_id=rule.id,
                        rule_name=rule.name,
                        level=ValidationLevel.ENGINEERING,
                        rule_type={
                            "001": RuleType.WALL_THICKNESS,
                            "002": RuleType.MAX_DIMENSIONS,
                            "003": RuleType.SELF_SUPPORTING,
                            "004": RuleType.THREAD_WALL_THICKNESS,
                            "005": RuleType.ASPECT_RATIO,
                            "006": RuleType.ASPECT_RATIO,
                        }.get(rule.id[1:], RuleType.ASPECT_RATIO),
                        passed=passed,
                        severity=rule.severity,
                        message=rule.description,
                        measured_value=measured,
                        details={"geometric_type": geometric_type},
                    )
                )
            except Exception as e:
                results.append(
                    ValidationResult(
                        rule_id=rule.id,
                        rule_name=rule.name,
                        level=ValidationLevel.ENGINEERING,
                        rule_type={
                            "001": RuleType.WALL_THICKNESS,
                            "002": RuleType.MAX_DIMENSIONS,
                            "003": RuleType.SELF_SUPPORTING,
                            "004": RuleType.THREAD_WALL_THICKNESS,
                            "005": RuleType.ASPECT_RATIO,
                            "006": RuleType.ASPECT_RATIO,
                        }.get(rule.id[1:], RuleType.ASPECT_RATIO),
                        passed=False,
                        severity="error",
                        message=f"Rule check failed: {e}",
                    )
                )

        return results

    def _extract_measured_value(
        self, rule_id: str, dimensions: dict[str, Any]
    ) -> float | None:
        """Extract the relevant measured value for a rule."""
        if rule_id == "R002":
            envelope = self._envelope_values(dimensions)
            return max(envelope) if envelope else None

        mapping = {
            "R001": dimensions.get("wall_thickness"),
            "R003": dimensions.get("overhang_angle"),
            "R004": dimensions.get("thread_wall_thickness"),
            "R005": dimensions.get("height", 0) / max(dimensions.get("width", 1), 1),
            "R006": dimensions.get("tolerance"),
        }
        return mapping.get(rule_id)
