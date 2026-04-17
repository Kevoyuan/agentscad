# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CAD Agent is a single-pass CAD Agent System for OpenSCAD. It transforms natural language CAD requests into editable parameterized OpenSCAD, then lets the deterministic harness render, validate, and deliver the result.

## Development Commands

```bash
# From the cad_agent/ directory
cd cad_agent

# Install dependencies
pip install -e ".[dev]"

# Run tests
pytest

# Run a single test file
pytest cad_agent/tests/test_orchestrator.py

# Run a specific test
pytest cad_agent/tests/test_orchestrator.py::test_name -v

# Lint
ruff check .

# Type check
mypy .

# Run the API server
cad-agent
# Or directly:
python -m cad_agent.main
```

## Architecture

### State Machine Pipeline

The `OrchestratorAgent` drives jobs through these states:

```
NEW -> SCAD_GENERATED -> RENDERED -> VALIDATED -> DELIVERED
                     -> DEBUGGING -> REPAIRING -> SCAD_GENERATED
```

Failure states: `*_FAILED` trigger retry/repair loops. Terminal states: `DELIVERED`, `ARCHIVED`, `HUMAN_REVIEW`, `CANCELLED`.

### Key Agents

| Agent | Purpose |
|-------|---------|
| `GeneratorAgent` | Produces explicit editable parameters and OpenSCAD |
| `ExecutorAgent` | Executes OpenSCAD to render STL/PNG |
| `ValidatorAgent` | Validates against engineering rules |
| `DebugAgent` | Diagnoses failures |
| `ReportAgent` | Generates delivery artifacts |

### Data Model

`DesignJob` (`cad_agent/app/models/design_job.py`) is the central state object. Key fields:
- `state: JobState` — current position in the pipeline
- `parameter_schema: ParameterSchema` — editable controls returned directly by the generator
- `parameter_values` — current editable values used for patch/re-render
- `scad_source` — generated OpenSCAD source
- `validation_results` — harness output used by the repair loop

### LLM Integration

LLM providers are configured via `config.py` settings (env prefix `CAD_AGENT_`):
- `openai`, `anthropic`, `azure`, `minimax` (MiniMax M2.7 uses `minimax` provider with Anthropic-compatible endpoint `https://api.minimaxi.com/anthropic`)

LLM clients are in `cad_agent/app/llm/`:
- `LLMScadGenerator` — generates SCAD code
- `LLMDesignCritic` — reviews generated geometry

### Storage

Jobs are persisted to SQLite via `SQLiteJobRepository` (`cad_agent/app/storage/sqlite_repo.py`). Case memory (`cad_agent/app/services/case_memory.py`) stores successful patterns for reuse.

## Environment Configuration

Copy `.env.example` to `.env` and configure:
- `CAD_AGENT_LLM_PROVIDER` — which LLM to use
- `CAD_AGENT_OPENSCAD_PATH` — path to OpenSCAD binary
- API keys for the chosen provider

OpenSCAD auto-detection checks these paths in order:
1. `.../OpenSCAD-2021.01.app/Contents/MacOS/OpenSCAD` (local dev)
2. `/opt/homebrew/bin/openscad`
3. `/usr/local/bin/openscad`
4. `/Applications/OpenSCAD.app/...`

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
