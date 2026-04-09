"""AgentResult unified return type."""

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class AgentRole(str, Enum):
    """Roles for agents in the system."""

    ORCHESTRATOR = "orchestrator"
    RESEARCH = "research"
    INTAKE = "intake"
    INTENT = "intent"
    DESIGN = "design"
    PARAMETERS = "parameters"
    TEMPLATE = "template"
    GENERATOR = "generator"
    EXECUTOR = "executor"
    VALIDATOR = "validator"
    DEBUG = "debug"
    REPORT = "report"


class AgentResult(BaseModel):
    """Unified return type for all agent operations."""

    success: bool
    agent: AgentRole
    state_reached: str
    data: dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None
    warnings: list[str] = Field(default_factory=list)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    duration_ms: int = 0

    @property
    def state(self) -> str:
        """Alias for state_reached."""
        return self.state_reached
