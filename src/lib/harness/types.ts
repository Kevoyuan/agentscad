import type { ValidationResult } from "@/lib/mesh-validator";

export type PartFamily =
  | "spur_gear"
  | "device_stand"
  | "electronics_enclosure"
  | "phone_case"
  | "unknown";

export interface ParameterDef {
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

export interface LLMGenerationResult {
  summary: string;
  parameters: ParameterDef[];
  scad_source: string;
}

export interface RenderLog {
  openscad_version: string;
  render_time_ms: number;
  stl_triangles: number;
  stl_vertices: number;
  png_resolution: string | null;
  warnings: string[];
}

export interface RenderedArtifacts {
  artifactsDir: string;
  scadFilePath: string;
  stlFilePath: string;
  pngFilePath: string;
  stlPath: string;
  pngPath: string;
  renderLog: RenderLog;
}

export interface ExecutionLogEntry {
  timestamp: string;
  event: string;
  message: string;
}

export type { ValidationResult };
