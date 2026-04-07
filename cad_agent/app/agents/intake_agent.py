"""Intake agent - natural language to structured spec."""

import re
import time
from typing import Any

import structlog

from cad_agent.app.models.agent_result import AgentResult, AgentRole
from cad_agent.app.models.design_job import DesignJob, SpecResult, JobState

logger = structlog.get_logger()


class IntakeAgent:
    """Parses natural language CAD requests into structured specs."""

    async def process(self, job: DesignJob) -> AgentResult:
        """Parse natural language input into structured spec.

        Args:
            job: DesignJob with input_request set

        Returns:
            AgentResult with SpecResult in data["spec"]
        """
        start_time = time.time()
        logger.info("intake_processing", job_id=job.id, request=job.input_request[:100])

        spec = self._parse_request(job.input_request)

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
        types = ["hook", "box", "clip", "bracket", "mount", "holder", "case"]
        for t in types:
            if t in text:
                return t
        return ""

    def _extract_dimensions(self, text: str) -> dict[str, float]:
        """Extract dimensions from request."""
        dims = {}

        dim_keyword_pattern = r"(\d+(?:\.\d+)?)\s*(?:mm|millimeter)\s*,?\s*(length|width|height|depth)"
        for match in re.finditer(dim_keyword_pattern, text, re.IGNORECASE):
            val = float(match.group(1))
            keyword = match.group(2).lower()
            if keyword == "length" and "length" not in dims:
                dims["length"] = val
            elif keyword == "width" and "width" not in dims:
                dims["width"] = val
            elif keyword == "height" and "height" not in dims:
                dims["height"] = val
            elif keyword == "depth" and "depth" not in dims:
                dims["depth"] = val

        width_x_height_pattern = r"(\d+(?:\.\d+)?)\s*(?:mm|millimeter)\s*(?:x|by)\s*(\d+(?:\.\d+)?)\s*(?:mm|millimeter)"
        match = re.search(width_x_height_pattern, text, re.IGNORECASE)
        if match:
            try:
                dims["width"] = float(match.group(1))
                dims["height"] = float(match.group(2))
            except (ValueError, IndexError):
                pass

        if "length" not in dims:
            match = re.search(r"length\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(?:mm|millimeter)?", text, re.IGNORECASE)
            if match:
                try:
                    dims["length"] = float(match.group(1))
                except (ValueError, IndexError):
                    pass

        if "width" not in dims:
            match = re.search(r"width\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(?:mm|millimeter)?", text, re.IGNORECASE)
            if match:
                try:
                    dims["width"] = float(match.group(1))
                except (ValueError, IndexError):
                    pass

        if "height" not in dims:
            match = re.search(r"height\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(?:mm|millimeter)?", text, re.IGNORECASE)
            if match:
                try:
                    dims["height"] = float(match.group(1))
                except (ValueError, IndexError):
                    pass

        if "depth" not in dims:
            match = re.search(r"depth\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(?:mm|millimeter)?", text, re.IGNORECASE)
            if match:
                try:
                    dims["depth"] = float(match.group(1))
                except (ValueError, IndexError):
                    pass

        if "wall_thickness" not in dims:
            match = re.search(r"wall\s*(?:thickness)?\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(?:mm|millimeter)?", text, re.IGNORECASE)
            if match:
                try:
                    dims["wall_thickness"] = float(match.group(1))
                except (ValueError, IndexError):
                    pass

        if "length" not in dims:
            match = re.search(r"(\d+(?:\.\d+)?)\s*(?:mm|millimeter)", text, re.IGNORECASE)
            if match:
                try:
                    dims["length"] = float(match.group(1))
                except (ValueError, IndexError):
                    pass

        if "width" not in dims and "length" in dims:
            dims["width"] = dims.get("length", 20.0)

        if "height" not in dims:
            dims["height"] = dims.get("length", 20.0)

        return dims

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
