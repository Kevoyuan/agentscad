#!/usr/bin/env python3
"""Report approved OpenSCAD libraries available in local search paths."""

from __future__ import annotations

import json
import os
import pathlib
import sys


def skill_root() -> pathlib.Path:
    return pathlib.Path(__file__).resolve().parents[1]


def load_manifest() -> dict:
    return json.loads((skill_root() / "manifest.json").read_text(encoding="utf-8"))


def split_paths(value: str | None) -> list[pathlib.Path]:
    if not value:
        return []
    items: list[pathlib.Path] = []
    for chunk in value.replace(",", os.pathsep).split(os.pathsep):
        chunk = chunk.strip()
        if chunk:
            items.append(pathlib.Path(chunk).expanduser())
    return items


def search_paths(manifest: dict) -> list[pathlib.Path]:
    home = pathlib.Path.home()
    managed_override = os.environ.get(manifest["managed_library_dir_env"])
    candidates = [
        pathlib.Path(managed_override).expanduser() if managed_override else None,
        pathlib.Path(manifest["default_managed_library_dir"]).expanduser(),
        *split_paths(os.environ.get("OPENSCAD_LIBRARY_PATHS")),
        *split_paths(os.environ.get("OPENSCADPATH")),
        home / "Documents" / "OpenSCAD" / "libraries",
        pathlib.Path("/Applications/OpenSCAD-2021.01.app/Contents/Resources/libraries"),
        pathlib.Path("/Applications/OpenSCAD.app/Contents/Resources/libraries"),
    ]
    seen: set[str] = set()
    existing: list[pathlib.Path] = []
    for candidate in [candidate for candidate in candidates if candidate is not None]:
        resolved = str(candidate.resolve())
        if resolved in seen:
            continue
        seen.add(resolved)
        if candidate.exists():
            existing.append(candidate)
    return existing


def main() -> int:
    manifest = load_manifest()
    paths = search_paths(manifest)
    results = []
    for library in manifest["libraries"]:
        matches = []
        for root in paths:
            for rel_file in library.get("detection_files", []):
                candidate = root / rel_file
                if candidate.exists():
                    matches.append(str(candidate))
        results.append(
            {
                "name": library["name"],
                "available": bool(matches),
                "license": library["license"],
                "license_gate": library["license_gate"],
                "default_install": library["default_install"],
                "include_examples": library["include_examples"],
                "matches": matches,
            }
        )

    payload = {"search_paths": [str(path) for path in paths], "libraries": results}
    json.dump(payload, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
