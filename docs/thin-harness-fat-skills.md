# Thin Harness, Fat Skills

AgentSCAD should keep orchestration small and move CAD reasoning into skills. The harness owns IO, persistence, rendering, validation, and streaming. Skills own generation instructions, repair strategy, validation review, and workflow guidance.

## Why

- Runtime contracts stay stable for the UI and job recovery.
- CAD behavior can improve by editing skills without risky route changes.
- Fallbacks remain reliable when an LLM, OpenSCAD, or Python/trimesh dependency is unavailable.
- New CAD behaviors can be added as skill routing decisions instead of hardcoded branches.

## Harness Responsibilities

- Create and update jobs.
- Emit SSE frames as `data: ${JSON.stringify(payload)}\n\n`.
- Broadcast job updates over WebSocket.
- Persist state, logs, SCAD source, parameters, and artifact paths.
- Render `model.scad` to `model.stl` and `preview.png` with OpenSCAD.
- Run Python/trimesh STL validation when available, with mock fallback.
- Run visual validation when MiMo vision is configured.
- Fall back from MiMo to ZAI SDK to template generation.

## Skill Responsibilities

- `scad-generation`: produce a CAD artifact with strict JSON compatibility. The SCAD source is the source of truth; `parameters` are secondary metadata.
- `scad-repair`: produce a complete repaired SCAD payload without mutating runtime contracts.
- `scad-validation-review`: explain validation failures and recommend the safest next action.
- `scad-visual-validate`: compare preview images to design intent and return strict JSON.
- `scad-improvement`: document the self-learning loop from user edits.
- `developer-workflow`: guide safe repository changes.
- `RESOLVER.md`: route tasks to the smallest applicable skill.

## Non-Negotiable Contracts

### States

`NEW`, `SCAD_GENERATED`, `RENDERED`, `VALIDATED`, `DELIVERED`, `DEBUGGING`, `REPAIRING`, `VALIDATION_FAILED`, `GEOMETRY_FAILED`, `RENDER_FAILED`, `HUMAN_REVIEW`, `CANCELLED`.

### Steps

`starting`, `generating_llm`, `generating_mock`, `scad_generated`, `scad_applied`, `rendering`, `render_failed`, `rendered`, `validating`, `validation_failed`, `validated`, `delivering`, `delivered`.

### Artifacts

- `/artifacts/{jobId}/model.scad`
- `/artifacts/{jobId}/model.stl`
- `/artifacts/{jobId}/preview.png`
- `/artifacts/{jobId}/report` when a report is available

### Validation Results

```json
{
  "rule_id": "R001",
  "rule_name": "Minimum Wall Thickness",
  "level": "ENGINEERING",
  "passed": true,
  "is_critical": true,
  "message": "Wall thickness passes"
}
```

Store `validationResults` as an array of these objects.

### Generation Results

```json
{
  "summary": "A one-sentence description of the generated part",
  "parameters": [
    {
      "key": "wall_thickness",
      "label": "Wall Thickness",
      "kind": "float",
      "unit": "mm",
      "value": 2,
      "min": 1.2,
      "max": 10,
      "step": 0.2,
      "source": "engineering",
      "editable": true,
      "description": "Uniform wall thickness",
      "group": "engineering"
    }
  ],
  "scad_source": "complete self-contained OpenSCAD source"
}
```

## Artifact-First Flow

AgentSCAD is moving away from trusting model-supplied parameter JSON as the primary CAD representation. The target flow is:

1. Build a CAD brief from the user request and current job context.
2. Generate or repair a complete OpenSCAD artifact.
3. Sanitize reserved keywords and validate the SCAD compiles.
4. Parse editable numeric parameters deterministically from top-level SCAD assignments.
5. Render STL/PNG with OpenSCAD.
6. Validate mesh and preview outputs.
7. Deliver only after deterministic checks and semantic review agree the artifact is usable.

This keeps the model responsible for CAD intent and code authoring, while TypeScript tools own parsing, rendering, artifact storage, validation, and state changes.

### Parameter Extraction Contract

