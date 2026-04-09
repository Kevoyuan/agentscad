"""Research agent for design-context discovery."""

from __future__ import annotations

from typing import Any

from cad_agent.app.llm.pipeline_models import PartFamily, ResearchResult
from cad_agent.app.llm.pipeline_utils import (
    build_search_queries,
    extract_numbers,
    family_default_values,
    infer_part_family,
    infer_missing_questions,
    has_resolved_part_family,
    normalize_known_object_name,
)
from cad_agent.app.research.web_adapter import WebResearchResult


class ResearchAgent:
    """Collects reference context before design."""

    def __init__(
        self,
        llm_client: object | None = None,
        web_research_adapter: Any | None = None,
    ) -> None:
        self._llm_client = llm_client
        self._web_research_adapter = web_research_adapter

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
        needs_web_search = family in {
            PartFamily.DEVICE_STAND,
            PartFamily.ELECTRONICS_ENCLOSURE,
            PartFamily.PHONE_CASE,
        }
        reference_dimensions: dict[str, float] = {}
        source_urls: list[str] = []
        web_research_used = False

        source_notes = ["Deterministic first-pass research model"]
        if needs_web_search:
            source_notes.append("Always-on web research should enrich the object dimensions and physical feature map.")
        else:
            source_notes.append("External web search can be layered on later using the search_queries field")

        if needs_web_search and self._web_research_adapter is not None:
            live_result = await self._run_live_web_research(request)
            if live_result is not None:
                object_name = self._object_name_from_live_result(family, live_result)
                reference_dimensions = dict(live_result.dimensions_mm)
                source_urls = list(live_result.source_urls)
                reference_facts = [*reference_facts, *live_result.reference_facts]
                web_research_used = True
                research_summary = self._summary_from_live_result(family, object_name, reference_dimensions)
                if source_urls:
                    source_notes.append("Live web research succeeded and populated structured reference dimensions.")

        return ResearchResult(
            request=request,
            part_family=family,
            object_name=object_name,
            research_summary=research_summary,
            reference_facts=reference_facts,
            reference_dimensions=reference_dimensions,
            search_queries=search_queries,
            open_questions=open_questions,
            source_notes=source_notes,
            source_urls=source_urls,
            needs_web_search=needs_web_search,
            web_research_used=web_research_used,
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
        if family == PartFamily.PHONE_CASE:
            normalized = normalize_known_object_name(request)
            return f"{normalized} Case"
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
        if family == PartFamily.PHONE_CASE:
            return [
                "A fitted phone case needs body clearance, camera-island relief, and button or port access planning.",
                "Screen lip height, corner protection, and bottom opening depth should remain editable controls.",
                "Real-world device dimensions should be verified from current sources before final geometry is trusted.",
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
        if family == PartFamily.PHONE_CASE:
            return (
                f"Design a fitted phone case for {object_name.lower()} with shell thickness, reliefs, and protection controls "
                "that can be refined after always-on device research."
            )
        return "Collect more context before committing to a parametric design family."

    async def _run_live_web_research(self, request: str) -> WebResearchResult | None:
        """Run the configured live web research adapter and swallow unsupported requests."""
        try:
            result = await self._web_research_adapter.research(request)
        except Exception:
            return None
        if not result.dimensions_mm:
            return None
        return result

    def _object_name_from_live_result(self, family: PartFamily, live_result: WebResearchResult) -> str:
        """Map a live result into the research result object name."""
        if family == PartFamily.PHONE_CASE:
            return f"{live_result.entity_name} Case"
        return live_result.entity_name

    def _summary_from_live_result(
        self,
        family: PartFamily,
        object_name: str,
        reference_dimensions: dict[str, float],
    ) -> str:
        """Build a summary after live research succeeds."""
        if family == PartFamily.PHONE_CASE and reference_dimensions:
            defaults = family_default_values(family)
            merged = {**defaults, **reference_dimensions}
            return (
                f"Design a fitted phone case for {object_name.lower()} using live device dimensions "
                f"{merged.get('body_length')} x {merged.get('body_width')} x {merged.get('body_depth')} mm "
                "from current web research."
            )
        return f"Live web research enriched the design context for {object_name.lower()}."
