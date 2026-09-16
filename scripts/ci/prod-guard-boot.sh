#!/usr/bin/env bash
# prod-guard-boot.sh — a production boot with PURCHASE_PROVIDER=stub-stripe must exit non-zero (07 §5.5;
# 05 §9 stage 7; AC-X-35). Reports check `build` (HANDOFF §9). Green from F-c.
#
# **E1 fix 1 — it used to pass for the wrong reason.** The old shape inherited the caller's environment and set
# only `NODE_ENV=production`, leaving `VERCEL_ENV` unset. `resolveEnvironment` then reads production, the prod
# column requires four names CI never sets (`VERCEL_ENV` · `NEXT_PUBLIC_META_PIXEL_ID` · `META_CAPI_ACCESS_TOKEN`
# · `META_DATASET_ID`), and `parseEnv` throws on those **before** `refineEnv` — where the stub rule lives — is
# ever reached. The boot exited non-zero, the gate reported OK, and 07 §5.5 item 2 was never exercised. The
# environment now comes from `lib/smoke-env.sh` in production mode, which is production-valid in every respect
# except the provider, so a non-zero exit can only be the guard. Its positive control — that the same
# environment *without* the stub does boot and serve — is `scripts/ci/boot-guard.sh` case 5.
#
# **E1 fix 2 —** the start-and-judge loop is no longer hand-copied here; it is `lib/boot-outcome.sh`, shared with
# `boot-guard.sh` (code-reviewer HIGH 2), which is also where the cleanup trap and the loopback bind live.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly REPO_ROOT
# shellcheck source=lib/smoke-env.sh
source "${REPO_ROOT}/scripts/ci/lib/smoke-env.sh"
# shellcheck source=lib/boot-outcome.sh
source "${REPO_ROOT}/scripts/ci/lib/boot-outcome.sh"

readonly STUB_PROVIDER="stub-stripe"
readonly GUARD_PORT="${PROD_GUARD_PORT:-3999}"

if [[ ! -d "${REPO_ROOT}/.next" ]]; then
  echo "prod-guard-boot: FAIL — .next/ not found; run 'next build' first" >&2
  exit 1
fi

cd "$REPO_ROOT"
trap boot_cleanup EXIT INT TERM

smoke_env production
export PURCHASE_PROVIDER="$STUB_PROVIDER"
# 07 §5.5 item 2 requires the secret beside the stub, so the guard must refuse the *pair* — not merely notice a
# stub provider with no secret, which would be refused for a different reason.
export STUB_EVENT_SECRET=placeholder-stub-event-secret

boot_outcome "$GUARD_PORT"

case "$BOOT_OUTCOME" in
  exited-nonzero)
    echo "prod-guard-boot: OK — production boot with ${STUB_PROVIDER} refused (non-zero exit)"
    exit 0
    ;;
  exited-zero)
    echo "prod-guard-boot: FAIL — server exited 0 with PURCHASE_PROVIDER=${STUB_PROVIDER}; the guard must exit non-zero" >&2
    ;;
  listening)
    echo "prod-guard-boot: FAIL — server is serving on :${GUARD_PORT} with PURCHASE_PROVIDER=${STUB_PROVIDER} in a production-resolved environment (must refuse to boot — 07 §5.5)" >&2
    ;;
  *)
    echo "prod-guard-boot: FAIL — indeterminate: server neither exited nor listened inside the grace period; log above" >&2
    ;;
esac
exit 1
