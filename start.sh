#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"

cd "$PROJECT_DIR"

echo "====================================="
echo "AgentSCAD unified dev startup"
echo "====================================="

if ! command -v bun >/dev/null 2>&1; then
  echo "ERROR: bun is not installed or not in PATH"
  exit 1
fi

exec bash .zscripts/dev.sh
