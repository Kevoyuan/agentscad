"""FastAPI application for CAD Agent System."""
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Optional

import structlog
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from cad_agent.config import get_settings
from cad_agent.app.models.design_job import DesignJob, JobState
from cad_agent.app.models.agent_result import AgentRole
from cad_agent.app.models.validation import ValidationLevel
from cad_agent.app.agents.orchestrator import OrchestratorAgent
from cad_agent.app.agents.intake_agent import IntakeAgent
from cad_agent.app.agents.template_agent import TemplateAgent
from cad_agent.app.agents.generator_agent import GeneratorAgent
from cad_agent.app.agents.executor_agent import ExecutorAgent
from cad_agent.app.agents.validator_agent import ValidatorAgent
from cad_agent.app.agents.debug_agent import DebugAgent
from cad_agent.app.agents.report_agent import ReportAgent
from cad_agent.app.rules.engineering_rules import EngineeringRulesEngine
from cad_agent.app.rules.retry_policy import RetryPolicy
from cad_agent.app.storage.sqlite_repo import SQLiteJobRepository
from cad_agent.app.services.case_memory import CaseMemoryService
from cad_agent.app.tools.openscad_executor import OpenSCADExecutor

settings = get_settings()
logger = structlog.get_logger()

_orchestrator: OrchestratorAgent | None = None
_job_repo: SQLiteJobRepository | None = None
_case_memory: CaseMemoryService | None = None


class CreateJobRequest(BaseModel):
    """Request to create a new CAD job."""

    input_request: str = Field(
        ...,
        min_length=10,
        max_length=5000,
        description="Natural language CAD request",
    )
    customer_id: str | None = Field(
        default=None,
        description="Optional customer identifier for case memory",
    )
    priority: int = Field(
        default=5,
        ge=1,
        le=10,
        description="Job priority (1=highest, 10=lowest)",
    )


class CreateJobResponse(BaseModel):
    """Response after creating a job."""

    job_id: str
    state: str
    message: str


class JobStatusResponse(BaseModel):
    """Response for job status check."""

    job_id: str
    state: str
    input_request: str
    spec_summary: str | None
    template_id: str | None
    scad_content: str | None
    artifacts: dict[str, Any] | None
    validation_results: list[dict[str, Any]] | None
    retry_count: int
    created_at: str
    updated_at: str
    logs: list[dict[str, Any]]


class ValidationResultSummary(BaseModel):
    """Summary of validation results."""

    rule_id: str
    rule_name: str
    level: str
    passed: bool
    message: str
    is_critical: bool


class JobDeliveryResponse(BaseModel):
    """Response when job is delivered."""

    job_id: str
    state: str
    artifacts: dict[str, Any]
    delivery_message: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    global _orchestrator, _job_repo, _case_memory

    settings.ensure_directories()

    rules_engine = EngineeringRulesEngine()
    retry_policy = RetryPolicy()
    _case_memory = CaseMemoryService(db_path=str(settings.get_case_db_path()))
    _job_repo = SQLiteJobRepository(db_path=str(settings.get_job_db_path("_main")))

    openscad_executor = OpenSCADExecutor(
        openscad_path=str(settings.openSCAD_path),
        timeout_seconds=settings.render_timeout,
    )

    intake_agent = IntakeAgent()
    template_agent = TemplateAgent(templates_dir=str(settings.templates_dir))
    generator_agent = GeneratorAgent(templates_dir=str(settings.templates_dir))
    executor_agent = ExecutorAgent(executor=openscad_executor)
    validator_agent = ValidatorAgent(rules_engine=rules_engine)
    debug_agent = DebugAgent()
    report_agent = ReportAgent(output_dir=str(settings.output_dir))

    _orchestrator = OrchestratorAgent(retry_policy=retry_policy, case_memory=_case_memory)
    _orchestrator.set_agents(
        intake=intake_agent,
        template=template_agent,
        generator=generator_agent,
        executor=executor_agent,
        validator=validator_agent,
        debug=debug_agent,
        report=report_agent,
    )

    logger.info("app_startup_complete", settings=dict(settings.model_dump()))
    yield

    logger.info("app_shutdown_complete")


