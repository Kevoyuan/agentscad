"""Generator agent - renders SCAD from Jinja2 templates."""

import time
from pathlib import Path

import structlog

from cad_agent.app.models.agent_result import AgentResult, AgentRole
from cad_agent.app.models.design_job import DesignJob, JobState

logger = structlog.get_logger()


class GeneratorAgent:
    """Renders SCAD source from Jinja2 templates."""

    def __init__(self, templates_dir: str = "cad_agent/app/templates"):
        """Initialize generator with templates directory."""
        self.templates_dir = Path(templates_dir)

    async def generate(self, job: DesignJob) -> AgentResult:
        """Generate SCAD source from template.

        Args:
            job: DesignJob with template_choice set

        Returns:
            AgentResult with SCAD source in data["scad_source"]
        """
        start_time = time.time()
        logger.info("generating_scad", job_id=job.id, template=job.template_choice.template_name)

        if not job.template_choice:
            return AgentResult(
                success=False,
                agent=AgentRole.GENERATOR,
                state_reached=JobState.SCAD_GENERATED.value,
                error="No template choice available",
            )

        try:
            from jinja2 import Environment, FileSystemLoader

            env = Environment(loader=FileSystemLoader(str(self.templates_dir)))
            template = env.get_template(f"{job.template_choice.template_name}.scad.j2")

            scad_source = template.render(**job.template_choice.parameters)

            job.scad_source = scad_source

            result = AgentResult(
                success=True,
                agent=AgentRole.GENERATOR,
                state_reached=JobState.SCAD_GENERATED.value,
                data={"scad_source": scad_source[:500] + "..." if len(scad_source) > 500 else scad_source},
            )

        except Exception as e:
            logger.error("scad_generation_failed", job_id=job.id, error=str(e))
            result = AgentResult(
                success=False,
                agent=AgentRole.GENERATOR,
                state_reached=JobState.SCAD_GENERATED.value,
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

        if not job.spec or not job.template_choice:
            return AgentResult(
                success=False,
                agent=AgentRole.GENERATOR,
                state_reached=job.state.value,
                error="Cannot repair without spec and template choice",
            )

        failures = [v for v in job.validation_results if not v.passed]

        adjusted_params = job.template_choice.parameters.copy()

        for failure in failures:
            if failure.rule_id == "R001":
                adjusted_params["wall_thickness"] = max(
                    adjusted_params.get("wall_thickness", 2.0),
                    1.2
                )
            elif failure.rule_id == "R002":
                for dim in ["length", "width", "height"]:
                    if dim in adjusted_params:
                        adjusted_params[dim] = min(adjusted_params[dim], 200.0)
            elif failure.rule_id == "R005":
                if adjusted_params.get("height", 0) / max(adjusted_params.get("width", 1), 1) > 4.0:
                    adjusted_params["height"] = adjusted_params.get("width", 20.0) * 4.0

        job.template_choice.parameters = adjusted_params

        return await self.generate(job)
