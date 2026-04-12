"""LLM-backed request parsing for CAD specs."""

from __future__ import annotations

import json
from typing import Any

from cad_agent.app.llm.provider import AnthropicCompatibleLLMClient
from cad_agent.app.models.design_job import SpecResult


class LLMSpecParser:
    """Parse CAD requests into structured specs via an LLM."""

    def __init__(self, client: AnthropicCompatibleLLMClient) -> None:
        self._client = client

    async def parse(self, request: str, extra_context: str | None = None) -> SpecResult:
        """Parse a natural language CAD request into a structured spec."""
        content_blocks: list[dict[str, str]] = [
            {
                "type": "text",
                "text": request,
            }
        ]
        if extra_context:
            content_blocks.append(
                {
                    "type": "text",
                    "text": f"Additional visual/reference context:\n{extra_context}",
                }
            )
        response = await self._client.generate(
            messages=[
                {
                    "role": "user",
                    "content": content_blocks,
                }
            ],
            system=(
                "You are a CAD specification parser. "
                "Extract a structured manufacturing-oriented spec from the user's request. "
                "Return JSON only with keys: "
                "request_summary, geometric_type, dimensions, material, tolerance, "
                "surface_finish, functional_requirements, constraints, cost_target, quantity, confidence. "
                "Dimensions must be a JSON object with numeric values in millimeters where possible. "
                "If the request refers to a real-world object, product page, or URL, preserve uncertainty instead of inventing dimensions. "
                "Prefer null, an empty dimensions object, or only clearly supported measurements over guessed values. "
                "Use generic geometric_type labels like support_accessory, protective_shell, enclosure, or mechanical_part when exact geometry is unresolved. "
                "Do not wrap the JSON in markdown fences."
            ),
            max_tokens=800,
            temperature=0.1,
        )

        payload = self._extract_json_payload(response)
        return SpecResult(
            success=True,
            request_summary=str(payload.get("request_summary") or request[:200]),
            geometric_type=str(payload.get("geometric_type") or "box"),
            dimensions=self._coerce_dimensions(payload.get("dimensions")),
            material=str(payload.get("material") or "PLA"),
            tolerance=self._coerce_float(payload.get("tolerance"), 0.1),
            surface_finish=str(payload.get("surface_finish") or "smooth"),
            functional_requirements=self._coerce_string_list(payload.get("functional_requirements")),
            constraints=self._coerce_constraints(payload.get("constraints")),
            cost_target=self._coerce_optional_float(payload.get("cost_target")),
            quantity=self._coerce_int(payload.get("quantity"), 1),
            raw_request=request,
            confidence=self._coerce_float(payload.get("confidence"), 0.75),
        )

    def _extract_json_payload(self, response: dict[str, Any]) -> dict[str, Any]:
        """Extract the first text block and parse it as JSON."""
        content = response.get("content", [])
        text_blocks = [
            block.get("text", "")
            for block in content
            if isinstance(block, dict) and block.get("type") == "text"
        ]
        text = "\n".join(part for part in text_blocks if part).strip()
        if not text:
            raise ValueError("LLM response did not contain a text payload")
        return json.loads(text)

    def _coerce_dimensions(self, value: Any) -> dict[str, float]:
        if not isinstance(value, dict):
            return {}
        result: dict[str, float] = {}
        for key, item in value.items():
            try:
                result[str(key)] = float(item)
            except (TypeError, ValueError):
                continue
        return result

    def _coerce_string_list(self, value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item) for item in value if item is not None]

    def _coerce_constraints(self, value: Any) -> dict[str, Any]:
        return value if isinstance(value, dict) else {}

    def _coerce_float(self, value: Any, default: float) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

    def _coerce_optional_float(self, value: Any) -> float | None:
        try:
            if value is None:
                return None
            return float(value)
        except (TypeError, ValueError):
            return None

    def _coerce_int(self, value: Any, default: int) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return default
