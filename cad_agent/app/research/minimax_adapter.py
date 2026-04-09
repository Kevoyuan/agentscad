"""MiniMax web search adapter using the Token Plan API directly."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

import httpx

from cad_agent.config import get_settings


@dataclass(frozen=True)
class WebResearchResult:
    """Structured result returned by a live web research adapter."""

    entity_name: str
    source_urls: list[str]
    dimensions_mm: dict[str, float] = field(default_factory=dict)
    reference_facts: list[str] = field(default_factory=list)


class MiniMaxWebSearchAdapter:
    """Call MiniMax Token Plan web_search API for product dimensions.

    This replaces the hardcoded AppleWebResearchAdapter with a general-purpose
    search that works for any device, not just Apple hardware.
    """

    SEARCH_ENDPOINT = "https://api.minimaxi.com/v1/coding_plan/search"

    # Patterns to extract dimensions from search result snippets
    _DIM_PATTERNS = [
        # "149.03×71.44×8.75mm" or "149.03 x 71.44 x 8.75 mm"
        re.compile(r"(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*mm", re.IGNORECASE),
        # "Width 75.6 mm" / "Height 146.6 mm" / "Depth 8.25 mm"
        re.compile(r"width[^\d]*(\d+(?:\.\d+)?)\s*mm", re.IGNORECASE),
        re.compile(r"height[^\d]*(\d+(?:\.\d+)?)\s*mm", re.IGNORECASE),
        re.compile(r"depth[^\d]*(\d+(?:\.\d+)?)\s*mm", re.IGNORECASE),
        # Fallback: any standalone "NNNmm" number that looks like a device dimension
        re.compile(r"\b(\d{2,3}(?:\.\d+)?)\s*mm\b", re.IGNORECASE),
    ]

    def __init__(
        self,
        *,
        api_key: str | None = None,
        timeout_seconds: float = 10.0,
        user_agent: str = "CAD-Agent/0.1 (+https://example.com)",
    ) -> None:
        self._api_key = api_key
        self._timeout_seconds = timeout_seconds
        self._user_agent = user_agent

    def _get_api_key(self) -> str:
        if self._api_key:
            return self._api_key
        settings = get_settings()
        key = settings.minimax_api_key or settings.anthropic_api_key
        if not key:
            raise ValueError(
                "MiniMax API key not set: configure CAD_AGENT_MINIMAX_API_KEY "
                "or CAD_AGENT_ANTHROPIC_API_KEY"
            )
        return key

    async def research(self, request: str) -> WebResearchResult:
        """Run a web search via MiniMax Token Plan API to get product dimensions.

        Args:
            request: Natural language request (e.g. "帮我设计一个iphone 17pro的手机壳")

        Returns:
            WebResearchResult with entity name, dimensions, and source URLs
        """
        api_key = self._get_api_key()
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": self._user_agent,
        }

        # Extract search query from the request
        query = self._build_search_query(request)
        payload = {"q": query}

        async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
            response = await client.post(
                self.SEARCH_ENDPOINT,
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

        organic = data.get("organic", [])
        snippets = self._collect_snippets(organic)
        dimensions = self._extract_dimensions(snippets)
        entity_name = self._extract_entity_name(request, organic)
        source_urls = [r.get("link", "") for r in organic if r.get("link")]
        reference_facts = [f"Live dimensions from web search for: {query}"]

        return WebResearchResult(
            entity_name=entity_name,
            dimensions_mm=dimensions,
            source_urls=source_urls,
            reference_facts=reference_facts,
        )

    def _build_search_query(self, request: str) -> str:
        """Extract a search-friendly query from the natural language request."""
        text = request.lower()
        # Normalize iPhone naming
        text = re.sub(r"iphone\s*(\d+)\s*(pro\s*max|pro|plus|mini|e|air)?", r"iphone \1 \2", text)
        text = re.sub(r"\s+", " ", text).strip()
        # Remove common Chinese filler words
        text = re.sub(r"[帮我设计一个有个]", "", text)
        return text.strip()

    def _collect_snippets(self, organic: list[dict[str, Any]]) -> str:
        """Join all snippets into one text blob for dimension extraction."""
        parts = []
        for result in organic:
            snippet = result.get("snippet", "")
            title = result.get("title", "")
            if snippet:
                parts.append(snippet)
            if title:
                parts.append(title)
        return " ".join(parts)

    def _extract_entity_name(self, request: str, organic: list[dict[str, Any]]) -> str:
        """Try to get a clean product name from search results or request."""
        # Use the first result's title if available
        if organic and (title := organic[0].get("title")):
            # Strip trailing source name after "--" or "|"
            name = re.split(r"--|\|", title)[0].strip()
            return name[:64]
        # Fallback: clean up the request
        text = request.lower()
        match = re.search(r"iphone\s*\d+\s*(?:pro\s*max|pro|plus|mini|e|air)?", text, re.IGNORECASE)
        if match:
            return match.group(0).title()
        return request[:48] or "Unknown Device"

    def _extract_dimensions(self, text: str) -> dict[str, float]:
        """Extract device dimensions (mm) from combined search snippet text."""
        dimensions: dict[str, float] = {}

        # Try "W × D × H mm" pattern first (most reliable for devices)
        multi_match = re.search(
            r"(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*mm",
            text,
            re.IGNORECASE,
        )
        if multi_match:
            w, d, h = float(multi_match.group(1)), float(multi_match.group(2)), float(multi_match.group(3))
            # Determine which is width/depth/height based on magnitude
            if w >= h >= d or w >= d and d < 20:
                dimensions["body_width"] = w
                dimensions["body_depth"] = d
                dimensions["body_length"] = h
            elif h > w:
                dimensions["body_length"] = h
                dimensions["body_width"] = w
                dimensions["body_depth"] = d
            else:
                dimensions["body_width"] = w
                dimensions["body_length"] = h
                dimensions["body_depth"] = d
            return dimensions

        # Fallback: individual patterns
        width_match = re.search(r"width[^\d]*(\d+(?:\.\d+)?)\s*mm", text, re.IGNORECASE)
        height_match = re.search(r"height[^\d]*(\d+(?:\.\d+)?)\s*mm", text, re.IGNORECASE)
        depth_match = re.search(r"depth[^\d]*(\d+(?:\.\d+)?)\s*mm", text, re.IGNORECASE)

        if width_match:
            dimensions["body_width"] = float(width_match.group(1))
        if height_match:
            dimensions["body_length"] = float(height_match.group(1))
        if depth_match:
            dimensions["body_depth"] = float(depth_match.group(1))

        return dimensions
