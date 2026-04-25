import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { broadcastWs } from "@/lib/ws-broadcast";
import { createMimoChatCompletion, getMimoConfig, MIMO_DEFAULT_MODEL } from "@/lib/mimo";
import { loadFamilySchema, buildScadPrompt, applyParameterOverrides } from "@/lib/skill-resolver";
import { validateStl } from "@/lib/mesh-validator";
import { validatePreviewAgainstRequest } from "@/lib/visual-validator";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface RouteParams {
  params: Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Part-family detection
// ---------------------------------------------------------------------------

type PartFamily =
  | "spur_gear"
  | "device_stand"
  | "electronics_enclosure"
  | "phone_case"
  | "unknown";

function detectPartFamily(request: string): PartFamily {
  const lower = request.toLowerCase();

  if (
    lower.includes("spur gear") ||
    lower.includes("gear") ||
    lower.includes(" involute")
  ) {
    return "spur_gear";
  }
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
    lower.includes("iphone case")
  ) {
    return "phone_case";
  }

  return "unknown";
}

// ---------------------------------------------------------------------------
// Parameter schema generation per part family
// ---------------------------------------------------------------------------

interface ParameterDef {
  key: string;
  label: string;
  kind: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  source: string;
  editable: boolean;
  description: string;
  group: string;
}

// Hardcoded fallback schemas (used when skill files are unavailable)
const FALLBACK_SCHEMAS: Record<string, ParameterDef[]> = {
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

const UNKNOWN_FALLBACK: ParameterDef[] = [
  { key: "width", label: "Width", kind: "float", unit: "mm", value: 40, min: 5, max: 500, step: 1, source: "user", editable: true, description: "Width of the part", group: "geometry" },
  { key: "depth", label: "Depth", kind: "float", unit: "mm", value: 30, min: 5, max: 500, step: 1, source: "user", editable: true, description: "Depth of the part", group: "geometry" },
  { key: "height", label: "Height", kind: "float", unit: "mm", value: 15, min: 5, max: 500, step: 1, source: "user", editable: true, description: "Height of the part", group: "geometry" },
  { key: "wall_thickness", label: "Wall Thickness", kind: "float", unit: "mm", value: 2, min: 0.8, max: 10, step: 0.2, source: "engineering", editable: true, description: "Wall thickness", group: "engineering" },
];

async function getParameterSchema(
  family: PartFamily,
  parameterValues: Record<string, unknown>
): Promise<ParameterDef[]> {
  // Try loading from skill files first, fall back to hardcoded schemas
  const schemaFile = await loadFamilySchema(family);
  const baseSchema = schemaFile?.parameters ?? (FALLBACK_SCHEMAS[family] ?? UNKNOWN_FALLBACK);

  // Apply user-provided value overrides
  return applyParameterOverrides(baseSchema, parameterValues);
}

// ---------------------------------------------------------------------------
// Learned patterns integration
// ---------------------------------------------------------------------------

interface LearnedPattern {
  family: string;
  insight: string;
  frequency: number;
  suggestedDefault: number | null;
  parameter: string;
}

const LEARNED_PATTERNS_PATH = path.join(
  process.cwd(),
  "skills",
  "scad-generation",
  "learned-patterns.json"
);

async function loadLearnedPatterns(
  partFamily: PartFamily
): Promise<string> {
  try {
    const raw = await fs.readFile(LEARNED_PATTERNS_PATH, "utf8");
    const data: { patterns: LearnedPattern[] } = JSON.parse(raw);

    if (!data.patterns || data.patterns.length === 0) {
      return "";
    }

    // Filter patterns relevant to this part family
    const relevant = data.patterns.filter(
      (p) => p.family === partFamily || p.family === "unknown"
    );

    if (relevant.length === 0) {
      return "";
    }

    // Sort by frequency (most common first), take top 5
    const top = relevant
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5);

    const lines = top.map((p) => {
      let line = `  - ${p.insight} (seen ${p.frequency} times)`;
      if (p.suggestedDefault !== null) {
        line += ` — suggested default: ${p.suggestedDefault}`;
      }
      return line;
    });

    return `\nCommon user adjustments for ${partFamily} parts:\n${lines.join("\n")}\n`;
  } catch {
    // File doesn't exist or can't be parsed — no patterns available
    return "";
  }
}

