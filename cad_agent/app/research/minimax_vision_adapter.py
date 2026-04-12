"""MiniMax MCP vision adapter for uploaded reference images."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path

from mcp import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client

from cad_agent.config import get_settings


@dataclass(frozen=True)
class ImageAnalysisResult:
    """Structured result returned by MiniMax image understanding."""

    image_source: str
    summary: str


class MiniMaxVisionAdapter:
    """Call MiniMax's official MCP server for reference-image understanding."""

    def __init__(
        self,
        *,
        command: str | None = None,
        package_name: str | None = None,
        api_key: str | None = None,
        api_host: str | None = None,
        timeout_seconds: float = 20.0,
    ) -> None:
        settings = get_settings()
        self._command = command or settings.minimax_mcp_command
        self._package_name = package_name or settings.minimax_mcp_package
        self._api_key = api_key or settings.minimax_api_key or settings.anthropic_api_key
        self._api_host = api_host or settings.minimax_api_host
        self._timeout = timedelta(seconds=timeout_seconds)

    async def analyze_images(
        self,
        request: str,
        image_sources: list[str],
    ) -> list[ImageAnalysisResult]:
        """Analyze one or more local image paths with MiniMax MCP vision."""
        if not self._api_key or not image_sources:
            return []

        results: list[ImageAnalysisResult] = []
        prompt = self._build_prompt(request)
        for image_source in image_sources:
            summary = await self._analyze_image(prompt, image_source)
            if summary:
                results.append(ImageAnalysisResult(image_source=image_source, summary=summary))
        return results

    async def _analyze_image(self, prompt: str, image_source: str) -> str:
        params = StdioServerParameters(
            command=self._command,
            args=[self._package_name, "-y"],
            env={
                "MINIMAX_API_KEY": self._api_key,
                "MINIMAX_API_HOST": self._api_host,
            },
        )

        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.call_tool(
                    "understand_image",
                    {
                        "prompt": prompt,
                        "image_source": str(Path(image_source).expanduser()),
                    },
                    read_timeout_seconds=self._timeout,
                )
        return self._extract_text(result)

    def _extract_text(self, result: object) -> str:
        content = getattr(result, "content", []) or []
        texts: list[str] = []
        for block in content:
            block_type = getattr(block, "type", None)
            block_text = getattr(block, "text", None)
            if block_type == "text" and block_text:
                texts.append(str(block_text).strip())
        return "\n".join(text for text in texts if text).strip()

    def _build_prompt(self, request: str) -> str:
        return (
            "You are helping a CAD agent understand a reference image for 3D modeling.\n"
            f"User request: {request}\n\n"
            "Describe the object's geometry in a compact, manufacturing-oriented way. "
            "Focus on: overall shape, support/contact surfaces, openings, pockets, lips, cable cutouts, "
            "rounded edges, symmetry, proportions, and any visible labels or dimensions. "
            "If something is uncertain, say that clearly instead of guessing."
        )
