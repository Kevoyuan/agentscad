export function sanitizeGeneratedScadSource(scadSource: string): string {
  return scadSource
    .replace(/(^|\n)(\s*)module(\s*=)/g, "$1$2tooth_module$3")
    .replace(/\bmodule\b(?!\s+[A-Za-z_][A-Za-z0-9_]*\s*\()/g, "tooth_module");
}
