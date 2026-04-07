"""SQLite repository for DesignJob persistence."""

import json
from pathlib import Path

import structlog
from sqlite_utils import Database

from cad_agent.app.models.design_job import DesignJob, JobState

logger = structlog.get_logger()


class SQLiteJobRepository:
    """Persists DesignJob objects to SQLite."""

    def __init__(self, db_path: str = "storage/jobs/jobs.db"):
        """Initialize with path to SQLite database."""
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.db = Database(self.db_path)
        self._ensure_tables()

    def _ensure_tables(self) -> None:
        """Create tables if they don't exist."""
        if "jobs" not in self.db.table_names():
            self.db["jobs"].create(
                {
                    "id": str,
                    "state": str,
                    "priority": str,
                    "input_request": str,
                    "spec_json": str,
                    "template_choice_json": str,
                    "scad_source": str,
                    "artifacts_json": str,
                    "validation_results_json": str,
                    "execution_logs_json": str,
                    "retry_count": int,
                    "case_id": str,
                    "created_at": str,
                    "updated_at": str,
                    "completed_at": str,
                },
                pk="id",
            )

    def save(self, job: DesignJob) -> None:
        """Persist a DesignJob to the database."""
        self.db["jobs"].insert(
            {
                "id": job.id,
                "state": job.state.value,
                "priority": job.priority.value,
                "input_request": job.input_request,
                "spec_json": job.spec.model_dump_json() if job.spec else "{}",
                "template_choice_json": (
                    job.template_choice.model_dump_json() if job.template_choice else "{}"
                ),
                "scad_source": job.scad_source or "",
                "artifacts_json": job.artifacts.model_dump_json(),
                "validation_results_json": json.dumps(
                    [v.model_dump() for v in job.validation_results]
                ),
                "execution_logs_json": json.dumps(
                    [e.model_dump(mode="json") for e in job.execution_logs]
                ),
                "retry_count": job.retry_count,
                "case_id": job.case_id or "",
                "created_at": job.created_at.isoformat(),
                "updated_at": job.updated_at.isoformat(),
                "completed_at": (
                    job.completed_at.isoformat() if job.completed_at else ""
                ),
            },
            pk="id",
            replace=True,
        )

    def get(self, job_id: str) -> DesignJob | None:
        """Retrieve a DesignJob by ID."""
        try:
            row = self.db["jobs"].get(job_id)
        except Exception:
            return None
        return self._row_to_job(row)

    def list(
        self,
        state: JobState | None = None,
        limit: int = 100,
    ) -> list[DesignJob]:
        """List DesignJobs, optionally filtered by state."""
        query = self.db["jobs"].rows
        jobs = []
        for row in query:
            job = self._row_to_job(row)
            if state is None or job.state == state:
                jobs.append(job)
                if len(jobs) >= limit:
                    break
        return jobs

    def _row_to_job(self, row: dict) -> DesignJob:
        """Convert a database row to a DesignJob."""
        from cad_agent.app.models.design_job import (
            Artifacts,
            ExecutionLog,
            RoutingDecision,
            SpecResult,
            TemplateChoice,
        )

        spec = None
        if row.get("spec_json"):
            try:
                spec = SpecResult.model_validate_json(row["spec_json"])
            except Exception:
                pass

        template_choice = None
        if row.get("template_choice_json"):
            try:
                template_choice = TemplateChoice.model_validate_json(
                    row["template_choice_json"]
                )
            except Exception:
                pass

        artifacts = Artifacts.model_validate_json(row.get("artifacts_json", "{}"))

        validation_results = []
        if row.get("validation_results_json"):
            try:
                validation_results = [
                    v for v in json.loads(row["validation_results_json"])
                ]
            except Exception:
                pass

        execution_logs = []
        if row.get("execution_logs_json"):
            try:
                execution_logs = [
                    ExecutionLog.model_validate(e)
                    for e in json.loads(row["execution_logs_json"])
                ]
            except Exception:
                pass

        job = DesignJob(
            id=row["id"],
            state=JobState(row["state"]),
            priority=row["priority"],
            input_request=row.get("input_request", ""),
            spec=spec,
            template_choice=template_choice,
            scad_source=row.get("scad_source") or None,
            artifacts=artifacts,
            validation_results=validation_results,
            execution_logs=execution_logs,
            retry_count=row.get("retry_count", 0),
            case_id=row.get("case_id") or None,
            created_at=row.get("created_at", ""),
            updated_at=row.get("updated_at", ""),
            completed_at=row.get("completed_at") or None,
        )
        return job
