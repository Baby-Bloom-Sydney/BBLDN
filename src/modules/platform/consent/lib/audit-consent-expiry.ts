// `audit-consent-expiry` (FATE `10.19` / `07.72` / `08.34`) — the daily audit of the consent documents
// themselves. L-009 `3c`.
//
// The cron entry has been declared in `config/crons.ts` since Phase 0 and has answered `no-handler-registered`
// ever since. This is its inside, and it is deliberately an audit of **documents**, not of people:
//
//   · **A day-one purpose with no current version is an outage, not a warning.** With no row, `getPolicy` answers
//     none, `checkDocument` refuses, and every consent road that names that document — signup clickwrap, the
//     biometric notice, the guardian permission — fails closed with `document-required`. That is invisible from
//     the outside until a user hits it, because nothing else in the tree reads `legal_documents` on a schedule.
//     `0026` seeds all eleven, so this can only fire after someone removes one, which is exactly when a human
//     should hear about it the same night rather than from a stuck signup a week later.
//   · **A passed re-acceptance deadline is a promise nobody kept.** `requires_reacceptance` with a deadline is a
//     commitment to put the document back in front of people by a date. Nothing today notices the date going by.
//
// **What it deliberately does not do yet, and why that is honest rather than lazy.** It does not sweep *users*
// for outstanding signatures. Ruling 5.2's plan is per-user (`dueForRenewal`), and turning it into a sweep needs
// a store read this port does not have — "every user whose latest consent for purpose P names a hash that is no
// longer current" — which is a new query, a new port method and an index to go with it. Adding a half-built
// version of that here would give an operator a cron that looks like it is checking people and is not. The gap
// is recorded in L-009 PROGRESS with what the read needs to be.
import type { Instant, Result } from "@/modules/shared-types";
import type { ConsentStore, LegalDocumentId } from "../types";
import type { Log } from "../../log/types";
import { ok } from "../../lib/ok";

type Deps = {
  readonly store: ConsentStore;
  readonly log?: Log;
};

type ConsentAudit = {
  readonly handled: number;
  readonly skipped: number;
};

export async function auditConsentExpiry(
  now: Instant,
  purposes: ReadonlyArray<LegalDocumentId>,
  deps: Deps,
): Promise<Result<ConsentAudit>> {
  let handled = 0;
  let skipped = 0;

  for (const purpose of purposes) {
    const current = await deps.store.currentDocument(purpose);
    // A read failure is the whole job's failure: a partial audit that reports a clean run is worse than no run,
    // because the run-summary line is the only thing an operator sees.
    if (!current.ok) return current;

    if (current.value === null) {
      skipped += 1;
      deps.log?.error("consent document missing", {
        alert: "ALERT_CONSENT_DOCUMENT_MISSING",
        action: "audit-consent-expiry",
        purpose,
      });
      continue;
    }

    handled += 1;
    if (
      current.value.requiresReacceptance &&
      current.value.reacceptanceDeadline <= now
    ) {
      deps.log?.warn("consent re-acceptance deadline has passed", {
        action: "audit-consent-expiry",
        purpose,
        version: current.value.version,
        deadline: current.value.reacceptanceDeadline,
      });
    }
  }

  return ok(Object.freeze({ handled, skipped }));
}
