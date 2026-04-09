# CAD Agent System

## English

A Business-Closed-Loop CAD Agent System for OpenSCAD. Transform natural language CAD requests into production-ready 3D models through a multi-agent orchestration pipeline.

### Features

- **Natural Language Interface** — Describe what you want in plain English, get OpenSCAD code
- **Multi-Agent Pipeline** — Coordinated agents for intake, template selection, generation, execution, validation, debugging, and reporting
- **Engineering Rules Engine** — Configurable validation rules ensure output quality
- **Case Memory** — Remembers successful patterns from previous jobs for better results
- **Retry & Recovery** — Automatic retry with intelligent state machine transitions
- **REST API** — Full API for job creation, status tracking, and artifact retrieval

### Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Intake    │────▶│  Template  │────▶│ Generator   │
│   Agent     │     │   Agent    │     │   Agent     │
└─────────────┘     └─────────────┘     └─────────────┘
                                              │
┌─────────────┐     ┌─────────────┐          ▼
│   Report    │◀────│   Debug    │◀────┌─────────────┐
│   Agent     │     │   Agent    │     │  Executor   │
└─────────────┘     └─────────────┘     │   Agent    │
                                          └─────────────┘
                                                  │
                                                  ▼
                                          ┌─────────────┐
                                          │  Validator  │
                                          │   Agent     │
                                          └─────────────┘
```

### Requirements

- Python 3.11+
- OpenSCAD
- LLM API key (OpenAI / Anthropic / Azure OpenAI / MiniMax Token Plan)
- For MiniMax M2.7, set `CAD_AGENT_LLM_PROVIDER=minimax`, `CAD_AGENT_MINIMAX_API_KEY=...`, and the Anthropic-compatible base URL is `https://api.minimaxi.com/anthropic`

### Quick Start

```bash
# Clone and install
pip install -e "cad-agent[dev]"

# Configure environment
cp .env.example .env
# Edit .env with your API keys and OpenSCAD path

# Run the API server
cad-agent

# Or run directly (from project root, using cad_agent's venv)

cad_agent/.venv/bin/python -m cad_agent.main

# Restart the server
# 1. Press Ctrl-C in the running terminal
# 2. Run the same start command again

# In Codex
# Run /start-dev to launch both backend and frontend together.
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/jobs` | Create a new CAD job |
| `POST` | `/jobs/{id}/process` | Start processing a job |
| `GET` | `/jobs/{id}` | Get job status and results |
| `GET` | `/jobs/{id}/artifacts/{type}` | Download STL/PNG/SCAD artifacts |
| `GET` | `/jobs` | List all jobs |
| `DELETE` | `/jobs/{id}` | Cancel a job |
| `GET` | `/templates` | List available templates |
| `GET` | `/case-memory/similar` | Find similar past cases |
| `GET` | `/health` | Health check |

### Example

```bash
curl -X POST http://localhost:8000/jobs \
  -H "Content-Type: application/json" \
  -d '{"input_request": "A 20mm cube with a 10mm cylindrical hole through the center"}'
```

### Development

```bash
# Run tests
pytest

# Lint
ruff check .

# Type check
mypy .
```

---

## 中文

商业闭环 CAD 代理系统，基于 OpenSCAD。将自然语言 CAD 需求转化为可生产的 3D 模型。

### 核心特性

- **自然语言接口** — 用日常语言描述需求，获取 OpenSCAD 代码
- **多代理管道** — 协调多个专业代理：接收、模板选择、生成、执行、验证、调试、报告
- **工程规则引擎** — 可配置验证规则，确保输出质量
- **案例记忆** — 记住历史成功案例，持续优化生成效果
- **重试与恢复** — 自动重试配合智能状态机转换
- **REST API** — 完整的作业管理、状态追踪和产物获取接口

### 系统架构

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   接收      │────▶│   模板      │────▶│   生成      │
│   代理      │     │   代理      │     │   代理      │
└─────────────┘     └─────────────┘     └─────────────┘
                                              │
┌─────────────┐     ┌─────────────┐          ▼
│   报告      │◀────│   调试      │◀────┌─────────────┐
│   代理      │     │   代理      │     │   执行      │
└─────────────┘     └─────────────┘     │   代理      │
                                          └─────────────┘
                                                  │
                                                  ▼
                                          ┌─────────────┐
                                          │   验证      │
                                          │   代理      │
                                          └─────────────┘
```

### 环境要求

- Python 3.11+
- OpenSCAD
- 大语言模型 API 密钥（OpenAI / Anthropic / Azure OpenAI / MiniMax Token Plan）
- 使用 MiniMax M2.7 时，设置 `CAD_AGENT_LLM_PROVIDER=minimax`、`CAD_AGENT_MINIMAX_API_KEY=...`，Anthropic 兼容地址为 `https://api.minimaxi.com/anthropic`

### 快速开始

```bash
# 安装
pip install -e "cad-agent[dev]"

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入 API 密钥和 OpenSCAD 路径

# 启动 API 服务
cad-agent

# 或直接运行 (从项目根目录执行，并使用 cad_agent 里的虚拟环境)
cd /Volumes/SSD/Projects/Code/agentscad
cad_agent/.venv/bin/python -m cad_agent.main

# 重启服务
# 1. 在运行中的终端按 Ctrl-C
# 2. 再执行一次相同的启动命令
```

### API 接口

| 方法 | 端点 | 描述 |
|------|------|------|
| `POST` | `/jobs` | 创建新 CAD 作业 |
| `POST` | `/jobs/{id}/process` | 开始处理作业 |
| `GET` | `/jobs/{id}` | 获取作业状态和结果 |
| `GET` | `/jobs/{id}/artifacts/{type}` | 下载 STL/PNG/SCAD 产物 |
| `GET` | `/jobs` | 列出所有作业 |
| `DELETE` | `/jobs/{id}` | 取消作业 |
| `GET` | `/templates` | 列出可用模板 |
| `GET` | `/case-memory/similar` | 查找相似历史案例 |
| `GET` | `/health` | 健康检查 |

### 使用示例

```bash
curl -X POST http://localhost:8000/jobs \
  -H "Content-Type: application/json" \
  -d '{"input_request": "一个20毫米的立方体，中心有一个10毫米的圆柱形通孔"}'
```

### 开发

```bash
# 运行测试
pytest

# 代码检查
ruff check .

# 类型检查
mypy .
```

---

## License

MIT
