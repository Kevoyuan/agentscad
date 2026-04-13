"""FastAPI application for CAD Agent System."""
import asyncio
import json
from contextlib import asynccontextmanager
from pathlib import Path
import time
from uuid import uuid4
from typing import Any, Optional

import structlog
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from cad_agent.config import get_settings
from cad_agent.app.models.design_job import DesignJob, JobState, ReferenceImage
from cad_agent.app.models.agent_result import AgentRole
from cad_agent.app.models.validation import ValidationLevel
from cad_agent.app.agents.orchestrator import OrchestratorAgent
from cad_agent.app.agents.research_agent import ResearchAgent
from cad_agent.app.agents.intake_agent import IntakeAgent
from cad_agent.app.agents.intent_agent import IntentAgent
from cad_agent.app.agents.design_agent import DesignAgent
from cad_agent.app.agents.parameter_schema_agent import ParameterSchemaAgent
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
from cad_agent.app.research import MiniMaxVisionAdapter, MiniMaxWebSearchAdapter
from cad_agent.app.llm import (
    AnthropicCompatibleLLMClient,
    LLMDesignCritic,
    LLMScadGenerator,
    LLMSpecParser,
)
from cad_agent.app.llm.scad_parameter_schema import apply_parameter_values_to_scad

settings = get_settings()
logger = structlog.get_logger()

_orchestrator: OrchestratorAgent | None = None
_job_repo: SQLiteJobRepository | None = None
_case_memory: CaseMemoryService | None = None


class JobEventBus:
    """Pub-Sub system for real-time job updates."""

    def __init__(self):
        self._subscribers: dict[str, list[asyncio.Queue]] = {}

    def subscribe(self, job_id: str) -> asyncio.Queue:
        if job_id not in self._subscribers:
            self._subscribers[job_id] = []
        queue = asyncio.Queue()
        self._subscribers[job_id].append(queue)
        return queue

    def unsubscribe(self, job_id: str, queue: asyncio.Queue):
        if job_id in self._subscribers:
            self._subscribers[job_id].remove(queue)
            if not self._subscribers[job_id]:
                del self._subscribers[job_id]

    async def broadcast(self, job: DesignJob):
        if job.id not in self._subscribers:
            return
        # Convert job to status response format
        data = _job_to_status_response(job).model_dump(mode="json")
        for queue in self._subscribers[job.id]:
            await queue.put(data)

_event_bus = JobEventBus()


def _sanitize_public_payload(value: Any) -> Any:
    """Strip internal routing labels from nested API payloads."""
    if isinstance(value, dict):
        sanitized: dict[str, Any] = {}
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


def _safe_settings_for_log() -> dict[str, Any]:
    """Redact secrets before logging configuration."""
    redacted = settings.model_dump()
    for key in (
        "anthropic_api_key",
        "openai_api_key",
        "azure_openai_key",
        "minimax_api_key",
    ):
        if redacted.get(key):
            redacted[key] = "***"
    return redacted


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


class ReferenceImageResponse(BaseModel):
    """Uploaded reference-image metadata exposed to the UI."""

    file_name: str
    media_type: str
    size_bytes: int | None


class JobStatusResponse(BaseModel):
    """Response for job status check."""

    job_id: str
    state: str
    input_request: str
    reference_images: list[ReferenceImageResponse]
    spec_summary: str | None
    generation_path: str | None
    parameter_update_strategy: str | None
    parameter_update_duration_ms: int | None
    parameter_updated_at: str | None
    parameter_update_stats: dict[str, Any] | None
    object_synthesis: str | None
    builder_name: str | None
    research_result: dict[str, Any] | None
    intent_result: dict[str, Any] | None
    design_result: dict[str, Any] | None
    parameter_schema: dict[str, Any] | None
    parameter_values: dict[str, Any] | None
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


