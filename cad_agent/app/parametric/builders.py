"""Deterministic parametric builders for core CAD families."""

from __future__ import annotations

from dataclasses import dataclass, field
from math import pi
from typing import Any, Mapping


@dataclass(frozen=True)
class ValidationIssue:
    """A single validation issue produced by a builder."""

    code: str
    message: str
    severity: str = "error"


@dataclass(frozen=True)
class BuildResult:
    """Result of a parametric build."""

    family: str
    parameters: dict[str, Any]
    derived: dict[str, Any]
    scad_source: str
    warnings: list[str] = field(default_factory=list)
    validations: list[ValidationIssue] = field(default_factory=list)


class ParametricBuilderError(ValueError):
    """Raised when a builder receives invalid or incomplete parameters."""


class BaseBuilder:
    """Common helpers for parametric builders."""

    family: str = "base"

    def build(self, parameters: Mapping[str, Any]) -> BuildResult:
        raise NotImplementedError

    @staticmethod
    def _get_float(parameters: Mapping[str, Any], *keys: str, default: float | None = None) -> float:
        for key in keys:
            value = parameters.get(key)
            if value is None:
                continue
            try:
                return float(value)
            except (TypeError, ValueError) as exc:  # pragma: no cover - defensive
                raise ParametricBuilderError(f"Parameter '{key}' must be numeric") from exc
        if default is None:
            raise ParametricBuilderError(f"Missing required parameter: {keys[0]}")
        return float(default)

    @staticmethod
    def _get_int(parameters: Mapping[str, Any], *keys: str, default: int | None = None) -> int:
        for key in keys:
            value = parameters.get(key)
            if value is None:
                continue
            try:
                return int(value)
            except (TypeError, ValueError) as exc:  # pragma: no cover - defensive
                raise ParametricBuilderError(f"Parameter '{key}' must be an integer") from exc
        if default is None:
            raise ParametricBuilderError(f"Missing required parameter: {keys[0]}")
        return int(default)

    @staticmethod
    def _merge_parameters(parameters: Mapping[str, Any], derived: Mapping[str, Any]) -> dict[str, Any]:
        merged = dict(parameters)
        merged.update(derived)
        return merged


