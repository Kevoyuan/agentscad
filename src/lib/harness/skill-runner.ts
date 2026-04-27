import { buildScadPrompt, loadFamilySchema, loadSkill, applyParameterOverrides } from "@/lib/skill-resolver";
import { createChatCompletionWithFallback } from "@/lib/tools/model-router";
import { sanitizeGeneratedScadSource } from "@/lib/tools/scad-sanitizer";
import { validateGeneratedScadSource } from "@/lib/tools/scad-renderer";
import {
  extractParameterDefsFromScad,
  mergeExtractedParameters,
} from "@/lib/tools/scad-parameter-extractor";
import { normalizeGenerationResult } from "@/lib/harness/structured-output";
import type { LLMGenerationResult, ParameterDef, PartFamily } from "@/lib/harness/types";

export { buildScadPrompt, loadFamilySchema, loadSkill, applyParameterOverrides };

export const FALLBACK_SCHEMAS: Record<string, ParameterDef[]> = {
  spur_gear: [
    { key: "teeth", label: "Number of Teeth", kind: "integer", unit: "", value: 20, min: 8, max: 200, step: 1, source: "user", editable: true, description: "Total number of teeth on the gear", group: "geometry" },
    { key: "outer_diameter", label: "Outer Diameter", kind: "float", unit: "mm", value: 50, min: 10, max: 500, step: 0.5, source: "user", editable: true, description: "Outer (tip) diameter of the gear", group: "geometry" },
    { key: "bore_diameter", label: "Bore Diameter", kind: "float", unit: "mm", value: 8, min: 2, max: 100, step: 0.5, source: "user", editable: true, description: "Central bore hole diameter", group: "geometry" },
    { key: "thickness", label: "Gear Thickness", kind: "float", unit: "mm", value: 8, min: 2, max: 100, step: 0.5, source: "user", editable: true, description: "Thickness (width) of the gear face", group: "geometry" },
    { key: "pressure_angle", label: "Pressure Angle", kind: "float", unit: "deg", value: 20, min: 14.5, max: 25, step: 0.5, source: "engineering", editable: true, description: "Involute pressure angle in degrees", group: "engineering" },
  ],
  device_stand: [
    { key: "device_width", label: "Device Width", kind: "float", unit: "mm", value: 75, min: 30, max: 400, step: 1, source: "user", editable: true, description: "Width of the device to hold", group: "device" },
    { key: "device_depth", label: "Device Depth", kind: "float", unit: "mm", value: 12, min: 5, max: 50, step: 0.5, source: "user", editable: true, description: "Depth (thickness) of the device", group: "device" },
    { key: "stand_height", label: "Stand Height", kind: "float", unit: "mm", value: 80, min: 30, max: 300, step: 1, source: "user", editable: true, description: "Total height of the stand", group: "geometry" },
    { key: "lip_height", label: "Lip Height", kind: "float", unit: "mm", value: 10, min: 3, max: 40, step: 0.5, source: "user", editable: true, description: "Height of the front retaining lip", group: "geometry" },
    { key: "wall_thickness", label: "Wall Thickness", kind: "float", unit: "mm", value: 3, min: 1.2, max: 10, step: 0.2, source: "engineering", editable: true, description: "Wall thickness for structural integrity", group: "engineering" },
    { key: "base_flare", label: "Base Flare", kind: "float", unit: "mm", value: 20, min: 0, max: 60, step: 1, source: "user", editable: true, description: "Extra width added to the base for stability", group: "geometry" },
    { key: "arch_radius", label: "Arch Radius", kind: "float", unit: "mm", value: 30, min: 10, max: 100, step: 1, source: "engineering", editable: true, description: "Radius of the support arch", group: "geometry" },
    { key: "arch_peak", label: "Arch Peak Offset", kind: "float", unit: "mm", value: 15, min: 0, max: 50, step: 1, source: "engineering", editable: true, description: "Forward offset of the arch peak", group: "geometry" },
  ],
  electronics_enclosure: [
    { key: "width", label: "Enclosure Width", kind: "float", unit: "mm", value: 60, min: 20, max: 300, step: 1, source: "user", editable: true, description: "Internal width of the enclosure", group: "geometry" },
    { key: "depth", label: "Enclosure Depth", kind: "float", unit: "mm", value: 40, min: 20, max: 300, step: 1, source: "user", editable: true, description: "Internal depth of the enclosure", group: "geometry" },
    { key: "height", label: "Enclosure Height", kind: "float", unit: "mm", value: 25, min: 10, max: 200, step: 1, source: "user", editable: true, description: "Internal height of the enclosure", group: "geometry" },
    { key: "wall_thickness", label: "Wall Thickness", kind: "float", unit: "mm", value: 2, min: 1.2, max: 10, step: 0.2, source: "engineering", editable: true, description: "Uniform wall thickness", group: "engineering" },
    { key: "corner_radius", label: "Corner Radius", kind: "float", unit: "mm", value: 3, min: 0, max: 20, step: 0.5, source: "user", editable: true, description: "Fillet radius on exterior corners", group: "geometry" },
    { key: "clearance", label: "Fit Clearance", kind: "float", unit: "mm", value: 0.2, min: 0, max: 1, step: 0.05, source: "engineering", editable: true, description: "Clearance between lid and body", group: "engineering" },
  ],
  phone_case: [
    { key: "body_length", label: "Body Length", kind: "float", unit: "mm", value: 158, min: 100, max: 200, step: 0.5, source: "user", editable: true, description: "Length of the phone body", group: "device" },
    { key: "body_width", label: "Body Width", kind: "float", unit: "mm", value: 78, min: 50, max: 120, step: 0.5, source: "user", editable: true, description: "Width of the phone body", group: "device" },
    { key: "body_depth", label: "Body Depth", kind: "float", unit: "mm", value: 8, min: 5, max: 15, step: 0.5, source: "user", editable: true, description: "Depth (thickness) of the phone body", group: "device" },
    { key: "wall_thickness", label: "Wall Thickness", kind: "float", unit: "mm", value: 1.5, min: 0.8, max: 4, step: 0.1, source: "engineering", editable: true, description: "Case wall thickness", group: "engineering" },
    { key: "camera_clearance", label: "Camera Clearance", kind: "float", unit: "mm", value: 1, min: 0, max: 5, step: 0.25, source: "user", editable: true, description: "Extra clearance around camera bump", group: "geometry" },
  ],
};

