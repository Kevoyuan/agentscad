import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

const createdJobs: Array<Record<string, unknown>> = [];
let nextId = 1;

beforeAll(() => {
  mock.module("@/lib/db", () => ({
    db: {
      job: {
        findMany: mock(async () => createdJobs),
        findUnique: mock(async (args: { where: { id: string } }) =>
          createdJobs.find((j) => j.id === args.where.id) ?? null
        ),
        create: mock(async (args: { data: Record<string, unknown> }) => {
          const job = { id: `test-job-${nextId++}`, state: "NEW", ...args.data };
          createdJobs.push(job);
          return job;
        }),
        count: mock(async () => createdJobs.length),
        delete: mock(async (args: { where: { id: string } }) => {
          const idx = createdJobs.findIndex((j) => j.id === args.where.id);
          if (idx >= 0) createdJobs.splice(idx, 1);
        }),
      },
    },
  }));
});

afterAll(() => {
  mock.restore();
});

describe("Job Pipeline API Tests", () => {
  let createdJobId: string;

  test("GET /api/jobs returns job list", async () => {
    // Ensure clean state for this test
    createdJobs.length = 0;
    nextId = 1;
    const { GET: getJobs } = await import("@/app/api/jobs/route");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest(new URL("http://localhost:3000/api/jobs"));
    const res = await getJobs(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data.jobs)).toBe(true);
    expect(typeof data.total).toBe("number");
  });

  test("POST /api/jobs creates a new job", async () => {
    const { POST: createJob } = await import("@/app/api/jobs/route");
    const { NextRequest } = await import("next/server");
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

    const { db } = await import("@/lib/db");
    const job = await db.job.findUnique({
      where: { id: createdJobId },
    });

    expect(job).not.toBeNull();
    expect(job?.state).toBe("NEW");
  });
});
