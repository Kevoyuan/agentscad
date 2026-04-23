# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

| Task | Command |
|---|---|
| Dev (app only) | `bun run dev` |
| Dev (everything: app + WS service + DB) | `bun run dev:all` |
| Build for production | `bun run build` |
| Start production server | `bun run start` |
| Lint | `bun run lint` |
| Sync DB schema to SQLite | `bun run db:push` |
| Generate Prisma client | `bun run db:generate` |
| Run DB migrations | `bun run db:migrate` |
| Reset DB | `bun run db:reset` |

No test runner is configured. There is no `test` script in package.json.

## Architecture

**AgentSCAD** is an AI-powered CAD job management platform. Users submit natural-language descriptions; an LLM pipeline generates parametric OpenSCAD code, renders it via OpenSCAD CLI, and validates the geometry.

### Core Pipeline (the most important file)

`src/app/api/jobs/[id]/process/route.ts` — the state machine that drives every job:

1. **INTAKE** — parse the user's request
2. **GENERATE** — LLM generates OpenSCAD code (falls back to template-based mock code). Auto-detects part family (spur_gear, device_stand, electronics_enclosure, phone_case).
3. **RENDER** — OpenSCAD CLI renders .scad to STL + PNG
4. **VALIDATE** — rules engine checks wall thickness, dimensions, manifold geometry
5. **DELIVER** — artifacts ready (SCAD source, STL, PNG, parameters, validation report)

Each step emits SSE events to the frontend and broadcasts via WebSocket.

### API Layer

Next.js Route Handlers under `src/app/api/`:
- `jobs/` — CRUD, batch operations, pipeline processing, SCAD editing, versioning
- `chat/` — LLM chat with SSE streaming
- `models/` — 30+ model definitions from 7 providers
- `health/` — health check

### Frontend

`src/components/cad/workspace/MainWorkspace.tsx` (~1700 lines) is the central UI — a 3-panel IDE-like layout:
- **Left**: Job list with drag-and-drop reordering
- **Center**: 3D viewer (Three.js/R3F) + pipeline status
- **Right**: 9-tab inspector (PARAMS, RENDER, VALIDATE, SCAD, LOG, NOTES, DEPS, HISTORY, AI)

Key client files:
- `src/components/cad/api.ts` — client-side API functions + SSE streaming helpers
- `src/components/cad/types.tsx` — job types, state colors, pipeline step definitions

### Database

Prisma ORM with SQLite (`db/custom.db`). Two models: `Job` (18 fields) and `JobVersion` (field-level audit trail).

### Mini-Services

- `mini-services/ws-service/` — standalone Socket.IO server on port 3003 for real-time job update broadcasts
- `mini-services/next-dev/` — dev wrapper that auto-restarts Next.js on crash

### LLM Integration

- `src/lib/mimo.ts` — Xiaomi MiMo API client (OpenAI-compatible format)
- Primary LLM provider, with `z-ai-web-dev-sdk` as fallback

## Key Config

- **Runtime**: Bun (primary), Node.js as fallback
- **Path alias**: `@/*` maps to `./src/*`
- **Build**: standalone Next.js output (`next.config.ts`)
- **Styling**: Tailwind CSS v4 + Shadcn UI (new-york style, CSS variable theming, lucide icons)
- **ESLint**: nearly all rules disabled (flat config in `eslint.config.mjs`)
- **Required external tool**: OpenSCAD must be installed and in PATH for the rendering pipeline

## Env Variables

Copy `.env.example` to `.env`. Required: `DATABASE_URL` (SQLite path), `MIMO_BASE_URL`, `MIMO_MODEL`, `MIMO_API_KEY`.
