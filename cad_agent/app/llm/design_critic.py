"""LLM-backed semantic design review for complex CAD requests."""

from __future__ import annotations

import json
from typing import Any

from cad_agent.app.llm.provider import AnthropicCompatibleLLMClient
from cad_agent.app.models.design_job import DesignJob


class LLMDesignCritic:
    """Review whether generated SCAD matches the user's requested geometry."""

    def __init__(self, client: AnthropicCompatibleLLMClient) -> None:
        self._client = client

    async def review(self, job: DesignJob) -> dict[str, Any]:
        """Return a semantic review payload for the current design job."""
        if not job.spec:
            raise ValueError("Cannot review a design without a parsed spec")
        if not job.scad_source:
            raise ValueError("Cannot review a design without generated SCAD")

        response = await self._client.generate(
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": self._build_review_prompt(job),
                        }
                    ],
                }
            ],
            system=(
                "You are a strict CAD design reviewer. "
                "Decide whether the OpenSCAD source actually matches the intended mechanical part. "
                "Focus on semantic fit, not code style. "
                "Return JSON only with keys: passed, confidence, summary, issues, suggested_fixes. "
                "passed must be a boolean. issues and suggested_fixes must be arrays of short strings. "
                "Fail the review if the model is the wrong class of object even if it renders successfully."
            ),
            max_tokens=700,
            temperature=0.1,
        )
        return self._extract_json_payload(response)

    def _build_review_prompt(self, job: DesignJob) -> str:
        spec = job.spec
        return (
            f"Customer request:\n{job.input_request}\n\n"
            f"Parsed geometric type:\n{spec.geometric_type}\n\n"
            f"Parsed dimensions:\n{json.dumps(spec.dimensions, ensure_ascii=False, indent=2)}\n\n"
            f"Functional requirements:\n{json.dumps(spec.functional_requirements, ensure_ascii=False)}\n\n"
            "OpenSCAD source:\n"
            f"{job.scad_source}\n"
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
