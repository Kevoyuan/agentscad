import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { createMimoChatCompletion, getMimoConfig, MIMO_DEFAULT_MODEL } from "@/lib/mimo";
import { loadSkill } from "@/lib/skill-resolver";

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type ChatMessage = {
  role: string;
  content: string | ContentPart[];
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, jobId, model, images } = body as {
      messages: Array<{ role: string; content: string }>;
      jobId?: string;
      model?: string;
      images?: string[];
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "Messages array is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build system prompt with optional job context
    // Try loading from skill file first, fall back to hardcoded default
    const SKILL_FALLBACK = `You are AgentSCAD Assistant, an AI CAD engineer helper. You help users with:
- Designing parametric CAD models
- Understanding OpenSCAD code
- Optimizing 3D printable parts
- Answering questions about manufacturing constraints
- Suggesting parameter values for specific use cases

Be concise, technical, and helpful. When discussing code, use code blocks with the appropriate language tag.

When proposing a full replacement SCAD file or an editable SCAD patch, wrap the code in a single \`\`\`openscad code block so it can be applied directly.`;

    let systemPrompt = (await loadSkill("scad-chat")) || SKILL_FALLBACK;

    if (jobId) {
      const job = await db.job.findUnique({ where: { id: jobId } });
      if (job) {
        const paramSchema = job.parameterSchema
          ? JSON.parse(job.parameterSchema)
          : null;
        const paramValues = job.parameterValues
          ? JSON.parse(job.parameterValues)
          : null;

        systemPrompt += `\n\nCurrent job context:
- Job ID: ${job.id}
- State: ${job.state}
- Request: "${job.inputRequest}"
- Part Family: ${job.partFamily || "unknown"}
- Builder: ${job.builderName || "unknown"}
- Parameter Schema: ${paramSchema ? JSON.stringify(paramSchema, null, 2) : "N/A"}
- Current Parameter Values: ${paramValues ? JSON.stringify(paramValues, null, 2) : "N/A"}
${job.scadSource ? `\nGenerated SCAD Code:\n\`\`\`openscad\n${job.scadSource}\n\`\`\`` : ""}`;

        if (job.validationResults) {
          try {
            const validation = JSON.parse(job.validationResults);
            systemPrompt += `\n\nValidation Results: ${JSON.stringify(validation, null, 2)}`;
          } catch {
            // skip
          }
        }
      }
    }

    // Build formatted messages - handle multimodal content for vision models
    const formattedMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
    ];

    const requestedModel = model || process.env.MIMO_MODEL || MIMO_DEFAULT_MODEL;

    // Check if the model supports multimodal input
    const multimodalModels = [
      // Xiaomi MiMo
      "mimo-v2.5",
      "mimo-v2-omni",
      // OpenAI
      "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-5", "gpt-5-mini", "gpt-4o", "o4-mini",
      // Anthropic
      "claude-opus-4-7-20260401", "claude-opus-4-6-20260205", "claude-sonnet-4-6-20260217", "claude-sonnet-4-5-20251022", "claude-haiku-4-5-20251022",
      // Google
      "gemini-3.1-pro", "gemini-3.1-flash", "gemini-3-flash", "gemini-2.5-pro", "gemini-2.5-flash",
      // Zhipu
      "glm-5.1", "glm-5-turbo", "glm-4v-plus",
      // Qwen
      "qwen3.5-plus", "qwen3-vl",
    ];
    const isMultimodal = multimodalModels.includes(requestedModel);

    for (const msg of messages) {
      if (
        isMultimodal &&
        images &&
        images.length > 0 &&
        msg.role === "user"
      ) {
        // For multimodal models with images, format user message as content parts
        const contentParts: ContentPart[] = [
          { type: "text", text: msg.content },
          ...images.map(
            (img) =>
              ({
                type: "image_url",
                image_url: { url: img.startsWith("data:") ? img : `data:image/png;base64,${img}` },
              }) as ContentPart
          ),
        ];
        formattedMessages.push({ role: msg.role, content: contentParts });
      } else {
        formattedMessages.push({ role: msg.role, content: msg.content });
      }
    }

    const mimoConfig = getMimoConfig();

    // Try Xiaomi MiMo first when configured or explicitly selected
    try {
      const shouldUseMimo = mimoConfig.enabled || requestedModel.startsWith("mimo-");

      if (shouldUseMimo) {
        const mimoResponse = await createMimoChatCompletion({
          messages: formattedMessages,
          model: requestedModel,
          stream: true,
        });

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        const stream = new ReadableStream({
          async start(controller) {
            const reader = mimoResponse.body?.getReader();

            if (!reader) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "error", message: "MiMo response body unavailable" })}\n\n`)
              );
              controller.close();
              return;
            }

            let buffer = "";

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const rawLine of lines) {
                  const line = rawLine.trim();
                  if (!line.startsWith("data:")) continue;

                  const payload = line.slice(5).trim();
                  if (!payload) continue;

                  if (payload === "[DONE]") {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
                    );
                    controller.close();
                    return;
                  }

                  try {
                    const chunk = JSON.parse(payload);
                    const content = chunk?.choices?.[0]?.delta?.content ?? "";
                    if (content) {
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ type: "token", content })}\n\n`)
                      );
                    }
                  } catch {
                    // Ignore malformed provider SSE lines
                  }
                }
              }

              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
              );
              controller.close();
            } catch (streamErr) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "error", message: streamErr instanceof Error ? streamErr.message : "MiMo stream interrupted" })}\n\n`)
              );
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }
    } catch (mimoError) {
      console.warn("MiMo chat request failed, falling back:", mimoError);
    }

    // Try LLM via z-ai-web-dev-sdk with streaming
    try {
      const ZAIModule = await import("z-ai-web-dev-sdk");
      const ZAI = ZAIModule.default;
      const zai = await ZAI.create();

      // Build the create options - pass model if specified
      const fallbackMessages = formattedMessages.map((msg) => ({
        role: msg.role as "system" | "user" | "assistant",
        content:
          typeof msg.content === "string"
            ? msg.content
            : msg.content
                .map((part) => (part.type === "text" ? part.text : "[image]"))
                .join("\n"),
      }));

      const createOptions = {
        messages: fallbackMessages,
        stream: true,
        ...(model ? { model } : {}),
      };

      const result = await zai.chat.completions.create(createOptions);

      // If the result is a streaming response (has iterator/async iterator)
      if (result && typeof result === "object" && Symbol.asyncIterator in result) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            try {
              for await (const chunk of result) {
                const content =
                  chunk?.choices?.[0]?.delta?.content ??
                  chunk?.data?.content ??
                  "";
                if (content) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: "token", content })}\n\n`)
                  );
                }
              }
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
              );
              controller.close();
            } catch (streamErr) {
              console.warn("Stream error:", streamErr);
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "error", message: "Stream interrupted" })}\n\n`)
              );
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }

      // If result is not a stream but a regular response, still send as SSE
      const content =
        result?.choices?.[0]?.message?.content ??
        result?.data?.content ??
        (typeof result === "string" ? result : JSON.stringify(result));

      const fullContent = typeof content === "string" ? content : JSON.stringify(content);
      const encoder = new TextEncoder();

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "token", content: fullContent })}\n\n`)
          );
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
          );
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } catch (llmError) {
      console.warn(
        "LLM unavailable for chat, using fallback:",
        llmError instanceof Error ? llmError.message : "Unknown error"
      );

      // Fallback response
      const lastUserMsg = messages[messages.length - 1]?.content || "";
      const lowerMsg = lastUserMsg.toLowerCase();

      let fallbackContent =
        "I'm currently unable to connect to the AI service. Please try again later.";

      if (lowerMsg.includes("wall") || lowerMsg.includes("thickness")) {
        fallbackContent =
          "For FDM 3D printing, minimum wall thickness should be 1.2mm. For structural parts, 2-3mm is recommended. Thinner walls may lead to print failures.";
      } else if (lowerMsg.includes("gear") || lowerMsg.includes("teeth")) {
        fallbackContent =
          "For spur gears, ensure the number of teeth is at least 8 for proper meshing. The pressure angle is typically 20° for standard gears. Module = pitch diameter / number of teeth.";
      } else if (lowerMsg.includes("tolerance") || lowerMsg.includes("clearance")) {
        fallbackContent =
          "For FDM printing, a clearance of 0.2mm is typical for tight fits and 0.4mm for loose fits. Adjust based on your printer's capabilities.";
      } else if (lowerMsg.includes("parameter") || lowerMsg.includes("dimension")) {
        fallbackContent =
          "You can adjust parameters using the sliders in the PARAMS tab. Changes are saved automatically. Key parameters to consider: wall thickness (min 1.2mm), overall dimensions, and corner radii.";
      }

      // Send fallback as SSE too for consistent handling
      const encoder = new TextEncoder();
      const fallbackStream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "token", content: fallbackContent })}\n\n`)
          );
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
          );
          controller.close();
        },
      });

      return new Response(fallbackStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process chat request" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
