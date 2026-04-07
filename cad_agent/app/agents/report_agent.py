"""Report agent - generates delivery reports."""

import time
from datetime import datetime

import structlog

from cad_agent.app.models.agent_result import AgentResult, AgentRole
from cad_agent.app.models.design_job import DesignJob, JobState

logger = structlog.get_logger()


class ReportAgent:
    """Generates delivery reports for completed designs."""

    async def generate(self, job: DesignJob) -> AgentResult:
        """Generate delivery report for accepted design.

        Args:
            job: DesignJob in ACCEPTED state

        Returns:
            AgentResult with report data
        """
        start_time = time.time()
        logger.info("generating_report", job_id=job.id)

        if job.state != JobState.ACCEPTED:
            return AgentResult(
                success=False,
                agent=AgentRole.REPORT,
                state_reached=job.state.value,
                error="Can only generate report for ACCEPTED designs",
            )

        report = self._build_report(job)

        job.transition_to(JobState.DELIVERED)
        job.completed_at = datetime.utcnow()

        result = AgentResult(
            success=True,
            agent=AgentRole.REPORT,
            state_reached=JobState.DELIVERED.value,
            data={"report": report},
        )

        result.duration_ms = int((time.time() - start_time) * 1000)
        return result

    def _build_report(self, job: DesignJob) -> dict:
        """Build comprehensive delivery report."""
        return {
            "job_id": job.id,
            "status": "DELIVERED",
            "completed_at": job.completed_at.isoformat() if job.completed_at else datetime.utcnow().isoformat(),
            "customer_request": job.input_request,
            "spec_summary": {
                "geometric_type": job.spec.geometric_type if job.spec else "unknown",
                "dimensions": job.spec.dimensions if job.spec else {},
                "material": job.spec.material if job.spec else "PLA",
                "tolerance": job.spec.tolerance if job.spec else 0.1,
            },
            "template_used": job.template_choice.template_name if job.template_choice else "unknown",
            "artifacts": {
                "stl_path": job.artifacts.stl_path,
                "png_path": job.artifacts.png_path,
            },
            "validation_summary": {
                "total_rules": len(job.validation_results),
                "passed": len([v for v in job.validation_results if v.passed]),
                "failed": len([v for v in job.validation_results if not v.passed]),
                "critical_failures": len([v for v in job.validation_results if v.is_critical]),
            },
            "execution_logs": [
                {
                    "agent": log.agent,
                    "action": log.action,
                    "success": log.success,
                    "timestamp": log.timestamp.isoformat(),
                }
                for log in job.execution_logs[-10:]
            ],
            "retry_count": job.retry_count,
        }
