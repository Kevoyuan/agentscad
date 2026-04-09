# Hybrid-First CAD Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Shift the CAD pipeline from template-first routing to a hybrid-first flow with always-on research for real-world devices, safer family routing, and a DSL-first LLM generation entry point that still falls back to existing paths.

**Architecture:** Add a lightweight entity-aware research layer and a geometry-DSL generation layer without breaking the existing orchestrator, executor, and validator flow. Unknown or unsupported requests should no longer be routed into the generator without either a supported deterministic part family or an explicit template/DSL path.

**Tech Stack:** Python 3.11, FastAPI, Pydantic, pytest, OpenSCAD, Anthropic-compatible LLM client

---

### Task 1: Document the new pipeline contract in code-facing tests

**Files:**
- Modify: `cad_agent/tests/test_generation_strategy.py`
- Modify: `cad_agent/tests/test_orchestrator.py`
- Modify: `cad_agent/tests/test_redesign_agents.py`

**Step 1: Write the failing tests for routing and research behavior**

Add tests covering:
- a request for `iphone 17 pro 手机壳` maps to a supported phone-case family
- real-world device requests mark research as web-backed and always-on
- `SPEC_PARSED` with `part_family="unknown"` routes to `template.select`, not directly to `generator.generate`
- generator prefers DSL compilation when a job carries a geometry DSL payload

**Step 2: Run the focused test command to verify failure**

Run:
```bash
pytest cad_agent/tests/test_generation_strategy.py cad_agent/tests/test_orchestrator.py cad_agent/tests/test_redesign_agents.py -q
```

Expected:
- failures showing missing phone-case family support
- failures showing incorrect orchestrator routing for `"unknown"`
- failures showing missing DSL handling

**Step 3: Commit the failing-test checkpoint only if the repo workflow allows isolated commits**

Run:
```bash
git status --short
```

Expected:
- only the intended test files plus existing in-progress repo changes

### Task 2: Add phone-case family recognition and research metadata

**Files:**
- Modify: `cad_agent/app/llm/pipeline_models.py`
- Modify: `cad_agent/app/llm/pipeline_utils.py`
- Modify: `cad_agent/app/agents/research_agent.py`
- Modify: `cad_agent/app/agents/intent_agent.py`
- Modify: `cad_agent/app/agents/design_agent.py`
- Modify: `cad_agent/app/agents/parameter_schema_agent.py`

**Step 1: Extend the family model**

Add a new supported family for phone cases and any metadata fields needed to describe:
- normalized entity name
- whether web research was required
- structured device reference dimensions

**Step 2: Implement deterministic first-pass recognition**

Teach `infer_part_family()` and related helpers to recognize:
- `phone case`
- `iphone case`
- `手机壳`
- `保护壳`

Do not overfit to only Apple. Keep the recognition generic.

**Step 3: Upgrade research output**

Update `ResearchAgent` so real-world product requests return:
- normalized object/entity name
- search queries for dimensions and key physical features
- `needs_web_search=True`
- source notes indicating the always-on research contract

**Step 4: Update downstream design/schema agents**

Add a phone-case design strategy with editable controls such as:
- wall thickness
- screen lip height
- camera clearance
- side clearance
- bottom opening depth
- corner bumper thickness

**Step 5: Run the focused redesign tests**

Run:
```bash
pytest cad_agent/tests/test_redesign_agents.py -q
```

Expected:
- tests for the new family pass

### Task 3: Introduce a geometry DSL model and compiler entry point

**Files:**
- Create: `cad_agent/app/llm/geometry_dsl.py`
- Modify: `cad_agent/app/models/design_job.py`
- Modify: `cad_agent/app/llm/scad_generator.py`
- Modify: `cad_agent/app/agents/generator_agent.py`

**Step 1: Define the DSL schema**

Create typed models for a minimal geometry DSL:
- root object with `family`, `units`, `operations`, `metadata`
- operation nodes with `type`, `name`, `anchor`, `dimensions`, `operation`
- enough structure to represent shell, cavity, cutouts, and reliefs

**Step 2: Add job storage for DSL**

Extend `DesignJob` with fields for:
- `geometry_dsl`
- `generation_path`

Keep them optional to avoid breaking existing saved jobs.

**Step 3: Add an LLM DSL generation method**

Refactor `LLMScadGenerator` so it can:
- generate geometry DSL from research/design/schema context
- compile that DSL into OpenSCAD

For this phase, the compiler can support only the operations needed for shell-style parts. Unsupported operations should fail loudly with clear error messages.

**Step 4: Update generator routing**

Change `GeneratorAgent` so its priority order is:
1. deterministic parametric builder
2. geometry DSL path
3. explicit template choice
4. direct LLM-native SCAD fallback

**Step 5: Run generation-strategy tests**

Run:
```bash
pytest cad_agent/tests/test_generation_strategy.py -q
```

Expected:
- generator uses DSL when available
- legacy template path still works

### Task 4: Fix orchestrator routing and fallback safety

**Files:**
- Modify: `cad_agent/app/agents/orchestrator.py`
- Modify: `cad_agent/app/rules/retry_policy.py`

**Step 1: Make family checks semantic instead of truthy**

Treat these values as unsupported:
- `None`
- `""`
- `"unknown"`

Do not route unsupported families directly to `generator.generate`.

**Step 2: Preserve fallback behavior**

For unsupported families:
- prefer `template.select` if a parsed spec exists
- otherwise allow the job to surface for review with actionable errors

**Step 3: Tighten retry behavior**

Prevent repeated generator retries on the same unsupported state when no new artifact path becomes available.

**Step 4: Run orchestrator tests**

Run:
```bash
pytest cad_agent/tests/test_orchestrator.py -q
```

Expected:
- `"unknown"` no longer behaves like a supported family

### Task 5: Wire the new services into app startup and verify end-to-end behavior

**Files:**
- Modify: `cad_agent/main.py`
- Modify: `cad_agent/cli.py`

**Step 1: Initialize the enhanced research and generation services**

Pass any required clients/config into:
- `ResearchAgent`
- `LLMScadGenerator`
- `GeneratorAgent`

Keep startup resilient when no API key is configured.

**Step 2: Run targeted verification**

Run:
```bash
pytest cad_agent/tests/test_redesign_agents.py cad_agent/tests/test_generation_strategy.py cad_agent/tests/test_orchestrator.py -q
```

Expected:
- all targeted tests pass

**Step 3: Run one broader safety check**

Run:
```bash
pytest cad_agent/tests/test_llm_provider.py cad_agent/tests/test_openscad_executor.py -q
```

Expected:
- no regressions in LLM provider or executor behavior

**Step 4: Review the diff**

Run:
```bash
git diff -- docs/plans/2026-04-09-hybrid-first-cad-pipeline.md cad_agent/app/llm/pipeline_models.py cad_agent/app/llm/pipeline_utils.py cad_agent/app/agents/research_agent.py cad_agent/app/agents/intent_agent.py cad_agent/app/agents/design_agent.py cad_agent/app/agents/parameter_schema_agent.py cad_agent/app/llm/geometry_dsl.py cad_agent/app/models/design_job.py cad_agent/app/llm/scad_generator.py cad_agent/app/agents/generator_agent.py cad_agent/app/agents/orchestrator.py cad_agent/app/rules/retry_policy.py cad_agent/main.py cad_agent/cli.py cad_agent/tests/test_generation_strategy.py cad_agent/tests/test_orchestrator.py cad_agent/tests/test_redesign_agents.py
```

Expected:
- only the planned hybrid-first pipeline changes appear
