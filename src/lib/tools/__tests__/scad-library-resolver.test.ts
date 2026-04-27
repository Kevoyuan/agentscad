import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import {
  buildScadLibraryPrompt,
  getAvailableScadLibraries,
} from "@/lib/tools/scad-library-resolver";

const originalOpenScadLibraryPaths = process.env.OPENSCAD_LIBRARY_PATHS;
const originalOpenScadPath = process.env.OPENSCADPATH;
const originalManagedLibraryDir = process.env.CADCAD_OPENSCAD_LIBRARY_DIR;
let tempRoot: string | null = null;

afterEach(async () => {
  process.env.OPENSCAD_LIBRARY_PATHS = originalOpenScadLibraryPaths;
  process.env.OPENSCADPATH = originalOpenScadPath;
  process.env.CADCAD_OPENSCAD_LIBRARY_DIR = originalManagedLibraryDir;
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  }
});

describe("scad-library-resolver", () => {
  test("detects supported OpenSCAD libraries by concrete include files", async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "cadcad-libs-"));
    await mkdir(path.join(tempRoot, "BOSL2"), { recursive: true });
    await mkdir(path.join(tempRoot, "NopSCADlib"), { recursive: true });
    await mkdir(path.join(tempRoot, "Round-Anything"), { recursive: true });
    await mkdir(path.join(tempRoot, "MCAD"), { recursive: true });
    await mkdir(path.join(tempRoot, "threadlib"), { recursive: true });

    await writeFile(path.join(tempRoot, "BOSL2", "std.scad"), "");
    await writeFile(path.join(tempRoot, "NopSCADlib", "core.scad"), "");
    await writeFile(path.join(tempRoot, "Round-Anything", "polyround.scad"), "");
    await writeFile(path.join(tempRoot, "MCAD", "units.scad"), "");
    await writeFile(path.join(tempRoot, "threads.scad"), "");
    await writeFile(path.join(tempRoot, "threadlib", "threadlib.scad"), "");

    process.env.OPENSCAD_LIBRARY_PATHS = tempRoot;
    process.env.OPENSCADPATH = "";
    process.env.CADCAD_OPENSCAD_LIBRARY_DIR = "";

    const available = (await getAvailableScadLibraries()).filter((library) => library.available);
    expect(available.map((library) => library.name).sort()).toEqual([
      "BOSL2",
      "MCAD",
      "NopSCADlib",
      "Round-Anything",
      "threadlib",
      "threads.scad",
    ]);
    expect(available.find((library) => library.name === "Round-Anything")?.includeExample).toBe(
      "use <Round-Anything/polyround.scad>"
    );
  });

  test("injects detailed library skill guidance for available libraries", async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "cadcad-libs-"));
    await mkdir(path.join(tempRoot, "BOSL2"), { recursive: true });
    await writeFile(path.join(tempRoot, "BOSL2", "std.scad"), "");

    process.env.OPENSCAD_LIBRARY_PATHS = tempRoot;
    process.env.OPENSCADPATH = "";
    process.env.CADCAD_OPENSCAD_LIBRARY_DIR = "";

    const prompt = await buildScadLibraryPrompt();
    expect(prompt).toContain("BOSL2: include <BOSL2/std.scad> (BSD-2-Clause)");
    expect(prompt).toContain("SCAD Library BOSL2 Skill");
    expect(prompt).toContain("cuboid()");
  });
});