Generated OpenSCAD should place editable numeric parameters before any `module`, `function`, or geometry operation:

```openscad
/* [Dimensions] */
body_width = 72; // min: 40 max: 120 step: 0.5
body_height = 150; // min: 80 max: 220 step: 0.5

/* [Structure] */
wall_thickness = 2; // min: 1.2 max: 6 step: 0.1
```

The deterministic extractor converts these assignments into existing `ParameterDef[]` records. Model-provided `parameters` JSON is allowed as fallback metadata, but it must not be the only place editable controls exist.

### OpenSCAD Libraries

AgentSCAD should improve CAD quality through general OpenSCAD library support instead of product-family hardcoding.

- Skills may instruct the model to use approved libraries only when the runtime reports them as available.
- The renderer exposes configured library parent directories through `OPENSCADPATH`.
- `CADCAD_OPENSCAD_LIBRARY_DIR` can override the app-managed library directory. By default, the managed directory is outside the repo at `~/.cadcad/openscad-libraries`.
- `OPENSCAD_LIBRARY_PATHS` can point at additional local BOSL2, BOSL, MCAD, or other reviewed OpenSCAD library parent directories.
- `skills/scad-library-policy/manifest.json` is the source of truth for approved library metadata, include examples, detection files, pinned install commits, and license gates.
- Managed library installation must preserve license files and install only default-approved non-GPL libraries unless the user explicitly opts into GPL libraries.
- The repository must not copy third-party library source by default. Managed library installs go outside the repo and should be treated as local runtime dependencies.
- Generated SCAD may use `include` or `use` statements for available libraries, but must keep editable top-level parameters.
- Server-side OpenSCAD CLI remains the authoritative export path for STL/PNG.

### CADAM-Inspired Boundary

AgentSCAD should emulate the useful architectural boundary from CADAM without copying its product UX wholesale:

- The model produces or edits OpenSCAD artifacts.
- The harness streams progress and records artifacts.
- Tools parse parameters, patch simple parameter changes, compile/render, and surface errors.
- Repair receives compiler/render/validation evidence and returns a new artifact.
- Product-specific hardcoding should remain optional. The default path should work for novel parts through artifact-first generation and deterministic feedback.

## Pipeline Orchestrator Boundary

`src/app/api/jobs/[id]/process/route.ts` is now intended to stay a thin HTTP/SSE adapter:

- Validate that the job exists.
- Validate that the current state is processable.
- Format SSE frames as `data: ${JSON.stringify(payload)}\n\n`.
- Call `executeCadJob(jobId, sendEvent)`.

`src/lib/pipeline/execute-cad-job.ts` owns the current runtime state machine:

- Parse existing parameter values.
- Generate or fall back to template SCAD.
- Save generated SCAD and metadata.
- Render OpenSCAD artifacts.
- Run mesh and visual validation.
- Update Prisma state/log fields.
- Broadcast `job:update`.

Future refactors should make `execute-cad-job.ts` thinner by delegating more phase internals to tools and skills, but route handlers should not regain CAD pipeline logic.

## Engineering Review Decisions

Accepted during `/plan-eng-review` on 2026-04-27.

1. Consolidate on one runtime orchestration path. `src/lib/pipeline/execute-cad-job.ts` remains the state-machine owner. `src/lib/harness/skill-runner.ts` should become a wrapper around shared generation helpers, not a second generator implementation.
2. Manual SCAD apply must reuse the same render and validation path as the main pipeline. `src/app/api/jobs/[id]/scad/apply/route.ts` must stop using local mock validation for mesh/manifold results and call shared render plus validation helpers instead.
3. Centralize duplicated execution logging and SCAD parameter extraction through existing shared helpers before adding new runtime behavior. Use `src/lib/stores/job-store.ts` for logs and `src/lib/tools/scad-parameter-extractor.ts` for top-level SCAD parameter parsing.
4. Make tests first-class. Add a `test` script that runs Bun tests, then add contract tests for process/apply routes, shared validation, and parameter extraction.

## What Already Exists

