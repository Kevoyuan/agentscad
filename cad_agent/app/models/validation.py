"""Validation models."""

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class ValidationLevel(str, Enum):
    """Three-layer validation levels."""

    RENDER = "render"
    ENGINEERING = "engineering"
    BUSINESS = "business"


class RuleType(str, Enum):
    """Types of validation rules."""

    WALL_THICKNESS = "wall_thickness"
    MAX_DIMENSIONS = "max_dimensions"
    SELF_SUPPORTING = "self_supporting"
    THREAD_WALL_THICKNESS = "thread_wall_thickness"
    ASPECT_RATIO = "aspect_ratio"
    SYNTAX = "syntax"
    RENDER = "render"
    COST = "cost"
    TOLERANCE = "tolerance"
    SEMANTIC = "semantic"


class ValidationResult(BaseModel):
    """Result from a single validation rule."""

    rule_id: str
    rule_name: str
    level: ValidationLevel
    rule_type: RuleType
    passed: bool
    severity: str = "error"
    message: str = ""
    measured_value: Optional[float] = None
    threshold_value: Optional[float] = None
    details: dict[str, Any] = Field(default_factory=dict)

    @property
    def is_critical(self) -> bool:
        """Check if this is a critical failure."""
        return not self.passed and self.severity == "error"
