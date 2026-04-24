import fs from "fs/promises";
import path from "path";
import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EditPattern {
  family: string;
  type: "parameter_drift" | "scad_patch" | "validation_failure";
  insight: string;
  frequency: number;
  parameter?: string;
  suggestedValue?: number;
  details: Record<string, unknown>;
}

interface LearnedPatternsFile {
  lastUpdated: string;
  patterns: EditPattern[];
  stats: {
    totalVersionsAnalyzed: number;
    userEdits: number;
    familiesAffected: number;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEARNED_PATTERNS_PATH = path.join(
  process.cwd(),
  "skills",
  "scad-generation",
  "learned-patterns.json"
);

const MIN_FREQUENCY_FOR_PATTERN = 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a JSON string safely, returning a fallback on failure. */
function safeParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Compute the mean of an array of numbers. */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// ---------------------------------------------------------------------------
// Pattern extraction
// ---------------------------------------------------------------------------

/**
 * Analyze parameter changes for a single family.
 * Detects parameters that users consistently change from defaults.
 */
function extractParameterDriftPatterns(
  family: string,
  versions: { oldValue: string | null; newValue: string | null }[]
): EditPattern[] {
  const paramChanges = versions.filter((v) => v.oldValue && v.newValue);
  if (paramChanges.length === 0) return [];

  // Track: paramKey -> { count, oldValues[], newValues[], allNewValues[] }
  const driftMap = new Map<
    string,
    { count: number; oldValues: number[]; newValues: number[] }
  >();

  for (const change of paramChanges) {
    const oldParams = safeParse<Record<string, unknown>>(change.oldValue, {});
    const newParams = safeParse<Record<string, unknown>>(change.newValue, {});

    for (const [key, newVal] of Object.entries(newParams)) {
      if (typeof newVal !== "number") continue;
      const oldVal = oldParams[key];
      if (typeof oldVal !== "number" || newVal === oldVal) continue;

      if (!driftMap.has(key)) {
        driftMap.set(key, { count: 0, oldValues: [], newValues: [] });
      }
      const entry = driftMap.get(key)!;
      entry.count++;
      entry.oldValues.push(oldVal);
      entry.newValues.push(newVal);
    }
  }

  const patterns: EditPattern[] = [];

  for (const [param, data] of Array.from(driftMap)) {
    if (data.count < MIN_FREQUENCY_FOR_PATTERN) continue;

    const avgOld = mean(data.oldValues);
    const avgNew = mean(data.newValues);
    const direction = avgNew > avgOld ? "increased" : "decreased";

    patterns.push({
      family,
      type: "parameter_drift",
      insight: `Users consistently ${direction} ${param} from ~${avgOld.toFixed(1)} to ~${avgNew.toFixed(1)} (${data.count} edits)`,
      frequency: data.count,
      parameter: param,
      suggestedValue: Math.round(mean(data.newValues) * 100) / 100,
      details: {
        avgOld: Math.round(avgOld * 100) / 100,
        avgNew: Math.round(avgNew * 100) / 100,
        sampleSize: data.count,
      },
    });
  }

  return patterns;
}

/**
 * Analyze SCAD source edits for a single family.
 * Identifies common line-level modifications users make.
 */
function extractScadPatchPatterns(
  family: string,
  versions: { oldValue: string | null; newValue: string | null }[]
): EditPattern[] {
  if (versions.length === 0) return [];

  // Count the total SCAD source edits
  const scadEditCount = versions.length;

  // Collect added/changed lines across all edits
  const addedLineCounts = new Map<string, number>();
  const removedLineCounts = new Map<string, number>();

  for (const change of versions) {
    const oldLines = (change.oldValue || "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("//"));
    const newLines = (change.newValue || "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("//"));

    const oldSet = new Set(oldLines);
    const newSet = new Set(newLines);

    // Lines added (in new but not old)
    for (const line of newLines) {
      if (!oldSet.has(line)) {
        addedLineCounts.set(line, (addedLineCounts.get(line) || 0) + 1);
      }
    }

    // Lines removed (in old but not new)
    for (const line of oldLines) {
      if (!newSet.has(line)) {
        removedLineCounts.set(line, (removedLineCounts.get(line) || 0) + 1);
      }
    }
  }

  const patterns: EditPattern[] = [];

  // Overall SCAD edit frequency pattern
  if (scadEditCount >= MIN_FREQUENCY_FOR_PATTERN) {
    patterns.push({
      family,
      type: "scad_patch",
      insight: `Users frequently modify SCAD source directly (${scadEditCount} edits) — generation quality may need improvement`,
      frequency: scadEditCount,
      parameter: "_scad_source_quality",
      details: {
        editCount: scadEditCount,
        commonAdditions: Array.from(addedLineCounts.entries())
          .filter(([, count]) => count >= 2)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([line, count]) => ({ line, count })),
        commonRemovals: Array.from(removedLineCounts.entries())
          .filter(([, count]) => count >= 2)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([line, count]) => ({ line, count })),
      },
    });
  }

  // Specific frequently-added lines
  for (const [line, count] of Array.from(addedLineCounts)) {
    if (count >= MIN_FREQUENCY_FOR_PATTERN && line.length > 3) {
      patterns.push({
        family,
        type: "scad_patch",
        insight: `Users commonly add: "${line}" (${count} times)`,
        frequency: count,
        parameter: `_added_${line.slice(0, 40).replace(/\s+/g, "_")}`,
        details: { addedLine: line, count },
      });
    }
  }

  return patterns;
}

/**
 * Analyze validation failures for a single family.
 * Identifies which validation rules fail most often.
 */
function extractValidationFailurePatterns(
  family: string,
  validationRecords: string[]
): EditPattern[] {
  if (validationRecords.length === 0) return [];

  // Count failures per rule
  const ruleFailures = new Map<
    string,
    { ruleName: string; count: number; total: number }
  >();

  for (const record of validationRecords) {
    const results = safeParse<Array<{ rule_id: string; rule_name: string; passed: boolean; is_critical: boolean; message: string }>>(record, []);
    if (!Array.isArray(results)) continue;

    for (const rule of results) {
      if (!rule.rule_id) continue;

      if (!ruleFailures.has(rule.rule_id)) {
        ruleFailures.set(rule.rule_id, {
          ruleName: rule.rule_name || rule.rule_id,
          count: 0,
          total: 0,
        });
      }
      const entry = ruleFailures.get(rule.rule_id)!;
      entry.total++;
      if (!rule.passed) {
        entry.count++;
      }
    }
  }

  const patterns: EditPattern[] = [];

  for (const [ruleId, data] of Array.from(ruleFailures)) {
    if (data.count < MIN_FREQUENCY_FOR_PATTERN) continue;

    const failureRate = data.total > 0 ? (data.count / data.total) * 100 : 0;

    patterns.push({
      family,
      type: "validation_failure",
      insight: `Validation rule "${data.ruleName}" (${ruleId}) fails ${data.count}/${data.total} times (${failureRate.toFixed(0)}% failure rate)`,
      frequency: data.count,
      parameter: `_validation_${ruleId}`,
      details: {
        ruleId,
        ruleName: data.ruleName,
        failureCount: data.count,
        totalChecks: data.total,
        failureRate: Math.round(failureRate),
      },
    });
  }

  return patterns;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze user edits from the last N hours.
 * Queries JobVersion records where changedBy = "user", groups by partFamily,
 * and extracts patterns for parameter drift, SCAD patches, and validation failures.
 *
 * Idempotent: running twice with the same data produces the same output.
 */
export async function analyzeUserEdits(
  sinceHours: number = 24
): Promise<EditPattern[]> {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

  // Query all user-made version changes in the time window
  const userVersions = await db.jobVersion.findMany({
    where: {
      changedBy: "user",
      createdAt: { gte: since },
    },
    include: {
      job: {
        select: {
          id: true,
          partFamily: true,
          parameterValues: true,
          validationResults: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (userVersions.length === 0) return [];

  // Group by partFamily
  const familyGroups = new Map<
    string,
    {
      parameterVersions: { oldValue: string | null; newValue: string | null }[];
      scadVersions: { oldValue: string | null; newValue: string | null }[];
      validationResults: string[];
    }
  >();

  for (const version of userVersions) {
    const family = version.job.partFamily || "unknown";

    if (!familyGroups.has(family)) {
      familyGroups.set(family, {
        parameterVersions: [],
        scadVersions: [],
        validationResults: [],
      });
    }

    const group = familyGroups.get(family)!;

    if (version.field === "parameters") {
      group.parameterVersions.push({
        oldValue: version.oldValue,
        newValue: version.newValue,
      });
    } else if (version.field === "scadSource") {
      group.scadVersions.push({
        oldValue: version.oldValue,
        newValue: version.newValue,
      });
    }

    // Collect validation results from the parent job if available
    if (version.job.validationResults) {
      group.validationResults.push(version.job.validationResults);
    }
  }

  // Extract patterns per family
  const allPatterns: EditPattern[] = [];

  for (const [family, group] of Array.from(familyGroups)) {
    allPatterns.push(
      ...extractParameterDriftPatterns(family, group.parameterVersions)
    );
    allPatterns.push(
      ...extractScadPatchPatterns(family, group.scadVersions)
    );
    allPatterns.push(
      ...extractValidationFailurePatterns(family, group.validationResults)
    );
  }

  // Sort by frequency descending for deterministic output (idempotency)
  allPatterns.sort((a, b) => {
    if (b.frequency !== a.frequency) return b.frequency - a.frequency;
    if (a.family !== b.family) return a.family.localeCompare(b.family);
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return (a.parameter || "").localeCompare(b.parameter || "");
  });

  return allPatterns;
}

/**
 * Write learned patterns to disk with atomic rename.
 * Merges with existing patterns — new data takes precedence for same key.
 */
export async function writeLearnedPatterns(
  patterns: EditPattern[]
): Promise<void> {
  // Load existing patterns if file exists
  let existing: LearnedPatternsFile = {
    lastUpdated: new Date().toISOString(),
    patterns: [],
    stats: { totalVersionsAnalyzed: 0, userEdits: 0, familiesAffected: 0 },
  };

  try {
    const raw = await fs.readFile(LEARNED_PATTERNS_PATH, "utf8");
    existing = JSON.parse(raw) as LearnedPatternsFile;
  } catch {
    // File doesn't exist yet — use defaults
  }

  // Merge patterns: use family:type:parameter as key
  const mergedMap = new Map<string, EditPattern>();

  // Keep existing patterns
  for (const p of existing.patterns) {
    const key = `${p.family}:${p.type}:${p.parameter || ""}`;
    mergedMap.set(key, p);
  }

  // Merge in new patterns (new data takes precedence)
  for (const p of patterns) {
    const key = `${p.family}:${p.type}:${p.parameter || ""}`;
    const prev = mergedMap.get(key);
    if (prev) {
      // Combine frequencies, keep the newer insight and suggestedValue
      mergedMap.set(key, {
        ...p,
        frequency: prev.frequency + p.frequency,
      });
    } else {
      mergedMap.set(key, p);
    }
  }

  const mergedPatterns = Array.from(mergedMap.values());

  // Compute stats
  const familiesAffected = new Set(mergedPatterns.map((p) => p.family));

  const output: LearnedPatternsFile = {
    lastUpdated: new Date().toISOString(),
    patterns: mergedPatterns,
    stats: {
      totalVersionsAnalyzed:
        existing.stats.totalVersionsAnalyzed + patterns.length,
      userEdits: patterns.filter((p) => p.type === "parameter_drift").length,
      familiesAffected: familiesAffected.size,
    },
  };

  // Atomic write: write to temp file, then rename
  const dir = path.dirname(LEARNED_PATTERNS_PATH);
  await fs.mkdir(dir, { recursive: true });

  const tmpPath = LEARNED_PATTERNS_PATH + ".tmp";
  await fs.writeFile(tmpPath, JSON.stringify(output, null, 2), "utf8");
  await fs.rename(tmpPath, LEARNED_PATTERNS_PATH);
}

/**
 * Load learned patterns and return a formatted string of insights
 * for the given family, suitable for injection into generation prompts.
 * Returns empty string if no patterns exist for the family.
 */
export async function getLearnedPatternsForFamily(
  family: string
): Promise<string> {
  try {
    const raw = await fs.readFile(LEARNED_PATTERNS_PATH, "utf8");
    const data = JSON.parse(raw) as LearnedPatternsFile;

    const familyPatterns = data.patterns.filter((p) => p.family === family);
    if (familyPatterns.length === 0) return "";

    const lines: string[] = [];

    // Parameter drift patterns
    const driftPatterns = familyPatterns.filter(
      (p) => p.type === "parameter_drift"
    );
    if (driftPatterns.length > 0) {
      lines.push("### Common user adjustments (parameter drift):");
      for (const p of driftPatterns) {
        const suggestion = p.suggestedValue
          ? ` (suggested default: ${p.suggestedValue})`
          : "";
        lines.push(`- ${p.insight}${suggestion}`);
      }
    }

    // SCAD patch patterns
    const scadPatterns = familyPatterns.filter(
      (p) => p.type === "scad_patch"
    );
    if (scadPatterns.length > 0) {
      lines.push("### Common SCAD source modifications:");
      for (const p of scadPatterns) {
        lines.push(`- ${p.insight}`);
      }
    }

    // Validation failure patterns
    const validationPatterns = familyPatterns.filter(
      (p) => p.type === "validation_failure"
    );
    if (validationPatterns.length > 0) {
      lines.push("### Frequent validation failures:");
      for (const p of validationPatterns) {
        lines.push(`- ${p.insight}`);
      }
    }

    return lines.join("\n");
  } catch {
    // File doesn't exist or can't be parsed — no patterns available
    return "";
  }
}
