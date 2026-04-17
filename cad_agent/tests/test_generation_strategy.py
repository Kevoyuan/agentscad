"""Tests for the single-pass generator flow."""

from __future__ import annotations

import pytest

from cad_agent.app.agents.generator_agent import GeneratorAgent
from cad_agent.app.models.design_job import DesignJob, JobState, ParameterDefinition, ParameterSchema


class StubSinglePassGenerator:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    async def generate_design(
        self,
        job: DesignJob,
        repair_notes: list[str] | None = None,
    ) -> tuple[str, ParameterSchema, str]:
        self.calls.append(
            {
                "request": job.input_request,
                "repair_notes": list(repair_notes or []),
            }
        )
        schema = ParameterSchema(
            request=job.input_request,
            part_family="",
            design_summary="rounded stand with editable height",
            parameters=[
                ParameterDefinition(
                    key="stand_height",
                    label="Stand Height",
                    value=28.0,
                    min=10.0,
                    max=60.0,
                    step=0.5,
                    unit="mm",
                ),
                ParameterDefinition(
                    key="wall_thickness",
                    label="Wall Thickness",
                    value=2.4,
                    min=1.2,
                    max=6.0,
                    step=0.2,
                    unit="mm",
                ),
            ],
        )
        scad_source = (
            "stand_height = 28.0;\n"
            "wall_thickness = 2.4;\n"
            "difference() {\n"
            "  cube([60, 60, stand_height]);\n"
            "  translate([wall_thickness, wall_thickness, wall_thickness])\n"
            "    cube([60 - wall_thickness * 2, 60 - wall_thickness * 2, stand_height]);\n"
            "}\n"
        )
        summary = "A hollow stand sized from two editable top-level parameters."
        return scad_source, schema, summary


@pytest.mark.asyncio
async def test_generator_agent_uses_single_pass_generate_design() -> None:
    backend = StubSinglePassGenerator()
    generator = GeneratorAgent(llm_scad_generator=backend)
    job = DesignJob(input_request="design a small desktop stand")

    result = await generator.generate(job)

    assert result.success is True
    assert job.state == JobState.NEW
    assert job.generation_path == "direct_llm_parametric"
    assert job.scad_source is not None
    assert "stand_height = 28.0;" in job.scad_source
    assert job.parameter_schema is not None
    assert job.parameter_values == {"stand_height": 28.0, "wall_thickness": 2.4}
    assert job.business_context["design_mode"] == "single_pass"
    assert backend.calls == [{"request": "design a small desktop stand", "repair_notes": []}]


@pytest.mark.asyncio
async def test_generator_agent_repair_feeds_validation_messages_back() -> None:
    backend = StubSinglePassGenerator()
    generator = GeneratorAgent(llm_scad_generator=backend)
    job = DesignJob(input_request="design a small desktop stand")
    job.validation_results = [
        type("Validation", (), {"passed": False, "message": "wall too thin"})(),
        type("Validation", (), {"passed": False, "message": "opening too narrow"})(),
    ]

    result = await generator.repair(job)

    assert result.success is True
    assert backend.calls == [
        {
            "request": "design a small desktop stand",
            "repair_notes": ["wall too thin", "opening too narrow"],
        }
    ]


def test_generator_agent_patch_parameters_updates_scad_and_job_values() -> None:
    generator = GeneratorAgent()
    job = DesignJob(
        input_request="design a stand",
        scad_source="stand_height = 28.0;\nwall_thickness = 2.4;\ncube([10, 10, stand_height]);\n",
    )
    job.set_parameter_values({"stand_height": 28.0, "wall_thickness": 2.4})

    patched = generator.patch_parameters(job, {"stand_height": 31.5})

    assert patched is True
    assert "stand_height = 31.5;" in (job.scad_source or "")
    assert job.parameter_values["stand_height"] == 31.5


@pytest.mark.asyncio
async def test_generator_agent_reports_missing_backend() -> None:
    generator = GeneratorAgent(llm_scad_generator=None)
    job = DesignJob(input_request="design a stand")

    result = await generator.generate(job)

    assert result.success is False
    assert result.state_reached == JobState.GEOMETRY_FAILED.value
