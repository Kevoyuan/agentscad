"""SQLite repository for DesignJob persistence."""

from __future__ import annotations

import json
from pathlib import Path
from typing import List, Optional

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

    @staticmethod
    def _has_meaningful_payload(raw_json: str | None) -> bool:
        """Return whether a JSON blob contains real agent output, not just an empty object."""
        if not raw_json:
            return False
        try:
            payload = json.loads(raw_json)
        except Exception:
            return False
        return isinstance(payload, dict) and any(value not in (None, "", [], {}, False) for value in payload.values())

    def _ensure_tables(self) -> None:
        """Create tables if they don't exist."""
        if "jobs" not in self.db.table_names():
            self.db["jobs"].create(
                {
                    "id": str,
                    "state": str,
                    "priority": str,
                    "input_request": str,
                    "reference_images_json": str,
                    "research_result_json": str,
                    "intent_result_json": str,
                    "design_result_json": str,
                    "parameter_schema_json": str,
                    "parameter_values_json": str,
                    "part_family": str,
                    "builder_name": str,
                    "generation_path": str,
                    "spec_json": str,
                    "scad_source": str,
                    "artifacts_json": str,
                    "validation_results_json": str,
                    "execution_logs_json": str,
                    "notes_json": str,
                    "final_result_json": str,
                    "retry_count": int,
                    "case_id": str,
                    "created_at": str,
                    "updated_at": str,
                    "completed_at": str,
                },
                pk="id",
            )
        else:
            table = self.db["jobs"]
            columns = table.columns_dict
            for column_name, column_type in {
                "reference_images_json": str,
                "research_result_json": str,
                "intent_result_json": str,
                "design_result_json": str,
                "parameter_schema_json": str,
                "parameter_values_json": str,
                "part_family": str,
                "builder_name": str,
                "generation_path": str,
            }.items():
                if column_name not in columns:
                    table.add_column(column_name, column_type)

    def save(self, job: DesignJob) -> None:
        """Persist a DesignJob to the database."""
        self.db["jobs"].insert(
            {
                "id": job.id,
                "state": job.state.value,
                "priority": job.priority.value,
                "input_request": job.input_request,
                "reference_images_json": json.dumps(
                    [image.model_dump(mode="json") for image in job.reference_images]
                ),
                "research_result_json": (
                    job.research_result.model_dump_json() if job.research_result else "{}"
                ),
                "intent_result_json": (
                    job.intent_result.model_dump_json() if job.intent_result else "{}"
                ),
                "design_result_json": (
                    job.design_result.model_dump_json() if job.design_result else "{}"
                ),
                "parameter_schema_json": (
                    job.parameter_schema.model_dump_json() if job.parameter_schema else "{}"
                ),
                "parameter_values_json": json.dumps(job.parameter_values),
                "part_family": job.part_family or "",
                "builder_name": job.builder_name or "",
                "generation_path": job.generation_path or "",
                "spec_json": job.spec.model_dump_json() if job.spec else "{}",
                "scad_source": job.scad_source or "",
                "artifacts_json": job.artifacts.model_dump_json(),
                "validation_results_json": json.dumps(
                    [v.model_dump(mode="json") for v in job.validation_results]
                ),
                "execution_logs_json": json.dumps(
                    [e.model_dump(mode="json") for e in job.execution_logs]
                ),
                "notes_json": json.dumps(job.notes),
                "final_result_json": json.dumps(job.final_result or {}, default=str),
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

    def get(self, job_id: str) -> Optional[DesignJob]:
        """Retrieve a DesignJob by ID."""
        try:
            row = self.db["jobs"].get(job_id)
        except Exception:
            return None
        return self._row_to_job(row)

    def delete(self, job_id: str) -> bool:
        """Hard delete a DesignJob from the database."""
        try:
            self.db.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
            self.db.conn.commit()
            return True
        except Exception as e:
            logger.error("job_delete_failed", job_id=job_id, error=str(e))
            return False

    def list(
        self,
        state: Optional[JobState] = None,
        limit: int = 100,
    ) -> List[DesignJob]:
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

    def list_jobs(
        self,
        state_filter: Optional[JobState] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[DesignJob]:
        """Backward-compatible listing API with offset support."""
        jobs = self.list(state=state_filter, limit=limit + offset)
        return jobs[offset: offset + limit]

    def _row_to_job(self, row: dict) -> DesignJob:
        """Convert a database row to a DesignJob."""
        from cad_agent.app.models.design_job import (
            Artifacts,
            ExecutionLog,
            ResearchResult,
            IntentResult,
            DesignResult,
            ParameterSchema,
            SpecResult,
            ReferenceImage,
        )

        reference_images = []
        if row.get("reference_images_json"):
            try:
                reference_images = [
                    ReferenceImage.model_validate(image)
                    for image in json.loads(row["reference_images_json"])
                ]
            except Exception:
                pass

        research_result = None
        if self._has_meaningful_payload(row.get("research_result_json")):
            try:
                research_result = ResearchResult.model_validate_json(row["research_result_json"])
            except Exception:
                pass

        intent_result = None
        if self._has_meaningful_payload(row.get("intent_result_json")):
            try:
                intent_result = IntentResult.model_validate_json(row["intent_result_json"])
            except Exception:
                pass

        design_result = None
        if self._has_meaningful_payload(row.get("design_result_json")):
            try:
                design_result = DesignResult.model_validate_json(row["design_result_json"])
            except Exception:
                pass

        parameter_schema = None
        if self._has_meaningful_payload(row.get("parameter_schema_json")):
            try:
                parameter_schema = ParameterSchema.model_validate_json(row["parameter_schema_json"])
            except Exception:
                pass

        parameter_values = {}
        if row.get("parameter_values_json"):
            try:
                parameter_values = dict(json.loads(row["parameter_values_json"]))
            except Exception:
                pass

        spec = None
        if row.get("spec_json"):
            try:
                spec = SpecResult.model_validate_json(row["spec_json"])
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

        notes = []
        if row.get("notes_json"):
            try:
                notes = list(json.loads(row["notes_json"]))
            except Exception:
                pass

        final_result = None
        if row.get("final_result_json"):
            try:
                final_result = json.loads(row["final_result_json"])
            except Exception:
                pass

        raw_state = row["state"]
        state_aliases = {
            "TEMPLATE_SELECTED": JobState.PARAMETERS_GENERATED,
            "TEMPLATE_FAILED": JobState.PARAMETER_FAILED,
        }

        job = DesignJob(
            id=row["id"],
            state=state_aliases.get(raw_state, JobState(raw_state)),
            priority=row["priority"],
            input_request=row.get("input_request", ""),
            reference_images=reference_images,
            research_result=research_result,
            intent_result=intent_result,
            design_result=design_result,
            parameter_schema=parameter_schema,
            parameter_values=parameter_values,
            part_family=row.get("part_family") or None,
            builder_name=row.get("builder_name") or None,
            generation_path=row.get("generation_path") or None,
            spec=spec,
            scad_source=row.get("scad_source") or None,
            artifacts=artifacts,
            validation_results=validation_results,
            execution_logs=execution_logs,
            notes=notes,
            retry_count=row.get("retry_count", 0),
            case_id=row.get("case_id") or None,
            created_at=row.get("created_at", ""),
            updated_at=row.get("updated_at", ""),
            completed_at=row.get("completed_at") or None,
            final_result=final_result,
        )
        return job
