import fs from "fs/promises";
import path from "path";

export interface ArtifactPaths {
  artifactsDir: string;
  scadFilePath: string;
  stlFilePath: string;
  pngFilePath: string;
  scadPublicPath: string;
  stlPublicPath: string;
  pngPublicPath: string;
  publicScadPath: string;
  publicStlPath: string;
  publicPngPath: string;
}

export function getJobArtifactPaths(jobId: string): ArtifactPaths {
  const artifactsDir = path.join(process.cwd(), "public", "artifacts", jobId);

  const scadPublicPath = `/artifacts/${jobId}/model.scad`;
  const stlPublicPath = `/artifacts/${jobId}/model.stl`;
  const pngPublicPath = `/artifacts/${jobId}/preview.png`;

  return {
    artifactsDir,
    scadFilePath: path.join(artifactsDir, "model.scad"),
    stlFilePath: path.join(artifactsDir, "model.stl"),
    pngFilePath: path.join(artifactsDir, "preview.png"),
    scadPublicPath,
    stlPublicPath,
    pngPublicPath,
    publicScadPath: scadPublicPath,
    publicStlPath: stlPublicPath,
    publicPngPath: pngPublicPath,
  };
}

export async function ensureJobArtifactsDir(jobId: string): Promise<ArtifactPaths> {
  const paths = getJobArtifactPaths(jobId);
  await fs.mkdir(paths.artifactsDir, { recursive: true });
  return paths;
}

export async function writeJobScadSource(
  jobId: string,
  scadSource: string
): Promise<ArtifactPaths> {
  const paths = await ensureJobArtifactsDir(jobId);
  await fs.writeFile(paths.scadFilePath, scadSource, "utf8");
  return paths;
}

export async function publicArtifactExists(publicPath: string | null | undefined): Promise<boolean> {
  if (!publicPath) return false;

  try {
    await fs.access(path.join(process.cwd(), "public", publicPath.replace(/^\//, "")));
    return true;
  } catch {
    return false;
  }
}
