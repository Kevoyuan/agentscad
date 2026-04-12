"""Tests for inferring editable parameter schema from OpenSCAD."""

from __future__ import annotations

from cad_agent.app.llm.scad_parameter_schema import (
    apply_parameter_values_to_scad,
    build_parameter_schema_from_scad,
)


def test_build_parameter_schema_from_scad_extracts_top_level_scalars() -> None:
    scad_source = """
device_width = 127; // [group: dimensions] supported device width
arch_radius = 61; // [group: support] underside arch radius
arch_peak = 22;
has_felt_pad = true; // include underside felt pad

module stand() {
    cube([device_width, arch_radius, arch_peak]);
}
""".strip()

    schema = build_parameter_schema_from_scad(
        "帮我给 mac mini m4 设计一个底座",
        scad_source,
        part_family="device_stand",
        design_summary="A compact support stand with a lower arch.",
    )

    assert schema is not None
    assert schema.part_family == "device_stand"
    assert [parameter.key for parameter in schema.parameters] == [
        "device_width",
        "arch_radius",
        "arch_peak",
        "has_felt_pad",
    ]
    assert schema.parameters[0].description == "supported device width"
    assert schema.parameters[0].group == "dimensions"
    assert schema.parameters[1].group == "support"
    assert schema.parameters[3].kind == "boolean"
    assert schema.parameters[3].value is True


def test_apply_parameter_values_to_scad_updates_top_level_assignments() -> None:
    scad_source = """
device_width = 127; // supported device width
arch_radius = 61;
arch_peak = 22;

module stand() {
    cube([device_width, arch_radius, arch_peak]);
}
""".strip()

    patched = apply_parameter_values_to_scad(
        scad_source,
        {
            "device_width": 130,
            "arch_peak": 24.5,
        },
    )

    assert patched is not None
    assert "device_width = 130; // supported device width" in patched
    assert "arch_peak = 24.5;" in patched
    assert "arch_radius = 61;" in patched
