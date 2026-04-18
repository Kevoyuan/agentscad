import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { broadcastWs } from "@/lib/ws-broadcast";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/jobs/[id]
 * Get a single job by ID
 */
export async function GET(
  _request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;

    const job = await db.job.findUnique({
      where: { id },
    });

    if (!job) {
      return NextResponse.json(
        { error: `Job not found with id: ${id}` },
        { status: 404 }
      );
    }

    return NextResponse.json({ job });
  } catch (error) {
    console.error("Error fetching job:", error);
    return NextResponse.json(
      { error: "Failed to fetch job" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/jobs/[id]
 * Delete a job by ID
 */
export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;

    const existingJob = await db.job.findUnique({
      where: { id },
    });

    if (!existingJob) {
      return NextResponse.json(
        { error: `Job not found with id: ${id}` },
        { status: 404 }
      );
    }

    // Prevent deletion of jobs that are currently being processed
    const activeStates = ["NEW", "SCAD_GENERATED", "RENDERED", "VALIDATED"];
    if (activeStates.includes(existingJob.state)) {
      // Cancel the job instead of deleting if it's active
      await db.job.update({
        where: { id },
        data: {
          state: "CANCELLED",
          notes: existingJob.notes
            ? `${existingJob.notes}\nJob cancelled and deleted by user`
            : "Job cancelled and deleted by user",
        },
      });
    }

    await db.job.delete({
      where: { id },
    });

    // Broadcast WebSocket event
    broadcastWs("job:update", { jobId: id, state: "DELETED", action: "deleted" }).catch(() => {});

    return NextResponse.json({
      message: `Job ${id} deleted successfully`,
      id,
    });
  } catch (error) {
    console.error("Error deleting job:", error);
    return NextResponse.json(
      { error: "Failed to delete job" },
      { status: 500 }
    );
  }
}
