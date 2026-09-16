#!/usr/bin/env bash
# shell-smoke-server.sh — start the built app for the E1 shell smoke (05 §9 stage 6).
#
# Usage: shell-smoke-server.sh <preview|production> <port>
#
# It is `next start` over an existing `.next/` — deliberately the production server rather than `next dev`,
# because the thing E1 asserts is the **assembled** application: the middleware bundle, the route manifest and
# the instrumentation hook as they would be served. A missing build is a loud failure, never a silent `next dev`
# fallback. The environment comes from `lib/smoke-env.sh` (placeholders only — 07 §7).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly REPO_ROOT
# shellcheck source=lib/smoke-env.sh
source "${REPO_ROOT}/scripts/ci/lib/smoke-env.sh"

readonly MODE="${1:?usage: shell-smoke-server.sh <preview|production> <port>}"
readonly PORT="${2:?usage: shell-smoke-server.sh <preview|production> <port>}"

if [[ ! -d "${REPO_ROOT}/.next" ]]; then
  echo "shell-smoke-server: FAIL — .next/ not found; run 'npm run build' first" >&2
  exit 1
fi

cd "$REPO_ROOT"
smoke_env "$MODE"
# Loopback only (security-reviewer LOW 2): a test server is never for anyone but this machine.
exec npx next start --hostname 127.0.0.1 --port "$PORT"
