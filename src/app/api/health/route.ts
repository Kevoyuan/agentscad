import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    // Simple DB connectivity check
    await db.job.count();
    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "AgentSCAD API",
      version: "1.0.0",
      database: "connected",
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        service: "AgentSCAD API",
        version: "1.0.0",
        database: "disconnected",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 503 }
    );
  }
}
