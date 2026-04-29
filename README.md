# AgentSCAD

AgentSCAD is an AI-native CAD agent that turns natural-language part requests into validated OpenSCAD artifacts.

It generates parametric SCAD, renders STL and preview images, validates geometry and visual intent, routes failed designs through repair or human review, and learns from user edits over time.

![AgentSCAD system overview](./docs/images/agentscad_overview.png)

## Why AgentSCAD?

Most text-to-CAD demos stop at code generation. AgentSCAD treats CAD as an artifact pipeline:

1. Generate OpenSCAD source from a natural-language request.
2. Extract editable parameters from top-level SCAD assignments.
3. Render STL and preview images with deterministic tools.
4. Validate mesh health, manufacturing rules, and visual intent.
5. Repair failed geometry or route the job to human review.
6. Store edits, artifacts, and learned patterns for future jobs.

## Features

- **Artifact-first CAD generation**: OpenSCAD source is the source of truth; model-provided parameter JSON is compatibility metadata and fallback.
- **CAD generation and repair agents**: A generation agent creates OpenSCAD artifacts, while a repair agent fixes failed geometry, validation blockers, and human-review edits.
- **Validation-driven workflow**: When validation fails, AgentSCAD keeps the generated STL, preview, and SCAD available for inspection, then routes the job into human review or repair.
- **Live workspace updates**: Server-Sent Events stream active generation progress, and the job workspace refreshes automatically.
- **Parametric editing**: Users can tweak extracted CAD parameters such as wall thickness, hole diameter, or gear teeth within schema constraints.
- **Edit-derived memory**: Version history and edit analysis feed recurring corrections back into future generation prompts.
- **Managed OpenSCAD libraries**: Approved libraries such as BOSL2, Round-Anything, and MCAD can be installed into a local managed bundle with license gates.
- **Multi-provider LLM support**: The runtime can route generation through OpenAI, Anthropic, Google, DeepSeek, OpenRouter, Zhipu, Qwen, Mistral, and other configured providers.

## Quick Start

Requirements: Node.js 18+ and OpenSCAD in your PATH.

```bash
npm install
cp .env.example .env
npm run db:push
npm run dev:all
```

Open `http://localhost:3000`.

`npm run dev:all` starts the local Next.js app/API. It works on macOS, Linux, WSL, and Windows PowerShell.

Optional setup:

- Add model API keys in `.env`.
- Install approved OpenSCAD libraries:

```bash
npm run scad:libs:install
npm run scad:libs:check
```

- Run tests with Bun:

```bash
bun test
```

## Example Job

Input:

```text
Create a wall-mountable phone holder with rounded corners and two screw holes.
```

Output:

- `model.scad`: parametric OpenSCAD source with editable top-level assignments.
- `model.stl`: rendered mesh.
- `preview.png`: generated preview image.
- Validation report: mesh, manufacturing, and visual-intent checks.
- Editable parameters: constrained values exposed in the workspace UI.

AgentSCAD is centered around two CAD agents: a generation agent that creates OpenSCAD artifacts, and a repair agent that fixes failed geometry, validation blockers, or human-review edits. The workspace chat helper stays outside the main generation pipeline and is used for CAD explanations, parameter advice, and user-facing SCAD patches.

## Repo Mental Model

| Layer | What it owns | Where to look |
|---|---|---|
| Agent workflow | Job state machine, retries, SSE progress, automatic workspace refresh | `src/lib/pipeline/`, `src/app/api/jobs/[id]/process/route.ts`, `src/app/api/cron/route.ts` |
| Skills | CAD reasoning contracts, repair strategy, validation review, library usage policy | `skills/scad-*`, `skills/RESOLVER.md` |
| Tools | Deterministic render, validation, SCAD sanitization, parameter extraction, artifact IO | `src/lib/tools/`, `scripts/validate_stl.py` |
| Memory | Job state, version history, generated artifacts, learned patterns from edits | `prisma/schema.prisma`, `src/lib/version-tracker.ts`, `src/lib/improvement-analyzer.ts`, `skills/scad-generation/learned-patterns.json` |
| Workspace UI | CAD viewport, job queue, parameter editing, review panels, chat helper | `src/components/cad/`, `src/app/` |

