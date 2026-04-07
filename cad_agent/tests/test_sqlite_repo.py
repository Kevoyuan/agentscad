import pytest
from pathlib import Path
from datetime import datetime

from cad_agent.app.storage.sqlite_repo import SQLiteJobRepository
from cad_agent.app.models.design_job import (
    DesignJob,
    JobState,
    SpecResult,
    TemplateChoice,
    Artifacts,
    ExecutionLog,
    RoutingDecision,
)


@pytest.fixture
def temp_db_path(tmp_path):
    return tmp_path / "test_jobs.db"


@pytest.fixture
def repo(temp_db_path):
    return SQLiteJobRepository(db_path=str(temp_db_path))


@pytest.fixture
def sample_job():
    return DesignJob(
        id="job-001",
        state=JobState.NEW,
        input_request="Create a parametric box with rounded corners",
        spec=SpecResult(
            success=True,
            request_summary="Box with dimensions",
            geometric_type="box",
            dimensions={"width": 10.0, "height": 5.0, "depth": 3.0},
            material="PLA",
            tolerance=0.1,
            surface_finish="matte",
            functional_requirements=[],
            constraints={},
            cost_target=25.0,
            quantity=1,
            raw_request="Create a box",
            confidence=0.95,
        ),
        template_choice=TemplateChoice(
            success=True,
            template_name="rectangular_primitives",
            confidence=0.95,
            parameters={"width": 10, "height": 5, "depth": 3},
            reasoning="Simple rectangular geometry detected",
        ),
        scad_source="$fn=50;\nmodule box() { cube([10, 5, 3]); }\nbox();",
        artifacts=Artifacts(
            scad_source="$fn=50;\nmodule box() { cube([10, 5, 3]); }\nbox();",
            stl_path="/output/job-001.stl",
            png_path="/output/job-001.png",
        ),
        execution_logs=[
            ExecutionLog(
                timestamp=datetime.utcnow(),
                agent="intake",
                action="process",
                input_data={"request": "Create a box"},
                output_data={"dimensions": {"width": 10, "height": 5, "depth": 3}},
                success=True,
            )
        ],
        retry_count=0,
        case_id=None,
    )


class TestSQLiteJobRepository:
    def test_save_and_get_job(self, repo, sample_job):
        repo.save(sample_job)
        retrieved = repo.get("job-001")
        
        assert retrieved is not None
        assert retrieved.id == sample_job.id
        assert retrieved.state == sample_job.state
        assert retrieved.input_request == sample_job.input_request

    def test_get_job_not_found(self, repo):
        result = repo.get("nonexistent")
        assert result is None

    def test_list_jobs(self, repo, sample_job):
        repo.save(sample_job)
        jobs = repo.list()
        
        assert len(jobs) == 1
        assert jobs[0].id == "job-001"

    def test_list_jobs_by_state(self, repo, sample_job):
        repo.save(sample_job)
        jobs = repo.list(state=JobState.NEW)
        
        assert len(jobs) == 1
        assert jobs[0].id == "job-001"

    def test_list_jobs_by_state_none(self, repo, sample_job):
        repo.save(sample_job)
        jobs = repo.list(state=JobState.RENDERED)
        
        assert len(jobs) == 0

    def test_list_jobs_limit(self, repo, temp_db_path):
        for i in range(5):
            job = DesignJob(
                id=f"job-{i:03d}",
                state=JobState.NEW,
                input_request=f"Request {i}",
            )
            repo.save(job)
        
        jobs = repo.list(limit=3)
        assert len(jobs) == 3

    def test_save_job_updates_existing(self, repo, sample_job):
        repo.save(sample_job)
        
        sample_job.state = JobState.SPEC_PARSED
        repo.save(sample_job)
        
        retrieved = repo.get("job-001")
        assert retrieved.state == JobState.SPEC_PARSED

    def test_minimal_job(self, repo):
        minimal_job = DesignJob(
            id="minimal-001",
            state=JobState.NEW,
            input_request="box",
        )
        repo.save(minimal_job)
        retrieved = repo.get("minimal-001")
        
        assert retrieved is not None
        assert retrieved.spec is None
        assert retrieved.template_choice is None

    def test_job_with_spec(self, repo, sample_job):
        repo.save(sample_job)
        retrieved = repo.get("job-001")
        
        assert retrieved.spec is not None
        assert retrieved.spec.dimensions["width"] == 10.0
        assert retrieved.template_choice.template_name == "rectangular_primitives"

    def test_job_with_artifacts(self, repo, sample_job):
        repo.save(sample_job)
        retrieved = repo.get("job-001")
        
        assert retrieved.artifacts is not None
        assert retrieved.artifacts.stl_path == "/output/job-001.stl"
        assert retrieved.artifacts.png_path == "/output/job-001.png"

    def test_job_with_execution_logs(self, repo, sample_job):
        repo.save(sample_job)
        retrieved = repo.get("job-001")
        
        assert len(retrieved.execution_logs) == 1
        assert retrieved.execution_logs[0].agent == "intake"
        assert retrieved.execution_logs[0].success is True
