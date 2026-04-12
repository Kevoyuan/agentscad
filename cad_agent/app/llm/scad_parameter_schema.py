"""Infer editable parameter schema from generated OpenSCAD source."""

from __future__ import annotations

import re
from typing import Any

from cad_agent.app.llm.pipeline_utils import label_for_key, unit_for_key
from cad_agent.app.models.design_job import ParameterDefinition, ParameterSchema

_ASSIGNMENT_RE = re.compile(
    r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*;\s*(?://\s*(.*))?$"
)
_SECTION_RE = re.compile(r"^\s*(module|function)\b")
_GROUP_TAG_RE = re.compile(r"\[group:\s*([a-z_ -]+)\]", re.IGNORECASE)
_TRUE_FALSE = {"true": True, "false": False}


def build_parameter_schema_from_scad(
    request: str,
    scad_source: str,
    *,
    part_family: str | None,
    design_summary: str = "",
    schema_version: str = "scad-inferred-v1",
) -> ParameterSchema | None:
    """Build a UI-editable parameter schema from top-level SCAD assignments."""
    parameters: list[ParameterDefinition] = []

    for raw_line in scad_source.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if _SECTION_RE.match(line):
            break
        match = _ASSIGNMENT_RE.match(raw_line)
        if not match:
            continue
        key, raw_value, comment = match.groups()
        parsed = _parse_scalar_value(raw_value)
        if parsed is None:
            continue
        parameters.append(
            ParameterDefinition(
                key=key,
                label=label_for_key(key),
                kind="boolean" if isinstance(parsed, bool) else "number",
                unit="" if isinstance(parsed, bool) else unit_for_key(key),
                value=parsed,
                min=None if isinstance(parsed, bool) else _range_for(key, parsed)[0],
                max=None if isinstance(parsed, bool) else _range_for(key, parsed)[1],
                step=None if isinstance(parsed, bool) else _range_for(key, parsed)[2],
                source="inferred_parametric",
                editable=True,
                description=_clean_comment(comment),
                group=_group_from_comment(comment) or _group_for(key),
            )
        )

    if not parameters:
        return None

    user_parameters = [parameter.key for parameter in parameters if parameter.source == "user"]
    inferred_parameters = [parameter.key for parameter in parameters if parameter.key not in user_parameters]

    return ParameterSchema(
        request=request,
        part_family=part_family or "",
        schema_version=schema_version,
        design_summary=design_summary,
        parameters=parameters,
        user_parameters=user_parameters,
        inferred_parameters=inferred_parameters,
        design_derived_parameters=[],
        notes=[
            "This schema was inferred from editable top-level OpenSCAD assignments.",
            "Parameter updates should prefer code patching over full regeneration when possible.",
        ],
    )


def apply_parameter_values_to_scad(scad_source: str, parameter_values: dict[str, Any]) -> str | None:
    """Patch top-level scalar assignments in SCAD with updated parameter values."""
    patched_lines: list[str] = []
    replaced_keys: set[str] = set()
    reached_section = False

    for raw_line in scad_source.splitlines():
        if _SECTION_RE.match(raw_line):
            reached_section = True
        if not reached_section:
            match = _ASSIGNMENT_RE.match(raw_line)
            if match:
                key, _, comment = match.groups()
                if key in parameter_values:
                    patched_lines.append(_format_assignment(key, parameter_values[key], comment))
                    replaced_keys.add(key)
                    continue
        patched_lines.append(raw_line)

    if not replaced_keys:
        return None
    return "\n".join(patched_lines)


def _parse_scalar_value(raw_value: str) -> Any | None:
    value = raw_value.strip()
    lower = value.lower()
    if lower in _TRUE_FALSE:
        return _TRUE_FALSE[lower]
    try:
        number = float(value)
    except ValueError:
        return None
    if number.is_integer():
        return int(number)
    return round(number, 4)


def _format_assignment(key: str, value: Any, comment: str | None) -> str:
    rendered = _format_scalar_value(value)
    if comment:
        return f"{key} = {rendered}; // {comment}"
    return f"{key} = {rendered};"


def _format_scalar_value(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return format(value, ".4f").rstrip("0").rstrip(".")
    return str(value)


def _range_for(key: str, value: float | int) -> tuple[float, float, float]:
    if "teeth" in key:
        return max(3, int(value * 0.5)), max(8, int(value * 1.5)), 1
    if "angle" in key:
        return 0.0, 60.0, 0.1
    magnitude = max(float(value), 1.0)
    if any(
        token in key
        for token in (
            "clearance",
            "thickness",
            "radius",
            "height",
            "width",
            "depth",
            "diameter",
            "peak",
            "flare",
            "length",
            "size",
        )
    ):
        return round(max(0.0, magnitude * 0.4), 3), round(magnitude * 1.8 + 10.0, 3), 0.1 if magnitude < 20 else 1.0
    return 0.0, max(magnitude * 2.0, 10.0), 0.1


def _group_for(key: str) -> str:
    if any(token in key for token in ("width", "depth", "height", "length", "diameter", "radius")):
        return "dimensions"
    if any(token in key for token in ("clearance", "thickness", "lip", "flare", "peak", "arch")):
        return "fit"
    return "general"


def _group_from_comment(comment: str | None) -> str | None:
    if not comment:
        return None
    match = _GROUP_TAG_RE.search(comment)
    if not match:
        return None
    return match.group(1).strip().lower().replace(" ", "_")


def _clean_comment(comment: str | None) -> str:
    if not comment:
        return ""
    return _GROUP_TAG_RE.sub("", comment).strip(" -")
