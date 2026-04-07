"""Case memory model for storing successful patterns."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class Case(BaseModel):
    """Case memory entry for successful CAD patterns."""

    id: str
    input_request: str
    spec_summary: str
    template_name: str
    final_parameters: dict[str, Any]
    failures_seen: list[str] = Field(default_factory=list)
    successful_repairs: list[dict[str, Any]] = Field(default_factory=list)
    outcome: str = "success"
    usage_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_used_at: datetime = Field(default_factory=datetime.utcnow)
    tags: list[str] = Field(default_factory=list)

    def recall(self) -> None:
        """Increment usage count when case is recalled."""
        self.usage_count += 1
        self.last_used_at = datetime.utcnow()

    def add_failure(self, failure: str) -> None:
        """Record a failure pattern."""
        if failure not in self.failures_seen:
            self.failures_seen.append(failure)

    def add_repair(self, repair: dict[str, Any]) -> None:
        """Record a successful repair pattern."""
        self.successful_repairs.append(repair)
