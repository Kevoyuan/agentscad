"""Shared models for the redesign pipeline."""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class PartFamily(str, Enum):
    """Supported parametric part families."""

    SPUR_GEAR = "spur_gear"
    DEVICE_STAND = "device_stand"
    ELECTRONICS_ENCLOSURE = "electronics_enclosure"
    PHONE_CASE = "phone_case"
    UNKNOWN = "unknown"


class ParameterSource(str, Enum):
    """Where a parameter originated from."""

    USER = "user"
    RESEARCH = "research"
    INFERRED = "inferred"
    DESIGN_DERIVED = "design_derived"
    OPTIONAL = "optional"


class ParameterKind(str, Enum):
    """Parameter data kinds."""

    NUMBER = "number"
    INTEGER = "integer"
    STRING = "string"
    BOOLEAN = "boolean"
    CHOICE = "choice"


class ParameterDefinition(BaseModel):
    """A single editable or derived parameter."""

    key: str
    label: str
    kind: ParameterKind = ParameterKind.NUMBER
    unit: str = ""
    value: Any
    min: float | None = None
    max: float | None = None
    step: float | None = None
    source: ParameterSource = ParameterSource.INFERRED
    editable: bool = True
    description: str = ""
    group: str = "general"
    choices: list[str] = Field(default_factory=list)
    derived_from: list[str] = Field(default_factory=list)


class ResearchResult(BaseModel):
    """Structured research and reference discovery output."""

    request: str
    part_family: PartFamily = PartFamily.UNKNOWN
    object_name: str = ""
    object_model: dict[str, Any] = Field(default_factory=dict)
    research_summary: str = ""
    reference_facts: list[str] = Field(default_factory=list)
    reference_dimensions: dict[str, float] = Field(default_factory=dict)
    search_queries: list[str] = Field(default_factory=list)
    open_questions: list[str] = Field(default_factory=list)
    source_notes: list[str] = Field(default_factory=list)
    source_urls: list[str] = Field(default_factory=list)
    image_analysis_summaries: list[str] = Field(default_factory=list)
    image_reference_used: bool = False
    needs_web_search: bool = False
    web_research_used: bool = False
    confidence: float = 0.5


class IntentResult(BaseModel):
    """Structured intent and family classification."""

    request: str
    part_family: PartFamily = PartFamily.UNKNOWN
    object_name: str = ""
    design_mode: str = ""
    primary_goal: str = ""
    secondary_goals: list[str] = Field(default_factory=list)
    constraints: dict[str, Any] = Field(default_factory=dict)
    missing_inputs: list[str] = Field(default_factory=list)
    confidence: float = 0.5


class DesignResult(BaseModel):
    """Design concept and geometry planning output."""

    request: str
    part_family: PartFamily = PartFamily.UNKNOWN
    design_intent_summary: str = ""
    design_strategy: str = ""
    structural_features: list[str] = Field(default_factory=list)
    manufacturability_notes: list[str] = Field(default_factory=list)
    parameter_inventions: list[str] = Field(default_factory=list)
    derived_constraints: dict[str, Any] = Field(default_factory=dict)
    confidence: float = 0.5


class ParameterSchemaResult(BaseModel):
    """Editable parameter schema for a part family."""

    request: str
    part_family: PartFamily = PartFamily.UNKNOWN
    schema_version: str = "v1"
    design_summary: str = ""
    parameters: list[ParameterDefinition] = Field(default_factory=list)
    user_parameters: list[str] = Field(default_factory=list)
    inferred_parameters: list[str] = Field(default_factory=list)
    design_derived_parameters: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
