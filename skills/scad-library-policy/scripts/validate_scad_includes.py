#!/usr/bin/env python3
"""Validate generated SCAD include/use statements against approved local libraries."""

from __future__ import annotations

import json
import pathlib
import re
import subprocess
import sys


INCLUDE_RE = re.compile(r"^\s*(?:include|use)\s*<([^>]+)>", re.MULTILINE)


def skill_root() -> pathlib.Path:
    return pathlib.Path(__file__).resolve().parents[1]


def load_manifest() -> dict:
    return json.loads((skill_root() / "manifest.json").read_text(encoding="utf-8"))


def include_path_from_example(example: str) -> str | None:
    match = re.search(r"<([^>]+)>", example)
    return match.group(1) if match else None


def approved_include_paths() -> set[str]:
    manifest = load_manifest()
    paths = set()
    for library in manifest["libraries"]:
        for example in library["include_examples"]:
            include_path = include_path_from_example(example)
            if include_path:
                paths.add(include_path)
    return paths


def available_include_paths() -> set[str]:
    script = pathlib.Path(__file__).with_name("check_scad_libraries.py")
    output = subprocess.check_output([sys.executable, str(script)], text=True)
    data = json.loads(output)
    available = set()
    for library in data["libraries"]:
        if library["available"]:
            for example in library["include_examples"]:
                include_path = include_path_from_example(example)
                if include_path:
                    available.add(include_path)
    return available


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: validate_scad_includes.py <file.scad>", file=sys.stderr)
        return 2

    scad_path = pathlib.Path(argv[1])
    source = scad_path.read_text(encoding="utf-8")
    includes = INCLUDE_RE.findall(source)
    approved = approved_include_paths()
    available = available_include_paths()
    errors = []

    for include_path in includes:
        if include_path not in approved:
            errors.append(f"Unapproved OpenSCAD include/use path: {include_path}")
        elif include_path not in available:
            errors.append(f"OpenSCAD library path is approved but not available locally: {include_path}")

    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1

    print(f"Validated {len(includes)} include/use statement(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
