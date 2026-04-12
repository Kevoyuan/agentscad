"""Semantic validation tests for complex geometry."""

from __future__ import annotations

from pathlib import Path

import pytest

from cad_agent.app.agents.validator_agent import ValidatorAgent
from cad_agent.app.models.design_job import Artifacts, DesignJob, JobState, SpecResult


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
