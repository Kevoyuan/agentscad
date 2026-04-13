"""Semantic validation tests for complex geometry."""

from __future__ import annotations

from pathlib import Path

import pytest

from cad_agent.app.agents.validator_agent import ValidatorAgent
from cad_agent.app.models.design_job import Artifacts, DesignJob, JobState, ResearchResult, SpecResult


def _build_gear_job(scad_source: str, tmp_path: Path) -> DesignJob:
    stl_path = tmp_path / "design.stl"
    stl_path.write_text("solid test\nendsolid test\n")

    job = DesignJob(
        input_request="设计一个17齿的齿轮，外30mm，内10mm，厚3mm",
        state=JobState.RENDERED,
    )
    job.spec = SpecResult(
        success=True,
        request_summary="17-tooth spur gear",
        geometric_type="cylindrical spur gear",
        dimensions={
            "outer_diameter": 30.0,
            "inner_diameter": 10.0,
            "thickness": 3.0,
            "module": 1.58,
        },
        material="steel_1045",
        tolerance=0.1,
    )
    job.generation_path = "llm_native_scad"
    job.set_parameter_values(job.spec.dimensions.copy())
    job.scad_source = scad_source
    job.artifacts = Artifacts(scad_source=scad_source, stl_path=str(stl_path))
    return job


@pytest.mark.asyncio
async def test_validator_rejects_box_like_scad_for_gear_request(tmp_path: Path) -> None:
    validator = ValidatorAgent()
    job = _build_gear_job(
        scad_source="""
// Box Basic Template v1
length = 40;
width = 20;
height = 15;
cube([length, width, height], center=false);
""",
        tmp_path=tmp_path,
    )

    result = await validator.validate(job)

    assert result.success is False
    semantic_result = next(v for v in job.validation_results if v.rule_id == "S001")
    assert semantic_result.passed is False
    assert "mismatch" in semantic_result.message.lower() or "does not look like a gear" in semantic_result.message.lower()


@pytest.mark.asyncio
async def test_validator_accepts_gear_like_scad_for_gear_request(tmp_path: Path) -> None:
    validator = ValidatorAgent()
    job = _build_gear_job(
        scad_source="""
teeth = 17;
outer_dia = 30;
pitch_dia = 26.84;
module_value = outer_dia / (teeth + 2);

module gear_tooth(height) {
    cube([1, height, 3]);
}

module spur_gear_final() {
    cylinder(h = 3, d = 23.7, center = false);
    for (i = [0 : teeth - 1]) {
        rotate(i * 360 / teeth)
            translate([pitch_dia / 2, 0, 0])
                gear_tooth(height = 3.2);
    }
}

spur_gear_final();
""",
        tmp_path=tmp_path,
    )

    result = await validator.validate(job)

    assert result.success is True
    semantic_result = next(v for v in job.validation_results if v.rule_id == "S001")
    assert semantic_result.passed is True


@pytest.mark.asyncio
async def test_validator_blocks_phone_case_without_verified_dimensions(tmp_path: Path) -> None:
    stl_path = tmp_path / "design.stl"
    stl_path.write_text("solid test\nendsolid test\n")

    scad_source = """
module rounded_box(size=[10, 10, 10], radius=2) {
  linear_extrude(height=size[2], center=true)
    offset(r=radius)
      square([max(size[0] - 2 * radius, 0.1), max(size[1] - 2 * radius, 0.1)], center=true);
}

module screen_window() {
  translate([0, 0, 2]) rounded_box([140, 64, 14], radius=3);
}

module phone_case_body() {
  difference() {
    rounded_box([155, 76, 11], radius=3.5);
    translate([0, 0, 0.4]) rounded_box([151, 72, 8.9], radius=2.2);
    screen_window();
  }
}

phone_case_body();
"""

    job = DesignJob(
        input_request="帮我设计iphone 17 pro 手机壳",
        state=JobState.RENDERED,
        part_family="phone_case",
        scad_source=scad_source,
        artifacts=Artifacts(scad_source=scad_source, stl_path=str(stl_path)),
        research_result=ResearchResult(
            request="帮我设计iphone 17 pro 手机壳",
            part_family="phone_case",
            object_name="iPhone 17 Pro Case",
            needs_web_search=True,
            web_research_used=False,
            image_reference_used=False,
            reference_dimensions={},
        ),
        spec=SpecResult(
            success=True,
            geometric_type="protective_shell",
            dimensions={},
            material="TPU",
            tolerance=0.1,
        ),
    )
    job.set_parameter_values(
        {
            "body_length": 149.6,
            "body_width": 71.5,
            "body_depth": 8.3,
            "wall_thickness": 1.8,
        }
    )

    validator = ValidatorAgent()
    result = await validator.validate(job)

    assert result.success is False
    trusted_dimensions = next(v for v in job.validation_results if v.rule_id == "S002")
    assert trusted_dimensions.passed is False
    assert "missing verified device dimensions" in trusted_dimensions.message.lower()