- `src/app/api/jobs/[id]/process/route.ts` is already a thin HTTP/SSE adapter that validates job state, emits raw `data: ...\n\n` frames, and calls `executeCadJob`.
- `src/lib/pipeline/execute-cad-job.ts` already owns the main generation, render, validation, persistence, SSE, and WebSocket state machine.
- `src/lib/harness/skill-runner.ts` already wraps skill prompt construction and LLM generation, but currently overlaps with generation logic in `executeCadJob`.
- `src/lib/tools/scad-renderer.ts` already provides `renderScadArtifacts`, `renderStl`, `renderPng`, `validateGeneratedScadSource`, and render failure logs.
- `src/lib/tools/validation-tool.ts` already provides `validateRenderedArtifacts` and `getCriticalValidationFailures`.
- `src/lib/tools/scad-parameter-extractor.ts` already parses top-level OpenSCAD numeric assignments into `ParameterDef[]`.
- `src/lib/stores/job-store.ts` already provides shared execution-log helpers.
- `src/app/api/__tests__/pipeline.test.ts` already uses `bun:test`, but `package.json` does not expose a `test` script yet.

## Target Data Flow

```text
User action
  |
  +--> POST /api/jobs/[id]/process
  |      |
  |      v
  |   executeCadJob(jobId, sendEvent)
  |      |
  |      +--> runScadGenerationSkill / template fallback
  |      +--> sanitize + validate generated SCAD
  |      +--> extract top-level parameters
  |      +--> renderScadArtifacts(jobId, scadSource)
  |      +--> validateRenderedArtifacts(...)
  |      +--> persist state/logs/artifacts
  |      +--> emit SSE + broadcast job:update
  |
  +--> POST /api/jobs/[id]/scad/apply
         |
         v
      sanitize applied SCAD
         |
         +--> extract top-level parameters
         +--> shared renderScadArtifacts(jobId, scadSource)
         +--> shared validateRenderedArtifacts(...)
         +--> persist same contract fields
         +--> emit same SSE + broadcast job:update
```

## Test Coverage Plan

```text
CODE PATHS                                             USER FLOWS
[+] process route                                      [+] Generate CAD job
  |                                                       |
  +-- [GAP] processable state guard                       +-- [GAP] [E2E] start job -> SCAD_GENERATED -> RENDERED -> VALIDATED/DELIVERED
  +-- [GAP] SSE frame contract                            +-- [GAP] LLM unavailable -> template fallback is visible and recoverable
  +-- [GAP] executeCadJob render failure path             +-- [GAP] OpenSCAD render failure shows GEOMETRY_FAILED with error message
  +-- [GAP] validation critical failure path              +-- [GAP] critical validation failure stops delivery

[+] manual SCAD apply                                  [+] Edit SCAD and rebuild
  |                                                       |
  +-- [GAP] sanitize invalid/reserved SCAD                +-- [GAP] [E2E] apply edited SCAD -> render -> validate -> deliver
  +-- [GAP] top-level parameter extraction                +-- [GAP] invalid SCAD -> GEOMETRY_FAILED and recoverable UI
  +-- [GAP] shared render helper                          +-- [GAP] mesh validation failure cannot silently deliver
  +-- [GAP] shared mesh + visual validation

[+] shared helpers
  |
  +-- [GAP] appendLog preserves prior log entries
  +-- [GAP] scad-parameter-extractor handles grouped assignments
  +-- [GAP] scad-parameter-extractor stops before geometry/module declarations
  +-- [GAP] validateRenderedArtifacts combines mesh + visual validation

COVERAGE: existing tests cover job list/create only. Pipeline contract coverage is effectively 0/17 planned paths.
QUALITY: existing tests are smoke/API happy-path tests. New work needs behavior + edge + error coverage.
```

Add these tests before or alongside implementation:

- Add `package.json` script: `"test": "bun test"`.
- Add Bun unit tests for `scad-parameter-extractor`: grouped assignments, comments with min/max/step, geometry stop, reserved keywords, fallback merge behavior.
- Add Bun unit tests for `appendLog` and any shared job-store helpers used by multiple routes.
- Add route or service-level tests for process/apply contract events: raw SSE framing, state/step strings, render failure, validation failure, success delivery.
- Add tests that manual SCAD apply uses real `validateRenderedArtifacts` instead of local synthetic validation.

