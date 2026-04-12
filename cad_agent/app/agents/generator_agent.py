"""Generator agent - generates SCAD from deterministic synthesis or LLM paths."""

from __future__ import annotations

import time

import structlog

from cad_agent.app.llm.geometry_dsl import GeometryDSLCompiler
from cad_agent.app.llm.scad_generator import LLMScadGenerator
from cad_agent.app.llm.scad_parameter_schema import build_parameter_schema_from_scad
from cad_agent.app.llm.pipeline_utils import has_resolved_part_family, normalize_part_family_value
from cad_agent.app.models.agent_result import AgentResult, AgentRole
from cad_agent.app.models.design_job import DesignJob, JobState

logger = structlog.get_logger()


class GeneratorAgent:
    """Generate SCAD source for a design job."""

    COMPLEX_LLM_NATIVE_KEYWORDS = (
        "gear",
        "spur gear",
        "helical gear",
        "bevel gear",
        "worm gear",
        "sprocket",
        "threaded",
        "thread",
        "bearing",
        "cam",
    )
    MCAD_SPUR_GEAR_PATH = "MCAD/involute_gears.scad"

    def __init__(
        self,
        llm_scad_generator: LLMScadGenerator | None = None,
        dsl_compiler: GeometryDSLCompiler | None = None,
    ):
        """Initialize generator."""
        self._llm_scad_generator = llm_scad_generator
        self._dsl_compiler = dsl_compiler or GeometryDSLCompiler()

    async def generate(self, job: DesignJob) -> AgentResult:
        """Generate SCAD source for the active job."""
        start_time = time.time()
        logger.info(
            "generating_scad",
            job_id=job.id,
            part_family=job.part_family,
        )

        if (
            not job.spec
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
                error="No parsed spec or deterministic geometry plan available",
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
                error="Cannot repair without a parsed design target",
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

        if job.generation_path == "inferred_parametric_scad" and self._llm_scad_generator is not None:
            try:
                job.scad_source = await self._llm_scad_generator.generate_implicit_template(job, repair_notes=repair_notes)
                self._hydrate_parameter_schema_from_scad(job, job.scad_source)
                result = AgentResult(
                    success=True,
                    agent=AgentRole.GENERATOR,
                    state_reached=self._success_state(job).value,
                    data={"scad_source": job.scad_source[:500] + "..." if len(job.scad_source) > 500 else job.scad_source},
                )
                result.duration_ms = int((time.time() - start_time) * 1000)
                return result
            except Exception as e:
                logger.error("inferred_parametric_repair_failed", job_id=job.id, error=str(e))

        if job.generation_path == "llm_native_scad" and self._llm_scad_generator is not None:
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
        """Build SCAD either from deterministic synthesis or LLM generation."""
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

        if self._should_generate_mcad_spur_gear(job):
            job.generation_path = "mcad_spur_gear"
            return self._build_mcad_spur_gear(job)

        if self._should_generate_inferred_parametric(job):
            if self._llm_scad_generator is None:
                raise RuntimeError("Inferred parametric generation requires an LLM generator, but none is configured")
            scad_source = await self._llm_scad_generator.generate_implicit_template(job)
            job.generation_path = "inferred_parametric_scad"
            self._hydrate_parameter_schema_from_scad(job, scad_source)
            return scad_source

        if self._should_generate_llm_native(job):
            if self._llm_scad_generator is None:
                raise RuntimeError("Complex geometry requires an LLM generator, but none is configured")
            job.generation_path = "llm_native_scad"
            return await self._llm_scad_generator.generate(job)

        raise RuntimeError("No geometry generation path available")

    def _should_generate_dsl(self, job: DesignJob) -> bool:
        """Return whether the job should use the DSL-first generation path."""
        family = normalize_part_family_value(job.part_family)
        return family in {"phone_case"} or job.generation_path == "dsl"

    def _should_generate_mcad_spur_gear(self, job: DesignJob) -> bool:
        """Return whether the job should use deterministic MCAD spur-gear generation."""
        if job.spec is None:
            return False

        family = normalize_part_family_value(job.part_family)
        haystack = " ".join(
            part for part in (job.input_request, job.spec.geometric_type, job.part_family or "") if part
        ).lower()
        if any(keyword in haystack for keyword in ("helical", "bevel", "worm")):
            return False
        return family == "spur_gear" or "spur gear" in haystack or "齿轮" in haystack or "gear" in haystack

    def _should_generate_inferred_parametric(self, job: DesignJob) -> bool:
        """Return whether the job should use inferred parametric OpenSCAD."""
        if self._llm_scad_generator is None:
            return False
        if job.spec is None:
            return False
        if job.geometry_dsl or self._has_object_model_synthesis(job) or self._has_geometry_intent_synthesis(job):
            return False
        return not self._should_generate_llm_native(job)

    def _should_generate_llm_native(self, job: DesignJob) -> bool:
        """Return whether the job should use freeform LLM-native generation."""
        if self._llm_scad_generator is None or job.spec is None:
            return False
        haystack = " ".join(
            part for part in (job.input_request, job.spec.geometric_type, job.part_family or "") if part
        ).lower()
        return any(keyword in haystack for keyword in self.COMPLEX_LLM_NATIVE_KEYWORDS)

    def _hydrate_parameter_schema_from_scad(self, job: DesignJob, scad_source: str) -> None:
        """Populate job.parameter_schema by inferring editable parameters from SCAD."""
        schema = build_parameter_schema_from_scad(
            job.input_request,
            scad_source,
            part_family=job.part_family,
            design_summary=job.design_result.design_intent_summary if job.design_result else "",
        )
        if schema is None:
            return
        current_schema = job.parameter_schema
        should_override = current_schema is None or not current_schema.parameters or current_schema.error_message
        if should_override:
            job.parameter_schema = schema
        elif current_schema and not current_schema.user_parameters:
            job.parameter_schema = schema
        job.set_parameter_values(schema.parameter_values())

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
        return JobState.SCAD_GENERATED

    def _failure_state(self, job: DesignJob) -> JobState:
        """Return the next failure state for the active generation path."""
        return JobState.GEOMETRY_FAILED

    def _build_mcad_spur_gear(self, job: DesignJob) -> str:
        """Build a patchable MCAD-backed spur gear for reliable OpenSCAD output."""
        teeth = max(8, int(round(self._gear_value(job, keys=("teeth", "齿数"), default=17.0))))
        outer_diameter = float(self._gear_value(job, keys=("outer_diameter", "外径"), default=30.0))
        inner_diameter = float(
            self._gear_value(job, keys=("inner_diameter", "bore_diameter", "内孔径", "内径"), default=10.0)
        )
        thickness = max(1.0, float(self._gear_value(job, keys=("thickness", "厚度"), default=3.0)))
        pressure_angle = min(
            35.0,
            max(14.5, float(self._gear_value(job, keys=("pressure_angle", "压力角"), default=20.0))),
        )
        backlash = max(0.0, float(self._gear_value(job, keys=("backlash",), default=0.0)))

        if outer_diameter <= inner_diameter:
            raise RuntimeError("Requested gear outer diameter must be larger than the bore diameter")

        module_size = outer_diameter / (teeth + 2.0)
        root_diameter = module_size * (teeth - 2.5)
        min_web = max(module_size, 1.0)
        if root_diameter <= inner_diameter + min_web:
            raise RuntimeError("Requested gear leaves no printable material between the bore and tooth root")

        return (
            "// Deterministic MCAD-backed spur gear for stable, renderable output.\n"
            "$fn = 96;\n"
            f"teeth = {teeth}; // [group: gear] tooth count\n"
            f"outer_diameter = {outer_diameter:.4f}; // [group: gear] tip diameter in mm\n"
            f"inner_diameter = {inner_diameter:.4f}; // [group: fit] bore diameter in mm\n"
            f"thickness = {thickness:.4f}; // [group: general] gear thickness in mm\n"
            f"pressure_angle = {pressure_angle:.4f}; // [group: gear] involute pressure angle in degrees\n"
            f"backlash = {backlash:.4f}; // [group: fit] tangential backlash in mm\n"
            "\n"
            "module_size = outer_diameter / (teeth + 2);\n"
            "circular_pitch = module_size * 180;\n"
            "clearance = module_size * 0.25;\n"
            "pitch_diameter = module_size * teeth;\n"
            "root_diameter = pitch_diameter - (2 * (module_size + clearance));\n"
            "hub_diameter = min(root_diameter * 0.75, max(inner_diameter + (module_size * 2.5), inner_diameter + 4));\n"
            "rim_width = max(module_size, (root_diameter - hub_diameter) / 2);\n"
            "\n"
            f"include <{self.MCAD_SPUR_GEAR_PATH}>;\n"
            "\n"
            "gear(\n"
            "    number_of_teeth=teeth,\n"
            "    circular_pitch=circular_pitch,\n"
            "    pressure_angle=pressure_angle,\n"
            "    clearance=clearance,\n"
            "    gear_thickness=thickness,\n"
            "    rim_thickness=thickness,\n"
            "    rim_width=rim_width,\n"
            "    hub_thickness=thickness,\n"
            "    hub_diameter=hub_diameter,\n"
            "    bore_diameter=inner_diameter,\n"
            "    backlash=backlash\n"
            ");\n"
        )

    def _gear_value(self, job: DesignJob, *, keys: tuple[str, ...], default: float) -> float:
        """Resolve a numeric gear parameter from normalized parameters or spec dimensions."""
        values = job.get_effective_parameter_values()
        for key in keys:
            if key in values and isinstance(values[key], (int, float)):
                return float(values[key])

        dimensions = job.spec.dimensions if job.spec else {}
        for key in keys:
            if key in dimensions and isinstance(dimensions[key], (int, float)):
                return float(dimensions[key])

        return default
