#!/usr/bin/env bash
# boot-guard.sh — E1 assertion 2: **the boot fails closed**. `src/instrumentation.ts` exits non-zero on an
# invalid environment rather than leaving a live process that serves 500s from every route — a server that is
# "up" but cannot answer reads to an orchestrator as healthy enough to keep in rotation (07 §5.5 item 2, §7.1;
# 01 §3.3 / §4d step 5). `check:prod-guard` pins the one production case (`PURCHASE_PROVIDER=stub-stripe`);
# this pins the general rule and the dev-bypass case beside it.
#
# Six cases over the shared `boot_outcome` harness (`lib/boot-outcome.sh`):
#   1. valid preview env       → must LISTEN and answer /api/health 200   (the positive control: without it a
#                                broken build would make every negative case pass for the wrong reason)
#   2. missing server secret   → must EXIT NON-ZERO
#   3. malformed server value  → must EXIT NON-ZERO
#   4. dev-bypass name present → must EXIT NON-ZERO (07 §5.4 row 4 / 01 §4d step 4: the `NEXT_PUBLIC_DEV_MODE`
#                                bypass is not merely ignored outside development — the env registry marks the
#                                name dev-only, so a deployment that sets it does not boot at all)
#   5. valid production env    → must LISTEN (the positive control for `check:prod-guard`)
#   6. off-Vercel production   → must EXIT NON-ZERO (a measured contradiction, not a guard — see the case)
#   7. production WRITE road    → the production environment's position / connection / placement writes reach
#                                the driver instead of being refused by the port (`0019`, ADR-127). Case 5
#                                proves production can READ (`/api/health` probes `areas`); until `0019` the
#                                same environment could not WRITE at all, and nothing here said so.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly REPO_ROOT
# shellcheck source=lib/smoke-env.sh
source "${REPO_ROOT}/scripts/ci/lib/smoke-env.sh"
# shellcheck source=lib/boot-outcome.sh
source "${REPO_ROOT}/scripts/ci/lib/boot-outcome.sh"

readonly BASE_PORT="${BOOT_GUARD_PORT:-3991}"

if [[ ! -d "${REPO_ROOT}/.next" ]]; then
  echo "boot-guard: FAIL — .next/ not found; run 'npm run build' first" >&2
  exit 1
fi

cd "$REPO_ROOT"
trap boot_cleanup EXIT INT TERM

failures=0

expect_outcome() {
  local label="$1" expected="$2" port="$3"
  boot_outcome "$port"
  if [[ "$BOOT_OUTCOME" == "$expected" ]]; then
    echo "boot-guard: OK   — ${label}: ${BOOT_OUTCOME}"
  else
    echo "boot-guard: FAIL — ${label}: expected ${expected}, got ${BOOT_OUTCOME}" >&2
    failures=$((failures + 1))
  fi
}

# Each case runs inline (never in a subshell — a subshell could neither raise `failures` nor expose the server's
# pid to the trap), with the environment rebuilt from scratch every time: `smoke_env` re-exports every name and
# unsets every dev-only one, so the previous case's deliberate corruption cannot leak into the next.
smoke_env preview
expect_outcome "a valid preview env boots and serves /api/health" listening "$BASE_PORT"

smoke_env preview
unset CRON_SECRET
expect_outcome "a missing server secret refuses the boot" exited-nonzero "$((BASE_PORT + 1))"

smoke_env preview
export SYSTEM_PARENT_ID=not-a-uuid
expect_outcome "a malformed server value refuses the boot" exited-nonzero "$((BASE_PORT + 2))"

smoke_env preview
export NEXT_PUBLIC_DEV_MODE=true
expect_outcome "the dev bypass name refuses the boot outside development" exited-nonzero "$((BASE_PORT + 3))"

# 5 — the production positive control. Without it, `check:prod-guard` could refuse the boot for any of the prod
# column's other reasons and still look like the stub guard working.
smoke_env production
expect_outcome "a valid production env boots and serves /api/health" listening "$((BASE_PORT + 4))"

# The stub-provider case (07 §5.5 item 2 / AC-X-35) is **not** repeated here: `check:prod-guard` owns it, and
# E1 fixed that script's environment so it now proves the claim instead of exiting on four unrelated missing
# prod-column names. Case 5 above is its positive control.

# 6 — the off-Vercel production shape 07 §5.5 item 2 names ("off-Vercel NODE_ENV=production at runtime"). It
# also refuses, but on the missing VERCEL_ENV of 06 §2.5, not on any guard — 07 §5.5 / ADR-108 contemplate that
# runtime and 06 §2.5 makes it unbootable. Pinned so the day someone resolves the contradiction, this case tells
# them the shape changed.
smoke_env production
unset VERCEL_ENV
expect_outcome "an off-Vercel production runtime refuses the boot (missing VERCEL_ENV)" exited-nonzero "$((BASE_PORT + 5))"

# 7 — the write road, in the production environment (S5c). ADR-127 makes one unit of work one RPC and the port
# refuses every table write under a `{ uow }`; before `0019` no definer existed for `nanny_positions`,
# `connection_requests` or `nanny_placements`, so the production boot served reads and refused every commit —
# P1-STORES measured that and pinned it. This case is that pin, run in the environment case 5 boots: the same
# `smoke_env production` names are exported, so `config/server` resolves the production column and the boot
# suite's write-road claims are made against it. It needs no database — the claim is that the refusal is the
# driver's and not `write-outside-rpc`, which is exactly what "the port let it out" means.
smoke_env production
# **`NODE_ENV` is put back to `test` for this one case, and the reason is a measured vite defect, not a
# convenience.** The environment `config/server` resolves is `VERCEL_ENV` first (ADR-108), and `smoke_env
# production` exports `VERCEL_ENV=production` plus the whole production column — so this run resolves the
# production environment either way. What `NODE_ENV=production` additionally does is put **vite** in production
# mode, and vite's production transform mangles the specifier of
# `import(/* webpackIgnore: true */ "node:async_hooks")` in `platform/unit-of-work` down to `"node:"`
# ("No such built-in module: node:"), so `withUnitOfWork` cannot open at all and all three claims fail for a
# reason that has nothing to do with the write road. That import is BUILD-FIX's construct in `platform/**`,
# outside this unit's surface; it is recorded rather than worked around silently. `next start` in cases 1-6 is
# unaffected — webpack honours the pragma, which is why `npm run build` is green.
NODE_ENV=test
export NODE_ENV
write_log="$(mktemp "${TMPDIR:-/tmp}/boot-guard-write.XXXXXX")"
if npx vitest run --project unit src/boot/__tests__/boot.test.ts \
  -t "0019" > "$write_log" 2>&1; then
  echo "boot-guard: OK   — the production env's writes reach the driver, not the unit-of-work refusal"
else
  echo "boot-guard: FAIL — the production env still refuses its writes (ADR-127 / 0019)" >&2
  cat "$write_log" >&2
  failures=$((failures + 1))
fi
rm -f "$write_log"

if ((failures > 0)); then
  echo "boot-guard: ${failures} case(s) failed" >&2
  exit 1
fi
echo "boot-guard: all cases passed"
