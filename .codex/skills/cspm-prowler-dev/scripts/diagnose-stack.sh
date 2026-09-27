#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$ROOT_DIR"

echo "[diag] repo=$ROOT_DIR"

echo
echo "[diag] dev stack status"
npm run dev:status || true

echo
echo "[diag] health"
npm run health || true

echo
echo "[diag] endpoint probes"
for url in \
  "http://127.0.0.1:3000/" \
  "http://127.0.0.1:3000/login" \
  "http://127.0.0.1:3000/integrations" \
  "http://127.0.0.1:4000/health" \
  "http://127.0.0.1:4010/health" \
  "http://127.0.0.1:4011/health"
do
  code="$(curl -s -o /dev/null -w '%{http_code}' "$url" || true)"
  printf '  %s -> %s\n' "$url" "${code:-ERR}"
done

echo
echo "[diag] web log error scan"
if [[ -f ".runtime/logs/web.log" ]]; then
  tail -n 400 .runtime/logs/web.log > /tmp/cspm-web-log-recent.txt || true
  if rg -n "Cannot find module '\\./[0-9]+\\.js'|React Client Manifest|__webpack_modules__\\[moduleId\\] is not a function" /tmp/cspm-web-log-recent.txt >/tmp/cspm-web-log-hits.txt; then
    cat /tmp/cspm-web-log-hits.txt
    echo
    echo "[diag] detected Next.js dev chunk/cache corruption symptoms"
    echo "[diag] suggested fix:"
    echo "  npm run clean:web && npm run dev:down && npm run dev:up"
  else
    echo "  no common Next.js chunk corruption signatures found"
  fi
else
  echo "  web log not found"
fi

echo
echo "[diag] api/worker tail"
for f in .runtime/logs/api.log .runtime/logs/worker.log; do
  if [[ -f "$f" ]]; then
    echo "==> $f <=="
    tail -n 20 "$f" || true
    echo
  fi
done
