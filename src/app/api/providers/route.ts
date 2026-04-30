import { NextResponse } from "next/server";

import {
  deleteProviderSettings,
  readProviderSettings,
  toPublicProvider,
  upsertProviderSettings,
  type ProviderType,
} from "@/lib/provider-settings";

const ENV_PROVIDERS = [
  {
    id: "env-mimo",
    name: "Xiaomi MiMo",
    enabled: Boolean(process.env.MIMO_API_KEY?.trim()),
    envKey: "MIMO_API_KEY",
  },
  {
    id: "env-deepseek",
    name: "DeepSeek",
    enabled: Boolean(process.env.DEEPSEEK_API_KEY?.trim()),
    envKey: "DEEPSEEK_API_KEY",
  },
  {
    id: "env-openrouter",
    name: "OpenRouter",
    enabled: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
    envKey: "OPENROUTER_API_KEY",
  },
];

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET() {
  const providers = await readProviderSettings();
  return NextResponse.json({
    providers: providers.map(toPublicProvider),
    envProviders: ENV_PROVIDERS,
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) return badRequest("Invalid JSON body");

  const name = String(body.name || "").trim();
  const baseUrl = String(body.baseUrl || "").trim();
  const defaultModel = String(body.defaultModel || "").trim();
  const apiKey = typeof body.apiKey === "string" ? body.apiKey : undefined;
  const keepExistingApiKey = Boolean(body.keepExistingApiKey);

  if (!name) return badRequest("Provider name is required");
  if (!baseUrl) return badRequest("Base URL is required");
  if (!defaultModel) return badRequest("Default model is required");
  if (!apiKey?.trim() && !keepExistingApiKey && body.type !== "ollama") {
    return badRequest("API key is required");
  }

  const provider = await upsertProviderSettings({
    id: typeof body.id === "string" ? body.id : undefined,
    name,
    type: (body.type as ProviderType) || "openai-compatible",
    baseUrl,
    apiKey,
    keepExistingApiKey,
    defaultModel,
    enabled: body.enabled !== false,
    isDefault: Boolean(body.isDefault),
  });

  return NextResponse.json({ provider: toPublicProvider(provider) });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return badRequest("Provider id is required");
  await deleteProviderSettings(id);
  return NextResponse.json({ ok: true });
}