app = FastAPI(
    title="CAD Agent API",
    description="Business-Closed-Loop CAD Agent System for OpenSCAD",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/jobs", response_model=CreateJobResponse, status_code=201)
async def create_job(request: CreateJobRequest) -> CreateJobResponse:
    """Create a new CAD job from natural language request."""
    job = DesignJob(
        input_request=request.input_request,
        customer_id=request.customer_id,
        priority=request.priority,
    )

    _job_repo.save(job)

    logger.info("job_created", job_id=job.id, state=job.state.value)

    return CreateJobResponse(
        job_id=job.id,
        state=job.state.value,
        message="Job created successfully. Use /jobs/{job_id}/process to start processing.",
    )


@app.post("/jobs/{job_id}/process")
async def process_job(job_id: str, background_tasks: BackgroundTasks) -> JSONResponse:
    """Start processing a job (runs in background)."""
    job = _job_repo.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    if job.state not in {JobState.NEW, JobState.SPEC_FAILED}:
        return JSONResponse(
            status_code=400,
            content={"detail": f"Job {job_id} is in state {job.state.value}, cannot process from this state"},
        )

    background_tasks.add_task(_run_orchestrator, job_id)

    return JSONResponse(
        status_code=202,
        content={
            "job_id": job_id,
            "state": job.state.value,
            "message": "Job processing started in background",
        },
    )


async def _run_orchestrator(job_id: str) -> None:
    """Internal: run the orchestrator for a job."""
    global _orchestrator, _job_repo

    job = _job_repo.get(job_id)
    if not job:
        logger.error("job_not_found_for_processing", job_id=job_id)
        return

    logger.info("orchestrator_starting", job_id=job_id)

    try:
        result = await _orchestrator.process(job)
        job.final_result = result.model_dump()
        _job_repo.save(job)
        logger.info("orchestrator_completed", job_id=job_id, success=result.success, final_state=job.state.value)
    except Exception as e:
        logger.error("orchestrator_error", job_id=job_id, error=str(e))
        job.add_log({"agent": "orchestrator", "action": "process", "error": str(e)})
        _job_repo.save(job)


@app.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str) -> JobStatusResponse:
    """Get the status of a job."""
    job = _job_repo.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    spec_summary = None
    if job.spec:
        spec_summary = f"{job.spec.geometric_type} {job.spec.dimensions}"

    return JobStatusResponse(
        job_id=job.id,
        state=job.state.value,
        input_request=job.input_request,
        spec_summary=spec_summary,
        template_id=job.template_choice.template_id if job.template_choice else None,
        scad_content=job.artifacts.scad_content if job.artifacts else None,
        artifacts=job.artifacts.model_dump() if job.artifacts else None,
        validation_results=[v.model_dump() for v in job.validation_results] if job.validation_results else None,
        retry_count=job.retry_count,
        created_at=job.created_at.isoformat(),
        updated_at=job.updated_at.isoformat(),
        logs=[log.model_dump(mode="json") for log in job.execution_logs],
    )


@app.get("/jobs/{job_id}/artifacts/{artifact_type}")
async def get_job_artifact(job_id: str, artifact_type: str) -> FileResponse:
    """Download a job artifact (STL, PNG, etc.)."""
    job = _job_repo.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    if not job.artifacts:
        raise HTTPException(status_code=404, detail="No artifacts available for this job")

    artifact_map = {
        "stl": job.artifacts.stl_path,
        "png": job.artifacts.png_path,
        "scad": job.artifacts.scad_content,
    }

    artifact_value = artifact_map.get(artifact_type)
    if not artifact_value:
        raise HTTPException(status_code=404, detail=f"Artifact type '{artifact_type}' not found")

    if artifact_type == "scad":
        return JSONResponse(content={"scad_content": artifact_value})

    artifact_path = Path(artifact_value)
    if not artifact_path.exists():
        raise HTTPException(status_code=404, detail=f"Artifact file not found: {artifact_path}")

    media_types = {
        "stl": "application/sla",
        "png": "image/png",
    }
    return FileResponse(
        path=artifact_path,
        media_type=media_types.get(artifact_type, "application/octet-stream"),
        filename=artifact_path.name,
    )


