#!/usr/bin/env bash
# prod-guard-boot.sh — a production boot with PURCHASE_PROVIDER=stub-stripe must
# exit non-zero (07 §5.5; 05 §9 stage 7; AC-X-35). Starts `next start` on a spare
# port under NODE_ENV=production and judges one of three outcomes:
#   exited non-zero  → OK   (the guard refused the boot)
#   exited zero      → FAIL (a guard must not exit cleanly)
#   still listening  → FAIL (the server booted with the stub provider)
#   neither          → FAIL (indeterminate: the server never came up — see the log)
# Reports check `build` (HANDOFF §9). Red until `purchase-paths` lands its guard (lane F-c).
set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly STUB_PROVIDER="stub-stripe"
readonly GUARD_PORT="${PROD_GUARD_PORT:-3999}"
readonly GRACE_SECONDS="${PROD_GUARD_GRACE_SECONDS:-20}"
readonly POLL_SECONDS=1
readonly SERVER_LOG="$(mktemp "${TMPDIR:-/tmp}/prod-guard-boot.XXXXXX")"

if [[ ! -d "${REPO_ROOT}/.next" ]]; then
  echo "prod-guard-boot: FAIL — .next/ not found; run 'next build' first" >&2
  exit 1
fi

cd "$REPO_ROOT"
NODE_ENV=production PURCHASE_PROVIDER="$STUB_PROVIDER" \
  npx next start --port "$GUARD_PORT" > "$SERVER_LOG" 2>&1 &
readonly SERVER_PID=$!
cleanup() { kill "$SERVER_PID" 2> /dev/null || true; rm -f "$SERVER_LOG"; }
trap cleanup EXIT

is_listening() { curl --silent --output /dev/null --max-time 2 "http://127.0.0.1:${GUARD_PORT}/"; }

elapsed=0
while (( elapsed < GRACE_SECONDS )); do
  if ! kill -0 "$SERVER_PID" 2> /dev/null; then
    if wait "$SERVER_PID"; then
      echo "prod-guard-boot: FAIL — server exited 0 with PURCHASE_PROVIDER=${STUB_PROVIDER}; the guard must exit non-zero" >&2
      exit 1
    fi
    echo "prod-guard-boot: OK — production boot with ${STUB_PROVIDER} refused (non-zero exit)"
    exit 0
  fi
  if is_listening; then
    echo "prod-guard-boot: FAIL — server is serving on :${GUARD_PORT} with PURCHASE_PROVIDER=${STUB_PROVIDER} under NODE_ENV=production (must refuse to boot — 07 §5.5)" >&2
    exit 1
  fi
  sleep "$POLL_SECONDS"; elapsed=$((elapsed + POLL_SECONDS))
done

echo "prod-guard-boot: FAIL — indeterminate: server neither exited nor listening after ${GRACE_SECONDS}s; log follows" >&2
cat "$SERVER_LOG" >&2
exit 1
