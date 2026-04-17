"""Generator agent - single-pass CAD generation and repair."""

from __future__ import annotations

import time

import structlog

from cad_agent.app.llm.scad_generator import LLMScadGenerator
from cad_agent.app.llm.scad_parameter_schema import apply_parameter_values_to_scad
from cad_agent.app.models.agent_result import AgentResult, AgentRole
from cad_agent.app.models.design_job import DesignJob, JobState

logger = structlog.get_logger()


class GeneratorAgent:
    """Generate SCAD source for a design job in one reasoning step."""

    def __init__(self, llm_scad_generator: LLMScadGenerator | None = None):
        self._llm_scad_generator = llm_scad_generator

    async def generate(self, job: DesignJob) -> AgentResult:
        """Generate SCAD and parameter metadata for the active job."""
        start_time = time.time()
        logger.info("generating_scad_direct", job_id=job.id)

        if self._llm_scad_generator is None:
            return AgentResult(
                success=False,
                agent=AgentRole.GENERATOR,
                state_reached=JobState.GEOMETRY_FAILED.value,
                error="No LLM CAD generator is configured",
            )

        try:
            scad_source, parameter_schema, summary = await self._llm_scad_generator.generate_design(job)
            job.scad_source = scad_source
            job.parameter_schema = parameter_schema
            job.set_parameter_values(parameter_schema.parameter_values())
            job.generation_path = "direct_llm_parametric"
            job.builder_name = None
            job.part_family = None
            self._sync_minimal_business_context(job, summary)
            result = AgentResult(
                success=True,
                agent=AgentRole.GENERATOR,
                state_reached=JobState.SCAD_GENERATED.value,
                data={
                    "summary": summary,
                    "parameter_values": job.get_effective_parameter_values(),
                    "scad_source": scad_source[:500] + "..." if len(scad_source) > 500 else scad_source,
                },
            )
        except Exception as exc:
            logger.error("scad_generation_failed", job_id=job.id, error=str(exc))
            result = AgentResult(
                success=False,
                agent=AgentRole.GENERATOR,
                state_reached=JobState.GEOMETRY_FAILED.value,
                error=f"SCAD generation failed: {exc}",
            )

        result.duration_ms = int((time.time() - start_time) * 1000)
        return result

    async def repair(self, job: DesignJob) -> AgentResult:
        """Repair generated CAD using validation feedback in the same generator loop."""
        start_time = time.time()
        logger.info("repairing_scad_direct", job_id=job.id)

        if self._llm_scad_generator is None:
            return AgentResult(
                success=False,
                agent=AgentRole.GENERATOR,
                state_reached=JobState.GEOMETRY_FAILED.value,
                error="No LLM CAD generator is configured",
            )

        repair_notes = [result.message for result in job.validation_results if not result.passed and result.message]
        try:
            scad_source, parameter_schema, summary = await self._llm_scad_generator.generate_design(
                job,
                repair_notes=repair_notes,
            )
            job.scad_source = scad_source
            job.parameter_schema = parameter_schema
            job.set_parameter_values(parameter_schema.parameter_values())
            job.generation_path = "direct_llm_parametric"
            self._sync_minimal_business_context(job, summary)
            result = AgentResult(
                success=True,
                agent=AgentRole.GENERATOR,
                state_reached=JobState.SCAD_GENERATED.value,
                data={
                    "summary": summary,
                    "parameter_values": job.get_effective_parameter_values(),
                    "scad_source": scad_source[:500] + "..." if len(scad_source) > 500 else scad_source,
                },
            )
        except Exception as exc:
            logger.error("scad_repair_failed", job_id=job.id, error=str(exc))
            result = AgentResult(
                success=False,
                agent=AgentRole.GENERATOR,
                state_reached=JobState.GEOMETRY_FAILED.value,
                error=f"SCAD repair failed: {exc}",
            )

        result.duration_ms = int((time.time() - start_time) * 1000)
        return result

    def patch_parameters(self, job: DesignJob, parameter_values: dict[str, object]) -> bool:
        """Patch top-level SCAD assignments in-place when possible."""
        if not job.scad_source:
            return False
        patched = apply_parameter_values_to_scad(job.scad_source, parameter_values)
        if not patched:
            return False
        job.scad_source = patched
        current_values = job.get_effective_parameter_values()
        current_values.update(parameter_values)
        job.set_parameter_values(current_values)
        if job.artifacts:
            job.artifacts.scad_source = patched
        return True

    def _sync_minimal_business_context(self, job: DesignJob, summary: str) -> None:
        if not job.business_context:
            job.business_context = {}
        job.business_context["generation_summary"] = summary
        job.business_context["design_mode"] = "single_pass"
