"""CLI interface for CAD Agent System."""
import asyncio
import sys
from pathlib import Path
from typing import Optional

import click
import structlog

from cad_agent.config import get_settings
from cad_agent.app.models.design_job import DesignJob, JobState
from cad_agent.app.agents.orchestrator import OrchestratorAgent
from cad_agent.app.agents.research_agent import ResearchAgent
from cad_agent.app.agents.intake_agent import IntakeAgent
from cad_agent.app.agents.intent_agent import IntentAgent
from cad_agent.app.agents.design_agent import DesignAgent
from cad_agent.app.agents.parameter_schema_agent import ParameterSchemaAgent
from cad_agent.app.agents.template_agent import TemplateAgent
from cad_agent.app.agents.generator_agent import GeneratorAgent
from cad_agent.app.agents.executor_agent import ExecutorAgent
from cad_agent.app.agents.validator_agent import ValidatorAgent
from cad_agent.app.agents.debug_agent import DebugAgent
from cad_agent.app.agents.report_agent import ReportAgent
from cad_agent.app.parametric import ParametricPartEngine
from cad_agent.app.rules.engineering_rules import EngineeringRulesEngine
from cad_agent.app.rules.retry_policy import RetryPolicy
from cad_agent.app.storage.sqlite_repo import SQLiteJobRepository
from cad_agent.app.services.case_memory import CaseMemoryService
from cad_agent.app.tools.openscad_executor import OpenSCADExecutor
from cad_agent.app.research import MiniMaxWebSearchAdapter
from cad_agent.app.llm import (
    AnthropicCompatibleLLMClient,
    LLMDesignCritic,
    LLMScadGenerator,
    LLMSpecParser,
)

settings = get_settings()
logger = structlog.get_logger()


class CliContext:
    """CLI context containing initialized services."""

    def __init__(self):
        self.orchestrator: Optional[OrchestratorAgent] = None
        self.job_repo: Optional[SQLiteJobRepository] = None
        self.case_memory: Optional[CaseMemoryService] = None


pass_context = click.make_pass_decorator(CliContext, ensure=True)


def init_services(ctx: CliContext) -> None:
    """Initialize all services."""
    settings.ensure_directories()

    rules_engine = EngineeringRulesEngine()
    retry_policy = RetryPolicy()
    ctx.case_memory = CaseMemoryService(db_path=str(settings.get_case_db_path()))
    ctx.job_repo = SQLiteJobRepository(db_path=str(settings.get_job_db_path("_cli")))

    openscad_executor = OpenSCADExecutor(
        openscad_path=str(settings.openSCAD_path),
        timeout_seconds=settings.render_timeout,
    )

    llm_spec_parser = None
    llm_scad_generator = None
    llm_design_critic = None
    try:
        provider_config = settings.resolve_llm_provider_config()
        if provider_config.is_anthropic_compatible:
            llm_client = AnthropicCompatibleLLMClient(provider_config)
            llm_spec_parser = LLMSpecParser(llm_client)
            llm_scad_generator = LLMScadGenerator(llm_client)
            llm_design_critic = LLMDesignCritic(llm_client)
    except ValueError:
        llm_spec_parser = None
        llm_scad_generator = None
        llm_design_critic = None

    web_research_adapter = None
    if settings.web_research_enabled:
        web_research_adapter = MiniMaxWebSearchAdapter(
            timeout_seconds=settings.web_research_timeout,
            user_agent=settings.web_research_user_agent,
        )

    part_engine = ParametricPartEngine()
    research_agent = ResearchAgent(web_research_adapter=web_research_adapter)
    intake_agent = IntakeAgent(spec_parser=llm_spec_parser)
    intent_agent = IntentAgent()
    design_agent = DesignAgent()
    parameter_schema_agent = ParameterSchemaAgent()
    template_agent = TemplateAgent()
    generator_agent = GeneratorAgent(
        templates_dir=str(settings.templates_dir),
        llm_scad_generator=llm_scad_generator,
        part_engine=part_engine,
    )
    executor_agent = ExecutorAgent(executor=openscad_executor)
    validator_agent = ValidatorAgent(
        rules_engine=rules_engine,
        design_critic=llm_design_critic,
    )
    debug_agent = DebugAgent()
    report_agent = ReportAgent(output_dir=str(settings.output_dir))

    orchestrator = OrchestratorAgent(retry_policy=retry_policy, case_memory=ctx.case_memory)
    orchestrator.set_agents(
        research=research_agent,
        intake=intake_agent,
        intent=intent_agent,
        design=design_agent,
        parameters=parameter_schema_agent,
        template=template_agent,
        generator=generator_agent,
        executor=executor_agent,
        validator=validator_agent,
        debug=debug_agent,
        report=report_agent,
    )
    ctx.orchestrator = orchestrator