class SpurGearBuilder(BaseBuilder):
    """Build a deterministic spur gear OpenSCAD program."""

    family = "spur_gear"

    def build(self, parameters: Mapping[str, Any]) -> BuildResult:
        teeth = self._get_int(parameters, "teeth", "num_teeth", "tooth_count")
        outer_diameter = parameters.get("outer_diameter") or parameters.get("outer_dia")
        module_value = parameters.get("module")
        thickness = self._get_float(parameters, "thickness", "gear_thickness", default=3.0)
        inner_diameter = self._get_float(parameters, "inner_diameter", "bore_diameter", "hole_diameter", default=0.0)
        pressure_angle = self._get_float(parameters, "pressure_angle", default=20.0)

        validations = self._validate(teeth, thickness, pressure_angle, outer_diameter, inner_diameter, module_value)
        if validations:
            raise ParametricBuilderError(validations[0].message)

        if module_value is not None:
            module_value = float(module_value)
            pitch_diameter = module_value * teeth
            outer_diameter = module_value * (teeth + 2)
        else:
            outer_diameter = self._get_float(parameters, "outer_diameter", "outer_dia")
            module_value = outer_diameter / (teeth + 2)
            pitch_diameter = module_value * teeth

        if inner_diameter <= 0:
            inner_diameter = max(outer_diameter * 0.35, 1.0)

        root_diameter = module_value * (teeth - 2.5)
        addendum = module_value
        dedendum = 1.25 * module_value
        tooth_span = (pi * pitch_diameter) / teeth * 0.38
        outer_radius = outer_diameter / 2
        root_radius = root_diameter / 2

        derived = {
            "module": round(module_value, 4),
            "pitch_diameter": round(pitch_diameter, 4),
            "root_diameter": round(root_diameter, 4),
            "addendum": round(addendum, 4),
            "dedendum": round(dedendum, 4),
            "tooth_span": round(tooth_span, 4),
            "pitch_radius": round(pitch_diameter / 2, 4),
            "outer_radius": round(outer_radius, 4),
            "root_radius": round(root_radius, 4),
        }

        scad_source = f"""// Parametric Spur Gear
$fn = 48;

teeth = {teeth};
outer_dia = {outer_diameter:.4f};
inner_bore = {inner_diameter:.4f};
thickness = {thickness:.4f};
pressure_angle = {pressure_angle:.4f};

module_value = outer_dia / (teeth + 2);
pitch_dia = module_value * teeth;
root_dia = module_value * (teeth - 2.5);
addendum = module_value;
dedendum = 1.25 * module_value;
tooth_span = (PI * pitch_dia) / teeth * 0.38;
outer_radius = outer_dia / 2;
root_radius = root_dia / 2;

module gear_tooth() {{
    linear_extrude(height = thickness)
        polygon(points = [
            [root_radius, -tooth_span / 2],
            [outer_radius, -tooth_span * 0.24],
            [outer_radius, tooth_span * 0.24],
            [root_radius, tooth_span / 2]
        ]);
}}

difference() {{
    union() {{
        cylinder(h = thickness, d = root_dia);
        for (i = [0 : teeth - 1]) {{
            rotate(i * 360 / teeth)
                gear_tooth();
        }}
    }}
    cylinder(h = thickness + 0.4, d = inner_bore);
}}
"""

        return BuildResult(
            family=self.family,
            parameters=self._merge_parameters(
                parameters,
                {
                    "teeth": teeth,
                    "outer_diameter": outer_diameter,
                    "inner_diameter": inner_diameter,
                    "thickness": thickness,
                    "pressure_angle": pressure_angle,
                },
            ),
            derived=derived,
            scad_source=scad_source.strip(),
        )

    def _validate(
        self,
        teeth: int,
        thickness: float,
        pressure_angle: float,
        outer_diameter: Any,
        inner_diameter: float,
        module_value: Any,
    ) -> list[ValidationIssue]:
        issues: list[ValidationIssue] = []
        if teeth < 6:
            issues.append(ValidationIssue("gear_teeth", "Spur gears need at least 6 teeth.", "error"))
        if thickness <= 0:
            issues.append(ValidationIssue("gear_thickness", "Gear thickness must be positive.", "error"))
        if not 14.0 <= pressure_angle <= 35.0:
            issues.append(ValidationIssue("pressure_angle", "Pressure angle should stay within a printable gear range.", "error"))
        if outer_diameter is None and module_value is None:
            issues.append(ValidationIssue("gear_size", "Need either outer_diameter or module to define the gear.", "error"))
        if inner_diameter < 0:
            issues.append(ValidationIssue("gear_bore", "Inner diameter cannot be negative.", "error"))
        return issues