class UpdateParametersRequest(BaseModel):
    """Patch request for parametric design controls."""

    parameter_values: dict[str, Any] = Field(
        ...,
        description="Updated parameter values to rebuild the model with",
    )
    preview_only: bool = Field(
        default=False,
        description="When true, rebuild only geometry and the STL preview for interactive edits",
    )


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
        include_dirs=[str(path) for path in settings.openscad_library_dirs],
        timeout_seconds=settings.render_timeout,
    )

    llm_spec_parser = None
    llm_scad_generator = None
    llm_design_critic = None
    try:
        provider_config = settings.resolve_llm_provider_config()
        if provider_config.is_anthropic_compatible:
            llm_client = AnthropicCompatibleLLMClient(provider_config)
            llm_spec_parser = LLMSpecParser(llm_client)
            llm_scad_generator = LLMScadGenerator(llm_client)
            llm_design_critic = LLMDesignCritic(llm_client)
    except ValueError:
        llm_spec_parser = None
        llm_scad_generator = None
        llm_design_critic = None

    web_research_adapter = None
    if settings.web_research_enabled:
        web_research_adapter = MiniMaxWebSearchAdapter(
            timeout_seconds=settings.web_research_timeout,
            user_agent=settings.web_research_user_agent,
        )

    vision_adapter = None
    if settings.image_understanding_enabled:
        vision_adapter = MiniMaxVisionAdapter(
            timeout_seconds=settings.image_understanding_timeout,
        )

    research_agent = ResearchAgent(
        web_research_adapter=web_research_adapter,
        vision_adapter=vision_adapter,
    )
    intake_agent = IntakeAgent(spec_parser=llm_spec_parser)
    intent_agent = IntentAgent()
    design_agent = DesignAgent()
    parameter_schema_agent = ParameterSchemaAgent()
    generator_agent = GeneratorAgent(llm_scad_generator=llm_scad_generator)
    executor_agent = ExecutorAgent(executor=openscad_executor)
    validator_agent = ValidatorAgent(
        rules_engine=rules_engine,
        design_critic=llm_design_critic,
    )
    debug_agent = DebugAgent()
    report_agent = ReportAgent(output_dir=str(settings.output_dir))

    _orchestrator = OrchestratorAgent(retry_policy=retry_policy, case_memory=_case_memory)
    _orchestrator.on_update = _event_bus.broadcast
    _orchestrator.set_agents(
        research=research_agent,
        intake=intake_agent,
        intent=intent_agent,
        design=design_agent,
        parameters=parameter_schema_agent,
        generator=generator_agent,
        executor=executor_agent,
        validator=validator_agent,
        debug=debug_agent,
        report=report_agent,
    )

    logger.info("app_startup_complete", settings=_safe_settings_for_log())
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


def _public_reference_images(images: list[ReferenceImage]) -> list[ReferenceImageResponse]:
    """Strip internal stored paths before returning image metadata."""
    return [
        ReferenceImageResponse(
            file_name=image.file_name,
            media_type=image.media_type,
            size_bytes=image.size_bytes,
        )
        for image in images
    ]


async def _store_reference_images(job_id: str, uploads: list[UploadFile] | None) -> list[ReferenceImage]:
    """Persist uploaded reference images for a job."""
    if not uploads:
        return []

    allowed_types = {"image/jpeg", "image/png", "image/webp"}
    job_dir = settings.uploads_dir / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    stored: list[ReferenceImage] = []
    for upload in uploads:
        if upload.content_type not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported image type for {upload.filename}: {upload.content_type or 'unknown'}",
            )
        suffix = Path(upload.filename or "").suffix or ".bin"
        target = job_dir / f"{uuid4().hex}{suffix.lower()}"
        payload = await upload.read()
        target.write_bytes(payload)
        stored.append(
            ReferenceImage(
                file_name=upload.filename or target.name,
                stored_path=str(target),
                media_type=upload.content_type or "application/octet-stream",
                size_bytes=len(payload),
            )
        )
    return stored


@app.post("/jobs", response_model=CreateJobResponse, status_code=201)
async def create_job(
    request: Request,
    input_request: str | None = Form(default=None),
    customer_id: str | None = Form(default=None),
    priority: int | None = Form(default=None),
    reference_images: list[UploadFile] | None = File(default=None),
) -> CreateJobResponse:
    """Create a new CAD job from natural language request."""
    content_type = request.headers.get("content-type", "")
    if content_type.startswith("application/json"):
        body = CreateJobRequest.model_validate(await request.json())
        uploads = None
    else:
        body = CreateJobRequest(
            input_request=input_request or "",
            customer_id=customer_id or None,
            priority=priority if priority is not None else 5,
        )
        uploads = reference_images

    job = DesignJob(
        input_request=body.input_request,
        customer_id=body.customer_id,
        priority=body.priority,
    )
    job.reference_images = await _store_reference_images(job.id, uploads)

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

    if job.state not in {JobState.NEW, JobState.RESEARCH_FAILED, JobState.INTENT_FAILED, JobState.DESIGN_FAILED, JobState.PARAMETER_FAILED, JobState.SPEC_FAILED, JobState.GEOMETRY_FAILED, JobState.REVIEW_FAILED}:
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
        job.final_result = result.model_dump(mode="json")
        _job_repo.save(job)
        logger.info("orchestrator_completed", job_id=job_id, success=result.success, final_state=job.state.value)
    except Exception as e:
        logger.error("orchestrator_error", job_id=job_id, error=str(e))
        job.add_log({"agent": "orchestrator", "action": "process", "error": str(e)})
        _job_repo.save(job)
