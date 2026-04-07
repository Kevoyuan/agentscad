"""DesignJob and related enums."""

from datetime import datetime
from enum import Enum
from typing import Any, Optional
from uuid import uuid4

from pydantic import BaseModel, Field


class JobState(str, Enum):
    """State machine states for DesignJob."""

    NEW = "NEW"
    SPEC_PARSED = "SPEC_PARSED"
    TEMPLATE_SELECTED = "TEMPLATE_SELECTED"
    SCAD_GENERATED = "SCAD_GENERATED"
    RENDER_REQUESTED = "RENDER_REQUESTED"
    RENDERED = "RENDERED"
    VALIDATED = "VALIDATED"
    ACCEPTED = "ACCEPTED"
    DELIVERED = "DELIVERED"
    ARCHIVED = "ARCHIVED"

    # Failure states
    SPEC_FAILED = "SPEC_FAILED"
    TEMPLATE_FAILED = "TEMPLATE_FAILED"
    RENDER_FAILED = "RENDER_FAILED"
    VALIDATION_FAILED = "VALIDATION_FAILED"
    DEBUGGING = "DEBUGGING"
    REPAIRING = "REPAIRING"
    RE_SPEC = "RE_SPEC"
    HUMAN_REVIEW = "HUMAN_REVIEW"
    CANCELLED = "CANCELLED"


class JobPriority(str, Enum):
    """Priority levels for DesignJobs."""

    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class SpecResult(BaseModel):
    """Result from IntakeAgent parsing natural language to structured spec."""

    success: bool
    request_summary: str = ""
    geometric_type: str = ""
    dimensions: dict[str, float] = Field(default_factory=dict)
    material: str = ""
    tolerance: float = 0.1
    surface_finish: str = ""
    functional_requirements: list[str] = Field(default_factory=list)
    constraints: dict[str, Any] = Field(default_factory=dict)
    cost_target: Optional[float] = None
    quantity: int = 1
    raw_request: str = ""
    confidence: float = 0.0
    error_message: Optional[str] = None


class TemplateChoice(BaseModel):
    """Result from TemplateAgent template selection."""

    success: bool
    template_name: str = ""
    template_version: str = "v1"
    confidence: float = 0.0
    parameters: dict[str, Any] = Field(default_factory=dict)
    reasoning: str = ""
    error_message: Optional[str] = None


class Artifacts(BaseModel):
    """Paths to generated artifacts."""

    scad_source: Optional[str] = None
    stl_path: Optional[str] = None
    png_path: Optional[str] = None
    render_log: Optional[str] = None


class ExecutionLog(BaseModel):
    """Log entry for agent execution."""

    timestamp: datetime = Field(default_factory=datetime.utcnow)
    agent: str = ""
    action: str = ""
    input_data: dict[str, Any] = Field(default_factory=dict)
    output_data: dict[str, Any] = Field(default_factory=dict)
    success: bool = True
    error_message: Optional[str] = None
    duration_ms: int = 0


class RoutingDecision(BaseModel):
    """Decision made by OrchestratorAgent for routing."""

    next_state: JobState
    next_agent: Optional[str] = None
    reason: str = ""
    confidence: float = 1.0
    should_retry: bool = False
    retry_count: int = 0


class DesignJob(BaseModel):
    """Central business object for the CAD Agent System."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    state: JobState = JobState.NEW
    priority: JobPriority = JobPriority.NORMAL

    # Customer request
    customer_id: Optional[str] = None
    session_id: Optional[str] = None
    input_request: str = ""

    # Business context
    business_context: dict[str, Any] = Field(default_factory=dict)

    # Spec from IntakeAgent
    spec: Optional[SpecResult] = None

    # Template choice from TemplateAgent
    template_choice: Optional[TemplateChoice] = None

    # Generated SCAD source
    scad_source: Optional[str] = None

    # Artifact paths
    artifacts: Artifacts = Field(default_factory=Artifacts)

    # Validation results
    validation_results: list[Any] = Field(default_factory=list)

    # Execution log
    execution_logs: list[ExecutionLog] = Field(default_factory=list)

    # Routing decision
    routing_decision: Optional[RoutingDecision] = None

    # Retry tracking
    retry_count: int = 0
    max_retries: int = 3

    # Case memory
    case_id: Optional[str] = None
    similar_case_ids: list[str] = Field(default_factory=list)

    # Audit
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    assigned_to: Optional[str] = None
    notes: list[str] = Field(default_factory=list)

    def transition_to(self, new_state: JobState) -> None:
        """Transition to a new state."""
        self.state = new_state
        self.updated_at = datetime.utcnow()

    def add_log(self, log: ExecutionLog) -> None:
        """Add an execution log entry."""
        self.execution_logs.append(log)

    def should_retry(self) -> bool:
        """Check if job should be retried."""
        return self.retry_count < self.max_retries

    def increment_retry(self) -> None:
        """Increment retry counter."""
        self.retry_count += 1
        self.updated_at = datetime.utcnow()