class DeviceStandBuilder(BaseBuilder):
    """Build a deterministic device stand or cradle."""

    family = "device_stand"

    def build(self, parameters: Mapping[str, Any]) -> BuildResult:
        device_width = self._get_float(parameters, "device_width", "width", "mac_size", default=130.0)
        device_depth = self._get_float(parameters, "device_depth", "depth", default=device_width)
        stand_height = self._get_float(parameters, "stand_height", "height", default=27.5)
        lip_height = self._get_float(parameters, "lip_height", default=9.5)
        wall_thickness = self._get_float(parameters, "wall_thickness", default=7.0)
        base_flare = self._get_float(parameters, "base_flare", default=10.0)
        arch_radius = self._get_float(parameters, "arch_radius", default=max(device_width, device_depth) * 0.47)
        arch_peak = self._get_float(parameters, "arch_peak", default=stand_height * 0.8)
        corner_radius = self._get_float(parameters, "corner_radius", default=41.5)
        clearance = self._get_float(parameters, "clearance", default=0.8)

        validations = self._validate(device_width, device_depth, stand_height, lip_height, wall_thickness, arch_radius, arch_peak)
        if validations:
            raise ParametricBuilderError(validations[0].message)

        inner_width = device_width + clearance * 2
        inner_depth = device_depth + clearance * 2
        outer_width = inner_width + wall_thickness * 2 + base_flare * 2
        outer_depth = inner_depth + wall_thickness * 2 + base_flare * 2
        seat_depth = max(stand_height - lip_height, 1.0)
        arch_cut_depth = max(arch_peak, 0.0)

        derived = {
            "inner_width": round(inner_width, 4),
            "inner_depth": round(inner_depth, 4),
            "outer_width": round(outer_width, 4),
            "outer_depth": round(outer_depth, 4),
            "seat_depth": round(seat_depth, 4),
            "arch_cut_depth": round(arch_cut_depth, 4),
        }

        scad_source = f"""// Parametric Device Stand
$fn = 96;

device_width = {device_width:.4f};
device_depth = {device_depth:.4f};
stand_height = {stand_height:.4f};
lip_height = {lip_height:.4f};
wall_thickness = {wall_thickness:.4f};
base_flare = {base_flare:.4f};
arch_radius = {arch_radius:.4f};
arch_peak = {arch_peak:.4f};
corner_radius = {corner_radius:.4f};
clearance = {clearance:.4f};

inner_width = device_width + clearance * 2;
inner_depth = device_depth + clearance * 2;
outer_width = inner_width + wall_thickness * 2 + base_flare * 2;
outer_depth = inner_depth + wall_thickness * 2 + base_flare * 2;
seat_depth = max(stand_height - lip_height, 1);

module rounded_rect(w, d, r) {{
    hull() {{
        for (x = [-w / 2 + r, w / 2 - r])
            for (y = [-d / 2 + r, d / 2 - r])
                translate([x, y, 0]) circle(r = r);
    }}
}}

module stand_shell() {{
    difference() {{
        linear_extrude(height = stand_height)
            rounded_rect(outer_width, outer_depth, corner_radius);
        translate([0, 0, wall_thickness])
            linear_extrude(height = stand_height)
                rounded_rect(inner_width, inner_depth, max(corner_radius - wall_thickness, 1));
        translate([0, -outer_depth * 0.18, 0])
            hull() {{
                translate([0, 0, 0]) cylinder(h = stand_height, r = arch_radius);
                translate([0, 0, arch_peak]) cylinder(h = stand_height, r = arch_radius * 0.72);
            }}
    }}
}}

stand_shell();
"""

        return BuildResult(
            family=self.family,
            parameters=self._merge_parameters(
                parameters,
                {
                    "device_width": device_width,
                    "device_depth": device_depth,
                    "stand_height": stand_height,
                    "lip_height": lip_height,
                    "wall_thickness": wall_thickness,
                    "base_flare": base_flare,
                    "arch_radius": arch_radius,
                    "arch_peak": arch_peak,
                    "corner_radius": corner_radius,
                    "clearance": clearance,
                },
            ),
            derived=derived,
            scad_source=scad_source.strip(),
        )

    def _validate(
        self,
        device_width: float,
        device_depth: float,
        stand_height: float,
        lip_height: float,
        wall_thickness: float,
        arch_radius: float,
        arch_peak: float,
    ) -> list[ValidationIssue]:
        issues: list[ValidationIssue] = []
        if device_width <= 0 or device_depth <= 0:
            issues.append(ValidationIssue("stand_size", "Device footprint must be positive.", "error"))
        if stand_height <= 0:
            issues.append(ValidationIssue("stand_height", "Stand height must be positive.", "error"))
        if wall_thickness <= 0:
            issues.append(ValidationIssue("stand_wall", "Wall thickness must be positive.", "error"))
        if lip_height < 0:
            issues.append(ValidationIssue("stand_lip", "Lip height cannot be negative.", "error"))
        if arch_radius <= 0:
            issues.append(ValidationIssue("arch_radius", "Arch radius must be positive.", "error"))
        if arch_peak < 0:
            issues.append(ValidationIssue("arch_peak", "Arch peak cannot be negative.", "error"))
        return issues


