"""Generator agent - renders SCAD from Jinja2 templates."""

from __future__ import annotations

import time
from pathlib import Path

import structlog

from cad_agent.app.llm.geometry_dsl import GeometryDSLCompiler
from cad_agent.app.llm.scad_generator import LLMScadGenerator
from cad_agent.app.llm.pipeline_utils import has_resolved_part_family, normalize_part_family_value
from cad_agent.app.models.agent_result import AgentResult, AgentRole
from cad_agent.app.models.design_job import DesignJob, JobState
from cad_agent.app.parametric import ParametricPartEngine
from cad_agent.app.parametric.builders import ParametricBuilderError

logger = structlog.get_logger()


class GeneratorAgent:
    """Renders SCAD source from Jinja2 templates."""

    def __init__(
        self,
        templates_dir: str = "cad_agent/app/templates",
        llm_scad_generator: LLMScadGenerator | None = None,
        part_engine: ParametricPartEngine | None = None,
        dsl_compiler: GeometryDSLCompiler | None = None,
    ):
        """Initialize generator with templates directory."""
        self.templates_dir = Path(templates_dir)
        self._llm_scad_generator = llm_scad_generator
        self._part_engine = part_engine or ParametricPartEngine()
        self._dsl_compiler = dsl_compiler or GeometryDSLCompiler()

    async def generate(self, job: DesignJob) -> AgentResult:
        """Generate SCAD source from template.

        Args:
            job: DesignJob with template_choice set

        Returns:
            AgentResult with SCAD source in data["scad_source"]
        """
        start_time = time.time()
        logger.info(
            "generating_scad",
            job_id=job.id,
            template=job.template_choice.template_name if job.template_choice else None,
            part_family=job.part_family,
        )

        if (
            not job.template_choice
            and not has_resolved_part_family(job.part_family)
            and not job.geometry_dsl
            and not self._has_object_model_synthesis(job)
            and not self._has_geometry_intent_synthesis(job)
            and not self._should_generate_dsl(job)
        ):
            return AgentResult(
                success=False,
                agent=AgentRole.GENERATOR,
                state_reached=JobState.GEOMETRY_FAILED.value,
                error="No deterministic part family or template choice available",
            )

        try:
            scad_source = await self._build_scad_source(job)
            job.scad_source = scad_source

            result = AgentResult(
                success=True,
                agent=AgentRole.GENERATOR,
                state_reached=self._success_state(job).value,
                data={
                    "scad_source": scad_source[:500] + "..." if len(scad_source) > 500 else scad_source,
                    "part_family": job.part_family,
                    "builder_name": job.builder_name,
                    "parameter_values": job.get_effective_parameter_values(),
                },
            )

        except Exception as e:
            logger.error("scad_generation_failed", job_id=job.id, error=str(e))
            result = AgentResult(
                success=False,
                agent=AgentRole.GENERATOR,
                state_reached=self._failure_state(job).value,
                error=f"SCAD generation failed: {e}",
            )

        result.duration_ms = int((time.time() - start_time) * 1000)
        return result

    async def repair(self, job: DesignJob) -> AgentResult:
        """Generate repaired SCAD based on validation failures.

        Args:
            job: DesignJob in REPAIRING state with validation failures

        Returns:
            AgentResult with repaired SCAD source
        """
        start_time = time.time()
        logger.info("repairing_scad", job_id=job.id)

        if not job.spec and not job.part_family:
            return AgentResult(
                success=False,
                agent=AgentRole.GENERATOR,
                state_reached=job.state.value,
                error="Cannot repair without a supported part family or template choice",
            )

        failures = [v for v in job.validation_results if not v.passed]
        adjusted_params = job.get_effective_parameter_values()
        repair_notes: list[str] = []

        for failure in failures:
            rule_type = getattr(failure, "rule_type", None)
            
            if rule_type == "wall_thickness":
                adjusted_params["wall_thickness"] = max(
                    adjusted_params.get("wall_thickness", 2.0),
                    1.2
                )
                repair_notes.append(failure.message or "Increased wall thickness to minimum required.")
            elif rule_type == "max_dimensions":
                self._repair_max_dimensions(adjusted_params)
                repair_notes.append(failure.message or "Clamped envelope dimensions to maximum allowed.")
            elif rule_type == "aspect_ratio":
                if adjusted_params.get("height", 0) / max(adjusted_params.get("width", 1), 1) > 4.0:
                    adjusted_params["height"] = adjusted_params.get("width", 20.0) * 4.0
                repair_notes.append(failure.message or "Reduced aspect ratio for stability.")
            elif failure.message:
                repair_notes.append(failure.message)

        job.set_parameter_values(adjusted_params)

        # Sync repaired dimensions back to spec so future validations use updated values
        if job.spec:
            self._sync_spec_dimensions(job)

        if job.part_family and self._part_engine.supports(job.part_family):
            return await self.generate(job)

        if job.template_choice and job.template_choice.template_name == "llm_native_v1" and self._llm_scad_generator is not None:
            try:
                job.scad_source = await self._llm_scad_generator.generate(job, repair_notes=repair_notes)
                result = AgentResult(
                    success=True,
                    agent=AgentRole.GENERATOR,
                    state_reached=self._success_state(job).value,
                    data={"scad_source": job.scad_source[:500] + "..." if len(job.scad_source) > 500 else job.scad_source},
                )
                result.duration_ms = int((time.time() - start_time) * 1000)
                return result
            except Exception as e:
                logger.error("llm_scad_repair_failed", job_id=job.id, error=str(e))

        return await self.generate(job)

    def _repair_max_dimensions(self, params: dict) -> None:
        """Clamp envelope dimensions to the FDM printing limit.

        Uses the shared ``_ENVELOPE_DIMENSION_KEYS`` whitelist so every builder's
        dimension parameter names are handled without per-family branching.
        """
        from cad_agent.app.rules.engineering_rules import (
            _ENVELOPE_DIMENSION_KEYS,
            MAX_FDM_DIMENSION_MM,
        )

        for key in list(params.keys()):
            if key in _ENVELOPE_DIMENSION_KEYS and isinstance(params[key], (int, float)):
                if params[key] > MAX_FDM_DIMENSION_MM:
                    params[key] = MAX_FDM_DIMENSION_MM

    def _sync_spec_dimensions(self, job: DesignJob) -> None:
        """Sync actual build parameters back into spec.dimensions for consistency.

        Copies all envelope-related parameter values so that future validation
        rounds use the repaired values rather than stale intake-spec values.
        """
        from cad_agent.app.rules.engineering_rules import _ENVELOPE_DIMENSION_KEYS

        if not job.spec:
            return
        params = job.get_effective_parameter_values()
        for key in _ENVELOPE_DIMENSION_KEYS:
            if key in params:
                job.spec.dimensions[key] = params[key]
        # Also sync wall_thickness as it feeds R001
        if "wall_thickness" in params:
            job.spec.dimensions["wall_thickness"] = params["wall_thickness"]

    async def _build_scad_source(self, job: DesignJob) -> str:
        """Build SCAD either from a template or from the LLM-native path."""
        if self._has_object_model_synthesis(job):
            object_model = self._object_model(job)
            job.geometry_dsl = self._dsl_compiler.build_support_base(object_model, job.get_effective_parameter_values())
            job.generation_path = "object_model"
            return self._dsl_compiler.compile(job.geometry_dsl)

        if self._has_geometry_intent_synthesis(job):
            geometry_intent = self._geometry_intent(job)
            job.geometry_dsl = self._dsl_compiler.build_geometry_intent(
                geometry_intent,
                job.get_effective_parameter_values(),
            )
            job.generation_path = "geometry_intent"
            return self._dsl_compiler.compile(job.geometry_dsl)

        if job.part_family and self._part_engine.supports(job.part_family):
            build_result = self._part_engine.build(job.part_family, job.get_effective_parameter_values())
            job.builder_name = type(self._part_engine._builders[job.part_family]).__name__
            job.part_family = build_result.family
            job.generation_path = "parametric_builder"
            job.set_parameter_values(build_result.parameters)
            if not job.business_context:
                job.business_context = {}
            job.business_context["derived_parameters"] = build_result.derived
            job.business_context["builder_validations"] = [
                {"code": issue.code, "message": issue.message, "severity": issue.severity}
                for issue in build_result.validations
            ]
            return build_result.scad_source

        if normalize_part_family_value(job.part_family) == "phone_case" and not job.geometry_dsl:
            job.geometry_dsl = self._dsl_compiler.build_phone_case(job.get_effective_parameter_values())
            job.generation_path = "dsl"
            return self._dsl_compiler.compile(job.geometry_dsl)

        if job.geometry_dsl:
            job.generation_path = "dsl"
            return self._dsl_compiler.compile(job.geometry_dsl)

        if self._should_generate_dsl(job):
            if self._llm_scad_generator is None:
                raise RuntimeError("DSL generation requires an LLM generator, but none is configured")
            job.geometry_dsl = await self._llm_scad_generator.generate_geometry_dsl(job)
            job.generation_path = "dsl"
            return self._dsl_compiler.compile(job.geometry_dsl)

        if not job.template_choice:
            raise ParametricBuilderError("Missing template choice for non-parametric geometry")

        template_name = job.template_choice.template_name
        if template_name == "llm_native_v1":
            if self._llm_scad_generator is None:
                raise RuntimeError("Complex geometry requires an LLM generator, but none is configured")
            job.generation_path = "llm_native_scad"
            return await self._llm_scad_generator.generate(job)

        from jinja2 import Environment, FileSystemLoader

        env = Environment(loader=FileSystemLoader(str(self.templates_dir)))
        template = env.get_template(f"{template_name}.scad.j2")
        job.generation_path = "template"
        return template.render(**job.template_choice.parameters)

    def _should_generate_dsl(self, job: DesignJob) -> bool:
        """Return whether the job should use the DSL-first generation path."""
        family = normalize_part_family_value(job.part_family)
        return family in {"phone_case"} or job.generation_path == "dsl"

    def _has_object_model_synthesis(self, job: DesignJob) -> bool:
        """Return whether the job can synthesize geometry directly from an object model."""
        object_model = self._object_model(job)
        if not object_model:
            return False
        if object_model.get("synthesis_kind") == "support_base":
            return True
        return (
            object_model.get("support_strategy") == "raised_base_with_top_alignment_pocket"
            and isinstance(object_model.get("base_footprint_mm"), dict)
            and isinstance(object_model.get("support_surface_mm"), dict)
        )

    def _object_model(self, job: DesignJob) -> dict:
        """Return the active object model from job context."""
        if isinstance(job.business_context.get("object_model"), dict):
            return job.business_context["object_model"]
        if job.research_result and isinstance(job.research_result.object_model, dict):
            return job.research_result.object_model
        return {}

    def _has_geometry_intent_synthesis(self, job: DesignJob) -> bool:
        """Return whether the job can synthesize geometry directly from a generic intent."""
        geometry_intent = self._geometry_intent(job)
        return bool(geometry_intent) and geometry_intent.get("intent_type") in {"frustum_shell", "half_frustum_shell"}

    def _geometry_intent(self, job: DesignJob) -> dict:
        """Return the active geometry intent from job context."""
        geometry_intent = job.business_context.get("geometry_intent")
        if isinstance(geometry_intent, dict):
            return geometry_intent
        return {}

    def _success_state(self, job: DesignJob) -> JobState:
        """Return the next success state for the active generation path."""
        if job.part_family and self._part_engine.supports(job.part_family):
            return JobState.GEOMETRY_BUILT
        return JobState.SCAD_GENERATED

    def _failure_state(self, job: DesignJob) -> JobState:
        """Return the next failure state for the active generation path."""
        if job.part_family and self._part_engine.supports(job.part_family):
            return JobState.GEOMETRY_FAILED
        return JobState.SCAD_GENERATED
