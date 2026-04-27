import fs from "fs/promises";
import os from "os";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { getJobArtifactPaths, writeJobScadSource } from "@/lib/tools/artifact-store";
import { buildOpenScadExecEnv } from "@/lib/tools/scad-library-resolver";
import type { RenderedArtifacts, RenderLog } from "@/lib/harness/types";

const execAsync = promisify(exec);

export async function validateGeneratedScadSource(scadSource: string): Promise<void> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cadcad-scad-"));
  const tempScadPath = path.join(tmpDir, "validate.scad");
  const tempStlPath = path.join(tmpDir, "validate.stl");

  try {
    await fs.writeFile(tempScadPath, scadSource, "utf8");
    await execAsync(`openscad -o "${tempStlPath}" "${tempScadPath}"`, {
      env: await buildOpenScadExecEnv(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown OpenSCAD validation error";
    throw new Error(`Generated SCAD failed OpenSCAD validation: ${message}`);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

export async function renderStl(scadFilePath: string, stlFilePath: string): Promise<void> {
  await execAsync(`openscad -o "${stlFilePath}" "${scadFilePath}"`, {
    env: await buildOpenScadExecEnv(),
  });
}

export async function renderPng(scadFilePath: string, pngFilePath: string): Promise<void> {
  await execAsync(`openscad -o "${pngFilePath}" --colorscheme=Tomorrow "${scadFilePath}"`, {
    env: await buildOpenScadExecEnv(),
  });
}

export async function renderScadArtifacts(
  jobId: string,
  scadSource: string
): Promise<RenderedArtifacts> {
  const paths = await writeJobScadSource(jobId, scadSource);
  const startTime = Date.now();

  await renderStl(paths.scadFilePath, paths.stlFilePath);
  await renderPng(paths.scadFilePath, paths.pngFilePath);

  const renderLog: RenderLog = {
    openscad_version: "real",
    render_time_ms: Date.now() - startTime,
    stl_triangles: 0,
    stl_vertices: 0,
    png_resolution: "800x600",
    warnings: [],
  };

  return {
    artifactsDir: paths.artifactsDir,
    scadFilePath: paths.scadFilePath,
    stlFilePath: paths.stlFilePath,
    pngFilePath: paths.pngFilePath,
    stlPath: paths.publicStlPath,
    pngPath: paths.publicPngPath,
    renderLog,
  };
}

export function buildRenderFailureLog(renderTime = 0, warnings: string[] = []): RenderLog {
  return {
    openscad_version: "error",
    render_time_ms: renderTime,
    stl_triangles: 0,
    stl_vertices: 0,
    png_resolution: null,
    warnings,
  };
}

export function getRenderedArtifactPaths(jobId: string) {
  return getJobArtifactPaths(jobId);
}
