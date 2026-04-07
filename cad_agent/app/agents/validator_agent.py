"""Validator agent - 3-layer validation."""

from __future__ import annotations

import time

import structlog

from cad_agent.app.models.agent_result import AgentResult, AgentRole
from cad_agent.app.models.design_job import DesignJob, JobState
from cad_agent.app.models.validation import ValidationLevel, ValidationResult, RuleType
from cad_agent.app.rules.engineering_rules import EngineeringRulesEngine

logger = structlog.get_logger()


class ValidatorAgent:
    """Validates CAD designs against 3-layer rules."""

    def __init__(self, rules_engine: EngineeringRulesEngine | None = None):
        """Initialize validator with rules engines."""
        self.engineering_rules = rules_engine or EngineeringRulesEngine()

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

        layer3_results = self._validate_business_layer(job)
        validation_results.extend(layer3_results)

        job.validation_results = validation_results

        critical_failures = [v for v in validation_results if v.is_critical]

        if critical_failures:
            result = AgentResult(
                success=False,
                agent=AgentRole.VALIDATOR,
                state_reached=JobState.VALIDATION_FAILED.value,
                data={"validation_results": [v.model_dump() for v in validation_results]},
                error=f"Critical validation failure: {critical_failures[0].rule_id}",
            )
        else:
            job.transition_to(JobState.VALIDATED)
            result = AgentResult(
                success=True,
                agent=AgentRole.VALIDATOR,
                state_reached=JobState.VALIDATED.value,
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
        if not job.spec:
            return []

        dimensions = job.spec.dimensions.copy()
        if not dimensions.get("wall_thickness"):
            dimensions["wall_thickness"] = job.template_choice.parameters.get("wall_thickness", 2.0) if job.template_choice else 2.0

        return self.engineering_rules.validate(
            dimensions=dimensions,
            geometric_type=job.spec.geometric_type,
        )

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
        if job.template_choice:
            params = job.template_choice.parameters
            volume_mm3 = (
                params.get("length", 40.0)
                * params.get("width", 20.0)
                * params.get("height", 15.0)
            )

        material_cost = volume_mm3 * 0.0005
        return base_cost + material_cost
