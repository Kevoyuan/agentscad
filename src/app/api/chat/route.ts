import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, jobId } = body as {
      messages: Array<{ role: string; content: string }>;
      jobId?: string;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages array is required" },
        { status: 400 }
      );
    }

    // Build system prompt with optional job context
    let systemPrompt = `You are AgentSCAD Assistant, an AI CAD engineer helper. You help users with:
- Designing parametric CAD models
- Understanding OpenSCAD code
- Optimizing 3D printable parts
- Answering questions about manufacturing constraints
- Suggesting parameter values for specific use cases

Be concise, technical, and helpful. When discussing code, use code blocks.`;

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

    // Try LLM via z-ai-web-dev-sdk
    try {
      const ZAIModule = await import("z-ai-web-dev-sdk");
      const ZAI = ZAIModule.default;
      const zai = await ZAI.create();

      const result = await zai.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: false,
      });

      const content =
        result?.choices?.[0]?.message?.content ??
        result?.data?.content ??
        (typeof result === "string" ? result : JSON.stringify(result));

      return NextResponse.json({
        message: {
          role: "assistant",
          content: typeof content === "string" ? content : JSON.stringify(content),
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

      return NextResponse.json({
        message: {
          role: "assistant",
          content: fallbackContent,
        },
      });
    }
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Failed to process chat request" },
      { status: 500 }
    );
  }
}
