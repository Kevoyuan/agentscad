"""Object-model extraction and enrichment for real-world device accessories."""

from __future__ import annotations

from typing import Any, Mapping

from cad_agent.app.llm.pipeline_utils import normalize_entity_text


def build_object_model(
    request: str,
    *,
    object_name: str = "",
    reference_dimensions: Mapping[str, float] | None = None,
    spec_dimensions: Mapping[str, float] | None = None,
    feature_map: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Build an object-centric geometry context from research/spec data."""
    text = normalize_entity_text(request)
    reference_dimensions = dict(reference_dimensions or {})
    spec_dimensions = dict(spec_dimensions or {})
    feature_map = dict(feature_map or {})

    if any(token in text for token in ("iphone", "samsung", "galaxy", "pixel", "手机")):
        envelope = {
            "length": reference_dimensions.get("body_length"),
            "width": reference_dimensions.get("body_width"),
            "depth": reference_dimensions.get("body_depth"),
        }
        if all(value is not None for value in envelope.values()):
            synthesis_kind = "support_mount" if any(token in text for token in ("stand", "支架", "holder", "dock")) else "protective_shell"
            return {
                "entity_name": object_name or "Phone",
                "category": "phone",
                "synthesis_kind": synthesis_kind,
                "envelope_mm": envelope,
                "feature_map": feature_map,
                "affordances": {
                    "supports_portrait": True,
                    "supports_landscape": True,
                },
            }

    if "mac studio" in text or "mac mini" in text:
        envelope = _device_envelope(reference_dimensions, spec_dimensions)
        base_from_spec, support_from_spec = _support_base_from_spec(spec_dimensions)
        category = "desktop_computer" if "mac studio" in text else "small_form_factor_desktop"
        default_entity_name = "Mac Studio" if "mac studio" in text else "Mac mini"
        object_model: dict[str, Any] = {
            "entity_name": object_name or default_entity_name,
            "category": category,
            "synthesis_kind": "support_base",
            "support_strategy": "raised_base_with_top_alignment_pocket",
            "feature_map": feature_map,
        }
        if envelope:
            object_model["envelope_mm"] = envelope

        if base_from_spec:
            object_model["base_footprint_mm"] = base_from_spec
        elif envelope.get("width") and envelope.get("depth"):
            object_model["base_footprint_mm"] = {
                "width": round(envelope["width"] + 24.0, 3),
                "depth": round(envelope["depth"] + 24.0, 3),
                "height": 30.0,
            }

        if support_from_spec:
            object_model["support_surface_mm"] = support_from_spec
        elif envelope.get("width") and envelope.get("depth"):
            object_model["support_surface_mm"] = {
                "width": round(envelope["width"] + 2.0, 3),
                "depth": round(envelope["depth"] + 2.0, 3),
            }
        return object_model

    if any(token in text for token in ("macbook", "laptop", "notebook", "电脑")):
        envelope = {
            "width": reference_dimensions.get("device_width"),
            "depth": reference_dimensions.get("device_depth"),
            "height": reference_dimensions.get("device_height"),
        }
        if all(value is not None for value in envelope.values()):
            return {
                "entity_name": object_name or "Laptop",
                "category": "laptop",
                "synthesis_kind": "support_stand",
                "envelope_mm": envelope,
                "feature_map": feature_map,
                "affordances": {
                    "hinge_clearance_required": True,
                    "cooling_clearance_required": True,
                },
            }

    return {}


def enrich_object_model_from_spec(
    object_model: Mapping[str, Any] | None,
    spec_dimensions: Mapping[str, float] | None,
) -> dict[str, Any]:
    """Merge parsed intake dimensions into an existing object model."""
    merged = dict(object_model or {})
    if not merged:
        return merged

    spec_dimensions = dict(spec_dimensions or {})
    if merged.get("synthesis_kind") != "support_base":
        return merged

    envelope = _device_envelope({}, spec_dimensions)
    if envelope and not merged.get("envelope_mm"):
        merged["envelope_mm"] = envelope

    base_from_spec, support_from_spec = _support_base_from_spec(spec_dimensions)
    if base_from_spec:
        existing_height = merged.get("base_footprint_mm", {}).get("height")
        merged["base_footprint_mm"] = {
            "width": base_from_spec["width"],
            "depth": base_from_spec["depth"],
            "height": base_from_spec.get("height") or existing_height or 35.0,
        }
    if support_from_spec:
        merged["support_surface_mm"] = support_from_spec

    return merged


def _dimension_value(dimensions: Mapping[str, float], *keys: str) -> float | None:
    for key in keys:
        value = dimensions.get(key)
        if isinstance(value, (int, float)):
            return float(value)
    return None


def _device_envelope(
    reference_dimensions: Mapping[str, float],
    spec_dimensions: Mapping[str, float],
) -> dict[str, float]:
    width = _dimension_value(reference_dimensions, "device_width", "body_width")
    depth = _dimension_value(reference_dimensions, "device_depth", "body_length")
    height = _dimension_value(reference_dimensions, "device_height", "body_depth")

    if width is None:
        width = _dimension_value(
            spec_dimensions,
            "macmini_cavity_width",
            "support_width",
            "顶部凹槽宽度",
            "内腔宽度",
            "cavity_width",
            "width",
            "overall_width",
        )
    if depth is None:
        depth = _dimension_value(
            spec_dimensions,
            "macmini_cavity_length",
            "support_depth",
            "顶部凹槽深度",
            "内腔长度",
            "cavity_length",
            "length",
            "overall_length",
        )
    if height is None:
        height = _dimension_value(
            spec_dimensions,
            "device_height",
            "内腔深度",
            "macmini_recess_depth",
            "cavity_depth",
        )

    envelope: dict[str, float] = {}
    if width is not None:
        envelope["width"] = float(width)
    if depth is not None:
        envelope["depth"] = float(depth)
    if height is not None:
        envelope["height"] = float(height)
    return envelope


def _support_base_from_spec(spec_dimensions: Mapping[str, float]) -> tuple[dict[str, float], dict[str, float]]:
    base_width = _dimension_value(
        spec_dimensions,
        "底座宽度",
        "base_width",
        "base_length",
        "base_outer_width",
        "overall_width",
        "width",
        "length",
    )
    base_depth = _dimension_value(
        spec_dimensions,
        "底座深度",
        "base_depth",
        "base_length",
        "base_outer_depth",
        "overall_length",
        "depth",
        "length",
    )
    base_height = _dimension_value(
        spec_dimensions,
        "底座高度",
        "base_height",
        "base_height_mm",
        "overall_height",
        "height",
    )
    support_width = _dimension_value(
        spec_dimensions,
        "顶部凹槽宽度",
        "support_width",
        "macmini_cavity_width",
        "pocket_width",
        "内腔宽度",
        "cavity_width",
    )
    support_depth = _dimension_value(
        spec_dimensions,
        "顶部凹槽深度",
        "support_depth",
        "macmini_cavity_length",
        "pocket_depth",
        "内腔长度",
        "cavity_length",
    )

    base: dict[str, float] = {}
    support: dict[str, float] = {}
    if base_width is not None and base_depth is not None:
        base = {
            "width": float(base_width),
            "depth": float(base_depth),
            "height": float(base_height) if base_height is not None else 35.0,
        }
    if support_width is not None and support_depth is not None:
        support = {
            "width": float(support_width),
            "depth": float(support_depth),
        }
    return base, support
