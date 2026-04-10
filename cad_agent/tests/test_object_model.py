"""Tests for object-model extraction and spec enrichment."""

from __future__ import annotations

from cad_agent.app.llm.object_model import build_object_model, enrich_object_model_from_spec


def test_mac_mini_object_model_uses_spec_dimensions_for_support_base() -> None:
    model = build_object_model(
        "帮我设计一个mac mini m4的底座",
        object_name="Mac mini M4",
        reference_dimensions={},
        spec_dimensions={
            "length": 150.0,
            "width": 150.0,
            "内腔长度": 130.0,
            "内腔宽度": 130.0,
            "内腔深度": 25.0,
        },
    )

    assert model["synthesis_kind"] == "support_base"
    assert model["category"] == "small_form_factor_desktop"
    assert model["base_footprint_mm"] == {"width": 150.0, "depth": 150.0, "height": 35.0}
    assert model["support_surface_mm"] == {"width": 130.0, "depth": 130.0}
    assert model["envelope_mm"] == {"width": 130.0, "depth": 130.0, "height": 25.0}


def test_support_base_object_model_enrichment_reads_english_spec_keys() -> None:
    merged = enrich_object_model_from_spec(
        {
            "synthesis_kind": "support_base",
            "base_footprint_mm": {"width": 180.0, "depth": 180.0, "height": 30.0},
            "support_surface_mm": {"width": 130.0, "depth": 130.0},
        },
        {
            "base_length": 160.0,
            "base_width": 155.0,
            "base_height": 32.0,
            "macmini_cavity_length": 132.0,
            "macmini_cavity_width": 131.0,
            "macmini_recess_depth": 24.0,
        },
    )

    assert merged["base_footprint_mm"] == {"width": 155.0, "depth": 160.0, "height": 32.0}
    assert merged["support_surface_mm"] == {"width": 131.0, "depth": 132.0}
    assert merged["envelope_mm"] == {"width": 131.0, "depth": 132.0, "height": 24.0}


def test_mac_mini_object_model_uses_overall_and_cavity_keys() -> None:
    model = build_object_model(
        "帮我设计一个mac mini m4的底座",
        object_name="Mac mini M4",
        reference_dimensions={},
        spec_dimensions={
            "overall_length": 150.0,
            "overall_width": 150.0,
            "overall_height": 45.0,
            "cavity_length": 132.0,
            "cavity_width": 132.0,
            "cavity_depth": 56.0,
        },
    )

    assert model["base_footprint_mm"] == {"width": 150.0, "depth": 150.0, "height": 45.0}
    assert model["support_surface_mm"] == {"width": 132.0, "depth": 132.0}
    assert model["envelope_mm"] == {"width": 132.0, "depth": 132.0, "height": 56.0}


def test_mac_mini_specs_url_builds_support_base_object_model() -> None:
    model = build_object_model(
        "https://www.apple.com/mac-mini/specs/ 竖直底座设计",
        object_name="Mac Mini",
        reference_dimensions={},
        spec_dimensions={},
    )

    assert model["synthesis_kind"] == "support_base"
    assert model["category"] == "small_form_factor_desktop"
