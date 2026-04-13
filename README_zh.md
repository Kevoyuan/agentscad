# CAD Agent 系统

商业闭环 CAD 代理系统，基于 OpenSCAD。将自然语言 CAD 需求转化为可生产的 3D 模型，通过多代理编排管道完成。

## 核心特性

- **自然语言接口** — 用日常语言描述需求，自动生成 OpenSCAD 代码
- **多代理管道** — 协调多个专业代理：接收、研究、意图解析、设计、参数架构、生成、执行、验证、报告
- **参数化构建器** — 确定性几何构建器（齿轮、设备支架、外壳），替代原有模板替换方案
- **工程规则引擎** — 可配置验证规则，确保输出质量
- **案例记忆** — 记住历史成功案例，持续优化生成效果
- **重试与恢复** — 自动重试配合智能状态机转换
- **REST API** — 完整的作业管理、状态追踪和产物获取接口

## 系统架构

```
NEW -> RESEARCHED -> INTENT_RESOLVED -> DESIGN_RESOLVED -> PARAMETERS_GENERATED
    -> GEOMETRY_BUILT -> RENDERED -> VALIDATED -> ACCEPTED -> DELIVERED
```

### 核心代理

| 代理 | 功能 |
|------|------|
| `ResearchAgent` | 收集外部参考信息（设备尺寸、标准规范） |
| `IntentAgent` | 将请求分类为零件族（手机壳、齿轮、设备支架等） |
| `DesignAgent` | 提出形状方案和可编辑控件 |
| `ParameterSchemaAgent` | 将设计转换为可编辑的参数架构 |
| `GeneratorAgent` | 通过参数化构建器或 LLM 生成 SCAD 代码 |
| `ExecutorAgent` | 执行 OpenSCAD 渲染 STL/PNG |
| `ValidatorAgent` | 根据工程规则进行验证 |
| `DebugAgent` | 诊断失败原因 |
| `ReportAgent` | 生成交付产物 |

### 参数化构建器

- `SpurGearBuilder` — 渐开线齿轮几何
- `DeviceStandBuilder` — 带拱形/托架结构的设备支架
- `EnclosureBuilder` — 带外壳/卡扣配合的盒式外壳

## 环境要求

- Python 3.11+
- OpenSCAD
- 大语言模型 API 密钥（OpenAI / Anthropic / Azure OpenAI / MiniMax Token Plan）
- 使用 MiniMax M2.7 时：设置 `CAD_AGENT_LLM_PROVIDER=minimax`、`CAD_AGENT_MINIMAX_API_KEY=...`，使用 Anthropic 兼容端点 `https://api.minimaxi.com/anthropic`

## 快速开始

```bash
# 安装依赖
cd cad_agent
pip install -e ".[dev]"

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入 API 密钥和 OpenSCAD 路径

# 启动 API 服务（从项目根目录）
cd ..
PYTHONPATH=. .venv/bin/python -m cad_agent.main

# 或使用 CLI
cd cad_agent
.venv/bin/cad-agent
```

### 开发服务器

在 Codex 中运行 `/start-dev` 可同时启动后端（端口 8000）和前端（端口 4174）。

## API 接口

| 方法 | 端点 | 描述 |
|------|------|------|
| `POST` | `/jobs` | 创建新 CAD 作业 |
| `POST` | `/jobs/{id}/process` | 开始处理作业 |
| `GET` | `/jobs/{id}` | 获取作业状态和结果 |
| `GET` | `/jobs/{id}/artifacts/{type}` | 下载 STL/PNG/SCAD 产物 |
| `GET` | `/jobs` | 列出所有作业 |
| `DELETE` | `/jobs/{id}` | 取消作业 |
| `GET` | `/case-memory/similar` | 查找相似历史案例 |
| `GET` | `/health` | 健康检查 |

## 使用示例

```bash
curl -X POST http://localhost:8000/jobs \
  -H "Content-Type: application/json" \
  -d '{"input_request": "一个20毫米的立方体，中心有一个10毫米的圆柱形通孔"}'
```

## 开发

```bash
# 运行测试
cd cad_agent
PYTHONPATH=. .venv/bin/python -m pytest

# 代码检查
.venv/bin/ruff check .

# 类型检查
.venv/bin/mypy .
```

## 项目结构

```
agentscad/
├── cad_agent/
│   ├── app/
│   │   ├── agents/        # OrchestratorAgent、IntentAgent、GeneratorAgent 等
│   │   ├── llm/           # LLM 客户端、规格解析器、SCAD 生成器
│   │   ├── models/        # DesignJob、JobState、代理结果
│   │   ├── parametric/     # ParametricPartEngine
│   │   ├── research/       # ResearchAgent、MinimaxVisionAdapter
│   │   ├── rules/          # 工程规则、重试策略
│   │   ├── storage/        # SQLiteJobRepository
│   │   └── templates/      # Jinja2 SCAD 模板（已弃用）
│   ├── tests/
│   ├── cli.py
│   ├── config.py
│   └── main.py
├── frontend/              # 静态 HTML/JS 前端
├── CLAUDE.md              # Claude Code 指南
└── README.md / README_zh.md
```

---

## 许可证

MIT
