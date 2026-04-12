"""Tests for generator routing and LLM-backed geometry generation."""

from __future__ import annotations

import pytest

from cad_agent.app.agents.generator_agent import GeneratorAgent
from cad_agent.app.models.design_job import DesignJob, JobState, SpecResult


@pytest.mark.asyncio
async def test_generator_agent_prefers_mcad_for_spur_gears() -> None:
    class StubLLMScadGenerator:
        async def generate_implicit_template(self, job: DesignJob, *, repair_notes: list[str] | None = None) -> str:
            raise AssertionError("spur gears should use deterministic MCAD generation")

        async def generate(self, job: DesignJob, *, repair_notes: list[str] | None = None) -> str:
            raise AssertionError("spur gears should not fall back to freeform LLM generation")

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

    generator = GeneratorAgent(llm_scad_generator=StubLLMScadGenerator())

    result = await generator.generate(job)

    assert result.success is True
    assert job.generation_path == "mcad_spur_gear"
    assert job.scad_source is not None
    assert "include <MCAD/involute_gears.scad>;" in job.scad_source
    assert "gear(" in job.scad_source
    assert "outer_diameter = 30.0000;" in job.scad_source


@pytest.mark.asyncio
async def test_generator_agent_keeps_llm_native_for_non_spur_complex_geometry() -> None:
    class StubLLMScadGenerator:
        async def generate_implicit_template(self, job: DesignJob, *, repair_notes: list[str] | None = None) -> str:
            raise AssertionError("inferred parametric generation should not be used for worm gears")

        async def generate(self, job: DesignJob, *, repair_notes: list[str] | None = None) -> str:
            return "cylinder(h=3, d=30);"

    job = DesignJob(
        input_request="worm gear",
        spec=SpecResult(
            success=True,
            geometric_type="worm gear",
            dimensions={"outer_diameter": 30.0, "thickness": 3.0},
            material="steel_1045",
            tolerance=0.1,
        ),
    )

    generator = GeneratorAgent(llm_scad_generator=StubLLMScadGenerator())

    result = await generator.generate(job)

    assert result.success is True
    assert job.generation_path == "llm_native_scad"
    assert job.scad_source == "cylinder(h=3, d=30);"


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

    generator = GeneratorAgent(llm_scad_generator=StubLLMScadGenerator())

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

    generator = GeneratorAgent(llm_scad_generator=StubLLMScadGenerator())

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

    generator = GeneratorAgent(llm_scad_generator=StubLLMScadGenerator())

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
        async def generate_implicit_template(self, job: DesignJob, *, repair_notes: list[str] | None = None) -> str:
            raise AssertionError("inferred parametric generation should not be used for generic geometry intent synthesis")

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

    generator = GeneratorAgent(llm_scad_generator=StubLLMScadGenerator())

    result = await generator.generate(job)

    assert result.success is True
    assert job.generation_path == "geometry_intent"


@pytest.mark.asyncio
async def test_generator_agent_prefers_inferred_parametric_before_freeform_llm() -> None:
    class StubLLMScadGenerator:
        async def generate_implicit_template(self, job: DesignJob, *, repair_notes: list[str] | None = None) -> str:
            return (
                "device_width = 127; // supported device width\n"
                "arch_radius = 61;\n"
                "arch_peak = 22;\n"
                "difference() {\n"
                "  cylinder(h=22, d=device_width + 14);\n"
                "  translate([0, 0, 2]) cylinder(h=24, d=device_width);\n"
                "}\n"
            )

        async def generate(self, job: DesignJob, *, repair_notes: list[str] | None = None) -> str:
            raise AssertionError("freeform llm generation should not be used when inferred parametric generation is available")

    job = DesignJob(
        input_request="帮我给 mac mini m4 设计一个底座",
        spec=SpecResult(
            success=True,
            geometric_type="desktop stand",
            dimensions={"device_width": 127.0, "device_depth": 127.0, "height": 36.0},
            material="PLA",
            tolerance=0.2,
        ),
    )
    generator = GeneratorAgent(llm_scad_generator=StubLLMScadGenerator())

    result = await generator.generate(job)

    assert result.success is True
    assert job.generation_path == "inferred_parametric_scad"
    assert job.parameter_schema is not None
    assert [parameter.key for parameter in job.parameter_schema.parameters] == [
        "device_width",
        "arch_radius",
        "arch_peak",
    ]


@pytest.mark.asyncio
async def test_generator_agent_device_stand_uses_inferred_parametric_without_object_model() -> None:
    """device_stand should avoid builders and fall back to inferred parametric synthesis."""

    class StandOnlyLLM:
        async def generate_implicit_template(self, job: DesignJob, *, repair_notes: list[str] | None = None) -> str:
            return (
                "device_width = 130;\n"
                "pocket_width = device_width + 2;\n"
                "pocket_depth = 130 + 2;\n"
                "cable_relief_width = 70;\n"
                "difference() {\n"
                "  rounded_prism([160, 80, 18], 12);\n"
                "  top_alignment_pocket(pocket_width, pocket_depth, 12);\n"
                "}\n"
            )

        async def generate(self, job: DesignJob, *, repair_notes: list[str] | None = None) -> str:
            raise AssertionError("freeform LLM generation should not be used for device_stand")

        async def generate_geometry_dsl(self, job: DesignJob, *, repair_notes: list[str] | None = None) -> dict:
            raise AssertionError("DSL generation should not be used for device_stand")

    job = DesignJob(
        input_request="设计一个竖直底座",
        part_family="device_stand",
        spec=SpecResult(
            success=True,
            geometric_type="support_accessory",
            dimensions={"device_width": 130.0, "device_depth": 130.0, "height": 152.0},
            material="PLA",
            tolerance=0.2,
        ),
        parameter_values={
            "device_width": 130.0,
            "device_depth": 130.0,
            "stand_height": 27.5,
        },
    )

    generator = GeneratorAgent(llm_scad_generator=StandOnlyLLM())

    result = await generator.generate(job)

    assert result.success is True
    assert job.generation_path == "inferred_parametric_scad"
    assert job.builder_name is None
    assert job.scad_source is not None
    assert "rounded_prism" in job.scad_source
    assert "top_alignment_pocket" in job.scad_source


@pytest.mark.asyncio
async def test_generator_agent_reports_geometry_failed_on_generation_error() -> None:
    class FailingLLMScadGenerator:
        async def generate(self, job: DesignJob, *, repair_notes: list[str] | None = None) -> str:
            raise RuntimeError("boom")

    job = DesignJob(
        input_request="worm gear",
        spec=SpecResult(
            success=True,
            geometric_type="worm gear",
            dimensions={"outer_diameter": 30.0, "thickness": 3.0},
            material="steel_1045",
            tolerance=0.1,
        ),
    )

    generator = GeneratorAgent(llm_scad_generator=FailingLLMScadGenerator())
    result = await generator.generate(job)

    assert result.success is False
    assert result.state_reached == JobState.GEOMETRY_FAILED.value
