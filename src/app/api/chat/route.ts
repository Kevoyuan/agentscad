import { NextRequest } from "next/server";
import { db } from "@/lib/db";

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
    let systemPrompt = `You are AgentSCAD Assistant, an AI CAD engineer helper. You help users with:
- Designing parametric CAD models
- Understanding OpenSCAD code
- Optimizing 3D printable parts
- Answering questions about manufacturing constraints
- Suggesting parameter values for specific use cases

Be concise, technical, and helpful. When discussing code, use code blocks with the appropriate language tag.`;

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

    // Check if the model supports multimodal input
    const multimodalModels = ["glm-4v", "gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "qwen-vl-max"];
    const isMultimodal = multimodalModels.includes(model || "");

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

    // Try LLM via z-ai-web-dev-sdk with streaming
    try {
      const ZAIModule = await import("z-ai-web-dev-sdk");
      const ZAI = ZAIModule.default;
      const zai = await ZAI.create();

      // Build the create options - pass model if specified
      const createOptions: Record<string, unknown> = {
        messages: formattedMessages,
        stream: true,
      };

      if (model) {
        createOptions.model = model;
      }

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
