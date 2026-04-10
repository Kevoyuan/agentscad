"""Constrained geometry DSL for LLM-planned CAD parts."""

from __future__ import annotations

from typing import Any, Mapping

from pydantic import BaseModel, Field

from cad_agent.app.llm.pipeline_models import PartFamily
from cad_agent.app.llm.pipeline_utils import family_default_values


class GeometryOperation(BaseModel):
    """A single geometry operation in the intermediate DSL."""

    type: str
    name: str
    anchor: str = "origin"
    operation: str = "add"
    dimensions: dict[str, float] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class GeometryDSLDocument(BaseModel):
    """Top-level DSL document."""

    family: str
    units: str = "mm"
    operations: list[GeometryOperation] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class GeometryDSLCompiler:
    """Compile the constrained geometry DSL into OpenSCAD."""

    def compile(self, payload: GeometryDSLDocument | Mapping[str, Any]) -> str:
        """Compile a validated DSL document to OpenSCAD."""
        document = payload if isinstance(payload, GeometryDSLDocument) else GeometryDSLDocument.model_validate(payload)
        modules: list[str] = [
            "// Generated from geometry DSL",
            "$fn = 64;",
            "",
        ]
        body: list[str] = []

        for operation in document.operations:
            if operation.type == "rounded_box":
                modules.append(self._rounded_box_module(operation))
                body.append(f"  {operation.name}();")
                continue
            if operation.type == "shell":
                modules.append(self._shell_module(operation))
                body.append(f"  {operation.name}();")
                continue
            if operation.type == "phone_case_shell":
                modules.append(self._phone_case_shell_module(operation))
                body.append(f"  {operation.name}();")
                continue
            if operation.type == "support_base":
                modules.append(self._support_base_module(operation))
                body.append(f"  {operation.name}();")
                continue
            if operation.type == "frustum_shell":
                modules.append(self._frustum_shell_module(operation))
                body.append(f"  {operation.name}();")
                continue
            raise ValueError(f"Unsupported geometry DSL operation: {operation.type}")

        modules.append("union() {")
        modules.extend(body or ["  // No geometry operations were provided"])
        modules.append("}")
        return "\n".join(modules)

    def build_phone_case(self, parameter_values: Mapping[str, float]) -> dict[str, Any]:
        """Build a deterministic phone-case DSL payload from effective parameter values."""
        defaults = family_default_values(PartFamily.PHONE_CASE)
        merged = {**defaults, **dict(parameter_values)}

        body_length = float(merged["body_length"])
        body_width = float(merged["body_width"])
        body_depth = float(merged["body_depth"])
        wall_thickness = float(merged["wall_thickness"])
        side_clearance = float(merged["side_clearance"])
        camera_clearance = float(merged["camera_clearance"])
        lip_height = float(merged["lip_height"])
        bottom_opening_depth = float(merged["bottom_opening_depth"])
        corner_bumper_thickness = float(merged["corner_bumper_thickness"])

        outer_length = body_length + 2 * (wall_thickness + side_clearance)
        outer_width = body_width + 2 * (wall_thickness + side_clearance)
        outer_depth = body_depth + wall_thickness + lip_height + side_clearance
        outer_radius = max(wall_thickness + side_clearance + 0.8, corner_bumper_thickness)
        camera_opening_length = min(max(body_length * 0.22, 18.0), outer_length * 0.32)
        camera_opening_width = min(max(body_width * 0.26, 16.0), outer_width * 0.34)
        camera_opening_depth = wall_thickness * 2.4
        port_opening_width = min(max(body_width * 0.58, 24.0), outer_width - 2 * wall_thickness)
        port_opening_depth = min(max(bottom_opening_depth, wall_thickness * 3.0), outer_length * 0.18)

        return {
            "family": "phone_case",
            "units": "mm",
            "operations": [
                {
                    "type": "phone_case_shell",
                    "name": "phone_case_body",
                    "dimensions": {
                        "body_length": body_length,
                        "body_width": body_width,
                        "body_depth": body_depth,
                        "wall_thickness": wall_thickness,
                        "side_clearance": side_clearance,
                        "camera_clearance": camera_clearance,
                        "lip_height": lip_height,
                        "bottom_opening_depth": bottom_opening_depth,
                        "corner_bumper_thickness": corner_bumper_thickness,
                        "outer_length": outer_length,
                        "outer_width": outer_width,
                        "outer_depth": outer_depth,
                        "outer_radius": outer_radius,
                        "camera_opening_length": camera_opening_length,
                        "camera_opening_width": camera_opening_width,
                        "camera_opening_depth": camera_opening_depth,
                        "port_opening_width": port_opening_width,
                        "port_opening_depth": port_opening_depth,
                    },
                }
            ],
            "metadata": {
                "synthesis": "deterministic_phone_case",
            },
        }

    def build_support_base(
        self,
        object_model: Mapping[str, Any],
        parameter_values: Mapping[str, float],
    ) -> dict[str, Any]:
        """Build a deterministic support-base DSL payload from an object model."""
        params = dict(parameter_values)
        base = dict(object_model.get("base_footprint_mm", {}))
        support = dict(object_model.get("support_surface_mm", {}))
        envelope = dict(object_model.get("envelope_mm", {}))

        base_width = float(params.get("base_width", base.get("width", 240.0)))
        base_depth = float(params.get("base_depth", base.get("depth", 240.0)))
        base_height = float(params.get("base_height", base.get("height", 45.0)))
        support_width = float(params.get("support_width", support.get("width", envelope.get("width", 197.0) + 8.0)))
        support_depth = float(params.get("support_depth", support.get("depth", 98.0)))
        device_width = float(params.get("device_width", envelope.get("width", 197.0)))
        device_depth = float(params.get("device_depth", envelope.get("depth", 197.0)))
        device_height = float(params.get("device_height", envelope.get("height", 95.0)))
        wall_thickness = float(params.get("wall_thickness", 4.0))
        clearance = float(params.get("clearance", 1.0))
        cable_relief_width = float(params.get("cable_relief_width", 70.0))
        edge_radius = float(params.get("edge_radius", 18.0))

        pocket_width = min(max(support_width, device_width + clearance * 2), base_width - wall_thickness * 2)
        pocket_depth = min(max(support_depth, device_depth * 0.45), base_depth - wall_thickness * 2)
        pocket_height = min(max(device_height * 0.12, wall_thickness + 2.0), base_height * 0.5)
        cable_relief_depth = min(max(base_depth * 0.18, 20.0), base_depth * 0.28)

        return {
            "family": "device_support",
            "units": "mm",
            "operations": [
                {
                    "type": "support_base",
                    "name": "support_base_body",
                    "dimensions": {
                        "base_width": base_width,
                        "base_depth": base_depth,
                        "base_height": base_height,
                        "pocket_width": pocket_width,
                        "pocket_depth": pocket_depth,
                        "pocket_height": pocket_height,
                        "cable_relief_width": cable_relief_width,
                        "cable_relief_depth": cable_relief_depth,
                        "edge_radius": edge_radius,
                        "wall_thickness": wall_thickness,
                    },
                    "metadata": {
                        "entity_name": object_model.get("entity_name", "Supported Device"),
                        "support_strategy": object_model.get("support_strategy", "support_base"),
                    },
                }
            ],
            "metadata": {
                "synthesis": "deterministic_support_base",
                "entity_name": object_model.get("entity_name", "Supported Device"),
            },
        }

    def build_geometry_intent(
        self,
        geometry_intent: Mapping[str, Any],
        parameter_values: Mapping[str, float] | None = None,
    ) -> dict[str, Any]:
        """Build deterministic DSL payloads for generic geometry intents."""
        parameter_values = dict(parameter_values or {})
        intent_type = str(geometry_intent.get("intent_type", "")).strip().lower()
        dims = dict(geometry_intent.get("dimensions_mm", {}))
        defaults = dict(geometry_intent.get("defaults", {}))

        if intent_type in {"frustum_shell", "half_frustum_shell"}:
            bottom_diameter = float(parameter_values.get("bottom_diameter", dims.get("bottom_diameter", 300.0)))
            top_diameter = float(parameter_values.get("top_diameter", dims.get("top_diameter", 200.0)))
            height = float(parameter_values.get("height", dims.get("height", 200.0)))
            wall_thickness = float(parameter_values.get("wall_thickness", defaults.get("wall_thickness", 1.8)))
            return {
                "family": "generic_shape",
                "units": "mm",
                "operations": [
                    {
                        "type": "frustum_shell",
                        "name": "frustum_shell_body",
                        "dimensions": {
                            "bottom_diameter": bottom_diameter,
                            "top_diameter": top_diameter,
                            "height": height,
                            "wall_thickness": wall_thickness,
                            "half_cut": 1.0 if intent_type == "half_frustum_shell" else 0.0,
                        },
                    }
                ],
                "metadata": {
                    "synthesis": "geometry_intent",
                    "intent_type": intent_type,
                },
            }

        raise ValueError(f"Unsupported geometry intent: {intent_type}")

    def _rounded_box_module(self, operation: GeometryOperation) -> str:
        dims = operation.dimensions
        length = dims.get("length", dims.get("x", 10.0))
        width = dims.get("width", dims.get("y", 10.0))
        height = dims.get("height", dims.get("z", 10.0))
        radius = dims.get("radius", 2.0)
        inner_length = max(length - 2 * radius, 0.1)
        inner_width = max(width - 2 * radius, 0.1)
        inner_height = max(height - 2 * radius, 0.1)
        return (
            f"module {operation.name}() {{\n"
            "  minkowski() {\n"
            f"    cube([{inner_length:.3f}, {inner_width:.3f}, {inner_height:.3f}], center=true);\n"
            f"    sphere(r={radius:.3f});\n"
            "  }\n"
            "}\n"
        )

    def _shell_module(self, operation: GeometryOperation) -> str:
        dims = operation.dimensions
        length = dims.get("length", 10.0)
        width = dims.get("width", 10.0)
        height = dims.get("height", 10.0)
        wall = dims.get("wall_thickness", 1.2)
        return (
            f"module {operation.name}() {{\n"
            "  difference() {\n"
            f"    cube([{length:.3f}, {width:.3f}, {height:.3f}], center=true);\n"
            f"    translate([0, 0, {wall / 2:.3f}]) cube([{max(length - 2 * wall, 0.1):.3f}, {max(width - 2 * wall, 0.1):.3f}, {max(height - wall, 0.1):.3f}], center=true);\n"
            "  }\n"
            "}\n"
        )

    def _phone_case_shell_module(self, operation: GeometryOperation) -> str:
        dims = operation.dimensions
        outer_length = dims.get("outer_length", 155.0)
        outer_width = dims.get("outer_width", 76.0)
        outer_depth = dims.get("outer_depth", 11.0)
        wall_thickness = dims.get("wall_thickness", 1.8)
        side_clearance = dims.get("side_clearance", 0.6)
        lip_height = dims.get("lip_height", 1.0)
        body_length = dims.get("body_length", 150.0)
        body_width = dims.get("body_width", 72.0)
        body_depth = dims.get("body_depth", 8.7)
        outer_radius = dims.get("outer_radius", 3.0)
        corner_bumper_thickness = dims.get("corner_bumper_thickness", 2.4)
        camera_clearance = dims.get("camera_clearance", 1.2)
        camera_opening_length = dims.get("camera_opening_length", 20.0)
        camera_opening_width = dims.get("camera_opening_width", 18.0)
        camera_opening_depth = dims.get("camera_opening_depth", wall_thickness * 2.4)
        port_opening_width = dims.get("port_opening_width", 28.0)
        port_opening_depth = dims.get("port_opening_depth", 9.0)

        inner_length = body_length + 2 * side_clearance
        inner_width = body_width + 2 * side_clearance
        inner_depth = body_depth + side_clearance
        inner_radius = max(outer_radius - wall_thickness, wall_thickness * 0.7)
        inner_translate_z = (wall_thickness - lip_height) / 2

        camera_offset_x = outer_length * 0.26
        camera_offset_y = outer_width * 0.18
        camera_offset_z = -(outer_depth / 2 - camera_opening_depth / 2 - 0.05)
        bumper_offset_x = outer_length / 2 - outer_radius * 1.15
        bumper_offset_y = outer_width / 2 - outer_radius * 1.15
        bumper_radius = max(corner_bumper_thickness * 0.32, 0.8)
        port_offset_x = -(outer_length / 2 - port_opening_depth / 2 - wall_thickness * 0.4)

        return (
            "module rounded_box(size=[10, 10, 10], radius=2) {\n"
            "  linear_extrude(height=size[2], center=true)\n"
            "    offset(r=radius)\n"
            "      square([\n"
            "        max(size[0] - 2 * radius, 0.1),\n"
            "        max(size[1] - 2 * radius, 0.1)\n"
            "      ], center=true);\n"
            "}\n\n"
            "module camera_opening() {\n"
            f"  translate([{camera_offset_x:.3f}, {camera_offset_y:.3f}, {camera_offset_z:.3f}])\n"
            f"    rounded_box([{camera_opening_length:.3f}, {camera_opening_width:.3f}, {camera_opening_depth:.3f}], radius={max(inner_radius * 0.7, 1.2):.3f});\n"
            "}\n\n"
            "module port_opening() {\n"
            f"  translate([{port_offset_x:.3f}, 0, 0])\n"
            f"    cube([{port_opening_depth + 0.3:.3f}, {port_opening_width:.3f}, {outer_depth + 1.0:.3f}], center=true);\n"
            "}\n\n"
            f"module {operation.name}() {{\n"
            "  union() {\n"
            "    difference() {\n"
            f"      rounded_box([{outer_length:.3f}, {outer_width:.3f}, {outer_depth:.3f}], radius={outer_radius:.3f});\n"
            f"      translate([0, 0, {inner_translate_z:.3f}]) rounded_box([{inner_length:.3f}, {inner_width:.3f}, {inner_depth:.3f}], radius={inner_radius:.3f});\n"
            "      camera_opening();\n"
            "      port_opening();\n"
            "    }\n"
            f"    for (sx = [-1, 1], sy = [-1, 1]) translate([sx * {bumper_offset_x:.3f}, sy * {bumper_offset_y:.3f}, {-outer_depth / 2 + wall_thickness + camera_clearance / 2:.3f}]) sphere(r={bumper_radius:.3f});\n"
            "  }\n"
            "}\n"
        )

    def _support_base_module(self, operation: GeometryOperation) -> str:
        dims = operation.dimensions
        base_width = dims.get("base_width", 240.0)
        base_depth = dims.get("base_depth", 240.0)
        base_height = dims.get("base_height", 45.0)
        pocket_width = dims.get("pocket_width", 205.0)
        pocket_depth = dims.get("pocket_depth", 98.0)
        pocket_height = dims.get("pocket_height", 12.0)
        cable_relief_width = dims.get("cable_relief_width", 70.0)
        cable_relief_depth = dims.get("cable_relief_depth", 40.0)
        edge_radius = dims.get("edge_radius", 18.0)
        wall_thickness = dims.get("wall_thickness", 4.0)

        pocket_radius = max(min(edge_radius * 0.6, pocket_width * 0.15, pocket_depth * 0.15), 4.0)
        pocket_z = base_height / 2 - pocket_height / 2 + 0.05
        cable_relief_y = -(base_depth / 2 - cable_relief_depth / 2) + 0.05

        return (
            "module rounded_prism(size=[10, 10, 10], radius=2) {\n"
            "  linear_extrude(height=size[2], center=true)\n"
            "    offset(r=radius)\n"
            "      square([\n"
            "        max(size[0] - 2 * radius, 0.1),\n"
            "        max(size[1] - 2 * radius, 0.1)\n"
            "      ], center=true);\n"
            "}\n\n"
            "module top_alignment_pocket() {\n"
            f"  translate([0, 0, {pocket_z:.3f}])\n"
            f"    rounded_prism([{pocket_width:.3f}, {pocket_depth:.3f}, {pocket_height + 0.2:.3f}], radius={pocket_radius:.3f});\n"
            "}\n\n"
            "module cable_relief() {\n"
            f"  translate([0, {cable_relief_y:.3f}, 0])\n"
            f"    cube([{cable_relief_width:.3f}, {cable_relief_depth + 0.2:.3f}, {base_height + 1.0:.3f}], center=true);\n"
            "}\n\n"
            f"module {operation.name}() {{\n"
            "  difference() {\n"
            f"    rounded_prism([{base_width:.3f}, {base_depth:.3f}, {base_height:.3f}], radius={edge_radius:.3f});\n"
            "    top_alignment_pocket();\n"
            "    cable_relief();\n"
            f"    translate([0, 0, {-base_height / 2 + wall_thickness * 0.55:.3f}]) cube([{max(base_width - wall_thickness * 4, 0.1):.3f}, {max(base_depth * 0.34, 0.1):.3f}, {max(base_height * 0.45, 0.1):.3f}], center=true);\n"
            "  }\n"
            "}\n"
        )

    def _frustum_shell_module(self, operation: GeometryOperation) -> str:
        dims = operation.dimensions
        bottom_diameter = dims.get("bottom_diameter", 300.0)
        top_diameter = dims.get("top_diameter", 200.0)
        height = dims.get("height", 200.0)
        wall_thickness = dims.get("wall_thickness", 1.8)
        half_cut = dims.get("half_cut", 0.0) >= 0.5

        outer_r1 = bottom_diameter / 2
        outer_r2 = top_diameter / 2
        inner_r1 = max(outer_r1 - wall_thickness, 0.1)
        inner_r2 = max(outer_r2 - wall_thickness, 0.1)
        cut_offset = outer_r1 + 1.0

        base = (
            f"bottom_diameter = {bottom_diameter:.3f};\n"
            f"top_diameter = {top_diameter:.3f};\n"
            f"shade_height = {height:.3f};\n"
            f"shade_wall_thickness = {wall_thickness:.3f};\n\n"
            f"module {operation.name}() {{\n"
            "  difference() {\n"
            "    cylinder(h=shade_height, r1=bottom_diameter / 2, r2=top_diameter / 2);\n"
            f"    translate([0, 0, {-0.05:.3f}]) cylinder(h={height + 0.1:.3f}, r1={inner_r1:.3f}, r2={inner_r2:.3f});\n"
            "  }\n"
            "}\n"
        )
        if not half_cut:
            return base
        return (
            f"bottom_diameter = {bottom_diameter:.3f};\n"
            f"top_diameter = {top_diameter:.3f};\n"
            f"shade_height = {height:.3f};\n"
            f"shade_wall_thickness = {wall_thickness:.3f};\n\n"
            "module half_profile_cut() {\n"
            f"  translate([{-cut_offset:.3f}, 0, {-1.0:.3f}]) cube([{cut_offset:.3f}, {bottom_diameter + 4.0:.3f}, {height + 2.0:.3f}]);\n"
            "}\n\n"
            f"module {operation.name}() {{\n"
            "  difference() {\n"
            "    cylinder(h=shade_height, r1=bottom_diameter / 2, r2=top_diameter / 2);\n"
            f"    translate([0, 0, {-0.05:.3f}]) cylinder(h={height + 0.1:.3f}, r1={inner_r1:.3f}, r2={inner_r2:.3f});\n"
            "    half_profile_cut();\n"
            "  }\n"
            "}\n"
        )
