"""Tests for DesignJob model and state machine."""

import pytest
from datetime import datetime

from cad_agent.app.models.design_job import (
    DesignJob,
    JobState,
    JobPriority,
    SpecResult,
    Artifacts,
    ExecutionLog,
    RoutingDecision,
)


class TestJobStateTransitions:
    """Test DesignJob state transitions."""

    def test_new_job_has_new_state(self):
        """Newly created job should be in NEW state."""
        job = DesignJob(input_request="test request")
        assert job.state == JobState.NEW

    def test_transition_to_updates_state_and_timestamp(self):
        """Transition should update state and updated_at."""
        job = DesignJob(input_request="test")
        original_updated = job.updated_at

        job.transition_to(JobState.SPEC_PARSED)
        assert job.state == JobState.SPEC_PARSED
        assert job.updated_at >= original_updated

    def test_transition_to_changes_enum_value(self):
        """Transition should accept JobState enum values."""
        job = DesignJob(input_request="test")
        job.transition_to(JobState.SCAD_GENERATED)
        assert job.state == JobState.SCAD_GENERATED
        assert job.state.value == "SCAD_GENERATED"

    def test_terminal_states_reached(self):
        """Test all terminal states."""
        terminal_cases = [
            JobState.DELIVERED,
            JobState.ARCHIVED,
            JobState.HUMAN_REVIEW,
            JobState.CANCELLED,
        ]
        for state in terminal_cases:
            job = DesignJob(input_request="test")
            job.transition_to(state)
            assert job.state == state


class TestRetryLogic:
    """Test retry-related methods."""

    def test_should_retry_false_when_count_zero(self):
        """Job with 0 retries should not retry by default."""
        job = DesignJob(input_request="test", max_retries=3)
        assert job.retry_count == 0
        assert job.should_retry() is True

    def test_should_retry_false_when_count_equals_max(self):
        """Job at max retries should not retry."""
        job = DesignJob(input_request="test", max_retries=3, retry_count=3)
        assert job.should_retry() is False

    def test_increment_retry_increments_counter(self):
        """Increment retry should increase retry_count."""
        job = DesignJob(input_request="test", max_retries=3)
        assert job.retry_count == 0
        job.increment_retry()
        assert job.retry_count == 1
        job.increment_retry()
        assert job.retry_count == 2

    def test_increment_retry_updates_timestamp(self):
        """Increment retry should update updated_at."""
        job = DesignJob(input_request="test")
        original = job.updated_at
        job.increment_retry()
        assert job.updated_at >= original


class TestExecutionLog:
    """Test execution log functionality."""

    def test_add_log_appends_to_logs(self):
        """Add log should append ExecutionLog entry."""
        job = DesignJob(input_request="test")
        assert len(job.execution_logs) == 0

        job.add_log(
            ExecutionLog(
                agent="intake",
                action="process",
                input_data={"request": "test"},
                output_data={"spec": {}},
            )
        )
        assert len(job.execution_logs) == 1
        assert job.execution_logs[0].agent == "intake"

    def test_add_log_with_dict(self):
        """Add log should accept dict-like log entries."""
        job = DesignJob(input_request="test")
        job.add_log(
            {
                "agent": "generator",
                "action": "generate",
                "success": True,
                "state_reached": "SCAD_GENERATED",
            }
        )
        assert len(job.execution_logs) == 1


class TestSpecResult:
    """Test SpecResult model."""

    def test_spec_result_defaults(self):
        """Test SpecResult default values."""
        spec = SpecResult(success=True, request_summary="test")
        assert spec.success is True
        assert spec.dimensions == {}
        assert spec.functional_requirements == []

    def test_spec_result_with_dimensions(self):
        """Test SpecResult with parsed dimensions."""
        spec = SpecResult(
            success=True,
            request_summary="hook design",
            geometric_type="hook",
            dimensions={"length": 30.0, "width": 10.0},
            material="PLA",
            tolerance=0.1,
        )
        assert spec.dimensions["length"] == 30.0
        assert spec.material == "PLA"


class TestArtifacts:
    """Test Artifacts model."""

    def test_artifacts_defaults(self):
        """Test Artifacts default values."""
        artifacts = Artifacts()
        assert artifacts.scad_source is None
        assert artifacts.stl_path is None
        assert artifacts.png_path is None

    def test_artifacts_with_paths(self):
        """Test Artifacts with file paths."""
        artifacts = Artifacts(
            scad_source="/path/to/design.scad",
            stl_path="/path/to/design.stl",
            png_path="/path/to/design.png",
        )
        assert artifacts.scad_source == "/path/to/design.scad"
        assert artifacts.stl_path == "/path/to/design.stl"
