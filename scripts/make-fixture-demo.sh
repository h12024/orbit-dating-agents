#!/usr/bin/env bash
# Regenerates public/fixture-demo.json: 25 FICTIONAL personas, synthetic output (LLM_MODE=fixture). Reproducible, offline.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT=3199
LLM_MODE=fixture RATE_LIMIT_SCALE=100 npx next dev -p $PORT >/tmp/fixture-dev.log 2>&1 &
PID=$!; trap 'kill $PID 2>/dev/null' EXIT
for i in $(seq 1 30); do curl -s localhost:$PORT/api/health >/dev/null 2>&1 && break; sleep 1; done
node scripts/run-cohort.mjs scripts/fixture-cohort.json public/fixture-demo.json http://localhost:$PORT
