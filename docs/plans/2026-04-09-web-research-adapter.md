# Web Research Adapter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a real no-extra-key web research adapter that fetches authoritative device dimensions from the live web and feeds them back into the hybrid-first CAD pipeline.

**Architecture:** Introduce a small research adapter layer between `ResearchAgent` and the public web. Start with official Apple specs pages for supported Apple devices, parse device dimensions into structured research output, and wire the adapter into app startup so phone-case and Apple-device accessory requests use live data automatically.

**Tech Stack:** Python 3.11/3.12, httpx, pytest, FastAPI, Pydantic

---

### Task 1: Lock the adapter contract with failing tests

**Files:**
- Create: `cad_agent/tests/test_web_research_adapter.py`
- Modify: `cad_agent/tests/test_redesign_agents.py`

**Step 1: Write a failing parser test**

Add a test that:
- mocks an Apple iPhone specs page response
- runs the new adapter
- expects normalized device name, source URL, and parsed `width/height/depth` in millimeters

**Step 2: Write a failing ResearchAgent integration test**

Add a test that:
- injects the adapter into `ResearchAgent`
- runs research for `apple iphone 17 pro 的手机壳`
- expects `reference_dimensions` to contain `body_width/body_length/body_depth`
- expects the research result to record source URLs

**Step 3: Verify RED**

Run:
```bash
PYTHONPATH=. ./.venv/bin/python -m pytest cad_agent/tests/test_web_research_adapter.py cad_agent/tests/test_redesign_agents.py -q
```

Expected:
- failures for missing adapter implementation and missing enriched research fields

### Task 2: Implement the web research adapter

**Files:**
- Create: `cad_agent/app/research/__init__.py`
- Create: `cad_agent/app/research/web_adapter.py`

**Step 1: Define result models**

Create structured adapter result types for:
- normalized entity name
- source URLs
- dimension map
- extracted facts

**Step 2: Implement official Apple specs fetching**

Support at least:
- `iPhone <number> <variant>`
- `Mac mini`

Use deterministic URL building first, then fetch with `httpx`.

**Step 3: Parse official specs text**

Extract millimeter dimensions from Apple’s “Technical Specifications” pages.

### Task 3: Wire the adapter into ResearchAgent

**Files:**
- Modify: `cad_agent/app/llm/pipeline_models.py`
- Modify: `cad_agent/app/models/design_job.py`
- Modify: `cad_agent/app/agents/research_agent.py`
- Modify: `cad_agent/app/agents/parameter_schema_agent.py`

**Step 1: Add research result fields**

Add structured fields for:
- `source_urls`
- `reference_dimensions`
- `web_research_used`

**Step 2: Merge live dimensions into research output**

When the adapter returns dimensions, merge them into:
- research facts
- object name normalization
- downstream parameter defaults for phone cases

### Task 4: Wire runtime startup and verify

**Files:**
- Modify: `cad_agent/config.py`
- Modify: `cad_agent/main.py`
- Modify: `cad_agent/cli.py`

**Step 1: Add runtime config knobs**

Support:
- enabling/disabling web research
- timeout
- user agent

**Step 2: Initialize the adapter in app/CLI startup**

Pass the configured adapter into `ResearchAgent`.

**Step 3: Verify GREEN**

Run:
```bash
PYTHONPATH=. ./.venv/bin/python -m pytest cad_agent/tests/test_web_research_adapter.py cad_agent/tests/test_redesign_agents.py cad_agent/tests/test_generation_strategy.py cad_agent/tests/test_orchestrator.py -q
```

Expected:
- all tests pass

**Step 4: Run safety regression**

Run:
```bash
PYTHONPATH=. ./.venv/bin/python -m pytest cad_agent/tests/test_llm_provider.py cad_agent/tests/test_openscad_executor.py -q
```

Expected:
- no regressions in adjacent systems
