# CAD Agent System

A single-pass CAD agent system for OpenSCAD. It turns natural language requests into editable parameters, OpenSCAD, rendered artifacts, and validation results.

## Features

- **Natural Language Interface** — Describe what you want in plain language, get OpenSCAD code
- **Single-Pass Generation** — One LLM call returns explicit parameters and OpenSCAD together
- **Deterministic Harness** — Rendering, validation, retry, and delivery stay outside the model loop
- **Engineering Rules Engine** — Configurable validation rules ensure output quality
- **Case Memory** — Remembers successful patterns from previous jobs for better results
- **Retry & Recovery** — Automatic retry with intelligent state machine transitions
- **REST API** — Full API for job creation, status tracking, and artifact retrieval

## Architecture

```
NEW -> SCAD_GENERATED -> RENDERED -> VALIDATED -> DELIVERED
                     -> DEBUGGING -> REPAIRING -> SCAD_GENERATED
```

### Key Agents

| Agent | Purpose |
|-------|---------|
| `GeneratorAgent` | Generates parameter metadata and SCAD in one step |
| `ExecutorAgent` | Executes OpenSCAD to render STL/PNG |
| `ValidatorAgent` | Validates against engineering rules |
| `DebugAgent` | Diagnoses failures |
| `ReportAgent` | Generates delivery artifacts |

## Requirements

- Python 3.11+
- OpenSCAD
- LLM API key (OpenAI / Anthropic / Azure OpenAI / MiniMax Token Plan)
- For MiniMax M2.7: set `CAD_AGENT_LLM_PROVIDER=minimax`, `CAD_AGENT_MINIMAX_API_KEY=...`, and use the Anthropic-compatible endpoint `https://api.minimaxi.com/anthropic`

## Quick Start

```bash
# Install dependencies
cd cad_agent
pip install -e ".[dev]"

# Configure environment
cp .env.example .env
# Edit .env with your API keys and OpenSCAD path

# Start the API server (from project root)
cd ..
PYTHONPATH=. .venv/bin/python -m cad_agent.main

# Or use the CLI
cd cad_agent
.venv/bin/cad-agent
```

### Development Server

From the Codex, run `/start-dev` to launch both backend (port 8000) and frontend (port 4174) together.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/jobs` | Create a new CAD job |
| `POST` | `/jobs/{id}/process` | Start processing a job |
| `GET` | `/jobs/{id}` | Get job status and results |
| `GET` | `/jobs/{id}/artifacts/{type}` | Download STL/PNG/SCAD artifacts |
| `GET` | `/jobs` | List all jobs |
| `DELETE` | `/jobs/{id}` | Cancel a job |
| `GET` | `/case-memory/similar` | Find similar past cases |
| `GET` | `/health` | Health check |

## Example

```bash
curl -X POST http://localhost:8000/jobs \
  -H "Content-Type: application/json" \
  -d '{"input_request": "A 20mm cube with a 10mm cylindrical hole through the center"}'
```

## Development

```bash
# Run tests
cd cad_agent
PYTHONPATH=. .venv/bin/python -m pytest

# Lint
.venv/bin/ruff check .

# Type check
.venv/bin/mypy .
```

## Project Structure

```
agentscad/
├── cad_agent/
│   ├── app/
│   │   ├── agents/        # OrchestratorAgent + harness agents
│   │   ├── llm/           # LLM clients, single-pass generator, design critic
│   │   ├── models/        # DesignJob, JobState, agent results
│   │   ├── rules/         # Engineering rules, retry policies
│   │   ├── storage/       # SQLiteJobRepository
│   │   └── tools/         # OpenSCAD executor
│   ├── tests/
│   ├── cli.py
│   ├── config.py
│   └── main.py
├── frontend/              # Static HTML/JS frontend
├── CLAUDE.md              # Claude Code guidance
└── README.md / README_zh.md
```

---

## License

MIT
