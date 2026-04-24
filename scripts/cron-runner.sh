#!/bin/bash
# ---------------------------------------------------------------------------
# cron-runner.sh — Invoke the AgentSCAD cron API
#
# Usage:
#   ./scripts/cron-runner.sh [action]
#
# Actions:
#   retry   — Auto-retry failed jobs (default, run every 15 min)
#   analyze — Analyze user edits for patterns (run nightly at 2am)
#   warm    — Pre-warm the similar jobs index (run hourly)
#   all     — Run all three in sequence
#
# Environment:
#   CRON_SECRET  — Optional auth token (must match server-side CRON_SECRET)
#   CRON_URL     — Base URL (default: http://localhost:3000)
#
# Examples (crontab):
#   */15 * * * *  /path/to/scripts/cron-runner.sh retry
#   0  2 * * *    /path/to/scripts/cron-runner.sh analyze
#   0  * * * *    /path/to/scripts/cron-runner.sh warm
# ---------------------------------------------------------------------------

set -euo pipefail

ACTION="${1:-retry}"
BASE_URL="${CRON_URL:-http://localhost:3000}"
ENDPOINT="${BASE_URL}/api/cron"

# Map friendly names to API action values
case "$ACTION" in
  retry)   API_ACTION="retry-failed" ;;
  analyze) API_ACTION="analyze-edits" ;;
  warm)    API_ACTION="warm-index" ;;
  all)     API_ACTION="all" ;;
  *)       echo "Unknown action: $ACTION"; echo "Usage: $0 [retry|analyze|warm|all]"; exit 1 ;;
esac

# Build headers
HEADERS=(-H "Content-Type: application/json")
if [ -n "${CRON_SECRET:-}" ]; then
  HEADERS+=(-H "Authorization: Bearer ${CRON_SECRET}")
fi

# Execute
HTTP_CODE=$(curl -s -o /tmp/cron-response.json -w "%{http_code}" \
  -X POST "$ENDPOINT" \
  "${HEADERS[@]}" \
  -d "{\"action\": \"${API_ACTION}\"}" \
  --max-time 30)

BODY=$(cat /tmp/cron-response.json 2>/dev/null || echo "{}")

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "[cron] ${ACTION} completed (HTTP ${HTTP_CODE}): ${BODY}"
else
  echo "[cron] ${ACTION} FAILED (HTTP ${HTTP_CODE}): ${BODY}" >&2
  exit 1
fi