@app.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str) -> JobStatusResponse:
    """Get status of a specific job."""
    job = _job_repo.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return _job_to_status_response(job)


@app.get("/jobs/{job_id}/events")
async def stream_job_events(job_id: str):
    """Stream real-time job updates via Server-Sent Events (SSE)."""

    async def event_generator():
        queue = _event_bus.subscribe(job_id)
        try:
            # Send initial state
            job = _job_repo.get(job_id)
            if job:
                yield {
                    "event": "message",
                    "data": json.dumps(_job_to_status_response(job).model_dump(mode="json")),
                }

            while True:
                data = await queue.get()
                yield {
                    "event": "message",
                    "data": json.dumps(data),
                }
        finally:
            _event_bus.unsubscribe(job_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
    )


def _job_to_status_response(job: DesignJob) -> JobStatusResponse:
    """Serialize a job into the public status payload."""
    spec_summary = None
    if job.spec:
        spec_summary = f"{job.spec.geometric_type} {job.spec.dimensions}"

    return JobStatusResponse(
        job_id=job.id,
        state=job.state.value,
        input_request=job.input_request,
        reference_images=_public_reference_images(job.reference_images),
        spec_summary=spec_summary,
        generation_path=job.generation_path,
        parameter_update_strategy=(job.business_context or {}).get("parameter_update_strategy"),
        parameter_update_duration_ms=(job.business_context or {}).get("parameter_update_duration_ms"),
        parameter_updated_at=(job.business_context or {}).get("parameter_updated_at"),
        parameter_update_stats=_parameter_update_stats(job),
        object_synthesis=(
            (job.research_result.object_model or {}).get("synthesis_kind")
            if job.research_result and job.research_result.object_model
            else None
        ),
        builder_name=job.builder_name,
        research_result=_sanitize_public_payload(job.research_result.model_dump(mode="json")) if job.research_result else None,
        intent_result=_sanitize_public_payload(job.intent_result.model_dump(mode="json")) if job.intent_result else None,
        design_result=_sanitize_public_payload(job.design_result.model_dump(mode="json")) if job.design_result else None,
        parameter_schema=_sanitize_public_payload(job.parameter_schema.model_dump(mode="json")) if job.parameter_schema else None,
        parameter_values=job.get_effective_parameter_values() or None,
        scad_content=job.artifacts.scad_content if job.artifacts else None,
        artifacts=job.artifacts.model_dump() if job.artifacts else None,
        validation_results=[v.model_dump() for v in job.validation_results] if job.validation_results else None,
        retry_count=job.retry_count,
        created_at=job.created_at.isoformat(),
        updated_at=job.updated_at.isoformat(),
        logs=[log.model_dump(mode="json") for log in job.execution_logs],
    )


def _parameter_update_stats(job: DesignJob) -> dict[str, Any] | None:
    """Summarize parameter update strategy frequency and latency from execution logs."""
    relevant_logs = []
    for log in job.execution_logs:
        agent = getattr(log, "agent", "") or ""
        action = getattr(log, "action", "") or ""
        output_data = getattr(log, "output_data", {}) or {}
        if agent == "parameters" and action == "update" and isinstance(output_data, dict):
            relevant_logs.append(log)

    if not relevant_logs:
        return None

    def _bucket(strategy: str) -> tuple[int, int]:
        matching = [
            int(getattr(log, "duration_ms", 0) or 0)
            for log in relevant_logs
            if ((getattr(log, "output_data", {}) or {}).get("strategy") == strategy)
        ]
        if not matching:
            return 0, 0
        return len(matching), round(sum(matching) / len(matching))

    patch_count, avg_patch_ms = _bucket("scad_patch")
    rebuild_count, avg_rebuild_ms = _bucket("full_rebuild")
    total_count = len(relevant_logs)

    return {
        "total_updates": total_count,
        "patch_hits": patch_count,
        "rebuild_hits": rebuild_count,
        "patch_hit_rate": round((patch_count / total_count) * 100) if total_count else 0,
        "avg_patch_ms": avg_patch_ms or None,
        "avg_rebuild_ms": avg_rebuild_ms or None,
    }


