import fs from "fs/promises";
import path from "path";
import { createMimoChatCompletion, getMimoConfig } from "@/lib/mimo";
import { loadSkill } from "@/lib/skill-resolver";
import type { ValidationResult } from "@/lib/mesh-validator";

type VisualValidationIssue = {
  severity?: string;
  feature?: string;
  message?: string;
};

type VisualValidationResponse = {
  passed?: boolean;
  confidence?: number;
  summary?: string;
  issues?: VisualValidationIssue[];
  missing_features?: string[];
};

function skippedResult(reason: string): ValidationResult {
  return {
    rule_id: "V001",
    rule_name: "Visual Design Intent Match",
    level: "SEMANTIC",
    passed: true,
    is_critical: false,
    message: `Skipped — ${reason}`,
  };
}

function extractJsonObject(raw: string): VisualValidationResponse | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;

  try {
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as VisualValidationResponse;
  } catch {
    return null;
  }
}

function buildResult(parsed: VisualValidationResponse, raw: string): ValidationResult {
  const issues = Array.isArray(parsed.issues) ? parsed.issues : [];
  const criticalIssues = issues.filter((issue) => issue.severity === "critical");
  const missingFeatures = Array.isArray(parsed.missing_features) ? parsed.missing_features : [];
  const passed = parsed.passed !== false && criticalIssues.length === 0;
  const summary = parsed.summary?.trim() || (passed ? "Rendered preview matches visible design intent" : "Rendered preview has visible design-intent issues");
  const issueSummary = issues
    .map((issue) => {
      const feature = issue.feature ? `${issue.feature}: ` : "";
      return `${feature}${issue.message || issue.severity || "visual issue"}`;
    })
    .filter(Boolean)
    .slice(0, 3)
    .join(" | ");
  const missingSummary = missingFeatures.length ? ` Missing: ${missingFeatures.slice(0, 5).join(", ")}.` : "";
  const confidence = typeof parsed.confidence === "number" ? ` Confidence: ${Math.round(parsed.confidence * 100)}%.` : "";

  return {
    rule_id: "V001",
    rule_name: "Visual Design Intent Match",
    level: "SEMANTIC",
    passed,
    is_critical: !passed,
    message: `${summary}${issueSummary ? ` Issues: ${issueSummary}.` : ""}${missingSummary}${confidence}`.trim() || raw.slice(0, 240),
  };
}

export async function validatePreviewAgainstRequest({
  inputRequest,
  partFamily,
  scadSource,
  previewImagePath,
}: {
  inputRequest: string;
  partFamily: string | null;
  scadSource: string;
  previewImagePath: string;
}): Promise<ValidationResult[]> {
  const mimoConfig = getMimoConfig();
  if (!mimoConfig.enabled) {
    return [skippedResult("MIMO_API_KEY is not configured")];
  }

  let imageDataUrl: string;
  try {
    const imageBuffer = await fs.readFile(previewImagePath);
    const ext = path.extname(previewImagePath).toLowerCase();
    const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
    imageDataUrl = `data:${mime};base64,${imageBuffer.toString("base64")}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "preview image is unavailable";
    return [skippedResult(message)];
  }

  const skill = await loadSkill("scad-visual-validate");
  if (!skill) {
    return [skippedResult("scad-visual-validate skill is missing")];
  }

  const userPrompt = [
    "Validate this CAD render against the original task.",
    "",
    `Original request: ${inputRequest}`,
    `Detected part family: ${partFamily || "unknown"}`,
    "",
    "Current OpenSCAD source:",
    "```openscad",
    scadSource.slice(0, 12000),
    "```",
    "",
    "Return strict JSON according to the skill output contract.",
  ].join("\n");

  try {
    const response = await createMimoChatCompletion({
      model: process.env.MIMO_VISION_MODEL || "mimo-v2.5",
      stream: false,
      messages: [
        { role: "system", content: skill },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    });

    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content;
    if (typeof raw !== "string" || raw.trim().length === 0) {
      return [skippedResult("vision model returned an empty response")];
    }

    const parsed = extractJsonObject(raw);
    if (!parsed) {
      return [skippedResult(`vision response was not valid JSON: ${raw.slice(0, 160)}`)];
    }

    return [buildResult(parsed, raw)];
  } catch (error) {
    const message = error instanceof Error ? error.message : "visual validation failed";
    return [skippedResult(message)];
  }
}
