import re

file_path = "/Volumes/SSD/Projects/Code/cadcad/src/app/api/models/route.ts"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

replacements = {
    "OpenAI最新GPT-4.1，增强指令遵循和编码能力，支持长上下文": "OpenAI's latest GPT-4.1, enhanced instruction following and coding capabilities, supports long context",
    "GPT-4.1轻量版，更快响应速度，高性价比": "GPT-4.1 lightweight version, faster response speed, high cost-effectiveness",
    "GPT-4.1超轻量版，最低延迟和成本，适合端侧部署": "GPT-4.1 ultra-lightweight version, lowest latency and cost, suitable for edge deployment",
    "OpenAI旗舰GPT-5，最强推理与编码能力，内置推理": "OpenAI flagship GPT-5, strongest reasoning and coding capabilities, built-in reasoning",
    "GPT-5轻量版，推理能力强，速度与成本兼顾": "GPT-5 lightweight version, strong reasoning capability, balances speed and cost",
    "OpenAI高级推理模型，强化思维链推理，适合复杂问题": "OpenAI advanced reasoning model, enhanced chain-of-thought reasoning, suitable for complex problems",
    "OpenAI最新轻量推理模型，高效推理能力": "OpenAI latest lightweight reasoning model, efficient reasoning capabilities",
    "OpenAI经典多模态模型（已被GPT-4.1替代，仍可使用）": "OpenAI classic multimodal model (replaced by GPT-4.1, but still usable)",
    "OpenRouter 路由的 OpenAI GPT-5.5，适合高质量 CAD 推理与 OpenSCAD 生成。": "OpenAI GPT-5.5 routed via OpenRouter, suitable for high-quality CAD reasoning and OpenSCAD generation.",
    "Anthropic最强模型，视觉理解和代理能力极强，支持1M上下文": "Anthropic's strongest model, extremely strong visual understanding and agent capabilities, supports 1M context",
    "Anthropic高可靠编码模型，适合复杂长时间任务": "Anthropic highly reliable coding model, suitable for complex long-duration tasks",
    "Anthropic最新Sonnet，编码/智能体/推理全面升级": "Anthropic latest Sonnet, comprehensive upgrade in coding/agents/reasoning",
    "Anthropic经典高性能模型，广泛使用": "Anthropic classic high-performance model, widely used",
    "Anthropic快速模型，极速响应，低延迟高吞吐": "Anthropic fast model, extremely fast response, low latency and high throughput",
    "Google最强推理模型，复杂任务首选，1M上下文": "Google strongest reasoning model, top choice for complex tasks, 1M context",
    "Google最新快速推理模型，速度与智能兼顾，含TTS增强": "Google latest fast reasoning model, balances speed and intelligence, includes TTS enhancement",
    "Google 3.0快速多模态模型，1M上下文，高效推理": "Google 3.0 fast multimodal model, 1M context, efficient reasoning",
    "Google思考型AI（已被3.1替代，仍可使用）": "Google thinking AI (replaced by 3.1, but still usable)",
    "Google快速推理模型（已被3.1替代，仍可使用）": "Google fast reasoning model (replaced by 3.1, but still usable)",
    "DeepSeek V4 Pro 推理增强模型，适合复杂 CAD/OpenSCAD 生成。": "DeepSeek V4 Pro reasoning-enhanced model, suitable for complex CAD/OpenSCAD generation.",
    "DeepSeek V4 Flash 快速模型，适合低延迟 CAD 草稿生成。": "DeepSeek V4 Flash fast model, suitable for low-latency CAD draft generation.",
    "DeepSeek旗舰对话模型，671B MoE架构，性价比极高": "DeepSeek flagship chat model, 671B MoE architecture, extremely high cost-effectiveness",
    "DeepSeek推理模型，强化推理与数学能力，对标o1": "DeepSeek reasoning model, enhanced reasoning and mathematical capabilities, benchmarking o1",
    "智谱最新旗舰，744B MoE，编码对标GPT-5级别，可持续工作8小时": "Zhipu latest flagship, 744B MoE, coding benchmarks at GPT-5 level, can work continuously for 8 hours",
    "智谱GLM-5加速版，更快响应，适合日常任务": "Zhipu GLM-5 accelerated version, faster response, suitable for daily tasks",
    "智谱增强版视觉模型，图像理解能力更强": "Zhipu enhanced vision model, stronger image understanding capabilities",
    "智谱高效免费/低价模型，极速响应": "Zhipu efficient free/low-cost model, extremely fast response",
    "阿里通义千问最强旗舰模型，复杂任务首选": "Alibaba Qwen strongest flagship model, top choice for complex tasks",
    "阿里最新增强版，文本媲美Qwen3-Max，多模态增强": "Alibaba latest enhanced version, text comparable to Qwen3-Max, multimodal enhanced",
    "通义千问视觉旗舰模型，图像理解与交互": "Qwen vision flagship model, image understanding and interaction",
    "阿里通义千问极速模型，最低延迟": "Alibaba Qwen ultra-fast model, lowest latency",
    "Mistral旗舰模型，顶级推理能力": "Mistral flagship model, top-tier reasoning capabilities",
    "Mistral轻量模型，快速高效": "Mistral lightweight model, fast and efficient",
    "Mistral代码专用模型，22B参数，编码专精": "Mistral code-specific model, 22B parameters, coding specialized",
    "providerName: \"智谱AI\"": "providerName: \"Zhipu AI\"",
    "providerName: \"阿里云\"": "providerName: \"Alibaba Cloud\""
}

for k, v in replacements.items():
    content = content.replace(k, v)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("route.ts updated successfully.")

file2_path = "/Volumes/SSD/Projects/Code/cadcad/src/components/cad/chat-panel.tsx"
with open(file2_path, "r", encoding="utf-8") as f:
    content2 = f.read()

replacements2 = {
    "Xiaomi MiMo 多模态模型": "Xiaomi MiMo multimodal model",
    "Xiaomi MiMo 默认模型": "Xiaomi MiMo default model",
    "Xiaomi MiMo 全模态模型": "Xiaomi MiMo full-modal model",
    "OpenAI旗舰多模态模型": "OpenAI flagship multimodal model",
    "智谱GLM-4高性能文本模型": "Zhipu GLM-4 high-performance text model",
    "智谱GLM-4V多模态模型": "Zhipu GLM-4V multimodal model",
    "providerName: '智谱AI'": "providerName: 'Zhipu AI'",
    "providerName: '阿里云'": "providerName: 'Alibaba Cloud'"
}

for k, v in replacements2.items():
    content2 = content2.replace(k, v)

with open(file2_path, "w", encoding="utf-8") as f:
    f.write(content2)

print("chat-panel.tsx updated successfully.")
