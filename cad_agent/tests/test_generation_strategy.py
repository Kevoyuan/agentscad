"""Tests for template selection and LLM-native geometry generation."""

from __future__ import annotations

import pytest

from cad_agent.app.agents.generator_agent import GeneratorAgent
from cad_agent.app.agents.template_agent import TemplateAgent
from cad_agent.app.models.design_job import DesignJob, SpecResult


@pytest.mark.asyncio
async def test_template_agent_routes_gears_to_llm_native() -> None:
    agent = TemplateAgent()
    job = DesignJob(
        input_request="设计一个17齿的齿轮，外30mm，内10mm，厚3mm",
        spec=SpecResult(
            success=True,
            geometric_type="cylindrical spur gear",
            dimensions={
                "outer_diameter": 30.0,
                "inner_diameter": 10.0,
                "thickness": 3.0,
                "module": 1.58,
                "pressure_angle": 20.0,
            },
            material="steel_1045",
            tolerance=0.1,
        ),
    )

    result = await agent.select(job)

    assert result.success is True
    assert job.template_choice is not None
    assert job.template_choice.template_name == "llm_native_v1"
    assert job.template_choice.parameters["outer_diameter"] == 30.0


@pytest.mark.asyncio
async def test_generator_agent_uses_llm_native_path_for_complex_geometry() -> None:
    class StubLLMScadGenerator:
        async def generate(self, job: DesignJob, *, repair_notes: list[str] | None = None) -> str:
            assert job.template_choice is not None
            assert job.template_choice.template_name == "llm_native_v1"
            return "cylinder(h=3, d=30);"

    job = DesignJob(
        input_request="spur gear",
        spec=SpecResult(
            success=True,
            geometric_type="cylindrical spur gear",
            dimensions={"outer_diameter": 30.0, "thickness": 3.0},
            material="steel_1045",
            tolerance=0.1,
        ),
    )

    await TemplateAgent().select(job)
    generator = GeneratorAgent(
        templates_dir="/Volumes/SSD/Projects/Code/agentscad/cad_agent/app/templates",
        llm_scad_generator=StubLLMScadGenerator(),
    )

    result = await generator.generate(job)

    assert result.success is True
    assert job.scad_source == "cylinder(h=3, d=30);"
    assert "cylinder" in result.data["scad_source"]
