"""Single-pass LLM CAD generation for parameterized OpenSCAD output."""

from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any

from cad_agent.app.llm.provider import AnthropicCompatibleLLMClient
from cad_agent.app.models.design_job import DesignJob, ParameterDefinition, ParameterSchema


class LLMScadGenerator:
    """Generate OpenSCAD and parameter metadata in a single LLM call."""

    def __init__(self, client: AnthropicCompatibleLLMClient) -> None:
        self._client = client

    async def generate_design(
        self,
        job: DesignJob,
        *,
        repair_notes: list[str] | None = None,
    ) -> tuple[str, ParameterSchema, str]:
        """Return SCAD source, parameter schema, and a short summary."""
        response = await self._client.generate(
            messages=[
                {
                    "role": "user",
                    "content": self._build_content_blocks(job, repair_notes=repair_notes),
                }
            ],
            system=self._system_prompt(),
            max_tokens=6000,
            temperature=0.15,
        )
        payload = self._extract_json_payload(response)
        scad_source = self._normalize_scad_source(str(payload.get("scad_source") or ""))
        if not scad_source:
            raise ValueError("LLM response did not contain scad_source")
        parameter_schema = self._build_parameter_schema(
            job,
            payload.get("parameters"),
            scad_source,
            summary=str(payload.get("summary") or "Single-pass CAD generation"),
        )
        return scad_source, parameter_schema, str(payload.get("summary") or "")

    def _build_content_blocks(
        self,
        job: DesignJob,
        *,
        repair_notes: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        blocks: list[dict[str, Any]] = [
            {
                "type": "text",
                "text": self._build_request_text(job, repair_notes=repair_notes),
            }
        ]
        for image in job.reference_images:
            image_block = self._image_block(image.stored_path, image.media_type)
            if image_block is not None:
                blocks.append(image_block)
        return blocks

    def _build_request_text(self, job: DesignJob, *, repair_notes: list[str] | None = None) -> str:
        lines = [
            f"User request:\n{job.input_request}",
            "",
            "Output requirements:",
            "- Produce a realistic, printable OpenSCAD design.",
            "- Use a small editable parameter block at the top of the SCAD file.",
            "- Keep dimensions in millimeters.",
            "- Prefer robust, renderable geometry over clever but fragile constructions.",
            "- Use MCAD, BOSL, or BOSL2 only when they materially improve correctness.",
            "- Do not invent hidden assumptions; when uncertain, pick the most standard physical interpretation.",
        ]
        if repair_notes:
            lines.extend(["", "Repair requirements:"])
            lines.extend(f"- {note}" for note in repair_notes)
        if job.scad_source and repair_notes:
            lines.extend(["", "Previous OpenSCAD to repair:", job.scad_source])
        return "\n".join(lines)

    def _system_prompt(self) -> str:
        return (
            "You are a senior CAD engineer generating production-minded OpenSCAD. "
            "Return JSON only with keys summary, parameters, and scad_source. "
            "summary must be one short sentence. "
            "parameters must be an array of objects with keys key, label, kind, unit, value, min, max, step, group, description. "
            "Every parameter you return must also appear as a top-level scalar assignment at the top of scad_source. "
            "scad_source must be raw OpenSCAD with no markdown fences. "
            "Do not emit placeholder boxes for mechanical parts or fit-critical accessories. "
            "Write geometry that matches the request as faithfully as possible in one pass. "
            "When the request references a real-world device, prefer a standard manufacturable interpretation over overfitting uncertain details. "
            "If reference images are provided, use them directly as geometric cues. "
            "Keep the parameter count between 4 and 18. "
            "Use short end-of-line comments on top-level assignments, including [group: ...] tags."
        )

    def _extract_json_payload(self, response: dict[str, Any]) -> dict[str, Any]:
        text = self._extract_text(response)
        if not text:
            raise ValueError("LLM response did not contain text content")
        if text.startswith("```"):
            lines = text.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            text = "\n".join(lines).strip()
        return json.loads(text)

    def _extract_text(self, response: dict[str, Any]) -> str:
        content = response.get("content", [])
        text_blocks = [
            block.get("text", "")
            for block in content
            if isinstance(block, dict) and block.get("type") == "text"
        ]
        return "\n".join(part for part in text_blocks if part).strip()

    def _build_parameter_schema(
        self,
        job: DesignJob,
        raw_parameters: Any,
        scad_source: str,
        *,
        summary: str,
    ) -> ParameterSchema:
        if not isinstance(raw_parameters, list):
            raise ValueError("LLM response did not contain a parameters array")

        parameters: list[ParameterDefinition] = []
        for item in raw_parameters:
            if not isinstance(item, dict):
                continue
            key = str(item.get("key") or "").strip()
            if not key:
                continue
            parameters.append(
                ParameterDefinition(
                    key=key,
                    label=str(item.get("label") or key.replace("_", " ").title()),
                    kind=str(item.get("kind") or "number"),
                    unit=str(item.get("unit") or ""),
                    value=item.get("value"),
                    min=self._coerce_optional_float(item.get("min")),
                    max=self._coerce_optional_float(item.get("max")),
                    step=self._coerce_optional_float(item.get("step")),
                    source="llm_declared",
                    editable=True,
                    description=str(item.get("description") or ""),
                    group=str(item.get("group") or "general"),
                )
            )

        if not parameters:
            raise ValueError("LLM response contained no valid parameters")

        declared_keys = {parameter.key for parameter in parameters}
        top_block_keys = self._top_level_assignment_keys(scad_source)
        if not declared_keys.issubset(top_block_keys):
            missing = sorted(declared_keys - top_block_keys)
            raise ValueError(f"Declared parameters missing from SCAD top-level assignments: {missing}")

        return ParameterSchema(
            request=job.input_request,
            part_family="",
            schema_version="direct-llm-v1",
            design_summary=summary,
            parameters=parameters,
            user_parameters=[],
            inferred_parameters=[parameter.key for parameter in parameters],
            design_derived_parameters=[],
            notes=[
                "This schema comes directly from the single-pass CAD generator.",
                "Render and validation act as harness layers outside the design reasoning loop.",
            ],
        )

    def _normalize_scad_source(self, scad_source: str) -> str:
        return scad_source.strip()

    def _top_level_assignment_keys(self, scad_source: str) -> set[str]:
        keys: set[str] = set()
        for raw_line in scad_source.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            if line.startswith("module ") or line.startswith("function "):
                break
            if "=" not in line or not line.endswith(";") and ";" not in line:
                continue
            key = line.split("=", 1)[0].strip()
            if key.replace("_", "").isalnum() and not key.startswith("//"):
                keys.add(key)
        return keys

    def _image_block(self, stored_path: str, media_type: str) -> dict[str, Any] | None:
        path = Path(stored_path)
        if not path.exists():
            return None
        data = base64.b64encode(path.read_bytes()).decode("utf-8")
        return {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": media_type,
                "data": data,
            },
        }

    def _coerce_optional_float(self, value: Any) -> float | None:
        try:
            if value is None or value == "":
                return None
            return float(value)
        except (TypeError, ValueError):
            return None
