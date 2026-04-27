import {
  clearValidationCache,
  validateStl,
  type ValidationResult,
} from "@/lib/mesh-validator";
import { validatePreviewAgainstRequest } from "@/lib/visual-validator";

export { clearValidationCache, validateStl, validatePreviewAgainstRequest };
export type { ValidationResult };

export async function validateRenderedArtifacts({
  inputRequest,
  partFamily,
  scadSource,
  stlFilePath,
  previewImagePath,
  wallThickness,
}: {
  inputRequest: string;
  partFamily: string | null;
  scadSource: string;
  stlFilePath: string;
  previewImagePath: string;
  wallThickness?: number;
}): Promise<ValidationResult[]> {
  const meshValidationResults = await validateStl(stlFilePath, wallThickness);
  const visualValidationResults = await validatePreviewAgainstRequest({
    inputRequest,
    partFamily,
    scadSource,
    previewImagePath,
  });

  return [...meshValidationResults, ...visualValidationResults];
}

export function getCriticalValidationFailures(results: ValidationResult[]): ValidationResult[] {
  return results.filter((rule) => !rule.passed && rule.is_critical);
}
