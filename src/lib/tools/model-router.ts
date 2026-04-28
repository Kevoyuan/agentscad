import {
  createMimoChatCompletion,
  getMimoConfig,
  MIMO_DEFAULT_MODEL,
  type MimoMessage,
} from "@/lib/mimo";
import { createDeepSeekChatCompletion } from "@/lib/deepseek";
import {
  createOpenRouterChatCompletion,
  isOpenRouterModel,
} from "@/lib/openrouter";
import { parseJsonObject } from "@/lib/harness/structured-output";

export interface ModelRouterRequest {
  messages: MimoMessage[];
  model?: string;
  stream?: boolean;
  preferMimo?: boolean;
}

export async function createChatCompletionWithFallback({
  messages,
  model,
  stream = false,
  preferMimo = true,
}: ModelRouterRequest): Promise<string> {
  if (isOpenRouterModel(model)) {
    const openRouterResponse = await createOpenRouterChatCompletion({
      model,
      messages,
      stream,
    });
    const result = await openRouterResponse.json();
    return result?.choices?.[0]?.message?.content ?? JSON.stringify(result);
  }

  if (model?.startsWith("deepseek-")) {
    const deepSeekResponse = await createDeepSeekChatCompletion({
      model,
      messages,
      stream,
    });
    const result = await deepSeekResponse.json();
    return result?.choices?.[0]?.message?.content ?? JSON.stringify(result);
  }

  if (preferMimo && getMimoConfig().enabled) {
    const mimoResponse = await createMimoChatCompletion({
      model: model || process.env.MIMO_MODEL || MIMO_DEFAULT_MODEL,
      messages,
      stream,
    });
    const result = await mimoResponse.json();
    return result?.choices?.[0]?.message?.content ?? JSON.stringify(result);
  }

  const ZAIModule = await import("z-ai-web-dev-sdk");
  const ZAI = ZAIModule.default;
  const zai = await ZAI.create();

  const result = await zai.chat.completions.create({
    messages: messages.map((message) => ({
      role:
        message.role === "system" || message.role === "assistant"
          ? message.role
          : "user",
      content:
        typeof message.content === "string"
          ? message.content
          : message.content
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join("\n"),
    })),
    stream,
  });

  return (
    result?.choices?.[0]?.message?.content ??
    result?.data?.content ??
    (typeof result === "string" ? result : JSON.stringify(result))
  );
}

export async function callModelText(request: ModelRouterRequest): Promise<string> {
  return createChatCompletionWithFallback(request);
}

export async function callModelJson<T>(
  request: ModelRouterRequest,
  fallback: T
): Promise<T> {
  const text = await callModelText(request);
  return parseJsonObject<T>(text, fallback);
}