## Memory at a Glance

AgentSCAD uses explicit product memory instead of opaque chat history:

- **Working memory**: current job state, request, parameters, SCAD source, artifacts, validation results, and logs.
- **Episodic memory**: field-level `JobVersion` history for parameter, source, and note edits.
- **Artifact memory**: generated `model.scad`, `model.stl`, `preview.png`, and reports under `public/artifacts/{jobId}/`.
- **Skill memory**: Markdown CAD skills, schemas, library policy, and in-process skill/schema caches.
- **Learned memory**: conservative learned patterns extracted from repeated user edits and validation failures.

See [docs/MEMORY.md](./docs/MEMORY.md) for the full memory design.

## Skills at a Glance

The CAD skill layer keeps model-facing judgment editable as Markdown while deterministic code handles rendering, validation, storage, and streaming.

| Skill | Role |
|---|---|
| `skills/scad-generation/` | Creates strict JSON containing a summary, compatibility parameter metadata, and complete `scad_source`. |
| `skills/scad-repair/` | Repairs broken or failed OpenSCAD while preserving design intent and runtime contracts. |
| `skills/scad-validation-review/` | Reviews render logs, artifacts, and validation results to decide deliver, repair, or human review. |
| `skills/scad-visual-validate/` | Compares rendered previews against the user request to catch visible intent failures. |
| `skills/scad-improvement/` | Documents the edit-analysis loop that learns from user corrections. |
| `skills/scad-library-*` | Guides approved external OpenSCAD library usage with runtime availability and license gates. |
| `skills/scad-chat/` | Provides workspace CAD help outside the main generation pipeline. |

See [docs/SKILLS.md](./docs/SKILLS.md) for the full CAD skill map.

## Managed OpenSCAD Libraries

The approved library catalog lives in `skills/scad-library-policy/manifest.json`. It records source repositories, pinned commits, detection files, include examples, and license gates.

The default managed library directory is outside the repository:

```bash
~/.cadcad/openscad-libraries
```

Install and check default-approved libraries:

```bash
npm run scad:libs:install
npm run scad:libs:check
```

Default installation currently includes BOSL2, Round-Anything, and MCAD. GPL libraries such as NopSCADlib are not installed by default; installing them requires an explicit opt-in:

```bash
npm run scad:libs:install:gpl
```

Generated SCAD may reference available libraries with `include` or `use`, but AgentSCAD does not copy third-party library source into generated SCAD.

## Common Commands

| Task | Command |
|---|---|
| Dev app | `npm run dev:all` or `npm run dev` |
| Dev app alias | `npm run dev:app` |
| Build | `bun run build` |
| Test | `bun test` or `bun run test` |
| Lint | `bun run lint` |
| Check OpenSCAD libraries | `npm run scad:libs:check` |
| Install default OpenSCAD libraries | `npm run scad:libs:install` |
| Install GPL OpenSCAD libraries explicitly | `npm run scad:libs:install:gpl` |

## Project Structure

- `/src/app/api/`: REST APIs, thin HTTP/SSE adapters, SCAD apply routes.
- `/src/components/cad/`: Domain-specific React components.
- `/src/lib/pipeline/`: CAD job runtime state machine.
- `/src/lib/harness/`: Skill runner and structured-output normalization.
- `/src/lib/tools/`: Deterministic rendering, validation, library resolution, sanitization, artifact, and parameter tools.
- `/src/lib/stores/`: Shared persistence helpers.
- `/prisma/`: ORM schema and database setup.
- `/skills/`: AI model capabilities, SCAD generation/repair/library policy, usage guides, and deterministic skill scripts.
- `/docs/`: Architecture, memory, skills, and frontend design notes.

## Deeper Docs

- [Architecture](./docs/ARCHITECTURE.md)
- [Memory](./docs/MEMORY.md)
- [Skills](./docs/SKILLS.md)
- [Frontend redesign plan](./docs/FRONTEND_REDESIGN_PLAN.md)
- [Design system](./DESIGN.md)

## License

MIT - see [LICENSE](./LICENSE) for details.