def _can_patch_parameterized_scad(job: DesignJob) -> bool:
    """Return whether a job can patch top-level SCAD parameters in place."""
    return bool(
        job.parameter_schema
        and job.generation_path in {"inferred_parametric_scad", "mcad_spur_gear"}
        and (job.scad_source or (job.artifacts.scad_source if job.artifacts else None))
    )


def _clear_render_outputs(job: DesignJob) -> None:
    """Clear render outputs while preserving parameter metadata."""
    if job.artifacts is None:
        return
    job.artifacts.stl_path = None
    job.artifacts.png_path = None
    job.artifacts.report_path = None


async def _rebuild_from_patched_scad(job: DesignJob, request: UpdateParametersRequest) -> None:
    """Patch top-level SCAD parameters and continue the workflow from SCAD_GENERATED."""
    source = job.scad_source or (job.artifacts.scad_source if job.artifacts else None)
    patched_source = apply_parameter_values_to_scad(source or "", request.parameter_values)
    if not patched_source:
        raise ValueError("Current SCAD source does not expose patchable top-level parameters")

    updated_values = job.get_effective_parameter_values()
    updated_values.update(request.parameter_values)
    job.set_parameter_values(updated_values)
    job.scad_source = patched_source
    if job.artifacts:
        job.artifacts.scad_source = patched_source
    job.validation_results = []
    _clear_render_outputs(job)
    if not job.business_context:
        job.business_context = {}
    job.business_context["parameter_update_strategy"] = "scad_patch"
    job.transition_to(JobState.SCAD_GENERATED)

    if request.preview_only:
        result = await _orchestrator.process_preview(job)
    else:
        result = await _orchestrator.process(job)
    job.final_result = result.model_dump(mode="json")


@app.patch("/jobs/{job_id}/parameters", response_model=JobStatusResponse)
async def update_job_parameters(job_id: str, request: UpdateParametersRequest) -> JobStatusResponse:
    """Update parameter values and rebuild a parametric design."""
    job = _job_repo.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    if not job.parameter_schema:
        raise HTTPException(status_code=400, detail="This job does not expose editable parametric controls")

    started_at = time.time()
    try:
        if _can_patch_parameterized_scad(job):
            try:
                await _rebuild_from_patched_scad(job, request)
            except Exception as exc:
                logger.warning("scad_parameter_patch_fell_back", job_id=job_id, error=str(exc))
                updated_values = job.get_effective_parameter_values()
                updated_values.update(request.parameter_values)
                job.set_parameter_values(updated_values)
                if not job.business_context:
                    job.business_context = {}
                job.business_context["parameter_update_strategy"] = "full_rebuild"
                job.scad_source = None
                if job.artifacts:
                    job.artifacts.scad_source = None
                _clear_render_outputs(job)
                job.validation_results = []
                job.transition_to(JobState.SPEC_PARSED)
                if request.preview_only:
                    result = await _orchestrator.process_preview(job)
                else:
                    result = await _orchestrator.process(job)
                job.final_result = result.model_dump(mode="json")
        else:
            updated_values = job.get_effective_parameter_values()
            updated_values.update(request.parameter_values)
            job.set_parameter_values(updated_values)
            if not job.business_context:
                job.business_context = {}
            job.business_context["parameter_update_strategy"] = "full_rebuild"
            job.scad_source = None
            if job.artifacts:
                job.artifacts.scad_source = None
            _clear_render_outputs(job)
            job.validation_results = []
            job.transition_to(JobState.SPEC_PARSED)
            if request.preview_only:
                result = await _orchestrator.process_preview(job)
            else:
                result = await _orchestrator.process(job)
            job.final_result = result.model_dump(mode="json")
    except Exception as exc:
        logger.error("parameter_rebuild_failed", job_id=job_id, error=str(exc))
        _job_repo.save(job)
        raise HTTPException(status_code=500, detail=f"Parameter rebuild failed: {exc}") from exc

    duration_ms = int((time.time() - started_at) * 1000)
    if not job.business_context:
        job.business_context = {}
    job.business_context["parameter_update_duration_ms"] = duration_ms
    job.business_context["parameter_updated_at"] = job.updated_at.isoformat()
    job.add_log(
        {
            "agent": "parameters",
            "action": "update",
            "success": True,
            "output_data": {
                "strategy": job.business_context.get("parameter_update_strategy"),
                "preview_only": request.preview_only,
                "updated_keys": sorted(request.parameter_values.keys()),
            },
            "duration_ms": duration_ms,
        }
    )

    _job_repo.save(job)
    return _job_to_status_response(job)


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
        return []

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
        _job_to_status_response(job)
        for job in jobs
    ]


