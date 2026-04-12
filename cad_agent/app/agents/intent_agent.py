"""Intent agent for classifying design requests."""

from __future__ import annotations

from cad_agent.app.llm.pipeline_models import IntentResult, PartFamily, ResearchResult
from cad_agent.app.llm.pipeline_utils import infer_part_family, infer_missing_questions, normalize_known_object_name


class IntentAgent:
    """Resolve the user's request into a design family and intent."""

    async def resolve(
        self,
        request: str,
        research: ResearchResult | None = None,
    ) -> IntentResult:
        """Build a normalized intent payload."""
        # Re-classify if the prior step left an "unknown" sentinel instead of a real family.
        if research and research.part_family not in (None, "", "unknown"):
            family = research.part_family
        else:
            family = infer_part_family(request)
        object_name = research.object_name if research and research.object_name else self._object_name_for_family(family, request)

        primary_goal, secondary_goals, constraints, design_mode = self._family_intent(family, request)
        missing_inputs = research.open_questions if research else infer_missing_questions(family, {})
        confidence = 0.9 if family != PartFamily.UNKNOWN else 0.4

        return IntentResult(
            request=request,
            part_family=family,
            object_name=object_name,
            design_mode=design_mode,
            primary_goal=primary_goal,
            secondary_goals=secondary_goals,
            constraints=constraints,
            missing_inputs=missing_inputs,
            confidence=confidence,
        )

    def _object_name_for_family(self, family: PartFamily, request: str) -> str:
        if family == PartFamily.SPUR_GEAR:
            return "Spur Gear"
        if family == PartFamily.DEVICE_STAND:
            normalized = normalize_known_object_name(request)
            return normalized if normalized and normalized != request[:48] else "Target Device"
        if family == PartFamily.ELECTRONICS_ENCLOSURE:
            return "Electronics Enclosure"
        return request[:48] or "Unknown Part"

    def _family_intent(
        self,
        family: PartFamily,
        request: str,
    ) -> tuple[str, list[str], dict[str, object], str]:
        if family == PartFamily.SPUR_GEAR:
            return (
                "Generate a printable spur gear with the requested envelope and bore.",
                [
                    "Keep gear tooth geometry mechanically coherent.",
                    "Preserve hub and bore compatibility.",
                    "Expose key dimensional controls for later tuning.",
                ],
                {
                    "part_class": "mechanical_power_transfer",
                    "must_remain_printable": True,
                    "prefer_standard_pressure_angle": True,
                },
                "mechanical_component",
            )

        if family == PartFamily.DEVICE_STAND:
            return (
                "Generate a stable support accessory for the target object while preserving fit, access, and cooling constraints.",
                [
                    "Keep the support footprint stable and printable.",
                    "Preserve ventilation, button access, and cable routing where relevant.",
                    "Expose support surfaces, clearances, and retention choices as editable controls.",
                ],
                {
                    "part_class": "device_accessory",
                    "must_remain_printable": True,
                    "object_first_reasoning": True,
                    "preserve_operational_access": True,
                },
                "accessory_design",
            )

        if family == PartFamily.ELECTRONICS_ENCLOSURE:
            return (
                "Generate a printable enclosure with shell thickness, clearance, and access features.",
                [
                    "Preserve an internal cavity with realistic clearance.",
                    "Expose lid overlap, venting, and port cutouts as separate controls.",
                    "Plan for assembly and serviceability.",
                ],
                {
                    "part_class": "protective_shell",
                    "must_remain_printable": True,
                    "assembly_required": True,
                },
                "enclosure_design",
            )

        if family == PartFamily.PHONE_CASE:
            return (
                "Generate a fitted phone case with a printable shell, controlled openings, and protective edge geometry.",
                [
                    "Preserve reliable fit around the handset body and camera island.",
                    "Expose shell thickness, screen lip, and opening controls for later tuning.",
                    "Keep the case printable without unsupported, razor-thin features.",
                ],
                {
                    "part_class": "protective_shell",
                    "must_remain_printable": True,
                    "requires_real_world_dimensions": True,
                },
                "phone_case_design",
            )

        return (
            "Classify the request before committing to geometry.",
            ["More context is needed to determine the right part family."],
            {"part_class": "unknown"},
            "classification_only",
        )
