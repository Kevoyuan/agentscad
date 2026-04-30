import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { db } from "@/lib/db";
import { GET as getJobs, POST as createJob } from "@/app/api/jobs/route";
import { NextRequest } from "next/server";

describe("Job Pipeline API Tests", () => {
  let createdJobId: string;

  test("GET /api/jobs returns job list", async () => {
    const req = new NextRequest(new URL("http://localhost:3000/api/jobs"));
    const res = await getJobs(req);
    expect(res.status).toBe(200);
    
    const data = await res.json();
    expect(Array.isArray(data.jobs)).toBe(true);
    expect(typeof data.total).toBe("number");
  });

  test("POST /api/jobs creates a new job", async () => {
    const payload = {
      inputRequest: "A test box 10x10x10",
    };
    
    const req = new NextRequest(new URL("http://localhost:3000/api/jobs"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
    
    const res = await createJob(req);
    expect(res.status).toBe(201);
    
    const data = await res.json();
    expect(data.job).toBeDefined();
    expect(data.job.inputRequest).toBe(payload.inputRequest);
    expect(data.job.state).toBe("NEW");
    
    createdJobId = data.job.id;
  });

  test("Database validates created job", async () => {
    expect(createdJobId).toBeDefined();
    
    const job = await db.job.findUnique({
      where: { id: createdJobId }
    });
    
    expect(job).not.toBeNull();
    expect(job?.state).toBe("NEW");
  });

  // Cleanup
  afterAll(async () => {
    if (createdJobId) {
      await db.job.delete({ where: { id: createdJobId } });
    }
  });
});
