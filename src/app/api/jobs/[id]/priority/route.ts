import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { broadcastWs } from "@/lib/ws-broadcast";

/**
 * PATCH /api/jobs/[id]/priority
 * Update the priority of a job.
 * Body: { priority: number } (1-10)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { priority } = body;

    if (typeof priority !== "number" || priority < 1 || priority > 10) {
      return NextResponse.json(
        { error: "Priority must be a number between 1 and 10" },
        { status: 400 }
      );
    }

    const existing = await db.job.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const job = await db.job.update({
      where: { id },
      data: { priority: Math.round(priority) },
    });

    // Broadcast WebSocket event
    broadcastWs("job:update", {
      jobId: job.id,
      state: job.state,
      action: "priority_updated",
    }).catch(() => {});

    return NextResponse.json({ job });
  } catch (error) {
    console.error("Error updating job priority:", error);
    return NextResponse.json(
      { error: "Failed to update priority" },
      { status: 500 }
    );
  }
}
