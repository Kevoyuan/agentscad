"""Retry policy and handoff logic."""

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

        spec = job.spec
        if spec and spec.cost_target:
            if spec.cost_target < 10.0:
                return True

        return False

    def should_retry(self, job: DesignJob) -> bool:
        """Determine if a failed job should be retried."""
        return job.retry_count < self.max_retries

    def get_next_state_after_failure(self, job: DesignJob) -> JobState:
        """Determine the next state after a failure."""
        if job.retry_count >= self.max_retries:
            return JobState.HUMAN_REVIEW

        current_state = job.state

        if current_state == JobState.SPEC_PARSED:
            return JobState.SPEC_FAILED
        elif current_state == JobState.TEMPLATE_SELECTED:
            return JobState.TEMPLATE_FAILED
        elif current_state == JobState.SCAD_GENERATED:
            return JobState.RENDER_FAILED
        elif current_state == JobState.RENDERED:
            return JobState.VALIDATION_FAILED
        elif current_state == JobState.VALIDATED:
            return JobState.DEBUGGING

        return JobState.HUMAN_REVIEW
