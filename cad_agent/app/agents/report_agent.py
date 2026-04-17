"""Report agent - generates delivery reports."""

import json
from pathlib import Path
import time
from datetime import datetime

import structlog

from cad_agent.app.models.agent_result import AgentResult, AgentRole
from cad_agent.app.models.design_job import DesignJob, JobState

logger = structlog.get_logger()


def _sanitize_public_payload(value):
    """Strip internal routing labels from nested public payloads."""
    if isinstance(value, dict):
        sanitized = {}
        for key, item in value.items():
            if key == "part_family":
                continue
            if key == "group" and item == "stand":
                sanitized[key] = "support"
                continue
            sanitized[key] = _sanitize_public_payload(item)
        return sanitized
    if isinstance(value, list):
        return [_sanitize_public_payload(item) for item in value]
    return value


class ReportAgent:
    """Generates delivery reports for completed designs."""

    def __init__(self, output_dir: str = "/tmp/cad_agent_reports"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    async def generate(self, job: DesignJob) -> AgentResult:
        """Generate delivery report for a validated design.

        Args:
            job: DesignJob in VALIDATED or ACCEPTED state

        Returns:
            AgentResult with report data
        """
        start_time = time.time()
        logger.info("generating_report", job_id=job.id)

        if job.state not in {JobState.ACCEPTED, JobState.VALIDATED, JobState.REVIEWED}:
            return AgentResult(
                success=False,
                agent=AgentRole.REPORT,
                state_reached=job.state.value,
                error="Can only generate report for validated designs",
            )

        job.transition_to(JobState.DELIVERED)
        job.completed_at = datetime.utcnow()
        report = self._build_report(job)
        report_path = self.output_dir / f"{job.id}.json"
        report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False))
        job.artifacts.report_path = str(report_path)

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
            "design_pipeline": {
                "generation_path": job.generation_path,
                "object_synthesis": (
                    (job.research_result.object_model or {}).get("synthesis_kind")
                    if job.research_result and job.research_result.object_model
                    else None
                ),
                "builder_name": job.builder_name,
                "research_result": _sanitize_public_payload(job.research_result.model_dump(mode="json")) if job.research_result else None,
                "intent_result": _sanitize_public_payload(job.intent_result.model_dump(mode="json")) if job.intent_result else None,
                "design_result": _sanitize_public_payload(job.design_result.model_dump(mode="json")) if job.design_result else None,
                "parameter_schema": _sanitize_public_payload(job.parameter_schema.model_dump(mode="json")) if job.parameter_schema else None,
                "parameter_values": job.get_effective_parameter_values(),
                "derived_parameters": (job.business_context or {}).get("derived_parameters", {}),
            },
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
