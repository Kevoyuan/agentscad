import { describe, expect, test } from "bun:test";
import {
  extractParameterDefsFromScad,
  mergeExtractedParameters,
} from "@/lib/tools/scad-parameter-extractor";

describe("scad-parameter-extractor", () => {
  test("extracts grouped top-level numeric assignments with explicit ranges", () => {
    const parameters = extractParameterDefsFromScad(`
/* [Dimensions] */
body_width = 72; // min: 40 max: 120 step: 0.5
body_height = 150; // min: 80 max: 220 step: 0.5

module body() {
  cube([body_width, body_height, 4]);
}
`);

    expect(parameters).toHaveLength(2);
    expect(parameters[0]).toMatchObject({
      key: "body_width",
      label: "Body Width",
      group: "Dimensions",
      value: 72,
      min: 40,
      max: 120,
      step: 0.5,
    });
    expect(parameters[1]).toMatchObject({
      key: "body_height",
      group: "Dimensions",
      value: 150,
      min: 80,
      max: 220,
      step: 0.5,
    });
  });

  test("stops extracting once geometry or module declarations begin", () => {
    const parameters = extractParameterDefsFromScad(`
wall_thickness = 2; // min: 1.2 max: 6 step: 0.1
module enclosure() {}
hidden_internal = 999;
`);

    expect(parameters.map((parameter) => parameter.key)).toEqual(["wall_thickness"]);
  });

  test("ignores reserved OpenSCAD keywords as editable parameters", () => {
    const parameters = extractParameterDefsFromScad(`
module = 3;
let = 4;
safe_width = 20;
`);

    expect(parameters.map((parameter) => parameter.key)).toEqual(["safe_width"]);
  });

  test("merges extracted parameters with existing schema metadata", () => {
    const extracted = extractParameterDefsFromScad(`
wall_thickness = 2.4;
`);
    const merged = mergeExtractedParameters(extracted, [
      {
        key: "wall_thickness",
        label: "Wall",
        kind: "float",
        unit: "mm",
        value: 2,
        min: 1.2,
        max: 8,
        step: 0.2,
        source: "user",
        editable: true,
        description: "Existing wall thickness control",
        group: "engineering",
      },
    ]);

    expect(merged[0]).toMatchObject({
      key: "wall_thickness",
      value: 2.4,
      min: 0,
      max: 12.4,
      source: "user",
      description: "Existing wall thickness control",
    });
  });
});
