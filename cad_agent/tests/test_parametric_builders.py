"""Tests for deterministic parametric builders."""

from __future__ import annotations

import pytest

from cad_agent.app.parametric import DeviceStandBuilder, EnclosureBuilder, SpurGearBuilder
from cad_agent.app.parametric.builders import ParametricBuilderError


def test_spur_gear_builder_derives_gear_values_and_emits_scad() -> None:
    result = SpurGearBuilder().build(
        {
            "teeth": 17,
            "outer_diameter": 30.0,
            "inner_diameter": 10.0,
            "thickness": 3.0,
            "pressure_angle": 20.0,
        }
    )

    assert result.family == "spur_gear"
    assert result.derived["module"] == pytest.approx(30.0 / 19.0, rel=1e-4)
    assert result.derived["pitch_diameter"] == pytest.approx((30.0 / 19.0) * 17, rel=1e-4)
    assert result.derived["root_diameter"] == pytest.approx((30.0 / 19.0) * 14.5, rel=1e-4)
    assert "teeth = 17;" in result.scad_source
    assert "module_value = outer_dia / (teeth + 2);" in result.scad_source
    assert "for (i = [0 : teeth - 1])" in result.scad_source


def test_spur_gear_builder_rejects_invalid_tooth_count() -> None:
    with pytest.raises(ParametricBuilderError, match="at least 6 teeth"):
        SpurGearBuilder().build(
            {
                "teeth": 4,
                "outer_diameter": 20.0,
                "inner_diameter": 5.0,
                "thickness": 3.0,
            }
        )


def test_device_stand_builder_invents_design_parameters() -> None:
    result = DeviceStandBuilder().build(
        {
            "device_width": 130.0,
            "device_depth": 128.0,
            "stand_height": 27.5,
            "lip_height": 9.7,
            "wall_thickness": 7.2,
            "base_flare": 10.0,
            "arch_radius": 61.0,
            "arch_peak": 22.0,
        }
    )

    assert result.family == "device_stand"
    assert result.derived["outer_width"] > result.derived["inner_width"]
    assert result.derived["outer_depth"] > result.derived["inner_depth"]
    assert result.scad_source.startswith("// Parametric Device Stand")
    assert "arch_radius = 61.0000;" in result.scad_source
    assert "stand_shell();" in result.scad_source


def test_enclosure_builder_generates_shell_and_vents() -> None:
    result = EnclosureBuilder().build(
        {
            "width": 160.0,
            "depth": 110.0,
            "height": 45.0,
            "wall_thickness": 2.4,
            "corner_radius": 8.0,
            "clearance": 0.6,
            "lid_overlap": 3.0,
            "vent_spacing": 8.0,
            "vent_rows": 3,
            "vent_cols": 5,
        }
    )

    assert result.family == "electronics_enclosure"
    assert result.derived["vent_count"] == 15
    assert result.derived["inner_width"] == pytest.approx(154.0, rel=1e-4)
    assert "module vents()" in result.scad_source
    assert "difference() {" in result.scad_source
    assert "vent_rows = 3;" in result.scad_source
