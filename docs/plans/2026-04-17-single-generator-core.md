# Single Generator Core Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current family/builder/multi-stage CAD generation pipeline with a single LLM-driven CAD generation core, while keeping render and validation as harness-only outer layers.

**Architecture:** The new flow is `request (+ optional images) -> direct CAD generator -> OpenSCAD + explicit parameter schema -> render -> validate -> deliver`. `OrchestratorAgent` stops routing through research, intent, design, and parameter-schema layers. `GeneratorAgent` becomes the single source of design understanding and code generation, including repair retries.

**Tech Stack:** FastAPI, Pydantic, Anthropic-compatible message API, OpenSCAD CLI, existing validation and artifact pipeline.

---

### Task 1: Add a direct generator contract

**Files:**
- Modify: `cad_agent/app/llm/scad_generator.py`
- Test: `cad_agent/tests/test_scad_generator.py`

**Step 1: Write a failing test**
- Add a test that feeds a mocked LLM response containing both parameter metadata and `scad_source`.
- Assert the generator returns parsed parameters plus raw SCAD.

**Step 2: Run test to verify it fails**
- Run: `PYTHONPATH=. .venv/bin/python -m pytest cad_agent/tests/test_scad_generator.py -q`

**Step 3: Implement minimal direct-generation API**
- Add a new response parser that expects a single JSON payload with:
  - `summary`
  - `parameters`
  - `scad_source`
- Add support for optional image blocks in the message payload.

**Step 4: Run test to verify it passes**
- Run the same pytest command.

### Task 2: Collapse GeneratorAgent into the primary reasoning layer

**Files:**
- Modify: `cad_agent/app/agents/generator_agent.py`
- Test: `cad_agent/tests/test_generation_strategy.py`

**Step 1: Write failing tests**
- Add a test asserting generation no longer depends on part family, object model, or geometry DSL.
- Add a repair-path test asserting validation failures feed back into the same direct generator.

**Step 2: Run tests to verify they fail**
- Run: `PYTHONPATH=. .venv/bin/python -m pytest cad_agent/tests/test_generation_strategy.py -q`

**Step 3: Replace strategy routing**
- Remove deterministic family/builder routing from `GeneratorAgent`.
- Set `generation_path` to a single direct mode.
- Store parsed parameter schema directly from the generator payload.

**Step 4: Run tests to verify they pass**
- Run the same pytest command.

### Task 3: Simplify orchestrator state flow

**Files:**
- Modify: `cad_agent/app/agents/orchestrator.py`
- Modify: `cad_agent/app/rules/retry_policy.py`
- Test: `cad_agent/tests/test_orchestrator.py`

**Step 1: Write failing tests**
- Add tests for the new state path:
  - `NEW -> SCAD_GENERATED -> RENDERED -> VALIDATED -> DELIVERED`
- Add a retry test for validation failure routing back to `REPAIRING`.

**Step 2: Run tests to verify they fail**
- Run: `PYTHONPATH=. .venv/bin/python -m pytest cad_agent/tests/test_orchestrator.py -q`

**Step 3: Implement minimal orchestrator**
- Stop routing through research, intake, intent, design, and parameter-schema stages.
- Keep executor, validator, report, and repair loop only.
- Preserve API-facing job logging and update callbacks.

**Step 4: Run tests to verify they pass**
- Run the same pytest command.

### Task 4: Remove family-centric payload dependencies from API responses

**Files:**
- Modify: `cad_agent/main.py`
- Modify: `cad_agent/app/agents/report_agent.py`
- Test: `cad_agent/tests/test_api_status.py`

**Step 1: Write failing tests**
- Add or update tests asserting status/report payloads no longer depend on `part_family`, `builder_name`, or old intermediate results being populated.

**Step 2: Run tests to verify they fail**
- Run the targeted pytest file.

**Step 3: Implement API compatibility cleanup**
- Keep existing response keys where practical, but populate them from the new direct-generation flow or leave them empty.
- Ensure parameter updates still use top-level SCAD patching when possible.

**Step 4: Run tests to verify they pass**
- Run the same pytest command.

### Task 5: Remove obsolete family/builder/template references

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Delete or stop importing obsolete family-builder modules if no longer used

**Step 1: Update docs**
- Rewrite architecture docs to describe the single-generator core and harness layers.

**Step 2: Remove dead references**
- Delete or detach references to builders/templates in runtime setup and docs.

**Step 3: Verify imports**
- Run: `PYTHONPATH=. .venv/bin/python -m pytest cad_agent/tests/test_generation_strategy.py cad_agent/tests/test_orchestrator.py -q`

### Task 6: End-to-end verification

**Files:**
- Verify current workspace only

**Step 1: Run focused regression suite**
- Run:
  - `PYTHONPATH=. .venv/bin/python -m pytest cad_agent/tests/test_generation_strategy.py -q`
  - `PYTHONPATH=. .venv/bin/python -m pytest cad_agent/tests/test_orchestrator.py -q`
  - `PYTHONPATH=. .venv/bin/python -m pytest cad_agent/tests/test_validator_semantics.py -q`

**Step 2: Run lint on edited files**
- Run: `cd cad_agent && .venv/bin/ruff check app/agents app/llm main.py tests`

**Step 3: Record any intentional breakages**
- If legacy tests fail because the old family/builder architecture was intentionally removed, document the exact reason and either update or delete the stale tests in the same change.
