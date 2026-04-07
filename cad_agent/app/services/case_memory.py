"""Case memory service for storing and recalling successful patterns."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import structlog

from cad_agent.app.models.case import Case

logger = structlog.get_logger()


class CaseMemoryService:
    """Stores successful CAD patterns for future recall."""

    def __init__(
        self,
        storage_dir: str = "storage/cases",
        db_path: str | None = None,
    ):
        """Initialize case memory storage."""
        self.storage_dir = Path(db_path).parent if db_path else Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.index_file = self.storage_dir / "index.json"
        self._ensure_index()

    def _ensure_index(self) -> None:
        """Ensure index file exists."""
        if not self.index_file.exists():
            self.index_file.write_text("[]")

    def store(self, case: Case) -> None:
        """Store a new case in memory."""
        case_path = self.storage_dir / f"{case.id}.json"
        case_path.write_text(case.model_dump_json(indent=2))
        self._add_to_index(case.id)

    def recall(self, case_id: str) -> Optional[Case]:
        """Recall a specific case by ID."""
        case_path = self.storage_dir / f"{case_id}.json"
        if not case_path.exists():
            return None
        data = json.loads(case_path.read_text())
        case = Case.model_validate(data)
        case.recall()
        self.store(case)
        return case

    def find_similar(
        self,
        input_request: str,
        geometric_type: str | None = None,
        template_name: str | None = None,
        limit: int = 5,
    ) -> list[Case]:
        """Find similar cases based on criteria."""
        cases = []
        index = json.loads(self.index_file.read_text())

        for case_id in index:
            case = self.recall(case_id)
            if not case:
                continue

            score = 0
            if geometric_type and case.spec_summary.get("geometric_type") == geometric_type:
                score += 3
            if template_name and case.template_name == template_name:
                score += 2
            if any(
                keyword in input_request.lower()
                for keyword in case.input_request.lower().split()
                if len(keyword) > 4
            ):
                score += 1

            if score > 0:
                cases.append((case, score))

        cases.sort(key=lambda x: x[1], reverse=True)
        return [c for c, _ in cases[:limit]]

    def find_similar_cases(
        self,
        input_request: str,
        geometric_type: str | None = None,
        template_name: str | None = None,
        limit: int = 5,
    ) -> list[Case]:
        """Backward-compatible alias for similar case lookup."""
        return self.find_similar(
            input_request=input_request,
            geometric_type=geometric_type,
            template_name=template_name,
            limit=limit,
        )

    def _add_to_index(self, case_id: str) -> None:
        """Add case ID to index."""
        index = json.loads(self.index_file.read_text())
        if case_id not in index:
            index.append(case_id)
            self.index_file.write_text(json.dumps(index, indent=2))

    def get_stats(self) -> dict[str, Any]:
        """Get case memory statistics."""
        index = json.loads(self.index_file.read_text())
        total = len(index)
        total_usage = 0

        for case_id in index:
            case = self.recall(case_id)
            if case:
                total_usage += case.usage_count

        return {
            "total_cases": total,
            "total_recalls": total_usage,
            "avg_usage": total_usage / total if total > 0 else 0,
        }
