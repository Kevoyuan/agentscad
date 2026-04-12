"""Validator agent - 3-layer validation."""

from __future__ import annotations

import time
from typing import Any

import structlog

from cad_agent.app.llm.design_critic import LLMDesignCritic
from cad_agent.app.models.agent_result import AgentResult, AgentRole
from cad_agent.app.models.design_job import DesignJob, JobState
from cad_agent.app.models.validation import ValidationLevel, ValidationResult, RuleType
from cad_agent.app.rules.engineering_rules import EngineeringRulesEngine

logger = structlog.get_logger()


class ValidatorAgent:
    """Validates CAD designs against 3-layer rules."""

    COMPLEX_KEYWORDS = (
        "gear",
        "sprocket",
        "bearing",
        "thread",
        "cam",
        "helical",
        "bevel",
        "worm",
    )

    def __init__(
        self,
        rules_engine: EngineeringRulesEngine | None = None,
        design_critic: LLMDesignCritic | None = None,
    ):
        """Initialize validator with rules engines."""
        self.engineering_rules = rules_engine or EngineeringRulesEngine()
        self.design_critic = design_critic

    async def validate(self, job: DesignJob) -> AgentResult:
        """Run 3-layer validation on rendered design.

        Layer 1: Render validation (syntax, render success)
        Layer 2: Engineering rules (R001-R006)
        Layer 3: Business acceptance

        Args:
            job: DesignJob in RENDERED state

        Returns:
            AgentResult with validation results
        """
        start_time = time.time()
        logger.info("validating_design", job_id=job.id)

        validation_results = []

        layer1_results = self._validate_render_layer(job)
        validation_results.extend(layer1_results)

        layer2_results = self._validate_engineering_layer(job)
        validation_results.extend(layer2_results)

        layer25_results = await self._validate_semantic_layer(job)
        validation_results.extend(layer25_results)

        layer3_results = self._validate_business_layer(job)
        validation_results.extend(layer3_results)

        job.validation_results = validation_results

        critical_failures = [v for v in validation_results if v.is_critical]

        review_state = JobState.REVIEWED if job.part_family else JobState.VALIDATED

        if critical_failures:
            result = AgentResult(
                success=False,
                agent=AgentRole.VALIDATOR,
                state_reached=JobState.REVIEW_FAILED.value if job.part_family else JobState.VALIDATION_FAILED.value,
                data={"validation_results": [v.model_dump() for v in validation_results]},
                error=f"Critical validation failure: {critical_failures[0].rule_id}",
            )
        else:
            job.transition_to(review_state)
            result = AgentResult(
                success=True,
                agent=AgentRole.VALIDATOR,
                state_reached=review_state.value,
                data={"validation_results": [v.model_dump() for v in validation_results]},
            )

        result.duration_ms = int((time.time() - start_time) * 1000)
        return result

    def _validate_render_layer(self, job: DesignJob) -> list[ValidationResult]:
        """Layer 1: Validate render success."""
        results = []

        if job.artifacts.stl_path:
            from pathlib import Path
            stl_exists = Path(job.artifacts.stl_path).exists()
            results.append(
                ValidationResult(
                    rule_id="L1_STL",
                    rule_name="STL Generation",
                    level=ValidationLevel.RENDER,
                    rule_type=RuleType.SYNTAX,
                    passed=stl_exists,
                    severity="error",
                    message="STL file generated successfully" if stl_exists else "STL file not generated",
                )
            )

        results.append(
            ValidationResult(
                rule_id="L1_SYNTAX",
                rule_name="SCAD Syntax",
                level=ValidationLevel.RENDER,
                rule_type=RuleType.SYNTAX,
                passed=True,
                severity="error",
                message="SCAD syntax is valid",
            )
        )

        return results

    def _validate_engineering_layer(self, job: DesignJob) -> list[ValidationResult]:
        """Layer 2: Validate engineering rules."""
        dimensions: dict[str, Any] = {}

        if job.part_family and job.parameter_values:
            dimensions = job.get_effective_parameter_values()
        elif job.spec:
            dimensions = job.spec.dimensions.copy()

        if not dimensions:
            return []

        if job.business_context and "derived_parameters" in job.business_context:
            dimensions.update(job.business_context["derived_parameters"])

        if not dimensions.get("wall_thickness"):
            dimensions["wall_thickness"] = job.get_effective_parameter_values().get("wall_thickness", 2.0)

        geometric_type = job.spec.geometric_type if job.spec else ""

        return self.engineering_rules.validate(
            dimensions=dimensions,
            geometric_type=geometric_type,
        )

    async def _validate_semantic_layer(self, job: DesignJob) -> list[ValidationResult]:
        """Ensure generated geometry matches the intended object class."""
        if not job.spec or not job.scad_source:
            return []
        if not self._requires_semantic_review(job):
            return []

        if self.design_critic is not None:
            try:
                review = await self.design_critic.review(job)
                return [self._semantic_result_from_review(review)]
            except Exception as exc:
                logger.warning("semantic_review_failed", job_id=job.id, error=str(exc))

        return [self._heuristic_semantic_result(job)]

    def _validate_business_layer(self, job: DesignJob) -> list[ValidationResult]:
        """Layer 3: Validate business acceptance criteria."""
        results = []

        if job.spec and job.spec.cost_target:
            estimated_cost = self._estimate_cost(job)
            results.append(
                ValidationResult(
                    rule_id="B001",
                    rule_name="Cost Target",
                    level=ValidationLevel.BUSINESS,
                    rule_type=RuleType.COST,
                    passed=estimated_cost <= job.spec.cost_target,
                    severity="warning",
                    message=f"Estimated cost ${estimated_cost:.2f} vs target ${job.spec.cost_target:.2f}",
                    measured_value=estimated_cost,
                    threshold_value=job.spec.cost_target,
                )
            )

        results.append(
            ValidationResult(
                rule_id="B002",
                rule_name="Printability",
                level=ValidationLevel.BUSINESS,
                rule_type=RuleType.SELF_SUPPORTING,
                passed=True,
                severity="warning",
                message="Design appears printable",
            )
        )

        return results

    def _estimate_cost(self, job: DesignJob) -> float:
        """Estimate print cost based on volume and material."""
        base_cost = 5.0

        volume_mm3 = 1.0
        params = job.get_effective_parameter_values()
        if params:
            volume_mm3 = (
                params.get("length", 40.0)
                * params.get("width", 20.0)
                * params.get("height", 15.0)
            )

        material_cost = volume_mm3 * 0.0005
        return base_cost + material_cost

    def _requires_semantic_review(self, job: DesignJob) -> bool:
        """Review LLM-native and complex geometry requests more strictly."""
        if job.generation_path in {
            "object_model",
            "geometry_intent",
            "dsl",
            "inferred_parametric_scad",
            "mcad_spur_gear",
            "llm_native_scad",
        }:
            return True
        object_model = {}
        if job.business_context and isinstance(job.business_context.get("object_model"), dict):
            object_model = job.business_context["object_model"]
        elif job.research_result and isinstance(job.research_result.object_model, dict):
            object_model = job.research_result.object_model
        if object_model.get("synthesis_kind") in {"support_base", "support_mount", "support_stand"}:
            return True
        geometric_type = (job.spec.geometric_type or "").lower()
        return any(keyword in geometric_type for keyword in self.COMPLEX_KEYWORDS)

    def _semantic_result_from_review(self, review: dict[str, Any]) -> ValidationResult:
        """Convert an LLM review payload into a validation result."""
        issues = [str(item) for item in review.get("issues", []) if item]
        suggested_fixes = [str(item) for item in review.get("suggested_fixes", []) if item]
        passed = bool(review.get("passed"))
        confidence = self._coerce_float(review.get("confidence"))
        summary = str(review.get("summary") or "").strip()
        if not summary:
            summary = "Generated CAD matches the requested geometry." if passed else "Generated CAD does not match the requested geometry."

        details: dict[str, Any] = {}
        if issues:
            details["issues"] = issues
        if suggested_fixes:
            details["suggested_fixes"] = suggested_fixes

        return ValidationResult(
            rule_id="S001",
            rule_name="Semantic Geometry Match",
            level=ValidationLevel.ENGINEERING,
            rule_type=RuleType.SEMANTIC,
            passed=passed,
            severity="error",
            message=summary,
            measured_value=confidence,
            threshold_value=0.75,
            details=details,
        )

    def _heuristic_semantic_result(self, job: DesignJob) -> ValidationResult:
        """Fallback semantic validation when an LLM critic is unavailable."""
        geometric_type = (job.spec.geometric_type or "").lower()
        scad_source = job.scad_source.lower()

        if "gear" in geometric_type:
            matched, message, details = self._check_gear_semantics(scad_source)
            return ValidationResult(
                rule_id="S001",
                rule_name="Semantic Geometry Match",
                level=ValidationLevel.ENGINEERING,
                rule_type=RuleType.SEMANTIC,
                passed=matched,
                severity="error",
                message=message,
                details=details,
            )

        object_model = {}
        if job.business_context and isinstance(job.business_context.get("object_model"), dict):
            object_model = job.business_context["object_model"]
        elif job.research_result and isinstance(job.research_result.object_model, dict):
            object_model = job.research_result.object_model

        if object_model.get("synthesis_kind") == "support_base":
            # Markers must match what _support_base_module in geometry_dsl.py generates.
            # Key names differ from what the validator previously expected:
            #   DSL generates rounded_prism (not rounded_rect_prism),
            #   pocket_width/pocket_depth (not support_width/support_depth),
            #   translate([0, 0, pocket_z]) with computed pocket_z (not literal base_height).
            positive_markers = [
                "rounded_prism",
                "difference()",
                "cable_relief_width",
                "pocket_width",
                "pocket_depth",
                "top_alignment_pocket",
            ]
            missing = [marker for marker in positive_markers if marker not in scad_source]
            passed = len(missing) <= 1
            return ValidationResult(
                rule_id="S001",
                rule_name="Semantic Geometry Match",
                level=ValidationLevel.ENGINEERING,
                rule_type=RuleType.SEMANTIC,
                passed=passed,
                severity="error",
                message=(
                    "Support-base geometry matches the object-model intent."
                    if passed
                    else "Generated geometry does not clearly express the expected support-base layout."
                ),
                details={} if passed else {"missing_markers": missing},
            )

        return ValidationResult(
            rule_id="S001",
            rule_name="Semantic Geometry Match",
            level=ValidationLevel.ENGINEERING,
            rule_type=RuleType.SEMANTIC,
            passed=True,
            severity="error",
            message="No semantic mismatch detected for complex geometry.",
        )

    def _check_gear_semantics(self, scad_source: str) -> tuple[bool, str, dict[str, Any]]:
        """Heuristically confirm a gear request looks like gear code, not a box fallback."""
        positive_markers = [
            "teeth",
            "tooth",
            "gear",
            "pitch_dia",
            "pitch_radius",
            "module_value",
            "for (i = [0 : teeth - 1])",
        ]
        negative_markers = [
            "fallback box",
            "finger notch",
            "lid groove",
        ]

        missing = [marker for marker in positive_markers if marker not in scad_source]
        found_negative = [marker for marker in negative_markers if marker in scad_source]

        passed = len(missing) <= 3 and not found_negative
        if passed:
            return (
                True,
                "Generated CAD reads like a gear model rather than a fallback primitive.",
                {"matched_markers": [marker for marker in positive_markers if marker not in missing]},
            )

        return (
            False,
            "Generated CAD does not look like a gear-specific design and likely mismatches the request.",
            {
                "missing_markers": missing,
                "unexpected_markers": found_negative,
            },
        )

    def _coerce_float(self, value: Any) -> float | None:
        """Best-effort float coercion for optional review metadata."""
        try:
            if value is None:
                return None
            return float(value)
        except (TypeError, ValueError):
            return None
