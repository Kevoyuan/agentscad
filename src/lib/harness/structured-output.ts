import type { LLMGenerationResult, ParameterDef } from "@/lib/harness/types";

export function stripMarkdownFence(rawContent: string): string {
  return rawContent
    .replace(/^```(?:json)?\s*\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trim();
}

export function extractJsonObjectText(rawContent: string): string {
  const cleaned = stripMarkdownFence(rawContent);
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return cleaned;
  }

  return cleaned.slice(firstBrace, lastBrace + 1);
}

export function extractOpenScadCodeFromText(rawContent: string): string | null {
  const fenced = rawContent.match(/```(?:openscad|scad)?\s*\n?([\s\S]*?)\n?```/i);
  if (fenced?.[1] && scoreOpenScadCode(fenced[1]) >= 3) {
    return fenced[1].trim();
  }

  const cleaned = stripMarkdownFence(rawContent);
  return scoreOpenScadCode(cleaned) >= 5 ? cleaned.trim() : null;
}

export function parseJsonObject<T>(rawContent: string): T;
export function parseJsonObject<T>(rawContent: string, fallback: T): T;
export function parseJsonObject<T>(rawContent: string, fallback?: T): T {
  try {
    return JSON.parse(extractJsonObjectText(rawContent)) as T;
  } catch (error) {
    if (arguments.length >= 2) {
      return fallback as T;
    }
    throw error;
  }
}

export function normalizeGenerationResult(
  rawContent: string,
  fallbackParameters: ParameterDef[],
  fallbackSummary: string
): LLMGenerationResult {
  let parsed: Partial<LLMGenerationResult>;
  try {
    parsed = parseJsonObject<Partial<LLMGenerationResult>>(rawContent);
  } catch {
    const scadSource = extractOpenScadCodeFromText(rawContent);
    if (!scadSource) {
      throw new Error("LLM response was neither valid JSON nor recognizable OpenSCAD");
    }
    parsed = {
      summary: fallbackSummary,
      parameters: fallbackParameters,
      scad_source: scadSource,
    };
  }

  if (!parsed.scad_source || typeof parsed.scad_source !== "string") {
    throw new Error("LLM response missing scad_source");
  }

  return {
    summary:
      typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary
        : fallbackSummary,
    parameters: Array.isArray(parsed.parameters)
      ? parsed.parameters
      : fallbackParameters,
    scad_source: parsed.scad_source,
  };
}

function scoreOpenScadCode(code: string): number {
  if (!code || code.length < 20) return 0;

  const patterns = [
    /\b(cube|sphere|cylinder|polyhedron)\s*\(/gi,
    /\b(union|difference|intersection)\s*\(/gi,
    /\b(translate|rotate|scale|mirror)\s*\(/gi,
    /\b(linear_extrude|rotate_extrude)\s*\(/gi,
    /\b(module|function)\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/gi,
    /\$fn\s*=/gi,
    /\bfor\s*\(\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*\[/gi,
    /^\s*[A-Za-z_$][A-Za-z0-9_$]*\s*=\s*[^;]+;/gm,
  ];

  return patterns.reduce((score, pattern) => {
    const matches = code.match(pattern);
    return score + (matches?.length ?? 0);
  }, 0);
}
