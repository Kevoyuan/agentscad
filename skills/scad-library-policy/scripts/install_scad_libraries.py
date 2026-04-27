#!/usr/bin/env python3
"""Install CadCAD-managed OpenSCAD libraries with license gates."""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import shutil
import subprocess
import sys
from datetime import datetime, timezone


def skill_root() -> pathlib.Path:
    return pathlib.Path(__file__).resolve().parents[1]


def load_manifest() -> dict:
    return json.loads((skill_root() / "manifest.json").read_text(encoding="utf-8"))


def managed_dir(manifest: dict) -> pathlib.Path:
    override = os.environ.get(manifest["managed_library_dir_env"])
    raw_path = override or manifest["default_managed_library_dir"]
    return pathlib.Path(raw_path).expanduser()


def run(cmd: list[str], cwd: pathlib.Path | None = None) -> None:
    subprocess.run(cmd, cwd=str(cwd) if cwd else None, check=True)


def git_available() -> bool:
    return shutil.which("git") is not None


def select_libraries(manifest: dict, include_gpl: bool, include_opt_in: bool, only: set[str]) -> list[dict]:
    selected = []
    for library in manifest["libraries"]:
        if only and library["name"] not in only:
            continue
        if not library.get("repo") or not library.get("commit"):
            if only and library["name"] in only:
                raise ValueError(f"{library['name']} is external-only and has no reviewed managed install source")
            continue
        if library["license_gate"] == "gpl" and not include_gpl:
            continue
        if not library.get("default_install", False) and not include_opt_in and library["license_gate"] != "gpl":
            continue
        selected.append(library)
    return selected


def install_library(root: pathlib.Path, library: dict, force: bool) -> dict:
    target = root / library["target_dir"]
    if target.exists() and force:
        shutil.rmtree(target)

    if not target.exists():
        run(["git", "clone", "--depth", "1", library["repo"], str(target)])

    run(["git", "fetch", "--depth", "1", "origin", library["commit"]], cwd=target)
    run(["git", "checkout", "--detach", library["commit"]], cwd=target)

    missing = [rel_path for rel_path in library["required_files"] if not (target / rel_path).exists()]
    if missing:
        raise RuntimeError(f"{library['name']} installed but required files are missing: {', '.join(missing)}")

    license_files = [
        path.name
        for path in target.iterdir()
        if path.is_file() and path.name.lower() in {"license", "license.txt", "copying", "copying.txt"}
    ]

    return {
        "name": library["name"],
        "target_dir": str(target),
        "repo": library["repo"],
        "commit": library["commit"],
        "license": library["license"],
        "license_gate": library["license_gate"],
        "license_files": license_files,
        "include_examples": library["include_examples"],
    }


def write_install_record(root: pathlib.Path, installed: list[dict]) -> None:
    record = {
        "installed_at": datetime.now(timezone.utc).isoformat(),
        "managed_dir": str(root),
        "libraries": installed,
    }
    (root / "cadcad-installed-libraries.json").write_text(
        json.dumps(record, indent=2) + "\n",
        encoding="utf-8",
    )


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--include-gpl", action="store_true", help="Allow GPL libraries such as NopSCADlib.")
    parser.add_argument("--include-opt-in", action="store_true", help="Install non-default opt-in libraries.")
    parser.add_argument("--force", action="store_true", help="Remove and reinstall selected target directories.")
    parser.add_argument("--dry-run", action="store_true", help="Print selected libraries without cloning.")
    parser.add_argument("--only", action="append", default=[], help="Install only a named manifest library. Repeatable.")
    args = parser.parse_args(argv[1:])

    if not git_available():
        print("git is required to install OpenSCAD libraries", file=sys.stderr)
        return 2

    manifest = load_manifest()
    root = managed_dir(manifest)
    selected = select_libraries(manifest, args.include_gpl, args.include_opt_in, set(args.only))

    if not selected:
        print("No libraries selected. Use --include-gpl or --include-opt-in if needed.")
        return 0

    print(f"Managed OpenSCAD library directory: {root}")
    for library in selected:
        print(f"- {library['name']} @ {library['commit']} ({library['license']}, {library['license_gate']})")

    if args.dry_run:
        return 0

    root.mkdir(parents=True, exist_ok=True)
    installed = []
    for library in selected:
        installed.append(install_library(root, library, args.force))

    write_install_record(root, installed)
    print(f"Installed {len(installed)} librar{'y' if len(installed) == 1 else 'ies'}.")
    print("Set OPENSCADPATH or CADCAD_OPENSCAD_LIBRARY_DIR only if using a non-default directory.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
