"""Intent agent for classifying design requests."""

from __future__ import annotations

from cad_agent.app.llm.pipeline_models import IntentResult, PartFamily, ResearchResult
from cad_agent.app.llm.pipeline_utils import infer_part_family, infer_missing_questions


class IntentAgent:
    """Resolve the user's request into a design family and intent."""

    async def resolve(
        self,
        request: str,
        research: ResearchResult | None = None,
    ) -> IntentResult:
        """Build a normalized intent payload."""
        family = research.part_family if research else infer_part_family(request)
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
            return "Device Stand"
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
                "Generate a stable stand that supports the target device while exposing fit and support controls.",
                [
                    "Keep the contact patch stable and broad enough for FDM printing.",
                    "Maintain airflow and port access where possible.",
                    "Make the supporting arch and lip editable.",
                ],
                {
                    "part_class": "device_accessory",
                    "must_remain_printable": True,
                    "support_should_be_visible": True,
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

        return (
            "Classify the request before committing to geometry.",
            ["More context is needed to determine the right part family."],
            {"part_class": "unknown"},
            "classification_only",
        )