export const UNKNOWN_FALLBACK_SCHEMA: ParameterDef[] = [
  { key: "width", label: "Width", kind: "float", unit: "mm", value: 40, min: 5, max: 500, step: 1, source: "user", editable: true, description: "Width of the part", group: "geometry" },
  { key: "depth", label: "Depth", kind: "float", unit: "mm", value: 30, min: 5, max: 500, step: 1, source: "user", editable: true, description: "Depth of the part", group: "geometry" },
  { key: "height", label: "Height", kind: "float", unit: "mm", value: 15, min: 5, max: 500, step: 1, source: "user", editable: true, description: "Height of the part", group: "geometry" },
  { key: "wall_thickness", label: "Wall Thickness", kind: "float", unit: "mm", value: 2, min: 0.8, max: 10, step: 0.2, source: "engineering", editable: true, description: "Wall thickness", group: "engineering" },
];

export function detectPartFamily(request: string): PartFamily {
  const lower = request.toLowerCase();
  const compact = lower.replace(/[\s_-]+/g, "");

  if (lower.includes("spur gear") || lower.includes("gear") || lower.includes(" involute")) return "spur_gear";
  if (
    lower.includes("device stand") ||
    lower.includes("phone stand") ||
    lower.includes("tablet stand") ||
    lower.includes("monitor stand") ||
    lower.includes("laptop stand") ||
    lower.includes("stand") ||
    lower.includes("holder") ||
    lower.includes("dock")
  ) {
    return "device_stand";
  }
  if (
    lower.includes("enclosure") ||
    lower.includes("electronics box") ||
    lower.includes("project box") ||
    lower.includes("junction box") ||
    lower.includes("case box")
  ) {
    return "electronics_enclosure";
  }
  if (
    lower.includes("phone case") ||
    lower.includes("phone cover") ||
    lower.includes("phone sleeve") ||
    lower.includes("smartphone case") ||
    lower.includes("iphone case") ||
    compact.includes("iphonecase") ||
    compact.includes("smartphonecase") ||
    lower.includes("手机壳") ||
    lower.includes("手机套") ||
    lower.includes("保护壳") ||
    lower.includes("保护套") ||
    /iphone\d*(pro|max|plus)?/.test(compact)
  ) {
    return "phone_case";
  }

  return "unknown";
}

export async function getParameterSchema(
  family: PartFamily,
  parameterValues: Record<string, unknown>
): Promise<ParameterDef[]> {
  const schemaFile = await loadFamilySchema(family);
  const baseSchema = schemaFile?.parameters ?? (FALLBACK_SCHEMAS[family] ?? UNKNOWN_FALLBACK_SCHEMA);
  return applyParameterOverrides(baseSchema, parameterValues);
}

export async function runScadGenerationSkill(
  inputRequest: string,
  parameterValues: Record<string, unknown>,
  requestedModel?: string | null
): Promise<LLMGenerationResult> {
  const partFamily = detectPartFamily(inputRequest);
  const paramSchema = await getParameterSchema(partFamily, parameterValues);
  const prompt = await buildScadPrompt(inputRequest, partFamily, parameterValues);

  if (!prompt) {
    throw new Error("scad-generation skill is missing");
  }

  const rawContent = await createChatCompletionWithFallback({
    messages: [
      { role: "system", content: prompt.systemPrompt },
      { role: "user", content: prompt.userPrompt },
    ],
    model: requestedModel?.trim() || undefined,
    stream: false,
  });

  const generationResult = normalizeGenerationResult(
    rawContent,
    paramSchema,
    `Generated ${partFamily} part`
  );
  const sanitizedScadSource = sanitizeGeneratedScadSource(generationResult.scad_source);
  await validateGeneratedScadSource(sanitizedScadSource);
  const extractedParameters = mergeExtractedParameters(
    extractParameterDefsFromScad(sanitizedScadSource),
    generationResult.parameters
  );

  return {
    ...generationResult,
    parameters: extractedParameters,
    scad_source: sanitizedScadSource,
  };
}
