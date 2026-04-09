"""Parametric part engine for deterministic core families."""

from __future__ import annotations

from typing import Any, Mapping

from cad_agent.app.parametric.builders import (
    BuildResult,
    DeviceStandBuilder,
    EnclosureBuilder,
    ParametricBuilderError,
    SpurGearBuilder,
)


class ParametricPartEngine:
    """Resolve part families to deterministic builders."""

    def __init__(self) -> None:
        self._builders = {
            "spur_gear": SpurGearBuilder(),
            "device_stand": DeviceStandBuilder(),
            "electronics_enclosure": EnclosureBuilder(),
        }

    def supports(self, part_family: str | None) -> bool:
        """Return whether the family has a deterministic builder."""
        return bool(part_family and part_family in self._builders)

    def build(self, part_family: str, parameter_values: Mapping[str, Any]) -> BuildResult:
        """Build a parametric part for the selected family."""
        builder = self._builders.get(part_family)
        if builder is None:
            raise ParametricBuilderError(f"No deterministic builder registered for part family '{part_family}'")
        return builder.build(parameter_values)
