# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CAD Agent is a Business-Closed-Loop CAD Agent System for OpenSCAD. It transforms natural language CAD requests into production-ready 3D models through a multi-agent orchestration pipeline.

The system is undergoing a transition from a **template-first** approach to a **parametric builder** approach:
- Old: `Prompt -> Choose Template -> Fill Variables -> Render`
- New: `Prompt -> Research -> Design Intent -> Parameter Schema -> Parametric Builder -> Geometry -> Review`

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
NEW -> RESEARCHED -> INTENT_RESOLVED -> DESIGN_RESOLVED -> PARAMETERS_GENERATED
    -> GEOMETRY_BUILT -> RENDERED -> VALIDATED -> ACCEPTED -> DELIVERED
```

Failure states: `*_FAILED` trigger retry/repair loops. Terminal states: `DELIVERED`, `ARCHIVED`, `HUMAN_REVIEW`, `CANCELLED`.

### Key Agents

| Agent | Purpose |
|-------|---------|
| `ResearchAgent` | Collects external reference facts (device dimensions, standards) |
| `IntentAgent` | Classifies request into a part family (PHONE_CASE, SPUR_GEAR, DEVICE_STAND, etc.) |
| `DesignAgent` | Proposes shape concept and editable controls |
| `ParameterSchemaAgent` | Converts design into an editable parameter schema |
| `GeneratorAgent` | Generates SCAD code via template or parametric builder |
| `ExecutorAgent` | Executes OpenSCAD to render STL/PNG |
| `ValidatorAgent` | Validates against engineering rules |
| `DebugAgent` | Diagnoses failures |
| `ReportAgent` | Generates delivery artifacts |

### Parametric Builders

The `ParametricPartEngine` (`cad_agent/app/parametric/`) replaces template substitution with deterministic geometry builders:
- `SpurGearBuilder` - Involute gear geometry
- `DeviceStandBuilder` - Device stands with arch/cradle geometry
- `EnclosureBuilder` - Box enclosures with shell/snap-fit logic

### Data Model

`DesignJob` (`cad_agent/app/models/design_job.py`) is the central state object. Key fields:
- `state: JobState` — current position in the pipeline
- `part_family` — classified family (e.g., "phone_case", "spur_gear")
- `research_result`, `intent_result`, `design_result` — per-stage outputs
- `parameter_schema: ParameterSchema` — editable controls with sources (user/research/derived)
- `spec` — structured geometric specification

### LLM Integration

LLM providers are configured via `config.py` settings (env prefix `CAD_AGENT_`):
- `openai`, `anthropic`, `azure`, `minimax` (MiniMax M2.7 uses `minimax` provider with Anthropic-compatible endpoint `https://api.minimaxi.com/anthropic`)

LLM clients are in `cad_agent/app/llm/`:
- `LLMScadGenerator` — generates SCAD code
- `LLMSpecParser` — parses structured specs from prompts
- `LLMDesignCritic` — reviews generated geometry

### Storage

Jobs are persisted to SQLite via `SQLiteJobRepository` (`cad_agent/app/storage/sqlite_repo.py`). Case memory (`cad_agent/app/services/case_memory.py`) stores successful patterns for reuse.

### Templates

Jinja2 templates in `cad_agent/app/templates/` (e.g., `rounded_block_v1.scad.j2`) are falling out of use in favor of parametric builders.

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