"""Geometry-intent inference for generic parametric shapes."""

from __future__ import annotations

from typing import Any, Mapping


def infer_geometry_intent(
    request: str,
    spec_dimensions: Mapping[str, float] | None = None,
    geometric_type: str = "",
) -> dict[str, Any]:
    """Infer a generic geometry intent from request language and parsed dimensions."""
    text = request.lower()
    dims = dict(spec_dimensions or {})
    geometric_type = geometric_type.lower()

    if _is_lampshade_request(text, geometric_type):
        bottom_diameter = _dimension(dims, "bottom_diameter", "diameter", "width")
        top_diameter = _dimension(dims, "top_diameter")
        height = _dimension(dims, "height", "length")
        if bottom_diameter and top_diameter and height:
            return {
                "intent_type": "half_frustum_shell" if "半" in request or "half" in text else "frustum_shell",
                "category": "lampshade",
                "dimensions_mm": {
                    "bottom_diameter": bottom_diameter,
                    "top_diameter": top_diameter,
                    "height": height,
                },
                "defaults": {
                    "wall_thickness": 1.8,
                },
            }

    return {}


def _is_lampshade_request(text: str, geometric_type: str) -> bool:
    return any(
        token in text or token in geometric_type
        for token in ("灯罩", "lampshade", "lamp shade", "shade", "frustum", "圆锥")
    )


def _dimension(dimensions: Mapping[str, float], *keys: str) -> float | None:
    for key in keys:
        value = dimensions.get(key)
        if isinstance(value, (int, float)):
            return float(value)
    return None