@click.group()
@click.option("--verbose", "-v", is_flag=True, help="Enable verbose logging")
@click.pass_context
def cli(ctx: click.Context, verbose: bool) -> None:
    """CAD Agent CLI - Business-Closed-Loop CAD System for OpenSCAD."""
    ctx.ensure_object(CliContext)
    if verbose:
        import logging
        structlog.configure(
            wrapper_class=structlog.make_filtering_bound_logger(logging.DEBUG),
        )
    init_services(ctx.obj)


@cli.command()
@click.argument("request")
@click.option("--customer-id", "-c", help="Customer ID for case memory")
@click.option("--priority", "-p", default=5, type=click.IntRange(1, 10), help="Job priority (1-10)")
@click.option("--sync/--no-sync", default=False, help="Run synchronously (don't background)")
@pass_context
def create(
    ctx: CliContext,
    request: str,
    customer_id: Optional[str],
    priority: int,
    sync: bool,
) -> None:
    """Create a new CAD job from natural language request."""
    job = DesignJob(
        input_request=request,
        customer_id=customer_id,
        priority=priority,
    )

    ctx.job_repo.save(job)
    click.echo(f"Created job: {job.id}")
    click.echo(f"State: {job.state.value}")
    click.echo(f"Request: {request[:100]}{'...' if len(request) > 100 else ''}")

    if sync:
        click.echo("\nProcessing job...")
        result = asyncio.run(ctx.orchestrator.process(job))
        ctx.job_repo.save(job)

        click.echo(f"\nProcessing complete!")
        click.echo(f"Final state: {job.state.value}")
        click.echo(f"Success: {result.success}")

        if job.artifacts:
            click.echo(f"\nArtifacts:")
            if job.artifacts.stl_path:
                click.echo(f"  STL: {job.artifacts.stl_path}")
            if job.artifacts.png_path:
                click.echo(f"  PNG: {job.artifacts.png_path}")

        if job.validation_results:
            click.echo(f"\nValidation results:")
            for v in job.validation_results:
                status = "PASS" if v.passed else "FAIL"
                click.echo(f"  [{status}] {v.rule_id}: {v.message}")

        if result.error:
            click.echo(f"\nError: {result.error}")
    else:
        click.echo(f"\nUse 'cad-agent status {job.id}' to check status")
        click.echo(f"Use 'cad-agent process {job.id}' to process the job")


@cli.command()
@click.argument("job_id")
@pass_context
def process(ctx: CliContext, job_id: str) -> None:
    """Process a job through the state machine."""
    job = ctx.job_repo.get(job_id)
    if not job:
        click.echo(f"Error: Job {job_id} not found", err=True)
        sys.exit(1)

    if job.state not in {JobState.NEW, JobState.RESEARCH_FAILED, JobState.INTENT_FAILED, JobState.DESIGN_FAILED, JobState.PARAMETER_FAILED, JobState.SPEC_FAILED, JobState.GEOMETRY_FAILED, JobState.REVIEW_FAILED}:
        click.echo(f"Error: Job is in state {job.state.value}, cannot process", err=True)
        sys.exit(1)

    click.echo(f"Processing job {job_id}...")
    click.echo(f"Starting state: {job.state.value}")
    click.echo("")

    result = asyncio.run(ctx.orchestrator.process(job))
    ctx.job_repo.save(job)

    click.echo(f"\nProcessing complete!")
    click.echo(f"Final state: {job.state.value}")
    click.echo(f"Success: {result.success}")

    if job.artifacts:
        click.echo(f"\nArtifacts:")
        if job.artifacts.stl_path:
            click.echo(f"  STL: {job.artifacts.stl_path}")
        if job.artifacts.png_path:
            click.echo(f"  PNG: {job.artifacts.png_path}")

    if job.validation_results:
        click.echo(f"\nValidation results:")
        for v in job.validation_results:
            status = "PASS" if v.passed else "FAIL"
            prefix = "[CRITICAL] " if v.is_critical else ""
            click.echo(f"  [{status}] {prefix}{v.rule_id}: {v.message}")

    if result.error:
        click.echo(f"\nError: {result.error}")


