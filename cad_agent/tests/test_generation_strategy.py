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


@pytest.mark.asyncio
async def test_generator_agent_prefers_geometry_dsl_when_present() -> None:
    class StubLLMScadGenerator:
        async def generate(self, job: DesignJob, *, repair_notes: list[str] | None = None) -> str:
            raise AssertionError("direct LLM SCAD generation should not be used when geometry DSL is present")

    job = DesignJob(
        input_request="帮我设计一个apple iphone 17 pro的手机壳",
        spec=SpecResult(
            success=True,
            geometric_type="phone case",
            dimensions={"length": 149.6, "width": 71.5, "height": 8.3},
            material="tpu",
            tolerance=0.2,
        ),
    )
    job.__dict__["geometry_dsl"] = {
        "family": "phone_case",
        "units": "mm",
        "operations": [
            {"type": "rounded_box", "name": "outer_shell", "dimensions": {"length": 151.0, "width": 74.0, "height": 10.0}},
        ],
    }
    job.__dict__["generation_path"] = "dsl"

    generator = GeneratorAgent(
        templates_dir="/Volumes/SSD/Projects/Code/agentscad/cad_agent/app/templates",
        llm_scad_generator=StubLLMScadGenerator(),
    )

    result = await generator.generate(job)

    assert result.success is True
    assert job.scad_source is not None
    assert "difference" in job.scad_source or "module" in job.scad_source


@pytest.mark.asyncio
async def test_generator_agent_synthesizes_phone_case_dsl_from_research_dimensions() -> None:
    class StubLLMScadGenerator:
        async def generate(self, job: DesignJob, *, repair_notes: list[str] | None = None) -> str:
            raise AssertionError("direct LLM SCAD generation should not be used for deterministic phone-case synthesis")

        async def generate_geometry_dsl(self, job: DesignJob, *, repair_notes: list[str] | None = None) -> dict:
            raise AssertionError("LLM DSL generation should not be used for deterministic phone-case synthesis")

    job = DesignJob(
        input_request="帮我设计一个apple iphone 17 pro的手机壳",
        part_family="phone_case",
        parameter_values={
            "body_length": 150.0,
            "body_width": 71.9,
            "body_depth": 8.75,
            "wall_thickness": 1.8,
            "side_clearance": 0.6,
            "camera_clearance": 1.2,
            "lip_height": 1.0,
            "bottom_opening_depth": 9.0,
            "corner_bumper_thickness": 2.4,
        },
    )

    generator = GeneratorAgent(
        templates_dir="/Volumes/SSD/Projects/Code/agentscad/cad_agent/app/templates",
        llm_scad_generator=StubLLMScadGenerator(),
    )

    result = await generator.generate(job)

    assert result.success is True
    assert job.geometry_dsl is not None
    assert job.geometry_dsl["family"] == "phone_case"
    assert job.geometry_dsl["operations"][0]["type"] == "phone_case_shell"
    assert job.scad_source is not None
    assert "module phone_case_body()" in job.scad_source
    assert "camera_opening" in job.scad_source
    assert "port_opening" in job.scad_source
    assert "minkowski()" not in job.scad_source
    assert "linear_extrude" in job.scad_source