@app.delete("/jobs/{job_id}")
async def cancel_job(job_id: str, hard: bool = Query(default=False)) -> JSONResponse:
    """Cancel or delete a job."""
    job = _job_repo.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    if hard:
        deleted = _job_repo.delete(job_id)
        if not deleted:
            raise HTTPException(status_code=500, detail="Failed to delete job from database")
        return JSONResponse(content={"job_id": job_id, "state": "DELETED", "message": "Job deleted completely"})

    if job.state in {JobState.DELIVERED, JobState.ARCHIVED}:
        raise HTTPException(status_code=400, detail=f"Cannot cancel job in state {job.state.value}")

    job.transition_to(JobState.CANCELLED)
    _job_repo.save(job)

    return JSONResponse(content={"job_id": job_id, "state": job.state.value, "message": "Job cancelled"})

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
                "openscad_library_dirs": [str(path) for path in settings.openscad_library_dirs],
                "storage_dir": str(settings.storage_dir),
                "output_dir": str(settings.output_dir),
                "case_memory_enabled": settings.case_memory_enabled,
            },
        },
    )


@app.get("/debug/network")
async def debug_network_status() -> JSONResponse:
    """Debug endpoint: probe web research connectivity and report status."""
    import httpx
    import time

    web_research_enabled = settings.web_research_enabled
    results: dict[str, object] = {
        "web_research_adapter_enabled": web_research_enabled,
        "targets": [],
    }

    # Probe 1: General internet reachability (apple.com)
    try:
        start = time.time()
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
            response = await client.get("https://www.apple.com/")
        latency_ms = int((time.time() - start) * 1000)
        results["internet_reachable"] = True
        results["apple_com_status"] = response.status_code
        results["apple_com_latency_ms"] = latency_ms
    except Exception as e:
        results["internet_reachable"] = False
        results["apple_com_error"] = str(e)
        results["apple_com_latency_ms"] = None

    # Probe 2: Apple device specs page (the actual research endpoint)
    if web_research_enabled:
        try:
            start = time.time()
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                response = await client.get("https://www.apple.com/iphone-17-pro/specs/")
            latency_ms = int((time.time() - start) * 1000)
            results["targets"].append({
                "name": "iphone_specs_page",
                "url": "https://www.apple.com/iphone-17-pro/specs/",
                "reachable": True,
                "status": response.status_code,
                "latency_ms": latency_ms,
            })
        except Exception as e:
            results["targets"].append({
                "name": "iphone_specs_page",
                "url": "https://www.apple.com/iphone-17-pro/specs/",
                "reachable": False,
                "error": str(e),
                "latency_ms": None,
            })

        # Probe 3: Web research adapter ping
        try:
            from cad_agent.app.research import MiniMaxWebSearchAdapter
            adapter = MiniMaxWebSearchAdapter(timeout_seconds=5.0)
            start = time.time()
            await adapter.research("iPhone 17 Pro dimensions mm")
            latency_ms = int((time.time() - start) * 1000)
            results["web_research_adapter_usable"] = True
            results["web_research_adapter_latency_ms"] = latency_ms
        except Exception as e:
            results["web_research_adapter_usable"] = False
            results["web_research_adapter_error"] = str(e)
            results["web_research_adapter_latency_ms"] = None
    else:
        results["web_research_adapter_usable"] = None
        results["web_research_adapter_usable_note"] = "disabled by CAD_AGENT_WEB_RESEARCH_ENABLED=false"

    return JSONResponse(status_code=200, content=results)


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
