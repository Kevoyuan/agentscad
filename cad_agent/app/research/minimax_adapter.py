"""MiniMax web search adapter using the Token Plan API directly."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

import httpx

from cad_agent.config import get_settings
from cad_agent.app.llm.pipeline_utils import normalize_entity_text, normalize_known_object_name


@dataclass(frozen=True)
class WebResearchResult:
    """Structured result returned by a live web research adapter."""

    entity_name: str
    source_urls: list[str]
    dimensions_mm: dict[str, float] = field(default_factory=dict)
    feature_map: dict[str, Any] = field(default_factory=dict)
    reference_facts: list[str] = field(default_factory=list)


class MiniMaxWebSearchAdapter:
    """Call MiniMax Token Plan web_search API for product dimensions.

    This replaces the hardcoded AppleWebResearchAdapter with a general-purpose
    search that works for any device, not just Apple hardware.
    """

    SEARCH_ENDPOINT = "https://api.minimaxi.com/v1/coding_plan/search"

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
        dimensions = self._extract_dimensions(snippets, request)
        feature_map = self._extract_feature_map(snippets, request)
        entity_name = self._extract_entity_name(request, organic)
        source_urls = [r.get("link", "") for r in organic if r.get("link")]
        reference_facts = [f"Live dimensions from web search for: {query}"]
        if feature_map:
            reference_facts.append("Live feature-map hints were extracted from current product references.")

        return WebResearchResult(
            entity_name=entity_name,
            dimensions_mm=dimensions,
            feature_map=feature_map,
            source_urls=source_urls,
            reference_facts=reference_facts,
        )

    def _build_search_query(self, request: str) -> str:
        """Extract a search-friendly query from the natural language request."""
        text = normalize_entity_text(request)
        # Normalize known product naming and prefer entity-led queries over raw request text.
        text = re.sub(r"iphone\s*(\d+)\s*(pro\s*max|pro|plus|mini|e|air)?", r"iphone \1 \2", text)
        text = re.sub(r"\s+", " ", text).strip()
        normalized_entity = self._extract_entity_name(request, [])
        request_lower = normalize_entity_text(request)
        if self._is_phone_request(request_lower):
            return f"{normalized_entity} dimensions camera bump button layout port layout".strip()
        if self._is_device_support_request(request_lower):
            return f"{normalized_entity} dimensions width depth height ports vent layout".strip()
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
        text = normalize_entity_text(request)
        known = normalize_known_object_name(request)
        if known not in {request[:48], request[:64], "Unknown Part"}:
            return known
        mac_match = re.search(r"mac\s*studio\s*(m\d+)?", text, re.IGNORECASE)
        if mac_match:
            suffix = f" {mac_match.group(1).upper()}" if mac_match.group(1) else ""
            return f"Mac Studio{suffix}".strip()
        mac_mini_match = re.search(r"mac\s*mini\s*(m\d+)?", text, re.IGNORECASE)
        if mac_mini_match:
            suffix = f" {mac_mini_match.group(1).upper()}" if mac_mini_match.group(1) else ""
            return f"Mac mini{suffix}".strip()
        macbook_match = re.search(r"macbook\s*(?:pro|air)?\s*\d*", text, re.IGNORECASE)
        if macbook_match:
            return macbook_match.group(0).replace("  ", " ").title().strip()
        samsung_match = re.search(r"(samsung|galaxy)\s*[a-z]*\s*\d+\s*(?:ultra|plus|pro)?", text, re.IGNORECASE)
        if samsung_match:
            return samsung_match.group(0).replace("  ", " ").title().strip()
        pixel_match = re.search(r"pixel\s*\d+\s*(?:pro|xl|fold|a)?", text, re.IGNORECASE)
        if pixel_match:
            return pixel_match.group(0).replace("  ", " ").title().strip()
        match = re.search(r"iphone\s*\d+\s*(?:pro\s*max|pro|plus|mini|e|air)?", text, re.IGNORECASE)
        if match:
            return match.group(0).title()
        return request[:48] or "Unknown Device"

    def _extract_dimensions(self, text: str, request: str) -> dict[str, float]:
        """Extract device dimensions (mm) from combined search snippet text."""
        text_lower = text.lower()
        request_lower = normalize_entity_text(request)
        dimensions: dict[str, float] = {}

        width = self._measure_to_mm(self._find_measurement(text_lower, "width"))
        height = self._measure_to_mm(self._find_measurement(text_lower, "height"))
        depth = self._measure_to_mm(self._find_measurement(text_lower, "depth"))

        if self._is_device_support_request(request_lower):
            if width is not None:
                dimensions["device_width"] = width
            if depth is not None:
                dimensions["device_depth"] = depth
            if height is not None:
                dimensions["device_height"] = height
            return dimensions

        if width is not None:
            dimensions["body_width"] = width
        if height is not None:
            dimensions["body_length"] = height
        if depth is not None:
            dimensions["body_depth"] = depth

        if dimensions:
            return dimensions

        multi_match = re.search(
            r"(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*(mm|cm)",
            text_lower,
            re.IGNORECASE,
        )
        if not multi_match:
            return dimensions

        a = self._convert_unit_to_mm(float(multi_match.group(1)), multi_match.group(4))
        b = self._convert_unit_to_mm(float(multi_match.group(2)), multi_match.group(4))
        c = self._convert_unit_to_mm(float(multi_match.group(3)), multi_match.group(4))

        if self._is_device_support_request(request_lower):
            return {
                "device_width": a,
                "device_depth": b,
                "device_height": c,
            }

        return {
            "body_width": a,
            "body_length": b,
            "body_depth": c,
        }

    def _find_measurement(self, text: str, keyword: str) -> tuple[float, str] | None:
        match = re.search(
            rf"{keyword}[^\d]*(\d+(?:\.\d+)?)\s*(mm|cm)",
            text,
            re.IGNORECASE,
        )
        if not match:
            return None
        return float(match.group(1)), match.group(2)

    def _measure_to_mm(self, measurement: tuple[float, str] | None) -> float | None:
        if measurement is None:
            return None
        value, unit = measurement
        return self._convert_unit_to_mm(value, unit)

    def _convert_unit_to_mm(self, value: float, unit: str) -> float:
        return round(value * 10.0, 4) if unit.lower() == "cm" else round(value, 4)

    def _extract_feature_map(self, text: str, request: str) -> dict[str, Any]:
        """Extract coarse device feature hints from snippets."""
        text_lower = text.lower()
        request_lower = normalize_entity_text(request)
        feature_map: dict[str, Any] = {}

        if self._is_phone_request(request_lower):
            camera_match = re.search(
                r"camera(?:\s*bump|\s*island|\s*module)?[^\d]*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|cm)",
                text_lower,
                re.IGNORECASE,
            )
            if camera_match:
                feature_map["camera_region"] = {
                    "bbox_mm": {
                        "width": self._convert_unit_to_mm(float(camera_match.group(1)), camera_match.group(3)),
                        "height": self._convert_unit_to_mm(float(camera_match.group(2)), camera_match.group(3)),
                    }
                }
            controls: list[str] = []
            if "power" in text_lower:
                controls.append("power")
            if "volume" in text_lower:
                controls.append("volume")
            if controls:
                side = "right" if "right side" in text_lower else "left" if "left side" in text_lower else "unknown"
                feature_map["button_zones"] = [{"side": side, "controls": controls}]
            if "usb-c" in text_lower or "usb c" in text_lower:
                feature_map["port_zone"] = {"type": "usb-c"}
            elif "lightning" in text_lower:
                feature_map["port_zone"] = {"type": "lightning"}

        if any(token in request_lower for token in ("macbook", "laptop", "notebook")):
            if "hinge" in text_lower:
                feature_map["hinge_side"] = "rear"
            if "vent" in text_lower or "cooling" in text_lower or "fan" in text_lower:
                feature_map["vent_zones"] = [{"side": "rear"}]
            if "feet" in text_lower or "foot" in text_lower:
                feature_map["foot_pad_zones"] = [{"present": True}]

        return feature_map

    def _is_phone_request(self, request_lower: str) -> bool:
        return any(token in request_lower for token in ("iphone", "samsung", "galaxy", "pixel", "手机"))

    def _is_device_support_request(self, request_lower: str) -> bool:
        return any(
            token in request_lower
            for token in (
                "mac mini",
                "mac studio",
                "macbook",
                "laptop",
                "notebook",
                "computer",
                "mini pc",
                "桌面电脑",
                "电脑",
            )
        )
