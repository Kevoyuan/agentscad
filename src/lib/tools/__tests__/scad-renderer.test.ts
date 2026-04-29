import { describe, expect, test } from "bun:test";
import { buildOpenScadDefineArgs } from "@/lib/tools/scad-renderer";

describe("scad-renderer", () => {
  test("builds shell-safe OpenSCAD define args for primitive parameter values", () => {
    const args = buildOpenScadDefineArgs({
      width: 42,
      centered: true,
      label: 'left "bracket" $HOME',
      bad_key: 10,
      "bad-key": 20,
      ignored: { nested: true },
      alsoIgnored: Number.NaN,
    });

    expect(args).toContain('-D "width=42"');
    expect(args).toContain('-D "centered=true"');
    expect(args).toContain('-D "label=\\"left \\\\\\"bracket\\\\\\" \\$HOME\\""');
    expect(args).toContain('-D "bad_key=10"');
    expect(args).not.toContain("bad-key");
    expect(args).not.toContain("ignored=");
    expect(args).not.toContain("alsoIgnored=");
  });
});
