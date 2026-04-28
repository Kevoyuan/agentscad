import { NextResponse } from "next/server";
import {
  getManagedMeshValidatorPath,
  getMeshValidatorStatus,
} from "@/lib/mesh-validator";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getMeshValidatorStatus();
  return NextResponse.json({
    extension: "mesh-validator",
    available: status.available,
    managed: status.managed,
    pythonPath: status.pythonPath || getManagedMeshValidatorPath(),
    message: status.message,
  });
}

export async function POST() {
  const status = await getMeshValidatorStatus();
  return NextResponse.json({
    extension: "mesh-validator",
    available: status.available,
    managed: status.managed,
    pythonPath: status.pythonPath || getManagedMeshValidatorPath(),
    message: status.message,
  });
}
