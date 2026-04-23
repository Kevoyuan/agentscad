#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
LOG_FILE="${TMPDIR:-/tmp}/agentscad-next-dev.log"

cd "$PROJECT_DIR"

if ! command -v bun >/dev/null 2>&1; then
  echo "ERROR: bun is not installed or not in PATH"
  exit 1
fi

echo "Installing dependencies if needed..."
bun install >/dev/null

echo "Ensuring database schema is applied..."
bun run db:push >/dev/null

echo "Stopping anything already bound to :3000..."
if command -v lsof >/dev/null 2>&1; then
  lsof -ti tcp:3000 | xargs -r kill
fi
sleep 1

echo "Starting Next.js dev server..."
NODE_OPTIONS="--max-old-space-size=4096" setsid bun run dev >"$LOG_FILE" 2>&1 &
DEV_PID=$!

cleanup() {
  if kill -0 "$DEV_PID" >/dev/null 2>&1; then
    kill "$DEV_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

echo "Waiting for server to be ready..."
for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:3000 >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS http://127.0.0.1:3000 >/dev/null 2>&1; then
  echo "ERROR: Server failed to start. See log: $LOG_FILE"
  exit 1
fi

echo "Warming main page and API route..."
PAGE_HTML=$(curl -m 120 -s http://127.0.0.1:3000/ || true)
curl -m 60 -s http://127.0.0.1:3000/api/jobs?limit=1 >/dev/null 2>&1 || true

if [ -n "$PAGE_HTML" ]; then
  CHUNKS=$(echo "$PAGE_HTML" | grep -oE '/_next/static/chunks/[^"]+\.js' | sort -u || true)
  CHUNK_COUNT=$(printf "%s\n" "$CHUNKS" | sed '/^$/d' | wc -l | tr -d ' ')
  echo "Warming $CHUNK_COUNT JS chunks..."
  if [ -n "$CHUNKS" ]; then
    while IFS= read -r chunk; do
      [ -n "$chunk" ] || continue
      curl -m 60 -s -o /dev/null "http://127.0.0.1:3000$chunk" || true
    done <<EOF
$CHUNKS
EOF
  fi
fi

echo "Server is ready at http://localhost:3000"
echo "Log file: $LOG_FILE"
wait "$DEV_PID"