@cli.command()
@click.argument("job_id")
@click.option("--format", "-f", type=click.Choice(["short", "full"]), default="short")
@pass_context
def status(ctx: CliContext, job_id: str, format: str) -> None:
    """Get the status of a job."""
    job = ctx.job_repo.get(job_id)
    if not job:
        click.echo(f"Error: Job {job_id} not found", err=True)
        sys.exit(1)

    click.echo(f"Job ID: {job.id}")
    click.echo(f"State: {job.state.value}")
    click.echo(f"Retry count: {job.retry_count}/{job.max_retries}")
    click.echo(f"Created: {job.created_at}")
    click.echo(f"Updated: {job.updated_at}")
    click.echo(f"\nRequest: {job.input_request[:200]}{'...' if len(job.input_request) > 200 else ''}")

    if job.spec:
        click.echo(f"\nSpec parsed:")
        click.echo(f"  Type: {job.spec.geometric_type}")
        click.echo(f"  Dimensions: {job.spec.dimensions}")
        click.echo(f"  Material: {job.spec.material}")
        click.echo(f"  Confidence: {job.spec.confidence:.2f}")

    if job.part_family:
        click.echo(f"\nPart family: {job.part_family}")
    if job.builder_name:
        click.echo(f"Builder: {job.builder_name}")
    if job.parameter_schema:
        click.echo(f"Parameters: {len(job.parameter_schema.parameters)} exposed")

    if job.template_choice:
        click.echo(f"\nTemplate: {job.template_choice.template_id}")

    if job.artifacts:
        click.echo(f"\nArtifacts:")
        if job.artifacts.stl_path:
            click.echo(f"  STL: {job.artifacts.stl_path}")
        if job.artifacts.png_path:
            click.echo(f"  PNG: {job.artifacts.png_path}")

    if format == "full" and job.validation_results:
        click.echo(f"\nValidation results:")
        for v in job.validation_results:
            status = "PASS" if v.passed else "FAIL"
            click.echo(f"  [{status}] {v.rule_id}: {v.message}")

    if format == "full" and job.execution_logs:
        click.echo(f"\nExecution logs:")
        for log in job.execution_logs[-10:]:
            click.echo(f"  [{log.agent}] {log.action} -> {log.state_reached} ({'OK' if log.success else 'FAIL'})")


@cli.command()
@click.argument("job_id")
@click.argument("artifact_type", type=click.Choice(["stl", "png", "scad"]))
@click.option("--output", "-o", type=click.Path(), help="Output file path")
@pass_context
def download(ctx: CliContext, job_id: str, artifact_type: str, output: Optional[str]) -> None:
    """Download job artifacts."""
    job = ctx.job_repo.get(job_id)
    if not job:
        click.echo(f"Error: Job {job_id} not found", err=True)
        sys.exit(1)

    if not job.artifacts:
        click.echo("Error: No artifacts for this job", err=True)
        sys.exit(1)

    if artifact_type == "scad":
        content = job.artifacts.scad_content
        if not content:
            click.echo("Error: No SCAD content", err=True)
            sys.exit(1)
        output_path = Path(output) if output else Path(f"{job_id}.scad")
        output_path.write_text(content)
        click.echo(f"Saved SCAD to: {output_path}")
        return

    artifact_path = getattr(job.artifacts, f"{artifact_type}_path", None)
    if not artifact_path:
        click.echo(f"Error: No {artifact_type} artifact", err=True)
        sys.exit(1)

    artifact_path = Path(artifact_path)
    if not artifact_path.exists():
        click.echo(f"Error: Artifact file not found: {artifact_path}", err=True)
        sys.exit(1)

    if output:
        import shutil
        output_path = Path(output)
        shutil.copy(artifact_path, output_path)
        click.echo(f"Copied {artifact_type} to: {output_path}")
    else:
        click.echo(f"{artifact_type.upper()} artifact: {artifact_path}")


