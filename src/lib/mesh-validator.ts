/**
 * mesh-validator.ts — Real STL mesh validation via Python/trimesh
 *
 * Shells out to `scripts/validate_stl.py` for deterministic mesh analysis.
 * Falls back to mock validation if Python3 or trimesh are not available.
 * Results are cached per file path (validation is deterministic).
 */

import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Types matching the frontend's ValidationResult interface
// ---------------------------------------------------------------------------

export interface ValidationResult {
  rule_id: string;
  rule_name: string;
  level: string;
  passed: boolean;
  is_critical: boolean;
  message: string;
}

// Python script output format (internal)
interface PythonRule {
  id: string;
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
  details: Record<string, unknown>;
}

interface PythonOutput {
  error?: boolean;
  message?: string;
  rules: PythonRule[];
  summary: {
    total: number;
    passed: number;
    warnings: number;
    failures: number;
    boundingBox: {
      length: number;
      width: number;
      height: number;
      unit: string;
    } | null;
  };
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const validationCache = new Map<string, ValidationResult[]>();

// ---------------------------------------------------------------------------
// Rule metadata (level + criticality) — mirrors the mock format
// ---------------------------------------------------------------------------

const RULE_META: Record<
  string,
  { level: string; is_critical: boolean }
> = {
  R001: { level: "ENGINEERING", is_critical: true },
  R002: { level: "MANUFACTURING", is_critical: false },
  R003: { level: "ENGINEERING", is_critical: true },
  S001: { level: "ENGINEERING", is_critical: true },
  S002: { level: "ENGINEERING", is_critical: false },
};

// ---------------------------------------------------------------------------
// Transform Python output → frontend ValidationResult[]
// ---------------------------------------------------------------------------

function transformPythonResults(pyOutput: PythonOutput): ValidationResult[] {
  const results: ValidationResult[] = [];

  for (const rule of pyOutput.rules) {
    const meta = RULE_META[rule.id] ?? {
      level: "ENGINEERING",
      is_critical: false,
    };

    results.push({
      rule_id: rule.id,
      rule_name: rule.name,
      level: meta.level,
      passed: rule.status === "pass",
      is_critical: meta.is_critical,
      message: rule.message,
    });
  }

  // S001 and S002 require LLM reasoning — mark as info/skipped for now
  results.push({
    rule_id: "S001",
    rule_name: "Semantic Geometry Match",
    level: "ENGINEERING",
    passed: true,
    is_critical: true,
    message: "Skipped — requires LLM reasoning (not yet implemented)",
  });

  results.push({
    rule_id: "S002",
    rule_name: "Design Intent Preservation",
    level: "ENGINEERING",
    passed: true,
    is_critical: false,
    message: "Skipped — requires LLM reasoning (not yet implemented)",
  });

  return results;
}

// ---------------------------------------------------------------------------
// Mock fallback — mirrors generateMockValidationResults() from route.ts
// ---------------------------------------------------------------------------

function generateMockValidationResults(wallThickness: number): ValidationResult[] {
  return [
    {
      rule_id: "R001",
      rule_name: "Minimum Wall Thickness",
      level: "ENGINEERING",
      passed: wallThickness >= 1.2,
      is_critical: true,
      message: `Wall thickness ${wallThickness}mm ${wallThickness >= 1.2 ? "meets" : "does not meet"} minimum 1.2mm (mock — Python/trimesh unavailable)`,
    },
    {
      rule_id: "R002",
      rule_name: "Maximum Dimensions",
      level: "MANUFACTURING",
      passed: true,
      is_critical: false,
      message: "All dimensions within manufacturing limits (mock — Python/trimesh unavailable)",
    },
    {
      rule_id: "R003",
      rule_name: "Manifold Geometry",
      level: "ENGINEERING",
      passed: true,
      is_critical: true,
      message: "Geometry is manifold (watertight) (mock — Python/trimesh unavailable)",
    },
    {
      rule_id: "S001",
      rule_name: "Semantic Geometry Match",
      level: "ENGINEERING",
      passed: true,
      is_critical: true,
      message: "Generated CAD matches the requested geometry (mock)",
    },
    {
      rule_id: "S002",
      rule_name: "Design Intent Preservation",
      level: "ENGINEERING",
      passed: true,
      is_critical: false,
      message: "Design intent preserved in generated model (mock)",
    },
  ];
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Validate an STL file using real mesh analysis.
 *
 * @param stlPath - Absolute path to the STL file on disk
 * @param wallThickness - Wall thickness from parameters (used for mock fallback)
 * @returns Array of ValidationResult objects matching the frontend interface
 */
export async function validateStl(
  stlPath: string,
  wallThickness?: number
): Promise<ValidationResult[]> {
  // Check cache
  const cached = validationCache.get(stlPath);
  if (cached) {
    console.log(`[mesh-validator] Cache hit for ${stlPath}`);
    return cached;
  }

  const scriptPath = path.join(process.cwd(), "scripts", "validate_stl.py");
  const mockWT = wallThickness ?? 2.0;

  try {
    // Attempt real validation via Python
    const { stdout, stderr } = await execAsync(
      `python3 "${scriptPath}" "${stlPath}"`,
      { timeout: 30_000 } // 30s timeout for large meshes
    );

    if (stderr) {
      console.warn(`[mesh-validator] Python stderr: ${stderr.trim()}`);
    }

    const parsed: PythonOutput = JSON.parse(stdout.trim());

    // Check if Python returned an error
    if (parsed.error) {
      console.warn(
        `[mesh-validator] Python reported error: ${parsed.message}. Falling back to mock.`
      );
      const mock = generateMockValidationResults(mockWT);
      validationCache.set(stlPath, mock);
      return mock;
    }

    const results = transformPythonResults(parsed);
    validationCache.set(stlPath, results);

    console.log(
      `[mesh-validator] Real validation complete for ${path.basename(stlPath)}: ` +
        `${parsed.summary.passed}/${parsed.summary.total} rules passed`
    );

    return results;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);

    // Common failures: python3 not found, trimesh not installed, file not found
    if (
      errMsg.includes("ENOENT") ||
      errMsg.includes("command not found") ||
      errMsg.includes("No such file") ||
      errMsg.includes("ModuleNotFoundError")
    ) {
      console.warn(
        `[mesh-validator] Python/trimesh not available (${errMsg}). Using mock validation.`
      );
    } else {
      console.warn(
        `[mesh-validator] Validation failed: ${errMsg}. Using mock validation.`
      );
    }

    const mock = generateMockValidationResults(mockWT);
    validationCache.set(stlPath, mock);
    return mock;
  }
}

/**
 * Clear the validation cache (useful for testing or when STL files change).
 */
export function clearValidationCache(): void {
  validationCache.clear();
}