class EnclosureBuilder(BaseBuilder):
    """Build a deterministic electronics enclosure shell."""

    family = "electronics_enclosure"

    def build(self, parameters: Mapping[str, Any]) -> BuildResult:
        width = self._get_float(parameters, "width", "outer_width", default=160.0)
        depth = self._get_float(parameters, "depth", "outer_depth", default=110.0)
        height = self._get_float(parameters, "height", "outer_height", default=45.0)
        wall_thickness = self._get_float(parameters, "wall_thickness", default=2.4)
        corner_radius = self._get_float(parameters, "corner_radius", default=8.0)
        clearance = self._get_float(parameters, "clearance", default=0.6)
        lid_overlap = self._get_float(parameters, "lid_overlap", default=3.0)
        vent_spacing = self._get_float(parameters, "vent_spacing", default=8.0)
        vent_rows = self._get_int(parameters, "vent_rows", default=3)
        vent_cols = self._get_int(parameters, "vent_cols", default=5)

        validations = self._validate(width, depth, height, wall_thickness, corner_radius, lid_overlap, vent_spacing)
        if validations:
            raise ParametricBuilderError(validations[0].message)

        inner_width = width - wall_thickness * 2 - clearance * 2
        inner_depth = depth - wall_thickness * 2 - clearance * 2
        inner_height = height - wall_thickness - lid_overlap
        shell_volume_hint = width * depth * height - max(inner_width, 1) * max(inner_depth, 1) * max(inner_height, 1)
        vent_count = max(vent_rows, 1) * max(vent_cols, 1)

        derived = {
            "inner_width": round(inner_width, 4),
            "inner_depth": round(inner_depth, 4),
            "inner_height": round(inner_height, 4),
            "shell_volume_hint": round(shell_volume_hint, 4),
            "vent_count": vent_count,
        }

        scad_source = f"""// Parametric Electronics Enclosure
$fn = 96;

width = {width:.4f};
depth = {depth:.4f};
height = {height:.4f};
wall_thickness = {wall_thickness:.4f};
corner_radius = {corner_radius:.4f};
clearance = {clearance:.4f};
lid_overlap = {lid_overlap:.4f};
vent_spacing = {vent_spacing:.4f};
vent_rows = {vent_rows};
vent_cols = {vent_cols};

inner_width = width - wall_thickness * 2 - clearance * 2;
inner_depth = depth - wall_thickness * 2 - clearance * 2;
inner_height = height - wall_thickness - lid_overlap;

module rounded_rect(w, d, r) {{
    hull() {{
        for (x = [-w / 2 + r, w / 2 - r])
            for (y = [-d / 2 + r, d / 2 - r])
                translate([x, y, 0]) circle(r = r);
    }}
}}

module shell() {{
    difference() {{
        linear_extrude(height = height)
            rounded_rect(width, depth, corner_radius);
        translate([0, 0, wall_thickness])
            linear_extrude(height = inner_height)
                rounded_rect(inner_width, inner_depth, max(corner_radius - wall_thickness, 1));
    }}
}}

module vents() {{
    for (row = [0 : vent_rows - 1]) {{
        for (col = [0 : vent_cols - 1]) {{
            translate([
                (col - (vent_cols - 1) / 2) * vent_spacing,
                (row - (vent_rows - 1) / 2) * vent_spacing,
                height - wall_thickness / 2
            ])
                cylinder(h = wall_thickness + 0.4, d = 2.8);
        }}
    }}
}}

difference() {{
    shell();
    vents();
}}
"""

        return BuildResult(
            family=self.family,
            parameters=self._merge_parameters(
                parameters,
                {
                    "width": width,
                    "depth": depth,
                    "height": height,
                    "wall_thickness": wall_thickness,
                    "corner_radius": corner_radius,
                    "clearance": clearance,
                    "lid_overlap": lid_overlap,
                    "vent_spacing": vent_spacing,
                    "vent_rows": vent_rows,
                    "vent_cols": vent_cols,
                },
            ),
            derived=derived,
            scad_source=scad_source.strip(),
        )

    def _validate(
        self,
        width: float,
        depth: float,
        height: float,
        wall_thickness: float,
        corner_radius: float,
        lid_overlap: float,
        vent_spacing: float,
    ) -> list[ValidationIssue]:
        issues: list[ValidationIssue] = []
        if width <= 0 or depth <= 0 or height <= 0:
            issues.append(ValidationIssue("enclosure_size", "Enclosure dimensions must be positive.", "error"))
        if wall_thickness <= 0:
            issues.append(ValidationIssue("enclosure_wall", "Wall thickness must be positive.", "error"))
        if corner_radius <= 0:
            issues.append(ValidationIssue("enclosure_corner", "Corner radius must be positive.", "error"))
        if lid_overlap < 0:
            issues.append(ValidationIssue("enclosure_lid", "Lid overlap cannot be negative.", "error"))
        if vent_spacing <= 0:
            issues.append(ValidationIssue("enclosure_vents", "Vent spacing must be positive.", "error"))
        if wall_thickness * 2 >= min(width, depth):
            issues.append(ValidationIssue("enclosure_cavity", "Wall thickness leaves no cavity.", "error"))
        return issues
