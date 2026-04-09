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
            device_name = research.object_name if research else "device"
            return (
                f"Create a wrap-around stand concept for {device_name.lower()} with a lifted support path and visible clearance around the body.",
                "Use a support arch, flared base, and retention lip so the design can be tuned without changing its overall class.",
                [
                    "support arch",
                    "retention lip",
                    "flared base",
                    "airflow gap",
                    "softened edges",
                ],
                [
                    "Keep walls thick enough for FDM.",
                    "Do not obscure device ports or cooling flow.",
                    "Use derived geometry controls instead of hard-coded contours.",
                ],
                ["arch_radius", "arch_peak", "base_flare", "lip_height"],
                {
                    "family": "stand",
                    "geometry_class": "device_accessory",
                    "fit_strategy": "clearance_first",
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

        return (
            "The request has not yet been assigned to a supported design family.",
            "Hold design until the intent is better resolved.",
            ["unknown geometry"],
            ["Need a clearer family before inventing parameters."],
            [],
            {"family": "unknown"},
        )

