// `close-no-candidates` (01 §4f, 04:15 London) — the one scheduled job this module owns, and the only file in
// the group that does I/O.
//
// 01 §4f states the rule in one sentence: "P-7 → `CLOSED (no_candidates)` **after the pre-check window ends
// with no keen nanny**; sends `no-candidates-left`". Three readings of it are load-bearing, and each is a way
// the job could quietly close a family's position when it should not:
//
//   1. **"after the pre-check window ends"** — the anchor is `precheck.expiresAt`, the lever `autofire` wrote
//      (`MATCHING.precheck.expiryDays`). A position with **no lever at all** is not in the cohort: nobody has
//      gone and looked for her yet, and closing it would tell a family we found nobody when we never asked.
//      That position belongs to `dfy-waves`, which fires the pre-check she is still waiting for.
//   2. **"with no keen nanny"** — a keen nanny is a **live connection**, which is the only form the data has
//      one in. The count comes from `connections.liveCountForPosition`, which is the read I-2 is already held
//      against, so "keen" means exactly what it means everywhere else in the stage model.
//   3. **not `ACTIVE`** — P-7's own `from` is `DRAFT | OPEN | CONNECTING`, and the sweep reads `OPEN` and
//      `CONNECTING` only. A `DRAFT` has not been published, so no pre-check has fired on it and rule 1 excludes
//      it anyway; reading it would be a third round trip for a cohort that is always empty.
//
// It moves nothing itself: every row goes through `advance`, so the sweep inherits P-7's own cascade — K-24 on
// every live connection, the open call to C-4, and the `no-candidates-left` message — rather than carrying a
// second copy of any of it.
//
// Idempotent by construction: the cohort is read at the stages P-7 moves a row out of, so a closed position is
// gone from the next run, and P-7 is `idempotency: 'noop'` besides.
import { connections } from "@/modules/connections";
import { ok } from "@/modules/platform";
import type {
  Actor,
  Instant,
  PositionId,
  PositionStage,
  Result,
} from "@/modules/shared-types";
import type {
  PositionJobRun,
  PositionRecord,
  PositionsJobs,
  PositionStore,
} from "../types";
import { advance } from "./advance";

export type PositionsJobsDeps = {
  readonly store: PositionStore;
};

const SWEEP: Actor = { kind: "system", id: "close-no-candidates" };

/** P-7's `from`, minus `DRAFT`: a draft has never been published, so no pre-check has ever fired on it. */
const SWEPT: ReadonlyArray<PositionStage> = Object.freeze([
  "OPEN",
  "CONNECTING",
]);

/** The pre-check window has ended. A position with no lever has no window and is never in the cohort. */
const windowEnded = (record: PositionRecord, now: Instant): boolean =>
  record.precheck !== null &&
  Date.parse(record.precheck.expiresAt as string) < Date.parse(now as string);

export function createPositionsJobs(deps: PositionsJobsDeps): PositionsJobs {
  return Object.freeze({
    runCloseNoCandidates: async (
      now: Instant,
    ): Promise<Result<PositionJobRun>> => {
      const gathered: Array<PositionRecord> = [];
      for (const stage of SWEPT) {
        const rows = await deps.store.forStage(stage);
        if (!rows.ok) return rows;
        gathered.push(...rows.value.filter((row) => windowEnded(row, now)));
      }

      let handled = 0;
      let skipped = 0;
      for (const record of gathered) {
        // A read that fails is a position we cannot judge, so it is **skipped**, never closed: failing open
        // here would close a family's position on a database hiccup.
        const live = await connections.liveCountForPosition(record.positionId);
        if (!live.ok) {
          skipped += 1;
          continue;
        }
        if (live.value > 0) continue;

        const closed = await advance({
          entity: { kind: "position", id: record.positionId as PositionId },
          transition: "P-7",
          actor: SWEEP,
          payload: { closeReason: "no_candidates" },
          expectedFrom: record.stage,
          idempotencyKey: `close-no-candidates:${record.positionId as string}`,
          at: now,
        });
        if (closed.ok) handled += 1;
        else skipped += 1;
      }
      return ok(Object.freeze({ handled, skipped }));
    },
  });
}
