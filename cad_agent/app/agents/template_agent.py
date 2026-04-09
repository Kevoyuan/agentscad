"""Template agent - selects appropriate SCAD template."""

import time

import structlog

from cad_agent.app.models.agent_result import AgentResult, AgentRole
from cad_agent.app.models.design_job import DesignJob, JobState, TemplateChoice

logger = structlog.get_logger()


class TemplateAgent:
    """Selects appropriate Jinja2 SCAD template based on spec."""

    COMPLEX_KEYWORDS = (
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

    TEMPLATES = {
        "hook": {"name": "hook_basic_v1", "score": 0.9},
        "box": {"name": "box_basic_v1", "score": 0.9},
        "cube": {"name": "rounded_block_v1", "score": 0.95},
        "rounded": {"name": "rounded_block_v1", "score": 0.95},
        "fillet": {"name": "rounded_block_v1", "score": 0.95},
        "clip": {"name": "clip_basic_v1", "score": 0.9},
        "bracket": {"name": "box_basic_v1", "score": 0.7},
        "mount": {"name": "box_basic_v1", "score": 0.7},
        "holder": {"name": "hook_basic_v1", "score": 0.6},
        "case": {"name": "box_basic_v1", "score": 0.8},
    }

    async def select(self, job: DesignJob) -> AgentResult:
        """Select appropriate template based on spec.

        Args:
            job: DesignJob with spec set

        Returns:
            AgentResult with TemplateChoice in data["template_choice"]
        """
        start_time = time.time()
        logger.info("template_selecting", job_id=job.id, geometric_type=job.spec.geometric_type)

        if not job.spec:
            return AgentResult(
                success=False,
                agent=AgentRole.TEMPLATE,
                state_reached=JobState.TEMPLATE_FAILED.value,
                error="No spec available for template selection",
            )

        template_name = self._select_template(job.spec.geometric_type)
        parameters = self._extract_parameters(job)

        template_choice = TemplateChoice(
            success=True,
            template_name=template_name,
            template_version="v1",
            confidence=0.85,
            parameters=parameters,
            reasoning=f"Selected {template_name} for {job.spec.geometric_type} based on spec analysis",
        )

        job.template_choice = template_choice

        result = AgentResult(
            success=True,
            agent=AgentRole.TEMPLATE,
            state_reached=JobState.TEMPLATE_SELECTED.value,
            data={"template_choice": template_choice.model_dump()},
        )

        result.duration_ms = int((time.time() - start_time) * 1000)
        return result

    def _select_template(self, geometric_type: str) -> str:
        """Select best template for geometric type."""
        geometric_type_lower = geometric_type.lower()

        if any(keyword in geometric_type_lower for keyword in self.COMPLEX_KEYWORDS):
            return "llm_native_v1"

        if any(keyword in geometric_type_lower for keyword in ("cube", "rounded", "fillet")):
            return "rounded_block_v1"

        template = self.TEMPLATES.get(geometric_type_lower)
        if template:
            return template["name"]

        for geo_type, info in self.TEMPLATES.items():
            if geo_type in geometric_type_lower:
                return info["name"]

        return "box_basic_v1"

    def _extract_parameters(self, job: DesignJob) -> dict:
        """Extract template parameters from spec dimensions."""
        dims = job.spec.dimensions

        base_params = {
            "length": dims.get("length", 40.0),
            "width": dims.get("width", 20.0),
            "height": dims.get("height", 15.0),
            "wall_thickness": dims.get("wall_thickness", 2.0),
            "fillet_radius": dims.get("fillet_radius", dims.get("edge_fillet_radius", 0.0)),
            "tolerance": job.spec.tolerance,
            "material": job.spec.material,
        }

        for key, value in dims.items():
            base_params.setdefault(key, value)

        if job.spec.geometric_type == "hook":
            base_params.update({
                "hook_diameter": dims.get("hook_diameter", 15.0),
                "hook_length": dims.get("hook_length", 25.0),
                "hook_angle": dims.get("hook_angle", 90),
            })

        elif job.spec.geometric_type == "clip":
            base_params.update({
                "clip_inner_diameter": dims.get("clip_inner_diameter", 10.0),
                "clip_outer_diameter": dims.get("clip_outer_diameter", 14.0),
                "clip_width": dims.get("clip_width", 10.0),
            })

        return base_params
