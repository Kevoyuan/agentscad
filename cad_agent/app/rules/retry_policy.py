"""Retry policy and handoff logic."""

from __future__ import annotations

from dataclasses import dataclass

from cad_agent.app.llm.pipeline_utils import has_resolved_part_family
from cad_agent.app.models.design_job import DesignJob, JobState


@dataclass
class RetryPolicy:
    """Defines retry behavior and handoff conditions."""

    max_retries: int = 3
    min_confidence: float = 0.6

    def should_human_handoff(self, job: DesignJob) -> bool:
        """Determine if job should be handed off to human.

        Conditions:
        - Retry count exceeded
        - Acceptance criteria conflict
        """
        if job.retry_count >= self.max_retries:
            return True

        intent_confidence = getattr(job.intent_result, "confidence", None)
        intent_part_family = getattr(job.intent_result, "part_family", None)
        if intent_confidence is not None and has_resolved_part_family(intent_part_family) and intent_confidence < self.min_confidence:
            return True

        if not has_resolved_part_family(job.part_family) and not job.spec and job.retry_count > 0:
            return True

        return False

    def should_retry(self, job: DesignJob) -> bool:
        """Determine if a failed job should be retried."""
        return job.retry_count < self.max_retries

    def get_next_state_after_failure(
        self,
        job: DesignJob,
        failed_state: str | None = None,
    ) -> JobState:
        """Determine the next state after a failure."""
        if job.retry_count >= self.max_retries:
            return JobState.HUMAN_REVIEW

        if failed_state in {JobState.VALIDATION_FAILED.value, JobState.REVIEW_FAILED.value}:
            return JobState.DEBUGGING

        if failed_state == JobState.GEOMETRY_FAILED.value:
            return JobState.REPAIRING

        if failed_state == JobState.PARAMETER_FAILED.value:
            return JobState.DESIGN_RESOLVED

        if failed_state == JobState.DESIGN_FAILED.value:
            return JobState.INTENT_RESOLVED

        if failed_state == JobState.INTENT_FAILED.value:
            return JobState.RESEARCHED

        return job.state
