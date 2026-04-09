"""Generator agent - renders SCAD from Jinja2 templates."""

import time
from pathlib import Path

import structlog

from cad_agent.app.llm.scad_generator import LLMScadGenerator
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
    ):
        """Initialize generator with templates directory."""
        self.templates_dir = Path(templates_dir)
        self._llm_scad_generator = llm_scad_generator
        self._part_engine = part_engine or ParametricPartEngine()

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

        if not job.template_choice and not job.part_family:
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
            if failure.rule_id == "R001":
                adjusted_params["wall_thickness"] = max(
                    adjusted_params.get("wall_thickness", 2.0),
                    1.2
                )
                repair_notes.append("Increase wall thickness to at least 1.2mm.")
            elif failure.rule_id == "R002":
                for dim in ["length", "width", "height"]:
                    if dim in adjusted_params:
                        adjusted_params[dim] = min(adjusted_params[dim], 200.0)
                repair_notes.append("Clamp all printable dimensions to 200mm or below.")
            elif failure.rule_id == "R005":
                if adjusted_params.get("height", 0) / max(adjusted_params.get("width", 1), 1) > 4.0:
                    adjusted_params["height"] = adjusted_params.get("width", 20.0) * 4.0
                repair_notes.append("Reduce aspect ratio so height-to-width stays at or below 4:1.")
            elif failure.message:
                repair_notes.append(failure.message)

        job.set_parameter_values(adjusted_params)

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

    async def _build_scad_source(self, job: DesignJob) -> str:
        """Build SCAD either from a template or from the LLM-native path."""
        if job.part_family and self._part_engine.supports(job.part_family):
            build_result = self._part_engine.build(job.part_family, job.get_effective_parameter_values())
            job.builder_name = type(self._part_engine._builders[job.part_family]).__name__
            job.part_family = build_result.family
            job.set_parameter_values(build_result.parameters)
            if not job.business_context:
                job.business_context = {}
            job.business_context["derived_parameters"] = build_result.derived
            job.business_context["builder_validations"] = [
                {"code": issue.code, "message": issue.message, "severity": issue.severity}
                for issue in build_result.validations
            ]
            return build_result.scad_source

        if not job.template_choice:
            raise ParametricBuilderError("Missing template choice for non-parametric geometry")

        template_name = job.template_choice.template_name
        if template_name == "llm_native_v1":
            if self._llm_scad_generator is None:
                raise RuntimeError("Complex geometry requires an LLM generator, but none is configured")
            return await self._llm_scad_generator.generate(job)

        from jinja2 import Environment, FileSystemLoader

        env = Environment(loader=FileSystemLoader(str(self.templates_dir)))
        template = env.get_template(f"{template_name}.scad.j2")
        return template.render(**job.template_choice.parameters)

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
