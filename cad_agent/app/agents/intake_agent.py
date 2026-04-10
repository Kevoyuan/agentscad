"""Intake agent - natural language to structured spec."""

from __future__ import annotations

import re
import time
from typing import Any

import structlog

from cad_agent.app.llm.spec_parser import LLMSpecParser
from cad_agent.app.models.agent_result import AgentResult, AgentRole
from cad_agent.app.models.design_job import DesignJob, SpecResult, JobState

logger = structlog.get_logger()


class IntakeAgent:
    """Parses natural language CAD requests into structured specs."""

    def __init__(self, spec_parser: LLMSpecParser | None = None) -> None:
        self._spec_parser = spec_parser

    async def process(self, job: DesignJob) -> AgentResult:
        """Parse natural language input into structured spec.

        Args:
            job: DesignJob with input_request set

        Returns:
            AgentResult with SpecResult in data["spec"]
        """
        start_time = time.time()
        logger.info("intake_processing", job_id=job.id, request=job.input_request[:100])

        spec = await self._parse_with_fallback(job.input_request)

        job.spec = spec

        if spec.success:
            job.transition_to(JobState.SPEC_PARSED)
            result = AgentResult(
                success=True,
                agent=AgentRole.INTAKE,
                state_reached=JobState.SPEC_PARSED.value,
                data={"spec": spec.model_dump()},
            )
        else:
            result = AgentResult(
                success=False,
                agent=AgentRole.INTAKE,
                state_reached=JobState.SPEC_FAILED.value,
                error=spec.error_message,
            )

        result.duration_ms = int((time.time() - start_time) * 1000)
        return result

    async def _parse_with_fallback(self, request: str) -> SpecResult:
        """Try the configured LLM parser first, then fall back to regex parsing."""
        if self._spec_parser is not None:
            try:
                llm_spec = await self._spec_parser.parse(request)
                if llm_spec.success:
                    return llm_spec
            except Exception as exc:  # pragma: no cover - fallback path is behaviorally tested
                logger.warning("llm_spec_parse_failed", error=str(exc))

        return self._parse_request(request)

    def _parse_request(self, request: str) -> SpecResult:
        """Parse natural language request into structured spec.

        Args:
            request: Natural language CAD request

        Returns:
            SpecResult with parsed values
        """
        request_lower = request.lower()

        geometric_type = self._extract_type(request_lower)
        dimensions = self._extract_dimensions(request)
        material = self._extract_material(request_lower)
        tolerance = self._extract_tolerance(request_lower)
        functional_reqs = self._extract_functional_requirements(request_lower)

        confidence = 0.7
        if geometric_type:
            confidence += 0.2
        if dimensions:
            confidence += 0.1

        return SpecResult(
            success=True,
            request_summary=request[:200],
            geometric_type=geometric_type or "box",
            dimensions=dimensions,
            material=material or "PLA",
            tolerance=tolerance or 0.1,
            surface_finish=self._extract_surface_finish(request_lower),
            functional_requirements=functional_reqs,
            cost_target=self._extract_cost(request_lower),
            quantity=self._extract_quantity(request),
            raw_request=request,
            confidence=min(confidence, 1.0),
        )

    def _extract_type(self, text: str) -> str:
        """Extract geometric type from request."""
        aliases = {
            "gear": ["gear", "spur gear", "齿轮"],
            "hook": ["hook", "挂钩"],
            "box": ["box", "盒", "箱"],
            "clip": ["clip", "夹", "卡扣"],
            "bracket": ["bracket", "支架"],
            "mount": ["mount", "安装座", "底座"],
            "holder": ["holder", "支撑", "托架"],
            "case": ["case", "外壳", "壳体"],
            "lampshade": ["lampshade", "lamp shade", "灯罩"],
        }
        for geometric_type, tokens in aliases.items():
            if any(token in text for token in tokens):
                return geometric_type
        return ""

    def _extract_dimensions(self, text: str) -> dict[str, float]:
        """Extract dimensions from request."""
        dims = {}
        text_lower = text.lower()

        frustum_match = re.search(
            r"直径\s*(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)\s*(cm|mm)",
            text,
            re.IGNORECASE,
        )
        if frustum_match:
            dims["bottom_diameter"] = self._to_mm(float(frustum_match.group(1)), frustum_match.group(3))
            dims["top_diameter"] = self._to_mm(float(frustum_match.group(2)), frustum_match.group(3))

        height_match = re.search(r"(?:高|height)\s*(\d+(?:\.\d+)?)\s*(cm|mm)", text, re.IGNORECASE)
        if height_match:
            dims["height"] = self._to_mm(float(height_match.group(1)), height_match.group(2))

        keyword_aliases = {
            "outer_diameter": ["outer diameter", "outside diameter", "od", "外径", "外"],
            "inner_diameter": ["inner diameter", "inside diameter", "id", "内径", "内"],
            "thickness": ["thickness", "厚度", "厚"],
            "length": ["length", "长"],
            "width": ["width", "宽"],
            "height": ["height", "高"],
            "depth": ["depth", "深"],
        }

        for key, aliases in keyword_aliases.items():
            if key in dims:
                continue
            for alias in aliases:
                match = re.search(
                    rf"{re.escape(alias)}\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(mm|millimeter|cm)?",
                    text,
                    re.IGNORECASE,
                )
                if match:
                    dims[key] = self._to_mm(float(match.group(1)), match.group(2))
                    break
                match = re.search(
                    rf"(\d+(?:\.\d+)?)\s*(mm|millimeter|cm)?\s*{re.escape(alias)}",
                    text,
                    re.IGNORECASE,
                )
                if match:
                    dims[key] = self._to_mm(float(match.group(1)), match.group(2))
                    break

        dim_keyword_pattern = r"(\d+(?:\.\d+)?)\s*(mm|millimeter|cm)\s*,?\s*(length|width|height|depth)"
        for match in re.finditer(dim_keyword_pattern, text, re.IGNORECASE):
            val = self._to_mm(float(match.group(1)), match.group(2))
            keyword = match.group(3).lower()
            if keyword == "length" and "length" not in dims:
                dims["length"] = val
            elif keyword == "width" and "width" not in dims:
                dims["width"] = val
            elif keyword == "height" and "height" not in dims:
                dims["height"] = val
            elif keyword == "depth" and "depth" not in dims:
                dims["depth"] = val

        width_x_height_pattern = r"(\d+(?:\.\d+)?)\s*(mm|millimeter|cm)\s*(?:x|by)\s*(\d+(?:\.\d+)?)\s*(mm|millimeter|cm)"
        match = re.search(width_x_height_pattern, text, re.IGNORECASE)
        if match:
            try:
                dims["width"] = self._to_mm(float(match.group(1)), match.group(2))
                dims["height"] = self._to_mm(float(match.group(3)), match.group(4))
            except (ValueError, IndexError):
                pass

        if "length" not in dims:
            match = re.search(r"length\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(mm|millimeter|cm)?", text, re.IGNORECASE)
            if match:
                try:
                    dims["length"] = self._to_mm(float(match.group(1)), match.group(2))
                except (ValueError, IndexError):
                    pass

        if "width" not in dims:
            match = re.search(r"width\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(mm|millimeter|cm)?", text, re.IGNORECASE)
            if match:
                try:
                    dims["width"] = self._to_mm(float(match.group(1)), match.group(2))
                except (ValueError, IndexError):
                    pass

        if "height" not in dims:
            match = re.search(r"height\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(mm|millimeter|cm)?", text, re.IGNORECASE)
            if match:
                try:
                    dims["height"] = self._to_mm(float(match.group(1)), match.group(2))
                except (ValueError, IndexError):
                    pass

        if "depth" not in dims:
            match = re.search(r"depth\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(mm|millimeter|cm)?", text, re.IGNORECASE)
            if match:
                try:
                    dims["depth"] = self._to_mm(float(match.group(1)), match.group(2))
                except (ValueError, IndexError):
                    pass

        if "wall_thickness" not in dims:
            match = re.search(r"wall\s*(?:thickness)?\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(mm|millimeter|cm)?", text, re.IGNORECASE)
            if match:
                try:
                    dims["wall_thickness"] = self._to_mm(float(match.group(1)), match.group(2))
                except (ValueError, IndexError):
                    pass

        if "length" not in dims and "gear" not in text_lower and "齿轮" not in text:
            match = re.search(r"(\d+(?:\.\d+)?)\s*(mm|millimeter|cm)", text, re.IGNORECASE)
            if match:
                try:
                    dims["length"] = self._to_mm(float(match.group(1)), match.group(2))
                except (ValueError, IndexError):
                    pass

        if "width" not in dims and "length" in dims:
            dims["width"] = dims.get("length", 20.0)

        if "height" not in dims and "thickness" in dims:
            dims["height"] = dims["thickness"]

        if "height" not in dims and "gear" not in text_lower and "齿轮" not in text:
            dims["height"] = dims.get("length", 20.0)

        return dims

    def _to_mm(self, value: float, unit: str | None) -> float:
        """Convert a parsed dimension into mm."""
        if unit and unit.lower() == "cm":
            return round(value * 10.0, 4)
        return round(value, 4)

    def _extract_material(self, text: str) -> str:
        """Extract material from request."""
        materials = ["PLA", "PETG", "ABS", "TPU", "nylon", "resin", "wood", "metal"]
        for m in materials:
            if m.lower() in text:
                return m.upper() if len(m) <= 4 else m.capitalize()
        return "PLA"

    def _extract_tolerance(self, text: str) -> float:
        """Extract tolerance value."""
        match = re.search(r"tolerance\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(?:mm|millimeter)?", text)
        if match:
            return float(match.group(1))
        return 0.1

    def _extract_surface_finish(self, text: str) -> str:
        """Extract surface finish requirement."""
        finishes = ["smooth", "rough", "matte", "glossy", "textured"]
        for f in finishes:
            if f in text:
                return f
        return "smooth"

    def _extract_functional_requirements(self, text: str) -> list[str]:
        """Extract functional requirements."""
        reqs = []
        keywords = ["threaded", "snap-fit", "press-fit", "hinge", "cable management", "mountable", "stackable"]
        for kw in keywords:
            if kw in text:
                reqs.append(kw)
        return reqs

    def _extract_cost(self, text: str) -> float | None:
        """Extract cost target if mentioned."""
        match = re.search(r"\$?\s*(\d+(?:\.\d+)?)\s*(?:dollars?|usd|\$)?", text)
        if match:
            return float(match.group(1))
        return None

    def _extract_quantity(self, text: str) -> int:
        """Extract quantity if mentioned."""
        match = re.search(r"(\d+)\s*(?:units?|pcs?|pieces?|copies?)", text, re.IGNORECASE)
        if match:
            return int(match.group(1))
        return 1

    async def accept(self, job: DesignJob) -> AgentResult:
        """Accept validated design for delivery.

        Args:
            job: DesignJob in VALIDATED state

        Returns:
            AgentResult with acceptance decision
        """
        if not job.validation_results:
            return AgentResult(
                success=False,
                agent=AgentRole.INTAKE,
                state_reached=job.state.value,
                error="No validation results to accept",
            )

        critical_failures = [
            v for v in job.validation_results if v.is_critical
        ]

        if critical_failures:
            return AgentResult(
                success=False,
                agent=AgentRole.INTAKE,
                state_reached=JobState.VALIDATION_FAILED.value,
                error=f"Critical failures: {critical_failures[0].rule_id}",
            )

        job.transition_to(JobState.ACCEPTED)
        return AgentResult(
            success=True,
            agent=AgentRole.INTAKE,
            state_reached=JobState.ACCEPTED.value,
            data={"accepted": True},
        )
