import { describe, expect, test } from "bun:test";
import { appendLog, parameterDefsToValues } from "@/lib/stores/job-store";
import type { ParameterDef } from "@/lib/harness/types";

describe("job-store helpers", () => {
  test("appendLog preserves existing log entries", () => {
    const existing = JSON.stringify([
      {
        timestamp: "2026-04-27T00:00:00.000Z",
        event: "STARTED",
        message: "Started",
      },
    ]);

    const next = JSON.parse(appendLog(existing, "RENDERED", "Rendered"));

    expect(next).toHaveLength(2);
    expect(next[0]).toMatchObject({ event: "STARTED", message: "Started" });
    expect(next[1]).toMatchObject({ event: "RENDERED", message: "Rendered" });
    expect(typeof next[1].timestamp).toBe("string");
  });

  test("appendLog recovers from malformed existing logs", () => {
    const next = JSON.parse(appendLog("{not json", "RECOVERED", "Recovered"));

    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ event: "RECOVERED", message: "Recovered" });
  });

  test("parameterDefsToValues converts editable schema values into a flat value map", () => {
    const parameters: ParameterDef[] = [
      {
        key: "width",
        label: "Width",
        kind: "float",
        unit: "mm",
        value: 42,
        min: 0,
        max: 100,
        step: 0.5,
        source: "artifact",
        editable: true,
        description: "Width",
        group: "Dimensions",
      },
      {
        key: "teeth",
        label: "Teeth",
        kind: "integer",
        unit: "",
        value: 24,
        min: 8,
        max: 200,
        step: 1,
        source: "user",
        editable: true,
        description: "Gear teeth",
        group: "Geometry",
      },
    ];

    expect(parameterDefsToValues(parameters)).toEqual({
      width: 42,
      teeth: 24,
    });
  });
});
