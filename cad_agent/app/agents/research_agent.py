"""Research agent for design-context discovery."""

from __future__ import annotations

from cad_agent.app.llm.pipeline_models import PartFamily, ResearchResult
from cad_agent.app.llm.pipeline_utils import (
    build_search_queries,
    extract_numbers,
    infer_part_family,
    infer_missing_questions,
)


class ResearchAgent:
    """Collects reference context before design."""

    def __init__(self, llm_client: object | None = None) -> None:
        self._llm_client = llm_client

    async def research(
        self,
        request: str,
        part_family: PartFamily | str | None = None,
    ) -> ResearchResult:
        """Return a structured research payload for the request."""
        family = self._coerce_family(part_family) if part_family else infer_part_family(request)
        parsed = extract_numbers(request)
        object_name = self._object_name_for_family(family, request)
        search_queries = build_search_queries(request, family)
        open_questions = infer_missing_questions(family, parsed.values)

        reference_facts = self._reference_facts_for_family(family, request)
        research_summary = self._summary_for_family(family, object_name, reference_facts, parsed.values)
        needs_web_search = family in {PartFamily.DEVICE_STAND, PartFamily.ELECTRONICS_ENCLOSURE}

        return ResearchResult(
            request=request,
            part_family=family,
            object_name=object_name,
            research_summary=research_summary,
            reference_facts=reference_facts,
            search_queries=search_queries,
            open_questions=open_questions,
            source_notes=[
                "Deterministic first-pass research model",
                "External web search can be layered on later using the search_queries field",
            ],
            needs_web_search=needs_web_search,
            confidence=0.75 if family != PartFamily.UNKNOWN else 0.45,
        )

    def _coerce_family(self, part_family: PartFamily | str) -> PartFamily:
        if isinstance(part_family, PartFamily):
            return part_family
        try:
            return PartFamily(str(part_family))
        except ValueError:
            return PartFamily.UNKNOWN

    def _object_name_for_family(self, family: PartFamily, request: str) -> str:
        if family == PartFamily.SPUR_GEAR:
            return "Spur Gear"
        if family == PartFamily.DEVICE_STAND:
            if "mac mini" in request.lower():
                return "Mac mini Stand"
            return "Device Stand"
        if family == PartFamily.ELECTRONICS_ENCLOSURE:
            return "Electronics Enclosure"
        return "Unknown Part"

    def _reference_facts_for_family(self, family: PartFamily, request: str) -> list[str]:
        if family == PartFamily.SPUR_GEAR:
            return [
                "Spur gears are governed by tooth count, outer diameter, pitch geometry, and bore fit.",
                "A printable gear needs a stable root diameter and a sensible pressure angle.",
                "The center bore and optional hub should not weaken the tooth ring.",
            ]
        if family == PartFamily.DEVICE_STAND:
            facts = [
                "A stand should preserve airflow and cable access while keeping the device stable.",
                "The geometry should expose retention, support, and clear placement surfaces as parameters.",
                "The model should avoid unsupported spans and overly thin walls.",
            ]
            if "mac mini" in request.lower():
                facts.append("Mac mini-style stands usually want a compact footprint, accessible ports, and a clean front opening.")
            return facts
        if family == PartFamily.ELECTRONICS_ENCLOSURE:
            return [
                "An enclosure needs wall thickness, clearance, split-line strategy, and cutout planning.",
                "Mounting bosses, lid overlap, and port access often become separate controls.",
                "Printability and assembly strategy must be considered together.",
            ]
        return [
            "The request is not yet mapped to a supported parametric family.",
        ]

    def _summary_for_family(
        self,
        family: PartFamily,
        object_name: str,
        facts: list[str],
        values: dict[str, float],
    ) -> str:
        if family == PartFamily.SPUR_GEAR:
            if values:
                return "Treat the gear as a real mechanical component and derive tooth geometry from the requested dimensions."
            return "Treat the gear as a real mechanical component and derive tooth geometry from any explicit or default dimensions."
        if family == PartFamily.DEVICE_STAND:
            return f"Design a stable, printable stand concept for {object_name.lower()} with editable support geometry and airflow-aware clearances."
        if family == PartFamily.ELECTRONICS_ENCLOSURE:
            return "Design a printable enclosure with wall, clearance, and opening controls exposed as first-class parameters."
        return "Collect more context before committing to a parametric design family."
