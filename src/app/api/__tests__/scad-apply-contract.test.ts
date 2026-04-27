import { describe, expect, test } from "bun:test";
import { readFile } from "fs/promises";
import path from "path";

describe("manual SCAD apply route contract", () => {
  test("uses shared artifact validation instead of local synthetic mesh validation", async () => {
    const routePath = path.join(
      process.cwd(),
      "src",
      "app",
      "api",
      "jobs",
      "[id]",
      "scad",
      "apply",
      "route.ts"
    );
    const source = await readFile(routePath, "utf8");

    expect(source).toContain("validateRenderedArtifacts");
    expect(source).toContain("renderScadArtifacts");
    expect(source).not.toContain("function generateValidationResults");
  });
});