## Failure Modes

| Codepath | Failure | Test coverage needed | Error handling required | User-visible behavior |
|---|---|---|---|---|
| LLM generation | provider unavailable or malformed JSON | fallback generation test | fallback to template | stream says template generation was used |
| Generated SCAD validation | OpenSCAD compile fails before render | unit/service test | reject generated output and fallback or fail safely | no fake delivered state |
| Render artifacts | OpenSCAD missing or render command fails | service test | `GEOMETRY_FAILED`, render log, SSE error | user sees render failure and can retry/repair |
| Mesh validation | STL is invalid or non-manifold | service test | `VALIDATION_FAILED` for critical failures | user sees validation blockers |
| Visual validation | vision model unavailable or fails | service test | non-blocking or explicit critical failure based on rule | user sees whether semantic validation ran |
| Manual SCAD apply | edited SCAD compiles but mesh is bad | regression test | shared mesh validation blocks delivery | user cannot export a silently invalid model |
| Parameter extraction | no editable top-level assignments | unit test | keep existing schema as fallback | controls do not disappear unexpectedly |
| SSE stream | client disconnects after final event | route test | close guard prevents double-close failures | no false failed job after success |

Critical gap: manual SCAD apply currently can deliver with synthetic mesh validation. Fix by reusing shared validation.

## NOT in Scope

- Rewriting the full job pipeline state machine in this phase. The state machine stays in `executeCadJob`; this phase extracts shared helpers and removes duplicate logic.
- Adding new job states, step strings, artifact names, or validation result fields. Any contract change needs a separate migration and frontend update.
- Adding direct viewport manipulation, STEP/OBJ/glTF export, simulation, FEA, or collaboration flows.
- Copying OpenSCAD third-party library source into the repository. Managed library installation may download approved runtime dependencies outside the repo, with license gates enforced by `skills/scad-library-policy/manifest.json`.
- Replacing SQLite/Prisma persistence or WebSocket infrastructure.

## Worktree Parallelization

| Step | Modules touched | Depends on |
|---|---|---|
| Shared helper consolidation | `src/lib/harness/`, `src/lib/tools/`, `src/lib/stores/` | none |
| Manual SCAD apply reuse | `src/app/api/jobs/[id]/scad/`, `src/lib/tools/` | shared helper consolidation |
| Main pipeline wrapper cleanup | `src/lib/pipeline/`, `src/lib/harness/` | shared helper consolidation |
| Contract tests | `package.json`, `src/app/api/__tests__/`, `src/lib/**/__tests__/` | shared helper consolidation |
| Docs and resolver updates | `docs/`, `skills/` | none |

Parallel lanes:

- Lane A: shared helper consolidation -> manual SCAD apply reuse -> main pipeline wrapper cleanup.
- Lane B: docs and resolver updates.
- Lane C: contract test scaffolding can start in parallel, then finish after Lane A exposes the final helper boundaries.

Execution order: launch Lane A and Lane B in parallel. Start Lane C with test script and extractor/log tests, then complete route/pipeline tests after Lane A lands.

Conflict flags: Lane A and Lane C both touch `src/lib/` test targets, so keep implementation and tests coordinated.

## Phase 1 Guidance

1. Add missing skills and docs before changing runtime code.
2. Use `skills/RESOLVER.md` to decide which skill should own a behavior.
3. Keep route handlers as contract-preserving callers.
4. If a desired behavior requires new state, step, artifact, or validation fields, pause and design the migration deliberately.
5. Validate docs by checking that every mentioned contract still matches the current runtime.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | - | Not run |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | - | Not run |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES OPEN | 4 issues, 1 critical gap |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | score: 4/10 -> 9/10, 6 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | - | Not run |

- **UNRESOLVED:** 0 review decisions.
- **VERDICT:** Design review cleared. Eng review found required implementation changes before shipping.
