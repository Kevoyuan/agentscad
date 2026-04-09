from cad_agent.app.models.design_job import DesignJob
from cad_agent.app.rules.retry_policy import RetryPolicy
from cad_agent.app.storage.sqlite_repo import SQLiteJobRepository


def test_empty_intent_result_json_round_trips_to_none(tmp_path):
    repo = SQLiteJobRepository(db_path=str(tmp_path / "jobs.db"))
    job = DesignJob(input_request="gear request")
    repo.save(job)

    loaded = repo.get(job.id)

    assert loaded is not None
    assert loaded.intent_result is None
    assert loaded.research_result is None
    assert loaded.design_result is None
    assert loaded.parameter_schema is None


def test_retry_policy_ignores_empty_intent_shell():
    job = DesignJob(input_request="gear request")
    policy = RetryPolicy()

    assert policy.should_human_handoff(job) is False
