#!/usr/bin/env bash
# shell-smoke.sh — the E1 shell smoke runner (`npm run test:shell-smoke`; 05 §9 stage 6).
#
# It exists so the **runner** and the **servers** read their secrets from the same file. The specs assert the
# authorised branch of every machine-facing route, which means they need the bearer the server is checking
# against; sourcing `lib/smoke-env.sh` here is what stops that value from being restated in a spec (L4) or
# drifting out of step with the server.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly REPO_ROOT
# shellcheck source=lib/smoke-env.sh
source "${REPO_ROOT}/scripts/ci/lib/smoke-env.sh"

cd "$REPO_ROOT"
smoke_env preview
exec npx playwright test --config playwright.shell-smoke.config.ts "$@"
