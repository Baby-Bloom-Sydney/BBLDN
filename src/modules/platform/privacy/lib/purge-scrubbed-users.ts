// `/api/cron/purge-scrubbed-users`'s inside — 07 §6.1 **step 6, second half** (L-009 `3g`; `3f`'s Q-2).
//
// **It is housekeeping, and the code says so.** The scrub is what protects the person: tombstoned email, no
// password, banned for ever. What this removes afterwards is a pseudonymous row that identifies nobody — so the
// job never pushes. A subject still inside any retention window is counted and left, which in practice is years
// (07 §6.2 rows 9 and 11 are both six), and that is a correct outcome rather than a backlog.
//
// **The windows come from `LEGAL.erasureRetains` and are handed across whole** (ADR-179's ruling, applied here).
// This file does not know what six years means and must not learn: it reads the list, shapes it as
// `{ class: { months, from } }`, and `0030` refuses the call outright if a class is missing — the same rule the
// `check:retention-classes` gate enforces in CI, enforced again at the only other moment it could be broken.
//
// **`retained` is the number an operator reads.** `purged` is housekeeping done; `retained` is how many people
// the database is still holding a row for, and why. It moves only as dates arrive, so a number that does not
// fall is not a stuck queue — which is the opposite of `sweepErasureRequests`' `skipped`, and worth the two
// different words.
import { CONSENT, SECURITY } from "@/modules/config";
import type { Instant, Result } from "@/modules/shared-types";
import { ok } from "../../lib/ok";
import { purgeWindows } from "./purge-windows";
import type {
  PrivacyDeps,
  PrivacyErrorDetails,
  PurgeSweepSummary,
} from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function purgeScrubbedUsers(
  now: Instant,
  deps: PrivacyDeps,
): Promise<Result<PurgeSweepSummary, PrivacyErrorDetails>> {
  const before = new Date(
    Date.parse(now) - SECURITY.retention.purgeScrubbedUserDays * DAY_MS,
  ).toISOString() as Instant;

  const candidates = await deps.store.listPurgeCandidates({
    before,
    limit: deps.sweepLimit ?? CONSENT.renewalSweepLimit,
  });
  // A read failure is the whole job's failure: a partial run reporting a clean sweep is worse than no run.
  if (!candidates.ok) return candidates;

  const windows = purgeWindows();
  let purged = 0;
  let retained = 0;

  for (const candidate of candidates.value) {
    const outcome = await deps.store.purgeSubject({
      subjectUserId: candidate.subjectUserId,
      windows,
    });
    if (!outcome.ok) {
      // A raised refusal — contention, or a foreign key the windows did not anticipate. Counted with the
      // retained because from an operator's seat both mean "still here", and logged so the second kind is
      // distinguishable when it matters. No subject id: this line is read by a person, and the row it would
      // name belongs to someone who has asked to be forgotten (01 §4b).
      retained += 1;
      deps.log?.warn("a scrubbed subject could not be purged", {
        action: "purge-scrubbed-users",
        reason: outcome.error.details?.reason ?? outcome.error.code,
      });
      continue;
    }
    if (outcome.value.outcome === "purged") {
      purged += 1;
      continue;
    }
    if (outcome.value.outcome === "already-purged") continue;
    retained += 1;
  }

  return ok(Object.freeze({ purged, retained }));
}