@cli.command()
@click.option("--state", "-s", type=click.Choice([s.value for s in JobState]))
@click.option("--limit", "-l", default=20, type=click.IntRange(1, 100))
@click.option("--offset", "-d", default=0, type=int)
@pass_context
def list_jobs(ctx: CliContext, state: Optional[str], limit: int, offset: int) -> None:
    """List jobs with optional filtering."""
    state_filter = JobState(state) if state else None
    jobs = ctx.job_repo.list_jobs(state_filter=state_filter, limit=limit, offset=offset)

    if not jobs:
        click.echo("No jobs found")
        return

    click.echo(f"Jobs (showing {len(jobs)}, offset {offset}):\n")

    for job in jobs:
        spec_info = ""
        if job.spec:
            spec_info = f" - {job.spec.geometric_type}"

        click.echo(f"[{job.state.value:20}] {job.id[:8]}... {spec_info} (retries: {job.retry_count})")


@cli.command()
@click.argument("request")
@click.option("--limit", "-l", default=5, type=click.IntRange(1, 20))
@pass_context
def similar(ctx: CliContext, request: str, limit: int) -> None:
    """Find similar cases from case memory."""
    if not settings.case_memory_enabled:
        click.echo("Error: Case memory is disabled", err=True)
        sys.exit(1)

    cases = ctx.case_memory.find_similar_cases(request, limit=limit)

    if not cases:
        click.echo("No similar cases found")
        return

    click.echo(f"Found {len(cases)} similar cases:\n")

    for case in cases:
        click.echo(f"Case: {case.id}")
        click.echo(f"  Template: {case.template_name}")
        click.echo(f"  Request: {case.input_request[:100]}...")
        click.echo(f"  Uses: {case.usage_count}")
        click.echo(f"  Tags: {', '.join(case.tags) if case.tags else 'none'}")
        click.echo("")


@cli.command()
@click.argument("job_id")
@pass_context
def cancel(ctx: CliContext, job_id: str) -> None:
    """Cancel a job."""
    job = ctx.job_repo.get(job_id)
    if not job:
        click.echo(f"Error: Job {job_id} not found", err=True)
        sys.exit(1)

    if job.state in {JobState.DELIVERED, JobState.ARCHIVED}:
        click.echo(f"Error: Cannot cancel job in state {job.state.value}", err=True)
        sys.exit(1)

    job.transition_to(JobState.CANCELLED)
    ctx.job_repo.save(job)

    click.echo(f"Job {job_id} cancelled (now in state {job.state.value})")


@cli.command()
def templates() -> None:
    """List available templates."""
    templates_dir = Path(settings.templates_dir)

    if not templates_dir.exists():
        click.echo("Templates directory not found")
        return

    template_files = list(templates_dir.glob("*.scad.j2"))

    if not template_files:
        click.echo("No templates found")
        return

    click.echo("Available templates:\n")

    for template_file in template_files:
        template_name = template_file.stem.replace("_basic_v1", "").replace("_", " ").title()
        click.echo(f"  {template_file.stem:30} - {template_name}")


@cli.command()
def info() -> None:
    """Show system information."""
    provider_config = settings.resolve_llm_provider_config(validate_api_key=False)
    click.echo("CAD Agent System Configuration:")
    click.echo(f"  OpenSCAD path: {settings.openSCAD_path}")
    click.echo(f"  Storage dir: {settings.storage_dir}")
    click.echo(f"  Output dir: {settings.output_dir}")
    click.echo(f"  Templates dir: {settings.templates_dir}")
    click.echo(f"  Max retries: {settings.max_retries}")
    click.echo(f"  Case memory: {'enabled' if settings.case_memory_enabled else 'disabled'}")
    click.echo(f"  LLM provider: {provider_config.provider}")
    click.echo(f"  LLM model: {provider_config.model}")
    click.echo(f"  LLM base URL: {provider_config.base_url}")


def main():
    """Entry point."""
    cli(obj=CliContext())


if __name__ == "__main__":
    main()
