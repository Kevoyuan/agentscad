// ---------------------------------------------------------------------------
// Validation check types — shared across all validators
// ---------------------------------------------------------------------------

export interface ValidationCheck {
  rule_id: string;
  rule_name: string;
  level: "ENGINEERING" | "MANUFACTURING" | "SEMANTIC" | "INFO";
  passed: boolean;
  is_critical: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface ValidationReport {
  ok: boolean;
  score: number; // 0–1
  checks: ValidationCheck[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    critical_failures: number;
  };
}

export interface RawMeshData {
  bbox: { length: number; width: number; height: number; unit: string } | null;
  vertices: number;
  faces: number;
  edges: number;
  isWatertight: boolean;
  isVolume: boolean;
  componentCount: number;
  eulerCharacteristic: number;
  genus: number; // through-hole count estimate (only valid if watertight)
}

export function computeReport(checks: ValidationCheck[]): ValidationReport {
  const passed = checks.filter((c) => c.passed).length;
  const failed = checks.filter((c) => !c.passed).length;
  const skipped = checks.filter((c) => c.message.toLowerCase().startsWith("skipped")).length;
  const critical_failures = checks.filter((c) => !c.passed && c.is_critical).length;

  const actionable = checks.filter((c) => !c.message.toLowerCase().startsWith("skipped"));
  const actionableScore = actionable.length > 0
    ? actionable.filter((c) => c.passed).length / actionable.length
    : 1;

  return {
    ok: critical_failures === 0,
    score: Math.round(actionableScore * 100) / 100,
    checks,
    summary: { total: checks.length, passed, failed, skipped, critical_failures },
  };
}

export function makeSkippedCheck(
  rule_id: string,
  rule_name: string,
  level: ValidationCheck["level"],
  reason: string
): ValidationCheck {
  return {
    rule_id,
    rule_name,
    level,
    passed: true,
    is_critical: false,
    message: `Skipped — ${reason}`,
  };
}
