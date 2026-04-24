import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { broadcastWs } from "@/lib/ws-broadcast";
import fs from "fs/promises";
import path from "path";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const FAILED_STATES = new Set(["GEOMETRY_FAILED", "RENDER_FAILED", "VALIDATION_FAILED"]);

export async function POST(
  _request: Request,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const job = await db.job.findUnique({ where: { id } });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (!FAILED_STATES.has(job.state)) {
      return NextResponse.json({
        job,
        repaired: false,
        recommendation: "none",
        reason: "Job is not in a failed state.",
      });
    }

    const stlExists = await publicArtifactExists(job.stlPath);
    const pngExists = await publicArtifactExists(job.pngPath);
    const logs = job.executionLogs ?? "";
    const looksLikeFalseFailure =
      stlExists &&
      pngExists &&
      (logs.includes("Controller is already closed") ||
        logs.includes("Job completed and deliverables ready") ||
        job.completedAt !== null);

    if (!looksLikeFalseFailure) {
      return NextResponse.json({
        job,
        repaired: false,
        recommendation: "retry",
        reason: "No complete artifact set was found, so a full retry is safer.",
      });
    }

    const updated = await db.job.update({
      where: { id },
      data: {
        state: "DELIVERED",
        completedAt: job.completedAt ?? new Date(),
        executionLogs: appendLog(
          job.executionLogs,
          "AUTO_REPAIRED",
          "Recovered false failure: deliverables exist and prior stream closed after completion"
        ),
      },
    });

    broadcastWs("job:update", { jobId: id, state: updated.state, action: "auto_repaired" }).catch(() => {});

    return NextResponse.json({
      job: updated,
      repaired: true,
      recommendation: "repaired",
      reason: "Artifacts already existed; state restored to DELIVERED.",
    });
  } catch (error) {
    console.error("Auto repair error:", error);
    return NextResponse.json({ error: "Failed to repair job" }, { status: 500 });
  }
}

async function publicArtifactExists(publicPath: string | null): Promise<boolean> {
  if (!publicPath) return false;
  const normalized = publicPath.replace(/^\/+/, "");
  const fullPath = path.join(process.cwd(), "public", normalized);
  try {
    const stat = await fs.stat(fullPath);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

function appendLog(
  existingLogs: string | null,
  event: string,
  message: string
): string {
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