@app.get("/jobs/{job_id}/validations", response_model=list[ValidationResultSummary])
async def get_job_validations(job_id: str) -> list[ValidationResultSummary]:
    """Get validation results for a job."""
    job = _job_repo.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    if not job.validation_results:
        raise HTTPException(status_code=404, detail="No validation results for this job")

    summaries = []
    for v in job.validation_results:
        summaries.append(
            ValidationResultSummary(
                rule_id=v.rule_id,
                rule_name=v.rule_name,
                level=v.level.value,
                passed=v.passed,
                message=v.message,
                is_critical=v.is_critical,
            )
        )
    return summaries


@app.get("/jobs", response_model=list[JobStatusResponse])
async def list_jobs(
    state: Optional[JobState] = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[JobStatusResponse]:
    """List jobs with optional state filter."""
    jobs = _job_repo.list_jobs(state_filter=state, limit=limit, offset=offset)

    return [
        JobStatusResponse(
            job_id=job.id,
            state=job.state.value,
            input_request=job.input_request,
            spec_summary=f"{job.spec.geometric_type} {job.spec.dimensions}" if job.spec else None,
            template_id=job.template_choice.template_id if job.template_choice else None,
            scad_content=job.artifacts.scad_content if job.artifacts else None,
            artifacts=job.artifacts.model_dump() if job.artifacts else None,
            validation_results=[v.model_dump() for v in job.validation_results] if job.validation_results else None,
            retry_count=job.retry_count,
            created_at=job.created_at.isoformat(),
            updated_at=job.updated_at.isoformat(),
            logs=[log.model_dump(mode="json") for log in job.execution_logs],
        )
        for job in jobs
    ]


@app.delete("/jobs/{job_id}")
async def cancel_job(job_id: str) -> JSONResponse:
    """Cancel a job."""
    job = _job_repo.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    if job.state in {JobState.DELIVERED, JobState.ARCHIVED}:
        raise HTTPException(status_code=400, detail=f"Cannot cancel job in state {job.state.value}")

    job.transition_to(JobState.CANCELLED)
    _job_repo.save(job)

    return JSONResponse(content={"job_id": job_id, "state": job.state.value, "message": "Job cancelled"})


@app.get("/templates", response_model=list[dict[str, Any]])
async def list_templates() -> list[dict[str, Any]]:
    """List available CAD templates."""
    templates_dir = Path(settings.templates_dir)
    templates = []

    for template_file in templates_dir.glob("*.scad.j2"):
        template_name = template_file.stem.replace("_basic_v1", "").replace("_", " ").title()
        templates.append(
            {
                "id": template_file.stem,
                "name": template_name,
                "file": str(template_file.name),
            }
        )

    return templates


@app.get("/health")
async def health_check() -> JSONResponse:
    """Health check endpoint."""
    return JSONResponse(
        status_code=200,
        content={
            "status": "healthy",
            "version": "0.1.0",
            "settings": {
                "openSCAD_path": str(settings.openSCAD_path),
                "storage_dir": str(settings.storage_dir),
                "output_dir": str(settings.output_dir),
                "case_memory_enabled": settings.case_memory_enabled,
            },
        },
    )


@app.get("/case-memory/similar")
async def get_similar_cases(
    request: str,
    limit: int = Query(default=5, ge=1, le=20),
) -> JSONResponse:
    """Find similar cases from case memory."""
    if not settings.case_memory_enabled:
        return JSONResponse(status_code=404, content={"detail": "Case memory is disabled"})

    cases = _case_memory.find_similar_cases(request, limit=limit)

    return JSONResponse(
        status_code=200,
        content={
            "cases": [c.model_dump() for c in cases],
            "count": len(cases),
        },
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
