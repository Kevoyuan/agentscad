"""Retry policy and handoff logic."""

from __future__ import annotations

from dataclasses import dataclass

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
        - Template confidence too low
        - Acceptance criteria conflict
        """
        if job.retry_count >= self.max_retries:
            return True

        if job.template_choice and job.template_choice.confidence < self.min_confidence:
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

        if failed_state == JobState.VALIDATION_FAILED.value:
            return JobState.DEBUGGING

        return job.state
