"""LLM-backed OpenSCAD generation for complex geometry."""

from __future__ import annotations

import json
from typing import Any

from cad_agent.app.llm.geometry_dsl import GeometryDSLCompiler
from cad_agent.app.llm.provider import AnthropicCompatibleLLMClient
from cad_agent.app.models.design_job import DesignJob


class LLMScadGenerator:
    """Generate OpenSCAD source directly from a parsed CAD job."""

    def __init__(self, client: AnthropicCompatibleLLMClient) -> None:
        self._client = client
        self._dsl_compiler = GeometryDSLCompiler()

    async def generate(
        self,
        job: DesignJob,
        *,
        repair_notes: list[str] | None = None,
    ) -> str:
        """Generate OpenSCAD for the provided job."""
        if job.spec is None:
            raise ValueError("Cannot synthesize OpenSCAD without a parsed spec")

        repair_context = ""
        if repair_notes:
            repair_context = (
                "\nRepair requirements:\n"
                + "\n".join(f"- {note}" for note in repair_notes)
            )

        response = await self._client.generate(
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                f"Original request:\n{job.input_request}\n\n"
                                f"Geometric type: {job.spec.geometric_type}\n"
                                f"Dimensions (mm): {job.spec.dimensions}\n"
                                f"Material: {job.spec.material}\n"
                                f"Tolerance: {job.spec.tolerance}\n"
                                f"Functional requirements: {job.spec.functional_requirements}\n"
                                f"Constraints: {job.spec.constraints}"
                                f"{repair_context}"
                            ),
                        }
                    ],
                }
            ],
            system=(
                "You are a senior parametric CAD engineer who writes valid OpenSCAD. "
                "Return OpenSCAD source only, with no markdown fences. "
                "Think through the geometry before writing code. "
                "Use explicit parameter variables in millimeters and produce a printable solid. "
                "When the request is a mechanical component such as a gear, generate the actual geometry rather than a placeholder box. "
                "Do not use external libraries, use/import statements, or placeholders. "
                "If repair requirements are present, revise the geometry to satisfy them."
            ),
            max_tokens=2200,
            temperature=0.2,
        )
        return self._extract_scad_source(response)

    async def generate_geometry_dsl(
        self,
        job: DesignJob,
        *,
        repair_notes: list[str] | None = None,
    ) -> dict[str, Any]:
        """Generate a constrained geometry DSL payload for the provided job."""
        repair_context = ""
        if repair_notes:
            repair_context = (
                "\nRepair requirements:\n"
                + "\n".join(f"- {note}" for note in repair_notes)
            )

        response = await self._client.generate(
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                f"Original request:\n{job.input_request}\n\n"
                                f"Part family: {job.part_family}\n"
                                f"Research: {job.research_result.model_dump() if job.research_result else {}}\n"
                                f"Design: {job.design_result.model_dump() if job.design_result else {}}\n"
                                f"Parameters: {job.get_effective_parameter_values()}\n"
                                f"Parsed spec: {job.spec.model_dump() if job.spec else {}}"
                                f"{repair_context}"
                            ),
                        }
                    ],
                }
            ],
            system=(
                "You are a senior CAD planning system. "
                "Return JSON only, matching a constrained geometry DSL with keys family, units, operations, and metadata. "
                "Use only primitive operations that can be compiled into OpenSCAD shell geometry. "
                "Prefer shell/cavity/cutout style operations for phone cases and protective shells."
            ),
            max_tokens=1800,
            temperature=0.1,
        )
        return self._extract_json_payload(response)

    def compile_geometry_dsl(self, geometry_dsl: dict[str, Any]) -> str:
        """Compile a geometry DSL payload to OpenSCAD."""
        return self._dsl_compiler.compile(geometry_dsl)

    def _extract_scad_source(self, response: dict[str, Any]) -> str:
        """Extract plain OpenSCAD text from the model response."""
        scad = self._extract_text(response)
        if not scad:
            raise ValueError("LLM response did not contain OpenSCAD source")
        if scad.startswith("```"):
            lines = scad.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            scad = "\n".join(lines).strip()
        return scad

    def _extract_text(self, response: dict[str, Any]) -> str:
        """Extract joined text blocks from an Anthropic-compatible response."""
        content = response.get("content", [])
        text_blocks = [
            block.get("text", "")
            for block in content
            if isinstance(block, dict) and block.get("type") == "text"
        ]
        return "\n".join(part for part in text_blocks if part).strip()

    def _extract_json_payload(self, response: dict[str, Any]) -> dict[str, Any]:
        """Extract a JSON object from a model response."""
        text = self._extract_text(response)
        if not text:
            raise ValueError("LLM response did not contain a geometry DSL payload")
        if text.startswith("```"):
            lines = text.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            text = "\n".join(lines).strip()
        return json.loads(text)
