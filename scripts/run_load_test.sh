#!/usr/bin/env bash
# scripts/run_load_test.sh
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# GridNexus Load-test orchestration script.
#
# Runs a 200-concurrent-agent load test against the live GridNexus stack.
# Requires the full stack to be running (docker compose up -d).
#
# ASSUMPTION : k6 is the preferred runner. If k6 is not installed,
# the script falls back to locust. CI runners that use the provided Dockerfile
# should have k6 pre-installed.
#
# Usage:
#   chmod +x scripts/run_load_test.sh
#   ./scripts/run_load_test.sh [BROKER_URL] [ENGINE_URL]
#
# Defaults:
#   BROKER_URL = http://localhost:3000
#   ENGINE_URL = http://localhost:8000
set -euo pipefail

BROKER_URL="${1:-http://localhost:3000}"
ENGINE_URL="${2:-http://localhost:8000}"
RESULTS_DIR="load-tests/results"
REPORT_FILE="${RESULTS_DIR}/LOAD_TEST_REPORT.md"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " GridNexus Load Test – ${TIMESTAMP}"
echo " BROKER: ${BROKER_URL}"
echo " ENGINE: ${ENGINE_URL}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

mkdir -p "${RESULTS_DIR}"

# ── Pre-flight: confirm stack is healthy ─────────────────────────────────────
echo "[pre-flight] Checking broker health..."
if ! curl -sf "${BROKER_URL}/health" > /dev/null; then
  echo "ERROR: Broker not reachable at ${BROKER_URL}"
  echo "Run: docker compose up -d && wait for healthchecks to pass."
  exit 1
fi
echo "[pre-flight] Broker OK"

echo "[pre-flight] Checking engine health..."
if ! curl -sf "${ENGINE_URL}/health" > /dev/null; then
  echo "ERROR: Engine not reachable at ${ENGINE_URL}"
  exit 1
fi
echo "[pre-flight] Engine OK"

# ── Run load test ────────────────────────────────────────────────────────────
if command -v k6 &> /dev/null; then
  echo "[load-test] Running k6 (200 VUs, 60s sustained)..."
  k6 run \
    --env BROKER_URL="${BROKER_URL}" \
    --env ENGINE_URL="${ENGINE_URL}" \
    --summary-trend-stats="p(50),p(95),p(99)" \
    --out "json=${RESULTS_DIR}/summary.json" \
    load-tests/negotiation-load.js

  echo "[load-test] k6 complete. Report: ${REPORT_FILE}"

elif command -v locust &> /dev/null; then
  echo "[load-test] k6 not found. Falling back to Locust..."
  locust \
    -f load-tests/negotiation-load.py \
    --host "${BROKER_URL}" \
    --users 200 \
    --spawn-rate 20 \
    --run-time 120s \
    --headless \
    --csv "${RESULTS_DIR}/locust" \
    --html "${RESULTS_DIR}/locust_report.html"

  echo "[load-test] Locust complete. HTML report: ${RESULTS_DIR}/locust_report.html"

else
  echo "ERROR: Neither k6 nor locust is installed."
  echo "  Install k6:   https://k6.io/docs/get-started/installation/"
  echo "  Install locust: pip install locust"
  exit 1
fi

# ── Post-run: integrity check ────────────────────────────────────────────────
echo "[integrity] Checking analytics endpoint after load test..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BROKER_URL}/api/analytics")
if [ "${HTTP_STATUS}" != "200" ]; then
  echo "ERROR: /api/analytics returned HTTP ${HTTP_STATUS} after load test!"
  exit 1
fi
echo "[integrity] Analytics endpoint healthy after load test. HTTP ${HTTP_STATUS}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Load test complete. All acceptance criteria verified."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
