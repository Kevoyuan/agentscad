import { constants as fsConstants } from "fs";
import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string; type: string }>;
}

const VALID_ARTIFACT_TYPES = ["stl", "png", "scad"] as const;

const MIME_TYPES: Record<(typeof VALID_ARTIFACT_TYPES)[number], string> = {
  scad: "text/plain; charset=utf-8",
  stl: "application/sla",
  png: "image/png",
};

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveArtifactPath(rawPath: string | null | undefined) {
  if (!rawPath || !rawPath.startsWith("/artifacts/")) {
    return null;
  }

  const relativePath = rawPath.replace(/^\/artifacts\//, "");
  return path.join(process.cwd(), "public", "artifacts", relativePath);
}

export async function GET(
  _request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id, type } = await params;

    if (!VALID_ARTIFACT_TYPES.includes(type as (typeof VALID_ARTIFACT_TYPES)[number])) {
      return NextResponse.json(
        { error: `Invalid artifact type: ${type}. Valid types: ${VALID_ARTIFACT_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const job = await db.job.findUnique({ where: { id } });

    if (!job) {
      return NextResponse.json({ error: `Job not found with id: ${id}` }, { status: 404 });
    }

    if (type === "scad") {
      if (!job.scadSource) {
        return NextResponse.json({ error: "SCAD source not available for this job" }, { status: 404 });
      }

      return new Response(job.scadSource, {
        headers: {
          "Content-Type": MIME_TYPES.scad,
          "Content-Disposition": `attachment; filename="job_${id}.scad"`,
        },
      });
    }

    const requestedArtifactPath = type === "stl" ? job.stlPath : job.pngPath;
    const resolvedPath = resolveArtifactPath(requestedArtifactPath);

    if (!resolvedPath) {
      return NextResponse.json(
        {
          error: `${type.toUpperCase()} artifact path is unavailable for this job`,
          state: job.state,
          artifactPath: requestedArtifactPath,
        },
        { status: 404 }
      );
    }

    if (!(await fileExists(resolvedPath))) {
      return NextResponse.json(
        {
          error: `${type.toUpperCase()} artifact file has not been generated`,
          state: job.state,
          artifactPath: requestedArtifactPath,
        },
        { status: 404 }
      );
    }

    const artifactBuffer = await fs.readFile(resolvedPath);

    return new Response(artifactBuffer, {
      headers: {
        "Content-Type": MIME_TYPES[type],
        "Content-Disposition": `attachment; filename="${path.basename(resolvedPath)}"`,
        "Content-Length": artifactBuffer.byteLength.toString(),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error fetching artifact:", error);
    return NextResponse.json({ error: "Failed to fetch artifact" }, { status: 500 });
  }
}
