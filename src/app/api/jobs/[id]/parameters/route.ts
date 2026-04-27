import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appendLog } from "@/lib/stores/job-store";
import { broadcastWs } from "@/lib/ws-broadcast";
import { trackVersion } from "@/lib/version-tracker";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/jobs/[id]/parameters
 * Update parameter values for a job
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parameters = body.parameters ?? body.parameterValues;

    if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) {
      return NextResponse.json(
        { error: "parameters must be an object with key-value pairs" },
        { status: 400 }
      );
    }

    const job = await db.job.findUnique({ where: { id } });

    if (!job) {
      return NextResponse.json(
        { error: `Job not found with id: ${id}` },
        { status: 404 }
      );
    }

    // Parse existing parameter values and schema
    let currentValues: Record<string, unknown> = {};
    if (job.parameterValues) {
      try {
        currentValues = JSON.parse(job.parameterValues);
      } catch {
        currentValues = {};
      }
    }

    let schemaObj: Record<string, unknown> | Array<Record<string, unknown>> = {};
    if (job.parameterSchema) {
      try {
        schemaObj = JSON.parse(job.parameterSchema);
      } catch {
        schemaObj = {};
      }
    }

    // Validate parameters against schema constraints
    const schemaParams = Array.isArray(schemaObj)
      ? schemaObj
      : (schemaObj.parameters as Array<Record<string, unknown>>) || [];
    const validationErrors: string[] = [];

    for (const [key, value] of Object.entries(parameters)) {
      const schemaParam = schemaParams.find((p) => p.key === key);

      if (schemaParam) {
        // Check if parameter is editable
        if (schemaParam.editable === false) {
          validationErrors.push(`Parameter '${key}' is not editable`);
          continue;
        }

        // Type and range validation for number parameters
        const numericKinds = new Set(["number", "float", "integer"]);
        if (numericKinds.has(String(schemaParam.kind)) && typeof value === "number") {
          const min = schemaParam.min as number | undefined;
          const max = schemaParam.max as number | undefined;
          const step = schemaParam.step as number | undefined;

          if (min !== undefined && value < min) {
            validationErrors.push(`Parameter '${key}' value ${value} is below minimum ${min}`);
          }
          if (max !== undefined && value > max) {
            validationErrors.push(`Parameter '${key}' value ${value} is above maximum ${max}`);
          }
          if (step !== undefined) {
            const roundedValue = Math.round(value / step) * step;
            if (Math.abs(roundedValue - value) > 0.0001) {
              validationErrors.push(`Parameter '${key}' value ${value} doesn't match step ${step}`);
            }
          }
        }
      }

      // Update the value even if there are warnings - client can decide
      currentValues[key] = value;
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: "Parameter validation failed", validationErrors },
        { status: 422 }
      );
    }

    // Track version history before updating
    await trackVersion(id, "parameters", job.parameterValues, JSON.stringify(currentValues));

    // Update the parameter values in the database
    const updatedJob = await db.job.update({
      where: { id },
      data: {
        parameterValues: JSON.stringify(currentValues),
        // Parameter edits invalidate rendered artifacts. Keep the state so the
        // viewport can show an immediate procedural preview until reprocessing.
        ...(job.state !== "NEW" && job.state !== "CANCELLED"
          ? { stlPath: null, pngPath: null }
          : {}),
        executionLogs: appendLog(
          job.executionLogs,
          "PARAMETERS_UPDATED",
          `Parameters updated: ${Object.keys(parameters).join(", ")}; render artifacts marked stale`
        ),
      },
    });

    // Broadcast WebSocket event
    broadcastWs("job:update", { jobId: id, state: updatedJob.state, action: "parameters_updated" }).catch(() => {});

    return NextResponse.json({
      job: updatedJob,
      updatedParameters: Object.keys(parameters),
      parameterValues: currentValues,
    });
  } catch (error) {
    console.error("Error updating parameters:", error);
    return NextResponse.json(
      { error: "Failed to update parameters" },
      { status: 500 }
    );
  }
}
