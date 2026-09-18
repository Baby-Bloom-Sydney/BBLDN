// `/api/cron/retention-sweep`'s inside — 07 §6.2's daily pass (L-009 `3h`; `3g`'s Q-1).
//
// **The unit of work is a class, not a person**, which is the one thing that makes this job different in shape
// from its two siblings. An erasure is one subject asked for by that subject; a purge is one subject the clock
// released. A sweep is every subject at once, one class at a time — so it commits per class, and a class that
// fails takes only itself down. A single transaction across seventeen classes would hold locks on `events` while
// it worked through `admin_notifications`, which is not a sweep but an outage.
//
// **ADR-182's two refusals, per class.** A class the config defers is a *recorded* refusal: it is not dispatched
// at all, it is counted as skipped, and nothing about retrying changes it until BAI confirms a ★ window. A class
// that raises — contention, or a foreign key the schedule did not anticipate — is the *raised* kind: its batch
// rolled back, it is counted as failed, the run carries on, and tomorrow retries it. Conflating them would
// either make a deferred class look like a nightly failure or a real failure look like a policy.
//
// **Nothing here knows a date.** Every window and anchor comes from `retentionSpecs()`, which is
// `config/retention.ts` handed across (ADR-179), and `0031` refuses a spec with no window — the same rule the
// `check:retention-classes` gate enforces in CI, enforced again at the only other moment it could be broken.
import { RETENTION } from "@/modules/config";
import type { Instant, Result } from "@/modules/shared-types";
import { ok } from "../../lib/ok";
import { retentionSpecs } from "./retention-schedule";
import type {
  PrivacyDeps,
  PrivacyErrorDetails,
  RetentionSweepSummary,
} from "../types";

export async function sweepRetention(
  _now: Instant,
  deps: PrivacyDeps,
): Promise<Result<RetentionSweepSummary, PrivacyErrorDetails>> {
  const specs = retentionSpecs();
  const capped: string[] = [];
  let handled = 0;
  let failed = 0;

  for (const entry of specs) {
    const run = await deps.store.sweepRetentionClass({
      class: entry.class,
      spec: entry.spec,
      limit: RETENTION.batchLimit,
    });
    if (!run.ok) {
      failed += 1;
      // No row ids and no subject: this line is read by a person, and a retention sweep's rows belong to people
      // who are not asking to be discussed (01 §4b). The class and the reason are what an operator can act on.
      deps.log?.warn("a retention class could not be swept", {
        action: "retention-sweep",
        class: entry.class,
        reason: run.error.details?.reason ?? run.error.code,
      });
      continue;
    }
    handled += run.value.removed + run.value.nulled;
    if (run.value.capped) capped.push(run.value.class);
  }

  // `skipped` is every class the schedule carries and this run did not act on — the ★ windows waiting on BAI and
  // the two rows no job can ever act on (the evidence log, the backups). It is a correct standing number rather
  // than a backlog, which is why the cron line names it separately.
  return ok(
    Object.freeze({
      handled,
      skipped: RETENTION.schedule.length - specs.length,
      failed,
      capped: Object.freeze([...capped]),
    }),
  );
}
