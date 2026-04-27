# AgentSCAD

AgentSCAD is a full-stack AI-powered CAD job management platform. It translates natural-language requests into parametric OpenSCAD code through a multi-stage AI pipeline, tracking the design lifecycle from intake to delivery.

## Features

- **Natural Language to CAD**: Uses advanced LLMs to infer part families, generate parametric schemas, and write OpenSCAD geometry.
- **Multi-Stage Pipeline**: Organized state machine (Intake → Generate → Render → Validate → Deliver).
- **Multi-Provider LLM Support**: Supports over 30 models from 7 providers (OpenAI, Anthropic, Google, DeepSeek, Zhipu, Qwen, Mistral).
- **Real-Time Workspace**: Server-Sent Events (SSE) stream generation progress, while a standalone Socket.IO microservice broadcasts global job updates.
- **Parametric Editing**: Instantly tweak CAD parameters (like wall thickness or teeth count) within schema constraints.
- **Artifact-First SCAD**: Treats generated OpenSCAD as the source of truth and extracts editable numeric parameters from top-level SCAD assignments.
- **Managed OpenSCAD Libraries**: Can install approved OpenSCAD libraries into a local managed bundle with license gates.
- **Audit Trails**: Field-level version tracking for parameters and SCAD source changes.

## Architecture

- **Frontend**: React 19 + Next.js 16 App Router + Tailwind CSS v4 + Shadcn UI
- **Backend API**: Next.js Route Handlers
- **Database**: SQLite with Prisma ORM
- **Microservices**: Node.js + Socket.IO (Port 3003) for WebSocket broadcast
- **Reverse Proxy**: Caddy (Port 81)

### Agent Architecture: Thin Harness, Fat CAD Skills

AgentSCAD keeps CAD judgment in Markdown skills and deterministic execution in TypeScript/Python tools. Skills such as `scad-generation`, `scad-repair`, `scad-validation-review`, `scad-chat`, `scad-visual-validate`, and the `scad-library-*` skills describe how the model should reason about CAD, repair, validation, manufacturing review, and library usage. The harness loads those skills, calls the model, parses structured JSON, records traces, and delegates deterministic work.

OpenSCAD rendering, artifact paths, Prisma writes, SCAD sanitization, SSE framing, Socket.IO broadcasts, file IO, Python/trimesh validation, and tests stay in code. Runtime contracts are intentionally stable: SSE uses raw `data: {json}\n\n` frames, public artifacts stay under `/artifacts/{jobId}/`, and validation results keep the `rule_id`, `rule_name`, `level`, `passed`, `is_critical`, `message` shape.

The generation path is artifact-first: the OpenSCAD source is the source of truth, and AgentSCAD deterministically extracts editable numeric parameters from top-level SCAD assignments. Model-provided parameter JSON is treated as compatibility metadata and fallback, not as the primary CAD representation.

The HTTP process route is intentionally thin. `src/app/api/jobs/[id]/process/route.ts` validates request state and streams SSE frames, while `src/lib/pipeline/execute-cad-job.ts` owns the current runtime state machine. Shared tools under `src/lib/tools/` handle rendering, validation, SCAD sanitization, OpenSCAD library resolution, and parameter extraction.

### Managed OpenSCAD Libraries

AgentSCAD may use approved OpenSCAD libraries when the runtime reports them as available. The approved library catalog lives in `skills/scad-library-policy/manifest.json`; it records source repositories, pinned commits, detection files, include examples, and license gates.

The default managed library directory is outside the repository:

```bash
~/.cadcad/openscad-libraries
```

Install default-approved libraries:

```bash
bun run scad:libs:install
```

Check installed libraries:

```bash
bun run scad:libs:check
```

Default installation currently includes BOSL2, Round-Anything, and MCAD. GPL libraries such as NopSCADlib are not installed by default; installing them requires an explicit opt-in:

```bash
bun run scad:libs:install:gpl
```

Generated SCAD may reference available libraries with `include` or `use`, but AgentSCAD does not copy third-party library source into generated SCAD. Keep third-party library source out of this repository unless a human explicitly reviews and approves the licensing and distribution model.

## Getting Started

### Prerequisites
- Node.js >= 18
- Bun or npm
- OpenSCAD installed and in your PATH (for rendering step)

### Setup

1. Install dependencies:
   ```bash
   npm install
   # or
   bun install
   ```

2. Setup database:
   ```bash
   npx prisma db push
   ```

3. Environment setup:
   Copy `.env.example` to `.env` and fill in necessary API keys.
   ```bash
   cp .env.example .env
   ```

4. Install managed OpenSCAD libraries:
   ```bash
   bun run scad:libs:install
   bun run scad:libs:check
   ```

5. Start development servers:
   ```bash
   # Start the WebSocket service
   cd mini-services/ws-service
   npm install
   npm run start &
   cd ../..

   # Start the Next.js app
   npm run dev
   ```

6. Access the workspace at `http://localhost:3000`.

## Common Commands

| Task | Command |
|---|---|
| Dev app | `bun run dev` |
| Dev app + services | `bun run dev:all` |
| Build | `bun run build` |
| Test | `bun test` or `bun run test` |
| Lint | `bun run lint` |
| Check OpenSCAD libraries | `bun run scad:libs:check` |
| Install default OpenSCAD libraries | `bun run scad:libs:install` |
| Install GPL OpenSCAD libraries explicitly | `bun run scad:libs:install:gpl` |

## Project Structure

- `/src/app/api/`: REST APIs, thin HTTP/SSE adapters, SCAD apply routes
- `/src/components/cad/`: Domain-specific React components
- `/src/lib/pipeline/`: CAD job runtime state machine
- `/src/lib/harness/`: Skill runner and structured-output normalization
- `/src/lib/tools/`: Deterministic rendering, validation, library resolution, sanitization, artifact, and parameter tools
- `/src/lib/stores/`: Shared persistence helpers
- `/mini-services/ws-service/`: WebSocket broadcast server
- `/prisma/`: ORM schema and database setup
- `/skills/`: AI model capabilities, SCAD generation/repair/library policy, library usage guides, and deterministic skill scripts
- `/docs/thin-harness-fat-skills.md`: Architecture contract for thin harness / fat skills work
