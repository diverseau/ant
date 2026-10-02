#!/usr/bin/env bash
# Real end-to-end checks against a throwaway antd using the real `claude` CLI (Haiku).
# Spends a little subscription usage. Usage: server/e2e/run.sh [chat|browser|all]
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
export ANT_HOME=$tmp/Ants ANT_DATA_DIR=$tmp/data ANT_SOCKET=$tmp/antd.sock ANT_PORT=${ANT_E2E_PORT:-7421} ANT_MODEL=haiku
node src/main.ts > "$tmp/antd.log" 2>&1 &
pid=$!
trap 'kill $pid 2>/dev/null; rm -rf "$tmp"' EXIT
for _ in $(seq 50); do curl -sf "http://127.0.0.1:$ANT_PORT/api/health" >/dev/null && break; sleep 0.2; done
status=0
for s in ${1:-all}; do
  case $s in
    all) node e2e/chat.mjs && node e2e/browser.mjs || status=1 ;;
    *) node "e2e/$s.mjs" || status=1 ;;
  esac
done
[[ $status -eq 0 ]] || { echo "--- antd log"; tail -30 "$tmp/antd.log"; }
exit $status
