"""Design agent for inventing parametric CAD concepts."""

from __future__ import annotations

from cad_agent.app.llm.pipeline_models import (
    DesignResult,
    IntentResult,
    PartFamily,
    ResearchResult,
)


class DesignAgent:
    """Invent a design concept and its controllable geometry."""

    async def design(
        self,
        intent: IntentResult,
        research: ResearchResult | None = None,
    ) -> DesignResult:
        """Produce a design concept for the requested family."""
        family = intent.part_family
        summary, strategy, features, notes, inventions, constraints = self._family_design(family, intent, research)

        return DesignResult(
            request=intent.request,
            part_family=family,
            design_intent_summary=summary,
            design_strategy=strategy,
            structural_features=features,
            manufacturability_notes=notes,
            parameter_inventions=inventions,
            derived_constraints=constraints,
            confidence=0.9 if family != PartFamily.UNKNOWN else 0.45,
        )

    def _family_design(
        self,
        family: PartFamily,
        intent: IntentResult,
        research: ResearchResult | None,
    ) -> tuple[str, str, list[str], list[str], list[str], dict[str, object]]:
        if family == PartFamily.SPUR_GEAR:
            return (
                "Use a deterministic spur gear layout with a toothed ring, bore, and derived pitch geometry.",
                "Translate tooth count and diameter into gear math, then expose the relevant controls for later tuning.",
                [
                    "toothed rim",
                    "central bore",
                    "optional hub",
                    "consistent tooth spacing",
                ],
                [
                    "Keep the root diameter printable.",
                    "Avoid collapsing the bore into the tooth ring.",
                    "Default to a standard pressure angle unless the request overrides it.",
                ],
                ["module", "pitch_diameter", "root_diameter", "addendum", "dedendum"],
                {
                    "family": "gear",
                    "expected_motion": "rotational",
                    "geometry_class": "mechanical_gear",
                },
            )

        if family == PartFamily.DEVICE_STAND:
            device_name = research.object_name if research else "target device"
            object_model = getattr(research, "object_model", {}) if research else {}
            synthesis_kind = object_model.get("synthesis_kind")
            if synthesis_kind == "support_base":
                return (
                    f"Create a stable support base for {device_name.lower()} with a defined placement surface, bottom clearance, and accessible operating edges.",
                    "Use the object envelope to size a base footprint and top alignment pocket so the geometry follows the real device instead of a generic accessory archetype.",
                    [
                        "support base",
                        "alignment pocket",
                        "cable relief",
                        "vent clearance",
                        "softened perimeter",
                    ],
                    [
                        "Keep the supported object easy to place and remove.",
                        "Do not block thermal intake or exhaust zones.",
                        "Treat alignment, stability, and access cutouts as first-class controls instead of hard-coded contours.",
                    ],
                    ["pocket_clearance", "cable_relief_width", "edge_radius"],
                    {
                        "family": "object_support",
                        "geometry_class": "support_base",
                        "fit_strategy": "object_envelope_first",
                    },
                )
            return (
                f"Create a support concept for {device_name.lower()} that preserves stable placement, visible clearance, and access to important edges.",
                "Use object-facing support surfaces and editable relief geometry so the form can adapt to the real object instead of following a canned accessory shape.",
                [
                    "support surface",
                    "retention edge",
                    "stabilized footprint",
                    "access gap",
                    "softened edges",
                ],
                [
                    "Keep walls thick enough for FDM.",
                    "Do not obscure device ports or cooling flow.",
                    "Use derived geometry controls instead of hard-coded contours.",
                ],
                ["arch_radius", "arch_peak", "base_flare", "lip_height"],
                {
                    "family": "object_support",
                    "geometry_class": "device_accessory",
                    "fit_strategy": "clearance_and_access",
                },
            )

        if family == PartFamily.ELECTRONICS_ENCLOSURE:
            return (
                "Create a printable enclosure concept with shell thickness, lid engagement, and access cutout planning.",
                "Favor a split-shell or lid-overlap structure so the model can be adjusted without redesigning the entire outer form.",
                [
                    "outer shell",
                    "internal cavity",
                    "lid overlap",
                    "boss locations",
                    "vent cutouts",
                ],
                [
                    "Reserve clearance for internal components.",
                    "Maintain printable wall thickness and boss geometry.",
                    "Treat cutouts and lid strategy as first-class parameters.",
                ],
                ["clearance", "lid_overlap", "boss_diameter", "vent_spacing"],
                {
                    "family": "enclosure",
                    "geometry_class": "protective_shell",
                    "fit_strategy": "clearance_first",
                },
            )

        if family == PartFamily.PHONE_CASE:
            device_name = research.object_name if research else "phone"
            return (
                f"Create a fitted shell-style phone case for {device_name.lower()} with a protected perimeter, camera relief, and accessible openings.",
                "Use a shell-and-cavity strategy so the case can preserve fit while exposing protection and access controls.",
                [
                    "outer shell",
                    "inner cavity",
                    "screen lip",
                    "camera island relief",
                    "button and port cutouts",
                    "corner bumpers",
                ],
                [
                    "Preserve a manufacturable wall around the handset body.",
                    "Keep the camera island clear and leave enough front lip to protect the screen.",
                    "Prefer editable relief and opening controls over hard-coded cutouts.",
                ],
                ["camera_clearance", "lip_height", "bottom_opening_depth", "corner_bumper_thickness"],
                {
                    "family": "phone_case",
                    "geometry_class": "protective_shell",
                    "fit_strategy": "device_envelope_plus_clearance",
                },
            )

        return (
            "The request has not yet been assigned to a supported design family.",
            "Hold design until the intent is better resolved.",
            ["unknown geometry"],
            ["Need a clearer family before inventing parameters."],
            [],
            {"family": "unknown"},
        )
