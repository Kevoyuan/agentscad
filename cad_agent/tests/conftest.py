"""Pytest configuration and shared fixtures."""

import asyncio
import tempfile
from pathlib import Path

import pytest

from cad_agent.app.models.design_job import DesignJob, JobState
from cad_agent.app.storage.sqlite_repo import SQLiteJobRepository


@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def temp_db():
    """Provide temporary SQLite database for tests."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test.db"
        repo = SQLiteJobRepository(db_path=str(db_path))
        yield repo


@pytest.fixture
def sample_job() -> DesignJob:
    """Provide a sample DesignJob for testing."""
    return DesignJob(
        input_request="Create a hook with 30mm length, 10mm width, PLA material"
    )


@pytest.fixture
def job_with_spec(sample_job: DesignJob) -> DesignJob:
    """Provide a DesignJob with spec already parsed."""
    from cad_agent.app.models.design_job import SpecResult

    sample_job.spec = SpecResult(
        success=True,
        request_summary="Create a hook",
        geometric_type="hook",
        dimensions={"length": 30.0, "width": 10.0, "height": 5.0},
        material="PLA",
        tolerance=0.1,
        functional_requirements=[],
    )
    sample_job.transition_to(JobState.SPEC_PARSED)
    return sample_job


@pytest.fixture
def job_with_template(job_with_spec: DesignJob) -> DesignJob:
    """Provide a DesignJob with template selected."""
    from cad_agent.app.models.design_job import TemplateChoice

    job_with_spec.template_choice = TemplateChoice(
        success=True,
        template_name="hook_basic_v1",
        template_version="v1",
        confidence=0.9,
        parameters={"length": 30.0, "width": 10.0},
    )
    job_with_spec.transition_to(JobState.TEMPLATE_SELECTED)
    return job_with_spec


@pytest.fixture
def job_with_scad(job_with_template: DesignJob) -> DesignJob:
    """Provide a DesignJob with SCAD source generated."""
    job_with_template.scad_source = """
// Generated hook design
length = 30;
width = 10;
height = 5;

difference() {
    cylinder(h=height, r=width/2, center=true);
    translate([0, 0, -height])
        cylinder(h=height*2, r=width/3, center=true);
}
"""
    job_with_template.transition_to(JobState.SCAD_GENERATED)
    return job_with_template


@pytest.fixture
def sample_scad_source() -> str:
    """Provide sample OpenSCAD source code."""
    return """
// Simple hook design
length = 30;
width = 10;
height = 5;

difference() {
    cylinder(h=height, r=width/2, center=true);
    translate([0, 0, -height])
        cylinder(h=height*2, r=width/3, center=true);
}
"""
