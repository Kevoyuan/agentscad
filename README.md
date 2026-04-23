# AgentSCAD

AgentSCAD is a full-stack AI-powered CAD job management platform. It translates natural-language requests into parametric OpenSCAD code through a multi-stage AI pipeline, tracking the design lifecycle from intake to delivery.

## Features

- **Natural Language to CAD**: Uses advanced LLMs to infer part families, generate parametric schemas, and write OpenSCAD geometry.
- **Multi-Stage Pipeline**: Organized state machine (Intake → Generate → Render → Validate → Deliver).
- **Multi-Provider LLM Support**: Supports over 30 models from 7 providers (OpenAI, Anthropic, Google, DeepSeek, Zhipu, Qwen, Mistral).
- **Real-Time Workspace**: Server-Sent Events (SSE) stream generation progress, while a standalone Socket.IO microservice broadcasts global job updates.
- **Parametric Editing**: Instantly tweak CAD parameters (like wall thickness or teeth count) within schema constraints.
- **Audit Trails**: Field-level version tracking for parameters and SCAD source changes.

## Architecture

- **Frontend**: React 19 + Next.js 16 App Router + Tailwind CSS v4 + Shadcn UI
- **Backend API**: Next.js Route Handlers
- **Database**: SQLite with Prisma ORM
- **Microservices**: Node.js + Socket.IO (Port 3003) for WebSocket broadcast
- **Reverse Proxy**: Caddy (Port 81)

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

4. Start development servers:
   ```bash
   # Start the WebSocket service
   cd mini-services/ws-service
   npm install
   npm run start &
   cd ../..

   # Start the Next.js app
   npm run dev
   ```

5. Access the workspace at `http://localhost:3000`.

## Project Structure

- `/src/app/api/`: REST APIs and AI pipeline orchestrator
- `/src/components/cad/`: Domain-specific React components
- `/mini-services/ws-service/`: WebSocket broadcast server
- `/prisma/`: ORM schema and database setup
- `/skills/`: AI model capabilities definition
