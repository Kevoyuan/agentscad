"""DesignJob and related enums."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator

from cad_agent.app.models.validation import ValidationResult


class JobState(str, Enum):
    """State machine states for DesignJob."""

    NEW = "NEW"
    RESEARCHED = "RESEARCHED"
    INTENT_RESOLVED = "INTENT_RESOLVED"
    DESIGN_RESOLVED = "DESIGN_RESOLVED"
    PARAMETERS_GENERATED = "PARAMETERS_GENERATED"
    GEOMETRY_BUILT = "GEOMETRY_BUILT"
    REVIEWED = "REVIEWED"
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
    RESEARCH_FAILED = "RESEARCH_FAILED"
    INTENT_FAILED = "INTENT_FAILED"
    DESIGN_FAILED = "DESIGN_FAILED"
    PARAMETER_FAILED = "PARAMETER_FAILED"
    GEOMETRY_FAILED = "GEOMETRY_FAILED"
    REVIEW_FAILED = "REVIEW_FAILED"
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

    @property
    def template_id(self) -> str:
        """Backward-compatible template identifier alias."""
        return self.template_name


class ResearchResult(BaseModel):
    """Structured output from ResearchAgent."""

    request: str = ""
    part_family: str = ""
    object_name: str = ""
    object_model: dict[str, Any] = Field(default_factory=dict)
    research_summary: str = ""
    reference_facts: list[str] = Field(default_factory=list)
    reference_dimensions: dict[str, float] = Field(default_factory=dict)
    search_queries: list[str] = Field(default_factory=list)
    open_questions: list[str] = Field(default_factory=list)
    source_notes: list[str] = Field(default_factory=list)
    source_urls: list[str] = Field(default_factory=list)
    needs_web_search: bool = False
    web_research_used: bool = False
    confidence: float = 0.0
    error_message: Optional[str] = None


class IntentResult(BaseModel):
    """Structured output from IntentAgent."""

    request: str = ""
    part_family: str = ""
    object_name: str = ""
    design_mode: str = ""
    primary_goal: str = ""
    secondary_goals: list[str] = Field(default_factory=list)
    constraints: dict[str, Any] = Field(default_factory=dict)
    missing_inputs: list[str] = Field(default_factory=list)
    confidence: float = 0.0
    error_message: Optional[str] = None


class DesignResult(BaseModel):
    """Structured output from DesignAgent."""

    request: str = ""
    part_family: str = ""
    design_intent_summary: str = ""
    design_strategy: str = ""
    structural_features: list[str] = Field(default_factory=list)
    manufacturability_notes: list[str] = Field(default_factory=list)
    parameter_inventions: list[str] = Field(default_factory=list)
    derived_constraints: dict[str, Any] = Field(default_factory=dict)
    confidence: float = 0.0
    error_message: Optional[str] = None


class ParameterDefinition(BaseModel):
    """Single editable parameter exposed to the UI and builders."""

    key: str
    label: str
    kind: str = "number"
    unit: str = ""
    value: Any = None
    min: float | None = None
    max: float | None = None
    step: float | None = None
    source: str = "inferred"
    editable: bool = True
    description: str = ""
    group: str = "general"
    choices: list[str] = Field(default_factory=list)
    derived_from: list[str] = Field(default_factory=list)


class ParameterSchema(BaseModel):
    """Editable parameter schema for a part family."""

    request: str = ""
    part_family: str = ""
    schema_version: str = "v1"
    design_summary: str = ""
    parameters: list[ParameterDefinition] = Field(default_factory=list)
    user_parameters: list[str] = Field(default_factory=list)
    inferred_parameters: list[str] = Field(default_factory=list)
    design_derived_parameters: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    error_message: Optional[str] = None

    def parameter_values(self) -> dict[str, Any]:
        """Return key-value mapping from parameter definitions."""
        return {parameter.key: parameter.value for parameter in self.parameters}


class Artifacts(BaseModel):
    """Paths to generated artifacts."""

    scad_source: Optional[str] = None
    stl_path: Optional[str] = None
    png_path: Optional[str] = None
    render_log: Optional[str] = None
    report_path: Optional[str] = None

    @property
    def scad_content(self) -> Optional[str]:
        """Backward-compatible alias for SCAD source content."""
        return self.scad_source


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
    final_result: Optional[dict[str, Any]] = None

    # Research and intent layers
    research_result: Optional[ResearchResult] = None
    intent_result: Optional[IntentResult] = None
    design_result: Optional[DesignResult] = None
    parameter_schema: Optional[ParameterSchema] = None
    parameter_values: dict[str, Any] = Field(default_factory=dict)
    part_family: Optional[str] = None
    builder_name: Optional[str] = None
    geometry_dsl: Optional[dict[str, Any]] = None
    generation_path: Optional[str] = None

    # Spec from IntakeAgent
    spec: Optional[SpecResult] = None

    # Template choice from TemplateAgent
    template_choice: Optional[TemplateChoice] = None

    # Generated SCAD source
    scad_source: Optional[str] = None

    # Artifact paths
    artifacts: Artifacts = Field(default_factory=Artifacts)

    # Validation results
    validation_results: list[ValidationResult] = Field(default_factory=list)

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

    @field_validator("priority", mode="before")
    @classmethod
    def _coerce_priority(cls, value: Any) -> JobPriority:
        """Accept the API's numeric priority and convert it to the enum."""
        if isinstance(value, JobPriority):
            return value
        if isinstance(value, int):
            if value <= 2:
                return JobPriority.URGENT
            if value <= 4:
                return JobPriority.HIGH
            if value <= 7:
                return JobPriority.NORMAL
            return JobPriority.LOW
        if isinstance(value, str):
            try:
                return JobPriority(value)
            except ValueError:
                return JobPriority.NORMAL
        return JobPriority.NORMAL

    def transition_to(self, new_state: JobState) -> None:
        """Transition to a new state."""
        self.state = new_state
        self.updated_at = datetime.utcnow()

    def add_log(self, log: Any) -> None:
        """Add an execution log entry."""
        if isinstance(log, dict):
            log = ExecutionLog.model_validate(log)
        self.execution_logs.append(log)

    @property
    def template(self) -> Optional[TemplateChoice]:
        """Backward-compatible alias for template_choice."""
        return self.template_choice

    @property
    def scad_content(self) -> Optional[str]:
        """Backward-compatible alias for scad_source."""
        return self.scad_source

    def should_retry(self) -> bool:
        """Check if job should be retried."""
        return self.retry_count < self.max_retries

    def increment_retry(self) -> None:
        """Increment retry counter."""
        self.retry_count += 1
        self.updated_at = datetime.utcnow()

    def set_parameter_values(self, values: dict[str, Any]) -> None:
        """Store mutable parameter values separately from the schema defaults."""
        self.parameter_values = values
        self.updated_at = datetime.utcnow()

    def get_effective_parameter_values(self) -> dict[str, Any]:
        """Return merged parameter values, preferring explicit overrides."""
        values = {}
        if self.parameter_schema:
            values.update(self.parameter_schema.parameter_values())
        values.update(self.parameter_values)
        return values
