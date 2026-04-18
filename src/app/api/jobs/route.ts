import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Valid job states
const VALID_STATES = [
  "NEW",
  "SCAD_GENERATED",
  "RENDERED",
  "VALIDATED",
  "DELIVERED",
  "DEBUGGING",
  "REPAIRING",
  "VALIDATION_FAILED",
  "GEOMETRY_FAILED",
  "RENDER_FAILED",
  "HUMAN_REVIEW",
  "CANCELLED",
] as const;

type JobState = (typeof VALID_STATES)[number];

/**
 * GET /api/jobs
 * List all jobs with optional state filter, limit, offset
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const state = searchParams.get("state") as JobState | null;
    const limitParam = searchParams.get("limit");
    const offsetParam = searchParams.get("offset");

    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10), 1), 100) : 50;
    const offset = offsetParam ? Math.max(parseInt(offsetParam, 10), 0) : 0;

    if (state && !VALID_STATES.includes(state)) {
      return NextResponse.json(
        { error: `Invalid state filter. Valid states: ${VALID_STATES.join(", ")}` },
        { status: 400 }
      );
    }

    const where = state ? { state } : {};

    const [jobs, total] = await Promise.all([
      db.job.findMany({
        where,
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        take: limit,
        skip: offset,
      }),
      db.job.count({ where }),
    ]);

    return NextResponse.json({
      jobs,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error("Error listing jobs:", error);
    return NextResponse.json(
      { error: "Failed to fetch jobs" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/jobs
 * Create a new job with inputRequest, customerId, priority
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { inputRequest, customerId, priority } = body;

    if (!inputRequest || typeof inputRequest !== "string" || inputRequest.trim().length === 0) {
      return NextResponse.json(
        { error: "inputRequest is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    const jobPriority = typeof priority === "number" ? Math.min(Math.max(priority, 1), 10) : 5;

    // Generate a default parameter schema based on a generic enclosure
    const defaultParameterSchema = JSON.stringify({
      part_family: "electronics_enclosure",
      design_summary: "Custom enclosure based on user request",
      parameters: [
        {
          key: "width",
          label: "Width",
          kind: "number",
          unit: "mm",
          value: 40,
          min: 10,
          max: 200,
          step: 1,
          source: "user",
          editable: true,
          description: "Outer width",
          group: "dimensions",
        },
        {
          key: "depth",
          label: "Depth",
          kind: "number",
          unit: "mm",
          value: 30,
          min: 10,
          max: 200,
          step: 1,
          source: "user",
          editable: true,
          description: "Outer depth",
          group: "dimensions",
        },
        {
          key: "height",
          label: "Height",
          kind: "number",
          unit: "mm",
          value: 15,
          min: 5,
          max: 100,
          step: 1,
          source: "inferred",
          editable: true,
          description: "Outer height",
          group: "dimensions",
        },
        {
          key: "wall_thickness",
          label: "Wall Thickness",
          kind: "number",
          unit: "mm",
          value: 2.0,
          min: 1.2,
          max: 5,
          step: 0.1,
          source: "design_derived",
          editable: true,
          description: "Wall thickness",
          group: "fit",
        },
      ],
    });

    // Default parameter values derived from the schema
    const defaultParameterValues = JSON.stringify({
      width: 40,
      depth: 30,
      height: 15,
      wall_thickness: 2.0,
    });

    const job = await db.job.create({
      data: {
        inputRequest: inputRequest.trim(),
        customerId: customerId || null,
        priority: jobPriority,
        state: "NEW",
        parameterSchema: defaultParameterSchema,
        parameterValues: defaultParameterValues,
        executionLogs: JSON.stringify([
          {
            timestamp: new Date().toISOString(),
            event: "JOB_CREATED",
            message: `Job created with input: ${inputRequest.trim().substring(0, 100)}`,
          },
        ]),
      },
    });

    return NextResponse.json({ job }, { status: 201 });
  } catch (error) {
    console.error("Error creating job:", error);
    return NextResponse.json(
      { error: "Failed to create job" },
      { status: 500 }
    );
  }
}
