#!/usr/bin/env sh
set -eu
BASE_URL="${BASE_URL:-http://localhost:8080}"
curl -fsS "$BASE_URL/health" >/dev/null
curl -fsS -X POST "$BASE_URL/logs" -H 'content-type: application/json' --data '{"logs":[{"timestamp":"2026-07-20T14:32:01.123Z","level":"error","service":"checkout","message":"payment declined","attributes":{"user_id":"42","retries":3}}]}' >/dev/null
curl -fsS "$BASE_URL/logs?service=checkout&attr.user_id=42" >/dev/null
curl -fsS "$BASE_URL/logs/aggregate?since=2026-07-20T00:00:00Z&until=2026-07-21T00:00:00Z&bucket=1h&group_by=service" >/dev/null
echo 'smoke test passed'
