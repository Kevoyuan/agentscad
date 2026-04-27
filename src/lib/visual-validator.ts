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

type VisualValidationContext = {
  scadSource?: string;
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

function normalizeFeatureName(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, " ");
}

function hasSourceEvidenceForFeature(feature: string, scadSource: string): boolean {
  const normalized = normalizeFeatureName(feature);
  const source = scadSource.toLowerCase();
  const tokens = normalized
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4);

  if (tokens.length === 0) return false;
  return tokens.some((token) => source.includes(token));
}

function isCoveredBySourceEvidence(issue: VisualValidationIssue, scadSource: string): boolean {
  const feature = issue.feature || "";
  const message = issue.message || "";
  return hasSourceEvidenceForFeature(feature, scadSource) || hasSourceEvidenceForFeature(message, scadSource);
}

function buildResult(
  parsed: VisualValidationResponse,
  raw: string,
  context: VisualValidationContext = {}
): ValidationResult {
  const scadSource = context.scadSource || "";
  const issues = Array.isArray(parsed.issues) ? parsed.issues : [];
  const missingFeatures = Array.isArray(parsed.missing_features) ? parsed.missing_features : [];
  const unresolvedIssues = scadSource
    ? issues.filter((issue) => !isCoveredBySourceEvidence(issue, scadSource))
    : issues;
  const unresolvedMissingFeatures = scadSource
    ? missingFeatures.filter((feature) => !hasSourceEvidenceForFeature(feature, scadSource))
    : missingFeatures;
  const criticalIssues = unresolvedIssues.filter((issue) => issue.severity === "critical");
  const sourceResolvedDisagreement =
    (issues.length > unresolvedIssues.length || missingFeatures.length > unresolvedMissingFeatures.length) &&
    criticalIssues.length === 0 &&
    unresolvedMissingFeatures.length === 0;
  const passed = sourceResolvedDisagreement || (parsed.passed !== false && criticalIssues.length === 0);
  const summary = parsed.summary?.trim() || (passed ? "Rendered preview matches visible design intent" : "Rendered preview has visible design-intent issues");
  const issueSummary = unresolvedIssues
    .map((issue) => {
      const feature = issue.feature ? `${issue.feature}: ` : "";
      return `${feature}${issue.message || issue.severity || "visual issue"}`;
    })
    .filter(Boolean)
    .slice(0, 3)
    .join(" | ");
  const missingSummary = unresolvedMissingFeatures.length ? ` Missing: ${unresolvedMissingFeatures.slice(0, 5).join(", ")}.` : "";
  const sourceEvidenceSummary = sourceResolvedDisagreement
    ? " Source evidence found in OpenSCAD; preview angle treated as inconclusive rather than critical."
    : "";
  const confidence = typeof parsed.confidence === "number" ? ` Confidence: ${Math.round(parsed.confidence * 100)}%.` : "";

  return {
    rule_id: "V001",
    rule_name: "Visual Design Intent Match",
    level: "SEMANTIC",
    passed,
    is_critical: !passed,
    message: `${summary}${issueSummary ? ` Issues: ${issueSummary}.` : ""}${missingSummary}${sourceEvidenceSummary}${confidence}`.trim() || raw.slice(0, 240),
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

    return [buildResult(parsed, raw, { scadSource })];
  } catch (error) {
    const message = error instanceof Error ? error.message : "visual validation failed";
    return [skippedResult(message)];
  }
}