@pytest.mark.asyncio
async def test_generator_agent_prefers_object_model_synthesis_for_mac_studio_base() -> None:
    class StubLLMScadGenerator:
        async def generate(self, job: DesignJob, *, repair_notes: list[str] | None = None) -> str:
            raise AssertionError("direct LLM SCAD generation should not be used for object-model synthesis")

        async def generate_geometry_dsl(self, job: DesignJob, *, repair_notes: list[str] | None = None) -> dict:
            raise AssertionError("LLM DSL generation should not be used for object-model synthesis")

    job = DesignJob(
        input_request="帮我设计一个mac studio m3底座",
        spec=SpecResult(
            success=True,
            geometric_type="平台式底座",
            dimensions={
                "底座宽度": 240.0,
                "底座深度": 240.0,
                "底座高度": 45.0,
                "顶部凹槽宽度": 205.0,
                "顶部凹槽深度": 98.0,
            },
            material="PLA",
            tolerance=0.1,
        ),
        business_context={
            "object_model": {
                "entity_name": "Mac Studio M3",
                "category": "desktop_computer",
                "envelope_mm": {"width": 197.0, "depth": 197.0, "height": 95.0},
                "support_strategy": "raised_base_with_top_alignment_pocket",
                "support_surface_mm": {"width": 205.0, "depth": 98.0},
                "base_footprint_mm": {"width": 240.0, "depth": 240.0, "height": 45.0},
            }
        },
    )

    generator = GeneratorAgent(
        templates_dir="/Volumes/SSD/Projects/Code/agentscad/cad_agent/app/templates",
        llm_scad_generator=StubLLMScadGenerator(),
    )

    result = await generator.generate(job)

    assert result.success is True
    assert job.generation_path == "object_model"
    assert job.scad_source is not None
    assert "top_alignment_pocket" in job.scad_source
    assert "cable_relief" in job.scad_source
    assert "240.000" in job.scad_source
    assert "205.000" in job.scad_source


@pytest.mark.asyncio
async def test_generator_agent_synthesizes_generic_lampshade_from_geometry_intent() -> None:
    class StubLLMScadGenerator:
        async def generate(self, job: DesignJob, *, repair_notes: list[str] | None = None) -> str:
            raise AssertionError("direct LLM SCAD generation should not be used for generic geometry intent synthesis")

        async def generate_geometry_dsl(self, job: DesignJob, *, repair_notes: list[str] | None = None) -> dict:
            raise AssertionError("LLM DSL generation should not be used for generic geometry intent synthesis")

    job = DesignJob(
        input_request="做个灯罩，大概半圆锥型，直径30/20cm，高20cm",
        spec=SpecResult(
            success=True,
            geometric_type="lampshade",
            dimensions={
                "bottom_diameter": 300.0,
                "top_diameter": 200.0,
                "height": 200.0,
            },
            material="PLA",
            tolerance=0.1,
        ),
        business_context={
            "geometry_intent": {
                "intent_type": "half_frustum_shell",
                "dimensions_mm": {
                    "bottom_diameter": 300.0,
                    "top_diameter": 200.0,
                    "height": 200.0,
                },
                "defaults": {
                    "wall_thickness": 1.8,
                },
            }
        },
    )

    generator = GeneratorAgent(
        templates_dir="/Volumes/SSD/Projects/Code/agentscad/cad_agent/app/templates",
        llm_scad_generator=StubLLMScadGenerator(),
    )

    result = await generator.generate(job)

    assert result.success is True
    assert job.generation_path == "geometry_intent"


@pytest.mark.asyncio
async def test_generator_agent_device_stand_does_not_fallback_to_parametric_builder_without_object_model() -> None:
    class StandOnlyLLM:
        async def generate(self, job: DesignJob, *, repair_notes: list[str] | None = None) -> str:
            raise AssertionError("LLM direct SCAD generation should not be used for stand fallback")

        async def generate_geometry_dsl(self, job: DesignJob, *, repair_notes: list[str] | None = None) -> dict:
            raise AssertionError("LLM DSL generation should not be used for stand fallback")

    job = DesignJob(
        input_request="设计一个竖直底座",
        part_family="device_stand",
        parameter_values={
            "device_width": 130.0,
            "device_depth": 130.0,
            "stand_height": 27.5,
        },
    )

    generator = GeneratorAgent(
        templates_dir="/Volumes/SSD/Projects/Code/agentscad/cad_agent/app/templates",
        llm_scad_generator=StandOnlyLLM(),
    )

    result = await generator.generate(job)

    assert result.success is False
    assert "template choice" in (result.error or "").lower()
