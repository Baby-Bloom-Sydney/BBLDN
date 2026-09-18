// `/api/cron/delete-account`'s inside (01 §4f: "processes deletion requests"). It is a **re-attempt**, not the
// product path: both roads run the erasure synchronously, so a request is normally closed before this cron ever
// sees it. What lands here is what the transaction refused to commit — `0027`'s `nowait` probe losing to a DBS
// decision being recorded at that moment, or a guard firing — and those are exactly the cases where trying again
// later is the right answer.
//
// `handled` counts requests this run closed; `skipped` counts the ones that are still open afterwards, which is
// the number an operator needs: a request that is skipped on every run for a week is a person whose Art 17
// request is not being served, and the run-summary line is where that becomes visible.
import { ok } from "../../lib/ok";
import type { Instant, Result } from "@/modules/shared-types";
import type { PrivacyDeps, PrivacyErrorDetails } from "../types";
import { runErasure } from "./run-erasure";

const DEFAULT_LIMIT = 50;

export async function sweepErasureRequests(
  _now: Instant,
  deps: PrivacyDeps,
): Promise<
  Result<
    { readonly handled: number; readonly skipped: number },
    PrivacyErrorDetails
  >
> {
  const open = await deps.store.listOpenRequests(
    deps.sweepLimit ?? DEFAULT_LIMIT,
  );
  // A read failure is the whole job's failure: a partial sweep reporting a clean run is worse than no run,
  // because the run-summary line is the only thing an operator sees (`audit-consent-expiry`'s rule).
  if (!open.ok) return open;

  let handled = 0;
  let skipped = 0;
  for (const request of open.value) {
    const erased = await runErasure(
      { subjectUserId: request.subjectUserId, requestId: request.requestId },
      deps,
    );
    if (!erased.ok) {
      skipped += 1;
      deps.log?.warn("erasure request could not be completed", {
        action: "delete-account",
        road: request.road,
        reason: erased.error.details?.reason ?? erased.error.code,
      });
      continue;
    }
    if (erased.value.outcome === "refused") {
      skipped += 1;
      continue;
    }
    handled += 1;
  }
  return ok(Object.freeze({ handled, skipped }));
}
