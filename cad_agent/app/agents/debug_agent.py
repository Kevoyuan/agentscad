"""Debug agent - diagnoses failures and suggests repairs."""

import time

import structlog

from cad_agent.app.models.agent_result import AgentResult, AgentRole
from cad_agent.app.models.design_job import DesignJob, JobState

logger = structlog.get_logger()


class DebugAgent:
    """Diagnoses validation failures and suggests repairs."""

    async def diagnose(self, job: DesignJob) -> AgentResult:
        """Diagnose validation failures and determine repair strategy.

        Args:
            job: DesignJob in DEBUGGING state with validation failures

        Returns:
            AgentResult with diagnosis and suggested repairs
        """
        start_time = time.time()
        logger.info("debugging_design", job_id=job.id)

        if not job.validation_results:
            return AgentResult(
                success=False,
                agent=AgentRole.DEBUG,
                state_reached=job.state.value,
                error="No validation failures to diagnose",
            )

        failures = [v for v in job.validation_results if not v.passed]

        diagnosis = self._analyze_failures(failures)
        repair_suggestions = self._generate_repair_suggestions(failures, job)

        job.notes.append(f"Diagnosis: {diagnosis}")
        for suggestion in repair_suggestions:
            job.notes.append(f"Repair suggestion: {suggestion}")

        job.transition_to(JobState.REPAIRING)

        result = AgentResult(
            success=True,
            agent=AgentRole.DEBUG,
            state_reached=JobState.REPAIRING.value,
            data={
                "diagnosis": diagnosis,
                "repair_suggestions": repair_suggestions,
                "failure_count": len(failures),
            },
        )

        result.duration_ms = int((time.time() - start_time) * 1000)
        return result

    def _analyze_failures(self, failures: list) -> str:
        """Analyze failures to determine root cause."""
        if not failures:
            return "No failures detected"

        failure_types = {}
        for f in failures:
            rule_type = f.rule_type.value if hasattr(f.rule_type, 'value') else str(f.rule_type)
            failure_types[rule_type] = failure_types.get(rule_type, 0) + 1

        most_common = max(failure_types.items(), key=lambda x: x[1])
        return f"Primary issue: {most_common[0]} ({most_common[1]} occurrences)"

    def _generate_repair_suggestions(
        self, failures: list, job: DesignJob
    ) -> list[str]:
        """Generate specific repair suggestions for failures."""
        suggestions = []

        for failure in failures:
            rule_id = failure.rule_id

            if rule_id == "R001":
                suggestions.append(
                    "Increase wall thickness to at least 1.2mm by adjusting wall_thickness parameter"
                )
            elif rule_id == "R002":
                suggestions.append(
                    "Reduce overall dimensions - current values exceed 200mm limit"
                )
            elif rule_id == "R003":
                suggestions.append(
                    "Add support material settings or modify overhang angle to be >= 45 degrees"
                )
            elif rule_id == "R004":
                suggestions.append(
                    "Increase thread wall thickness to at least 3mm"
                )
            elif rule_id == "R005":
                suggestions.append(
                    "Reduce height-to-width ratio - current exceeds 4:1"
                )
            elif rule_id == "B001":
                if job.spec and job.spec.cost_target:
                    suggestions.append(
                        f"Reduce material usage to meet cost target of ${job.spec.cost_target:.2f}"
                    )

        return suggestions