// ---------------------------------------------------------------------------
// Real SCAD generation via z-ai-web-dev-sdk
// ---------------------------------------------------------------------------

interface LLMGenerationResult {
  summary: string;
  parameters: ParameterDef[];
  scad_source: string;
}

async function generateRealScadCode(
  inputRequest: string,
  parameterValues: Record<string, unknown>
): Promise<LLMGenerationResult> {
  const partFamily = detectPartFamily(inputRequest);
  const paramSchema = await getParameterSchema(partFamily, parameterValues);

  // Build a parameter summary for the prompt so the LLM knows what's available
  const paramSummary = paramSchema
    .map(
      (p) =>
        `- ${p.key} = ${p.value} (${p.kind}, ${p.unit || "unitless"}, range ${p.min}–${p.max})  // ${p.description}`
    )
    .join("\n");

  // Load learned patterns from the cron-analyzed user edit data
  const learnedPatternsHint = await loadLearnedPatterns(partFamily);

  // Try loading prompts from skill files, fall back to hardcoded defaults
  const skillPrompt = await buildScadPrompt(inputRequest, partFamily, parameterValues);

  const DEFAULT_SYSTEM_PROMPT = `You are an expert CAD engineer who writes OpenSCAD code. You MUST respond with ONLY a JSON object — no markdown fences, no commentary outside the JSON.

The JSON object must have exactly these fields:
{
  "summary": "A one-sentence description of the generated part",
  "parameters": [ ... array of parameter objects ... ],
  "scad_source": "The complete OpenSCAD source code as a string"
}

Each parameter object must have:
  key, label, kind ("float"|"integer"), unit, value, min, max, step, source ("user"|"engineering"|"derived"), editable (boolean), description, group

IMPORTANT RULES for the scad_source:
1. Every parameter MUST appear as a top-level assignment, e.g.  teeth = 20;
2. Use ONLY built-in OpenSCAD primitives (cube, cylinder, difference, union, translate, rotate, hull, minkowski, etc.)
3. The code must be valid, self-contained OpenSCAD that compiles without errors.
4. Use meaningful variable names matching the parameter keys.
5. Add a header comment with the part family name and generation timestamp.
6. NEVER use OpenSCAD reserved keywords as variable names, especially: module, function, if, else, for, let, use, include.`;

  const DEFAULT_USER_PROMPT = `Generate OpenSCAD code for the following request:

"${inputRequest}"

Detected part family: ${partFamily}

Suggested parameters:
${paramSummary}

Current parameter values:
${JSON.stringify(parameterValues, null, 2)}
${learnedPatternsHint}
Return the JSON object with summary, parameters, and scad_source.`;

  const systemPrompt = skillPrompt?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  const userPrompt = skillPrompt?.userPrompt
    ? skillPrompt.userPrompt + learnedPatternsHint
    : DEFAULT_USER_PROMPT;

  let rawContent = "";

  if (getMimoConfig().enabled) {
    const mimoResponse = await createMimoChatCompletion({
      model: process.env.MIMO_MODEL || MIMO_DEFAULT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      stream: false,
    });

    const result = await mimoResponse.json();
    rawContent =
      result?.choices?.[0]?.message?.content ??
      JSON.stringify(result);
  } else {
    // Dynamically import so that a missing SDK never crashes at module level
    const ZAIModule = await import("z-ai-web-dev-sdk");
    const ZAI = ZAIModule.default;
    const zai = await ZAI.create();

    const result = await zai.chat.completions.create({
      messages: [
        { role: "user", content: userPrompt },
      ],
      stream: false,
    });

    rawContent =
      result?.choices?.[0]?.message?.content ??
      result?.data?.content ??
      (typeof result === "string" ? result : JSON.stringify(result));
  }

  // Strip markdown code fences if the LLM wrapped them
  const cleaned = rawContent
    .replace(/^```(?:json)?\s*\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trim();

  const parsed = JSON.parse(cleaned);

  // Validate the shape minimally
  if (!parsed.scad_source || typeof parsed.scad_source !== "string") {
    throw new Error("LLM response missing scad_source");
  }
  if (!Array.isArray(parsed.parameters)) {
    parsed.parameters = paramSchema;
  }
  if (!parsed.summary || typeof parsed.summary !== "string") {
    parsed.summary = `Generated ${partFamily} part`;
  }

  const sanitizedScadSource = sanitizeGeneratedScadSource(parsed.scad_source);
  await validateGeneratedScadSource(sanitizedScadSource);

  return {
    summary: parsed.summary,
    parameters: parsed.parameters,
    scad_source: sanitizedScadSource,
  };
}

function sanitizeGeneratedScadSource(scadSource: string) {
  return scadSource
    .replace(/(^|\n)(\s*)module(\s*=)/g, "$1$2tooth_module$3")
    .replace(/\bmodule\b(?!\s+[A-Za-z_][A-Za-z0-9_]*\s*\()/g, "tooth_module");
}

async function validateGeneratedScadSource(scadSource: string) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cadcad-scad-"));
  const tempScadPath = path.join(tmpDir, "validate.scad");
  const tempStlPath = path.join(tmpDir, "validate.stl");

  try {
    await fs.writeFile(tempScadPath, scadSource, "utf8");
    await execAsync(`openscad -o "${tempStlPath}" "${tempScadPath}"`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown OpenSCAD validation error";
    throw new Error(`Generated SCAD failed OpenSCAD validation: ${message}`);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Mock SCAD code generator (fallback)
// ---------------------------------------------------------------------------

async function generateMockScadCode(
  inputRequest: string,
  parameterValues: Record<string, unknown>
): Promise<LLMGenerationResult> {
  const partFamily = detectPartFamily(inputRequest);
  const paramSchema = await getParameterSchema(partFamily, parameterValues);
  const ts = new Date().toISOString();

  // Build top-level parameter assignments for the SCAD source
  const assignments = paramSchema
    .map((p) => {
      const val = p.kind === "integer" ? Math.round(p.value) : p.value;
      return `${p.key} = ${val};`;
    })
    .join("\n");

  let scadSource = "";
  let summary = "";

  switch (partFamily) {
    case "spur_gear": {
      const teeth = (parameterValues.teeth as number) ?? 20;
      const outerDiam = (parameterValues.outer_diameter as number) ?? 50;
      const boreDiam = (parameterValues.bore_diameter as number) ?? 8;
      const thickness = (parameterValues.thickness as number) ?? 8;
      const pressureAngle = (parameterValues.pressure_angle as number) ?? 20;
      summary = `Spur gear with ${teeth} teeth, ${outerDiam}mm outer diameter`;
      scadSource = `// Generated by AgentSCAD
// Part Family: spur_gear
// Generated at: ${ts}

${assignments}

module spur_gear(teeth, outer_diameter, bore_diameter, thickness, pressure_angle) {
  tooth_module = outer_diameter / teeth;
  pitch_diameter = outer_diameter - 2 * tooth_module;
  tooth_depth = tooth_module * 2.2;

  difference() {
    union() {
      cylinder(h=thickness, d=outer_diameter, $fn=teeth, center=true);
      for (i = [0:teeth-1]) {
        rotate([0, 0, i * 360 / teeth])
          translate([pitch_diameter/2, 0, 0])
            cube([tooth_depth, tooth_module, thickness], center=true);
      }
    }
    cylinder(h=thickness+2, d=bore_diameter, $fn=64, center=true);
  }
}

spur_gear(teeth, outer_diameter, bore_diameter, thickness, pressure_angle);`;
      break;
    }

    case "device_stand": {
      const dw = (parameterValues.device_width as number) ?? 75;
      const dd = (parameterValues.device_depth as number) ?? 12;
      const sh = (parameterValues.stand_height as number) ?? 80;
      const lh = (parameterValues.lip_height as number) ?? 10;
      const wt = (parameterValues.wall_thickness as number) ?? 3;
      const bf = (parameterValues.base_flare as number) ?? 20;
      const ar = (parameterValues.arch_radius as number) ?? 30;
      const ap = (parameterValues.arch_peak as number) ?? 15;
      summary = `Device stand for ${dw}mm wide device, ${sh}mm tall`;
      scadSource = `// Generated by AgentSCAD
// Part Family: device_stand
// Generated at: ${ts}

${assignments}

module device_stand(device_width, device_depth, stand_height, lip_height,
                    wall_thickness, base_flare, arch_radius, arch_peak) {
  base_w = device_width + 2*wall_thickness + base_flare*2;
  base_d = device_depth + 2*wall_thickness + 30;

  // Base plate
  translate([0, 0, wall_thickness/2])
    minkowski() {
      cube([base_w - 4, base_d - 4, wall_thickness - 1], center=true);
      cylinder(r=2, h=0.5, $fn=32);
    }

  // Back support arch
  translate([0, -base_d/2 + wall_thickness, stand_height/2])
    hull() {
      cube([device_width + 2*wall_thickness, wall_thickness, stand_height], center=true);
    }

  // Front lip
  translate([0, device_depth/2 + wall_thickness, lip_height/2])
    cube([device_width + 2*wall_thickness, wall_thickness, lip_height], center=true);

  // Arch reinforcement
  translate([arch_peak, -base_d/2 + wall_thickness*2, 0])
    cylinder(r=arch_radius, h=wall_thickness, $fn=64, center=true);
}

device_stand(device_width, device_depth, stand_height, lip_height,
             wall_thickness, base_flare, arch_radius, arch_peak);`;
      break;
    }

    case "phone_case": {
      const bl = (parameterValues.body_length as number) ?? 158;
      const bw = (parameterValues.body_width as number) ?? 78;
      const bd = (parameterValues.body_depth as number) ?? 8;
      const wt = (parameterValues.wall_thickness as number) ?? 1.5;
      const cc = (parameterValues.camera_clearance as number) ?? 1;
      summary = `Phone case for ${bl}×${bw}×${bd}mm device`;
      scadSource = `// Generated by AgentSCAD
// Part Family: phone_case
// Generated at: ${ts}

${assignments}

module phone_case(body_length, body_width, body_depth,
                  wall_thickness, camera_clearance) {
  outer_l = body_length + 2*wall_thickness;
  outer_w = body_width + 2*wall_thickness;
  outer_d = body_depth + wall_thickness;
  corner_r = 8;

  difference() {
    // Outer shell
    minkowski() {
      cube([outer_l - 2*corner_r, outer_w - 2*corner_r, outer_d - 1], center=true);
      cylinder(r=corner_r, h=0.5, $fn=64);
    }
    // Inner cavity
    translate([0, 0, wall_thickness])
      minkowski() {
        cube([body_length - 2*corner_r, body_width - 2*corner_r, body_depth], center=true);
        cylinder(r=corner_r, h=0.5, $fn=64);
      }
    // Screen opening (top face)
    translate([0, 0, outer_d/2 + 0.5])
      cube([body_length - 10, body_width - 10, wall_thickness + 2], center=true);
    // Camera cutout
    translate([-body_length/2 + 15, -body_width/2 + 15, outer_d/2])
      cylinder(r=8 + camera_clearance, h=wall_thickness + 2, $fn=64);
  }
}

phone_case(body_length, body_width, body_depth, wall_thickness, camera_clearance);`;
      break;
    }

    case "electronics_enclosure":
    default: {
      const w = (parameterValues.width as number) ?? 60;
      const d = (parameterValues.depth as number) ?? 40;
      const h = (parameterValues.height as number) ?? 25;
      const wt = (parameterValues.wall_thickness as number) ?? 2;
      const cr = (parameterValues.corner_radius as number) ?? 3;
      const cl = (parameterValues.clearance as number) ?? 0.2;
      summary = `Electronics enclosure ${w}×${d}×${h}mm, ${wt}mm walls`;
      scadSource = `// Generated by AgentSCAD
// Part Family: ${partFamily}
// Generated at: ${ts}

${assignments}

module enclosure_bottom(width, depth, height, wall_thickness,
                        corner_radius, clearance) {
  outer_w = width + 2*wall_thickness;
  outer_d = depth + 2*wall_thickness;
  outer_h = height + wall_thickness;

  difference() {
    // Outer shell
    minkowski() {
      cube([outer_w - 2*corner_radius, outer_d - 2*corner_radius, outer_h - corner_radius], center=true);
      cylinder(r=corner_radius, h=corner_radius, $fn=32);
    }
    // Inner cavity
    translate([0, 0, wall_thickness/2])
      cube([width, depth, height + 1], center=true);
  }
}

module enclosure_lid(width, depth, wall_thickness, corner_radius, clearance) {
  lid_w = width + 2*wall_thickness - 2*clearance;
  lid_d = depth + 2*wall_thickness - 2*clearance;

  minkowski() {
    cube([lid_w - 2*corner_radius, lid_d - 2*corner_radius, wall_thickness - corner_radius], center=true);
    cylinder(r=corner_radius, h=corner_radius/2, $fn=32);
  }
}

enclosure_bottom(width, depth, height, wall_thickness, corner_radius, clearance);

translate([0, depth + 20, 0])
  enclosure_lid(width, depth, wall_thickness, corner_radius, clearance);`;
      break;
    }
  }

  return {
    summary,
    parameters: paramSchema,
    scad_source: scadSource,
  };
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function generateMockValidationResults(wallThickness: number) {
  return [
    {
      rule_id: "R001",
      rule_name: "Minimum Wall Thickness",
      level: "ENGINEERING",
      passed: wallThickness >= 1.2,
      is_critical: true,
      message: `Wall thickness ${wallThickness}mm ${wallThickness >= 1.2 ? "meets" : "does not meet"} minimum 1.2mm`,
    },
    {
      rule_id: "R002",
      rule_name: "Maximum Dimensions",
      level: "MANUFACTURING",
      passed: true,
      is_critical: false,
      message: "All dimensions within manufacturing limits",
    },
    {
      rule_id: "R003",
      rule_name: "Manifold Geometry",
      level: "ENGINEERING",
      passed: true,
      is_critical: true,
      message: "Geometry is manifold (watertight)",
    },
    {
      rule_id: "S001",
      rule_name: "Semantic Geometry Match",
      level: "ENGINEERING",
      passed: true,
      is_critical: true,
      message: "Generated CAD matches the requested geometry",
    },
    {
      rule_id: "S002",
      rule_name: "Design Intent Preservation",
      level: "ENGINEERING",
      passed: true,
      is_critical: false,
      message: "Design intent preserved in generated model",
    },
  ];
}

function appendLog(existingLogs: string | null | undefined, event: string, message: string): string {
  let logs: Array<{ timestamp: string; event: string; message: string }> = [];
  if (existingLogs) {
    try {
      logs = JSON.parse(existingLogs);
    } catch {
      logs = [];
    }
  }
  logs.push({
    timestamp: new Date().toISOString(),
    event,
    message,
  });
  return JSON.stringify(logs);
}

function parameterDefsToValues(parameters: ParameterDef[]) {
  return parameters.reduce<Record<string, number>>((acc, parameter) => {
    acc[parameter.key] = parameter.value;
    return acc;
  }, {});
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * POST /api/jobs/[id]/process
 * Start processing a job – orchestrator pipeline
 * Transitions: NEW → SCAD_GENERATED → RENDERED → VALIDATED → DELIVERED
 * Returns Server-Sent Events for progressive state updates
 */
export async function POST(
  _request: NextRequest,
  { params }: RouteParams
) {
  const { id } = await params;

  try {
    const job = await db.job.findUnique({ where: { id } });

    if (!job) {
      return NextResponse.json(
        { error: `Job not found with id: ${id}` },
        { status: 404 }
      );
    }

    // Allow reprocessing delivered jobs as a rebuild flow, especially after
    // parameter edits have invalidated the rendered STL/PNG artifacts.
    const processableStates = ["NEW", "DELIVERED", "VALIDATION_FAILED", "GEOMETRY_FAILED", "RENDER_FAILED", "HUMAN_REVIEW"];
    if (!processableStates.includes(job.state)) {
      return NextResponse.json(
        { error: `Job cannot be processed in state: ${job.state}. Must be in one of: ${processableStates.join(", ")}` },
        { status: 409 }
      );
    }

    // Use Server-Sent Events to stream progress
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let streamClosed = false;
        function sendEvent(data: Record<string, unknown>) {
          if (streamClosed) return;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        }
        function closeStream() {
          if (streamClosed) return;
          streamClosed = true;
          try {
            controller.close();
          } catch {
            // Clients can disconnect after receiving the final event; that
            // should not mutate a completed job into a failure.
          }
        }

        try {
          // Parse parameter values for SCAD generation
          let paramValues: Record<string, unknown> = {};
          if (job.parameterValues) {
            try {
              paramValues = JSON.parse(job.parameterValues);
            } catch {
              paramValues = {};
            }
          }

          const wallThickness = (paramValues.wall_thickness as number) ?? 2.0;
          const inputRequest = job.inputRequest ?? "generic part";

          // Step 1: NEW → SCAD_GENERATED
          sendEvent({ state: "NEW", step: "starting", message: "Starting job processing pipeline..." });
          await delay(800);

          // ---- Try real LLM generation, fall back to mock ----
          let generationResult: LLMGenerationResult;
          let usedLLM = false;

          try {
            sendEvent({
              state: "NEW",
              step: "generating_llm",
              message: "Generating SCAD code via LLM...",
            });
            generationResult = await generateRealScadCode(inputRequest, paramValues);
            usedLLM = true;
          } catch (llmError) {
            const errMsg = llmError instanceof Error ? llmError.message : "Unknown LLM error";
            console.warn(`LLM generation failed, falling back to mock: ${errMsg}`);
            sendEvent({
              state: "NEW",
              step: "generating_mock",
              message: `LLM unavailable (${errMsg}), using template generation...`,
            });
            await delay(300);
            generationResult = await generateMockScadCode(inputRequest, paramValues);
          }

          const partFamily = detectPartFamily(inputRequest);
          const scadCode = generationResult.scad_source;
          const generationPath = usedLLM ? "llm_parametric" : "template_parametric";
          const builderName = usedLLM
            ? `AgentSCAD-LLM-${partFamily}`
            : `AgentSCAD-Template-${partFamily}`;

          await db.job.update({
            where: { id },
            data: {
              state: "SCAD_GENERATED",
              partFamily,
              scadSource: scadCode,
              builderName,
              generationPath,
              parameterSchema: JSON.stringify(generationResult.parameters),
              parameterValues: JSON.stringify(parameterDefsToValues(generationResult.parameters)),
              researchResult: JSON.stringify({
                part_family: partFamily,
                generation_method: usedLLM ? "llm" : "template",
                summary: generationResult.summary,
                references_found: usedLLM ? 0 : 3,
                similar_designs: usedLLM ? [] : ["standard_box_enclosure_v1", "parametric_case_v2"],
                best_practices: ["Minimum wall thickness 1.2mm for FDM", "Add fillets for strength"],
              }),
              intentResult: JSON.stringify({
                geometry_type: partFamily,
                features: ["parametric_design"],
                constraints: ["printable_without_supports"],
              }),
              designResult: JSON.stringify({
                approach: generationPath,
                parameters_mapped: generationResult.parameters.map((p) => p.key),
                llm_used: usedLLM,
              }),
              executionLogs: appendLog(
                job.executionLogs,
                "SCAD_GENERATED",
                `SCAD code generated via ${usedLLM ? "LLM" : "template"} (family: ${partFamily})`
              ),
            },
          });

          sendEvent({
            state: "SCAD_GENERATED",
            step: "scad_generated",
            message: `SCAD code generated successfully via ${usedLLM ? "LLM" : "template"}`,
            scadSource: scadCode,
            parameters: generationResult.parameters,
            partFamily,
          });
          broadcastWs("job:update", { jobId: id, state: "SCAD_GENERATED", action: "scad_generated" }).catch(() => {});
          await delay(1200);

          // Step 2: SCAD_GENERATED → RENDERED
          sendEvent({
            state: "SCAD_GENERATED",
            step: "rendering",
            message: "Rendering STL and preview image with OpenSCAD...",
          });

          const artifactsDir = path.join(process.cwd(), "public", "artifacts", id);
          await fs.mkdir(artifactsDir, { recursive: true });

          const scadFilePath = path.join(artifactsDir, "model.scad");
          const stlFilePath = path.join(artifactsDir, "model.stl");
          const pngFilePath = path.join(artifactsDir, "preview.png");

          await fs.writeFile(scadFilePath, scadCode);

          let stlPath = "";
          let pngPath = "";
          let renderTime = 0;
          let warnings: string[] = [];

          try {
            const startTime = Date.now();

            sendEvent({ state: "SCAD_GENERATED", step: "rendering", message: "Generating STL..." });
            await execAsync(`openscad -o "${stlFilePath}" "${scadFilePath}"`);

            sendEvent({ state: "SCAD_GENERATED", step: "rendering", message: "Generating PNG preview..." });
            await execAsync(`openscad -o "${pngFilePath}" --colorscheme=Tomorrow "${scadFilePath}"`);

            renderTime = Date.now() - startTime;
            stlPath = `/artifacts/${id}/model.stl`;
            pngPath = `/artifacts/${id}/preview.png`;
          } catch (execError) {
            const renderError =
              execError instanceof Error ? execError.message : "Unknown OpenSCAD render error";
            warnings.push(`OpenSCAD rendering failed: ${renderError}`);

            console.warn("OpenSCAD rendering failed:", execError);

            await db.job.update({
              where: { id },
              data: {
                state: "GEOMETRY_FAILED",
                renderLog: JSON.stringify({
                  openscad_version: "error",
                  render_time_ms: renderTime,
                  stl_triangles: 0,
                  stl_vertices: 0,
                  png_resolution: null,
                  warnings,
                }),
                executionLogs: appendLog(
                  (await db.job.findUnique({ where: { id } }))?.executionLogs,
                  "GEOMETRY_FAILED",
                  `OpenSCAD render failed: ${renderError}`
                ),
              },
            });

            sendEvent({
              state: "GEOMETRY_FAILED",
              step: "render_failed",
              message: "OpenSCAD render failed. Real STL/PNG artifacts were not generated.",
              error: renderError,
            });
            broadcastWs("job:update", { jobId: id, state: "GEOMETRY_FAILED", action: "render_failed" }).catch(() => {});
            controller.close();
            return;
          }

          await db.job.update({
            where: { id },
            data: {
              state: "RENDERED",
              stlPath,
              pngPath,
              renderLog: JSON.stringify({
                openscad_version: "real",
                render_time_ms: renderTime,
                stl_triangles: 0,
                stl_vertices: 0,
                png_resolution: "800x600",
                warnings,
              }),
              executionLogs: appendLog(
                (await db.job.findUnique({ where: { id } }))?.executionLogs,
                "RENDERED",
                `STL and PNG rendered successfully (${renderTime}ms)`
              ),
            },
          });

          sendEvent({
            state: "RENDERED",
            step: "rendered",
            message: "STL and PNG rendered successfully",
            stlPath,
            pngPath,
          });
          broadcastWs("job:update", { jobId: id, state: "RENDERED", action: "rendered" }).catch(() => {});
          await delay(1000);

          // Step 3: RENDERED → VALIDATED
          sendEvent({
            state: "RENDERED",
            step: "validating",
            message: "Running validation rules...",
          });
          await delay(1200);

          const meshValidationResults = await validateStl(stlFilePath, wallThickness);
          sendEvent({
            state: "RENDERED",
            step: "validating",
            message: "Running visual design-intent validation...",
          });
          const visualValidationResults = await validatePreviewAgainstRequest({
            inputRequest: job.inputRequest,
            partFamily,
            scadSource: scadCode,
            previewImagePath: pngFilePath,
          });
          const validationResults = [...meshValidationResults, ...visualValidationResults];
          const criticalFailures = validationResults.filter((rule) => !rule.passed && rule.is_critical);

          if (criticalFailures.length > 0) {
            await db.job.update({
              where: { id },
              data: {
                state: "VALIDATION_FAILED",
                validationResults: JSON.stringify(validationResults),
                executionLogs: appendLog(
                  (await db.job.findUnique({ where: { id } }))?.executionLogs,
                  "VALIDATION_FAILED",
                  `Validation failed: ${criticalFailures.map((rule) => `${rule.rule_id} ${rule.rule_name}`).join(", ")}`
                ),
              },
            });

            sendEvent({
              state: "VALIDATION_FAILED",
              step: "validation_failed",
              message: "Validation failed - critical design-intent or mesh rules did not pass",
              validationResults,
            });
            broadcastWs("job:update", { jobId: id, state: "VALIDATION_FAILED", action: "validation_failed" }).catch(() => {});
            controller.close();
            return;
          }

          await db.job.update({
            where: { id },
            data: {
              state: "VALIDATED",
              validationResults: JSON.stringify(validationResults),
              reportPath: `/artifacts/${id}/report`,
              executionLogs: appendLog(
                (await db.job.findUnique({ where: { id } }))?.executionLogs,
                "VALIDATED",
                `Validation passed: ${validationResults.filter((r) => r.passed).length}/${validationResults.length} rules passed` +
                  (validationResults.some((r) => r.message.includes("(mock")) ? " [mock fallback]" : " [real mesh analysis]")
              ),
            },
          });

          sendEvent({
            state: "VALIDATED",
            step: "validated",
            message: "Validation passed - all critical rules satisfied",
            validationResults,
          });
          broadcastWs("job:update", { jobId: id, state: "VALIDATED", action: "validated" }).catch(() => {});
          await delay(800);

          // Step 4: VALIDATED → DELIVERED
          sendEvent({
            state: "VALIDATED",
            step: "delivering",
            message: "Preparing final deliverables...",
          });
          await delay(600);

          await db.job.update({
            where: { id },
            data: {
              state: "DELIVERED",
              completedAt: new Date(),
              executionLogs: appendLog(
                (await db.job.findUnique({ where: { id } }))?.executionLogs,
                "DELIVERED",
                "Job completed and deliverables ready"
              ),
            },
          });

          const finalJob = await db.job.findUnique({ where: { id } });

          sendEvent({
            state: "DELIVERED",
            step: "delivered",
            message: "Job completed successfully! All deliverables are ready.",
            job: finalJob,
          });
          broadcastWs("job:update", { jobId: id, state: "DELIVERED", action: "delivered" }).catch(() => {});

          closeStream();
        } catch (error) {
          console.error("Error during job processing:", error);

          const message = error instanceof Error ? error.message : "Unknown error";
          const latestJob = await db.job.findUnique({ where: { id } });
          const isStreamLifecycleError =
            message.includes("Controller is already closed") ||
            message.includes("ReadableStreamDefaultController");

          if (isStreamLifecycleError && latestJob?.state === "DELIVERED") {
            console.warn("Ignoring post-delivery stream lifecycle error:", message);
            closeStream();
            return;
          }

          // Update job state to indicate failure
          await db.job.update({
            where: { id },
            data: {
              state: "GEOMETRY_FAILED",
              executionLogs: appendLog(
                (await db.job.findUnique({ where: { id } }))?.executionLogs,
                "GEOMETRY_FAILED",
                `Processing failed: ${message}`
              ),
            },
          });

          sendEvent({
            state: "GEOMETRY_FAILED",
            step: "error",
            message: `Processing failed: ${message}`,
          });
          broadcastWs("job:update", { jobId: id, state: "GEOMETRY_FAILED", action: "error" }).catch(() => {});

          closeStream();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Error starting job processing:", error);
    return NextResponse.json(
      { error: "Failed to start job processing" },
      { status: 500 }
    );
  }
}
