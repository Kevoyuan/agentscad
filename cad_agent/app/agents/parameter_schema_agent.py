"""Parameter schema agent for editable parametric controls."""

from __future__ import annotations

from cad_agent.app.llm.pipeline_models import (
    DesignResult,
    IntentResult,
    ParameterDefinition,
    ParameterKind,
    ParameterSchemaResult,
    ParameterSource,
    PartFamily,
    ResearchResult,
)
from cad_agent.app.llm.pipeline_utils import (
    extract_numbers,
    family_default_values,
    label_for_key,
    unit_for_key,
)


class ParameterSchemaAgent:
    """Invent editable parameters from the design concept."""

    async def build_schema(
        self,
        request: str,
        intent: IntentResult,
        design: DesignResult,
        research: ResearchResult | None = None,
    ) -> ParameterSchemaResult:
        """Return a parameter schema for the part family."""
        parsed = extract_numbers(request)
        family = intent.part_family
        defaults = family_default_values(family)
        if research and getattr(research, "reference_dimensions", None):
            defaults = {**defaults, **dict(research.reference_dimensions)}

        if family == PartFamily.SPUR_GEAR:
            parameters, user_params, inferred_params, design_params = self._gear_schema(parsed.values, defaults)
        elif family == PartFamily.DEVICE_STAND:
            parameters, user_params, inferred_params, design_params = self._stand_schema(parsed.values, defaults, research)
        elif family == PartFamily.ELECTRONICS_ENCLOSURE:
            parameters, user_params, inferred_params, design_params = self._enclosure_schema(parsed.values, defaults)
        elif family == PartFamily.PHONE_CASE:
            parameters, user_params, inferred_params, design_params = self._phone_case_schema(parsed.values, defaults)
        else:
            parameters, user_params, inferred_params, design_params = self._fallback_schema(defaults)

        notes = [
            "User parameters come from the prompt when present.",
            "Design-derived parameters are invented controls that shape the object without hard-coding geometry.",
        ]
        if research and research.needs_web_search:
            notes.append("Research can be extended later using the search_queries field.")

        return ParameterSchemaResult(
            request=request,
            part_family=family,
            schema_version="v1",
            design_summary=design.design_intent_summary,
            parameters=parameters,
            user_parameters=user_params,
            inferred_parameters=inferred_params,
            design_derived_parameters=design_params,
            notes=notes,
        )

    def _gear_schema(
        self,
        values: dict[str, float],
        defaults: dict[str, float],
    ) -> tuple[list[ParameterDefinition], list[str], list[str], list[str]]:
        merged = {**defaults, **values}
        teeth = int(round(merged["teeth"]))
        outer_diameter = float(merged["outer_diameter"])
        inner_diameter = float(merged["inner_diameter"])
        thickness = float(merged["thickness"])
        pressure_angle = float(merged.get("pressure_angle", 20.0))
        module = round(outer_diameter / (teeth + 2), 3)
        pitch_diameter = round(module * teeth, 3)
        root_diameter = round(module * (teeth - 2.5), 3)
        addendum = round(module, 3)
        dedendum = round(1.25 * module, 3)

        params = [
            self._parameter("teeth", teeth, ParameterKind.INTEGER, source=self._source_for("teeth", values)),
            self._parameter("outer_diameter", outer_diameter, source=self._source_for("outer_diameter", values)),
            self._parameter("inner_diameter", inner_diameter, source=self._source_for("inner_diameter", values)),
            self._parameter("thickness", thickness, source=self._source_for("thickness", values)),
            self._parameter("pressure_angle", pressure_angle, unit="deg", source=self._source_for("pressure_angle", values, default_source=ParameterSource.INFERRED)),
            self._parameter("module", module, editable=False, source=ParameterSource.DESIGN_DERIVED, derived_from=["teeth", "outer_diameter"]),
            self._parameter("pitch_diameter", pitch_diameter, editable=False, source=ParameterSource.DESIGN_DERIVED, derived_from=["module", "teeth"]),
            self._parameter("root_diameter", root_diameter, editable=False, source=ParameterSource.DESIGN_DERIVED, derived_from=["module", "teeth"]),
            self._parameter("addendum", addendum, editable=False, source=ParameterSource.DESIGN_DERIVED, derived_from=["module"]),
            self._parameter("dedendum", dedendum, editable=False, source=ParameterSource.DESIGN_DERIVED, derived_from=["module"]),
        ]
        return params, ["teeth", "outer_diameter", "inner_diameter", "thickness"], ["pressure_angle"], ["module", "pitch_diameter", "root_diameter", "addendum", "dedendum"]

    def _stand_schema(
        self,
        values: dict[str, float],
        defaults: dict[str, float],
        research: ResearchResult | None,
    ) -> tuple[list[ParameterDefinition], list[str], list[str], list[str]]:
        merged = {**defaults, **values}
        user_params = list(values.keys())
        if research and research.object_name.lower().startswith("mac mini"):
            merged.setdefault("device_width", 130.0)
            merged.setdefault("device_depth", 130.0)

        params = [
            self._parameter("device_width", merged["device_width"], source=self._source_for("device_width", values)),
            self._parameter("device_depth", merged["device_depth"], source=self._source_for("device_depth", values)),
            self._parameter("corner_radius", merged["corner_radius"], source=self._source_for("corner_radius", values, default_source=ParameterSource.DESIGN_DERIVED)),
            self._parameter("stand_height", merged["stand_height"], source=self._source_for("stand_height", values, default_source=ParameterSource.DESIGN_DERIVED)),
            self._parameter("lip_height", merged["lip_height"], source=self._source_for("lip_height", values, default_source=ParameterSource.DESIGN_DERIVED)),
            self._parameter("wall_thickness", merged["wall_thickness"], source=self._source_for("wall_thickness", values, default_source=ParameterSource.DESIGN_DERIVED)),
            self._parameter("base_flare", merged["base_flare"], source=ParameterSource.DESIGN_DERIVED, editable=True),
            self._parameter("arch_radius", merged["arch_radius"], source=ParameterSource.DESIGN_DERIVED, editable=True),
            self._parameter("arch_peak", merged["arch_peak"], source=ParameterSource.DESIGN_DERIVED, editable=True),
        ]
        return params, user_params, [], ["base_flare", "arch_radius", "arch_peak"]

    def _enclosure_schema(
        self,
        values: dict[str, float],
        defaults: dict[str, float],
    ) -> tuple[list[ParameterDefinition], list[str], list[str], list[str]]:
        merged = {**defaults, **values}
        outer_width = merged["outer_width"]
        outer_depth = merged["outer_depth"]
        outer_height = merged["outer_height"]
        wall_thickness = merged["wall_thickness"]
        clearance = merged["clearance"]
        lid_overlap = merged["lid_overlap"]
        standoff_height = merged["standoff_height"]
        boss_diameter = merged["boss_diameter"]
        vent_spacing = merged["vent_spacing"]

        inner_width = round(max(outer_width - 2 * (wall_thickness + clearance), 0.0), 3)
        inner_depth = round(max(outer_depth - 2 * (wall_thickness + clearance), 0.0), 3)
        inner_height = round(max(outer_height - wall_thickness - clearance, 0.0), 3)

        params = [
            self._parameter("outer_width", outer_width, source=self._source_for("outer_width", values)),
            self._parameter("outer_depth", outer_depth, source=self._source_for("outer_depth", values)),
            self._parameter("outer_height", outer_height, source=self._source_for("outer_height", values)),
            self._parameter("wall_thickness", wall_thickness, source=self._source_for("wall_thickness", values)),
            self._parameter("corner_radius", merged["corner_radius"], source=self._source_for("corner_radius", values, default_source=ParameterSource.DESIGN_DERIVED)),
            self._parameter("clearance", clearance, source=self._source_for("clearance", values, default_source=ParameterSource.DESIGN_DERIVED)),
            self._parameter("lid_overlap", lid_overlap, source=ParameterSource.DESIGN_DERIVED, editable=True),
            self._parameter("standoff_height", standoff_height, source=ParameterSource.DESIGN_DERIVED, editable=True),
            self._parameter("boss_diameter", boss_diameter, source=ParameterSource.DESIGN_DERIVED, editable=True),
            self._parameter("vent_spacing", vent_spacing, source=ParameterSource.DESIGN_DERIVED, editable=True),
            self._parameter("inner_width", inner_width, editable=False, source=ParameterSource.DESIGN_DERIVED, derived_from=["outer_width", "wall_thickness", "clearance"]),
            self._parameter("inner_depth", inner_depth, editable=False, source=ParameterSource.DESIGN_DERIVED, derived_from=["outer_depth", "wall_thickness", "clearance"]),
            self._parameter("inner_height", inner_height, editable=False, source=ParameterSource.DESIGN_DERIVED, derived_from=["outer_height", "wall_thickness", "clearance"]),
        ]
        return params, list(values.keys()), [], ["lid_overlap", "standoff_height", "boss_diameter", "vent_spacing", "inner_width", "inner_depth", "inner_height"]

    def _fallback_schema(self, defaults: dict[str, float]) -> tuple[list[ParameterDefinition], list[str], list[str], list[str]]:
        params = [self._parameter(key, value, source=ParameterSource.DESIGN_DERIVED) for key, value in defaults.items()]
        return params, [], [], list(defaults.keys())

    def _phone_case_schema(
        self,
        values: dict[str, float],
        defaults: dict[str, float],
    ) -> tuple[list[ParameterDefinition], list[str], list[str], list[str]]:
        merged = {**defaults, **values}
        params = [
            self._parameter("body_length", merged["body_length"], source=self._source_for("body_length", values, default_source=ParameterSource.RESEARCH)),
            self._parameter("body_width", merged["body_width"], source=self._source_for("body_width", values, default_source=ParameterSource.RESEARCH)),
            self._parameter("body_depth", merged["body_depth"], source=self._source_for("body_depth", values, default_source=ParameterSource.RESEARCH)),
            self._parameter("wall_thickness", merged["wall_thickness"], source=self._source_for("wall_thickness", values, default_source=ParameterSource.DESIGN_DERIVED)),
            self._parameter("side_clearance", merged["side_clearance"], source=ParameterSource.DESIGN_DERIVED, editable=True),
            self._parameter("camera_clearance", merged["camera_clearance"], source=ParameterSource.DESIGN_DERIVED, editable=True),
            self._parameter("lip_height", merged["lip_height"], source=ParameterSource.DESIGN_DERIVED, editable=True),
            self._parameter("bottom_opening_depth", merged["bottom_opening_depth"], source=ParameterSource.DESIGN_DERIVED, editable=True),
            self._parameter("corner_bumper_thickness", merged["corner_bumper_thickness"], source=ParameterSource.DESIGN_DERIVED, editable=True),
        ]
        return params, list(values.keys()), ["body_length", "body_width", "body_depth"], [
            "side_clearance",
            "camera_clearance",
            "lip_height",
            "bottom_opening_depth",
            "corner_bumper_thickness",
        ]

    def _parameter(
        self,
        key: str,
        value: float | int,
        kind: ParameterKind = ParameterKind.NUMBER,
        *,
        unit: str | None = None,
        source: ParameterSource = ParameterSource.DESIGN_DERIVED,
        editable: bool = True,
        derived_from: list[str] | None = None,
    ) -> ParameterDefinition:
        return ParameterDefinition(
            key=key,
            label=label_for_key(key),
            kind=kind,
            unit=unit or unit_for_key(key),
            value=value,
            min=self._range_for(key, value)[0],
            max=self._range_for(key, value)[1],
            step=self._range_for(key, value)[2],
            source=source,
            editable=editable,
            description=self._description_for(key),
            group=self._group_for(key),
            derived_from=derived_from or [],
        )

    def _range_for(self, key: str, value: float | int) -> tuple[float, float, float]:
        if "teeth" in key:
            return max(3, int(value * 0.5)), max(8, int(value * 1.5)), 1
        if any(token in key for token in ("angle",)):
            return 0, 60, 0.1
        if any(token in key for token in ("clearance", "thickness", "radius", "height", "width", "depth", "diameter", "peak", "flare", "overlap")):
            magnitude = max(float(value), 1.0)
            return round(max(0.0, magnitude * 0.4), 3), round(magnitude * 1.8 + 10, 3), 0.1 if magnitude < 20 else 1.0
        return 0.0, max(float(value) * 2.0, 10.0), 0.1

    def _description_for(self, key: str) -> str:
        descriptions = {
            "teeth": "Tooth count that defines the gear circumference.",
            "outer_diameter": "Tip diameter of the gear.",
            "inner_diameter": "Center bore or hub opening diameter.",
            "pressure_angle": "Working angle for tooth geometry.",
            "device_width": "Reference width of the supported device.",
            "device_depth": "Reference depth of the supported device.",
            "corner_radius": "Outer rounding used to soften the part envelope.",
            "stand_height": "Vertical separation between base and support path.",
            "lip_height": "Retention height that keeps the device from slipping.",
            "wall_thickness": "Printable structural wall thickness.",
            "base_flare": "Outward spread at the base for stability.",
            "arch_radius": "Radius of the supporting underside arch.",
            "arch_peak": "Peak height of the underside arch.",
            "outer_width": "Outer shell width.",
            "outer_depth": "Outer shell depth.",
            "outer_height": "Outer shell height.",
            "clearance": "Safety clearance around internal components.",
            "lid_overlap": "Overlap depth where the lid engages the shell.",
            "standoff_height": "Height of internal mounting standoffs.",
            "boss_diameter": "Diameter of mounting bosses.",
            "vent_spacing": "Spacing between ventilation features.",
        }
        return descriptions.get(key, "Generated control parameter.")

    def _group_for(self, key: str) -> str:
        if key in {"teeth", "outer_diameter", "inner_diameter", "pressure_angle", "module", "pitch_diameter", "root_diameter", "addendum", "dedendum"}:
            return "gear"
        if key in {"device_width", "device_depth", "corner_radius", "stand_height", "lip_height", "wall_thickness", "base_flare", "arch_radius", "arch_peak"}:
            return "stand"
        if key in {"outer_width", "outer_depth", "outer_height", "wall_thickness", "corner_radius", "clearance", "lid_overlap", "standoff_height", "boss_diameter", "vent_spacing", "inner_width", "inner_depth", "inner_height"}:
            return "enclosure"
        return "general"

    def _source_for(
        self,
        key: str,
        values: dict[str, float],
        *,
        default_source: ParameterSource = ParameterSource.USER,
    ) -> ParameterSource:
        return ParameterSource.USER if key in values else default_source
