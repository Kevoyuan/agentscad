"""Executor agent - runs OpenSCAD CLI."""

from __future__ import annotations

import os
import time
from pathlib import Path

import structlog

from cad_agent.app.models.agent_result import AgentResult, AgentRole
from cad_agent.app.models.design_job import Artifacts, DesignJob, JobState
from cad_agent.app.tools.openscad_executor import OpenSCADExecutor

logger = structlog.get_logger()


class ExecutorAgent:
    """Executes OpenSCAD CLI to render SCAD to STL/PNG."""

    def __init__(
        self,
        executor: OpenSCADExecutor | None = None,
        openscad_path: str = "openscad",
        output_dir: str = "/tmp/cad_agent_renders",
    ):
        """Initialize executor with OpenSCAD path and output directory."""
        self.executor = executor or OpenSCADExecutor(openscad_path=openscad_path)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    async def execute(self, job: DesignJob) -> AgentResult:
        """Execute SCAD rendering.

        Args:
            job: DesignJob with scad_source set

        Returns:
            AgentResult with artifact paths in data
        """
        start_time = time.time()
        logger.info("executing_scad", job_id=job.id)

        if not job.scad_source:
            return AgentResult(
                success=False,
                agent=AgentRole.EXECUTOR,
                state_reached=JobState.RENDER_FAILED.value,
                error="No SCAD source to render",
            )

        is_valid, error = self.executor.validate_syntax(job.scad_source)
        if not is_valid:
            return AgentResult(
                success=False,
                agent=AgentRole.EXECUTOR,
                state_reached=JobState.RENDER_FAILED.value,
                error=f"SCAD syntax error: {error}",
            )

        job_dir = self.output_dir / job.id
        job_dir.mkdir(exist_ok=True)

        result = await self.executor.render(
            scad_source=job.scad_source,
            output_dir=str(job_dir),
        )

        if result.success:
            job.artifacts = Artifacts(
                scad_source=job.scad_source,
                stl_path=result.stl_path,
                png_path=result.png_path,
                render_log=result.log_output,
            )
            agent_result = AgentResult(
                success=True,
                agent=AgentRole.EXECUTOR,
                state_reached=JobState.RENDERED.value,
                data={
                    "stl_path": result.stl_path,
                    "png_path": result.png_path,
                },
            )
        else:
            agent_result = AgentResult(
                success=False,
                agent=AgentRole.EXECUTOR,
                state_reached=JobState.RENDER_FAILED.value,
                error=result.error_message,
            )

        agent_result.duration_ms = int((time.time() - start_time) * 1000)
        return agent_result
