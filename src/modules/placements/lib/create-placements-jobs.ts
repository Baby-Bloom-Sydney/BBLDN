// `placement-start-sweep` (01 §4f, 00:15 London) — the one scheduled job this module owns, and the only file in
// the group that does I/O. It reads the placements at `CONFIRMED`, keeps the ones whose `start_date` has
// arrived in London, and hands each to `advance` as **L-1b**.
//
//   1. **It moves nothing itself.** L-1b already exists, already cascades into K-21 on the connection and into
//      `payments.openDfyAccess` (ADR-093), already starts the 30-day satisfaction window and already sets
//      `paymentDueAt` (ADR-094). A cron that wrote `nanny_placements` directly would be a second writer of a
//      table 03 §2.1 gives one, and would silently skip every one of those consequences.
//   2. **A row that fails does not stop the sweep** — each is counted `handled` or `skipped` and the run summary
//      is the truth (01 §4f). A failure on the read does fail the run: there is nothing to do.
//   3. **A second fire is a no-op**, twice over: the cohort is read at `CONFIRMED`, the state L-1b moves a row
//      out of, and L-1b is `idempotency: 'noop'` besides.
//   4. **`start_date <= today` is a London comparison of two dates**, so "today" is read once per run through
//      `platform.londonWallClock`. At 00:15 London in BST the UTC date is still yesterday — the one hour of the
//      day when the two disagree is exactly the hour this job runs, which is why it cannot use the UTC date.
import { londonWallClock, ok } from "@/modules/platform";
import type {
  Actor,
  Instant,
  ISODate,
  PlacementId,
  Result,
} from "@/modules/shared-types";
import type {
  PlacementAdvanceFn,
  PlacementJobRun,
  PlacementRecord,
  PlacementsErrorDetails,
  PlacementsJobs,
  PlacementsResult,
  PlacementStore,
} from "../types";

export type PlacementsJobsDeps = {
  readonly store: PlacementStore;
  readonly advance: PlacementAdvanceFn;
};

const SWEEP: Actor = { kind: "system", id: "placement-start-sweep" };

const asPlacements = <T>(result: Result<T>): PlacementsResult<T> =>
  result as Result<T, PlacementsErrorDetails>;

/** Her first day has arrived when it is not in the future: a placement starting today starts today. */
const started = (row: PlacementRecord, londonToday: ISODate): boolean =>
  (row.startDate as string) <= (londonToday as string);

export function createPlacementsJobs(deps: PlacementsJobsDeps): PlacementsJobs {
  return Object.freeze({
    runStartSweep: async (
      now: Instant,
    ): Promise<PlacementsResult<PlacementJobRun>> => {
      const rows = await deps.store.forState("CONFIRMED");
      if (!rows.ok) return asPlacements(rows);
      const today = londonWallClock(now).date as ISODate;
      const due = rows.value.filter((row) => started(row, today));

      let handled = 0;
      for (const row of due) {
        const moved = await deps.advance({
          entity: { kind: "placement", id: row.placementId as PlacementId },
          transition: "L-1b",
          actor: SWEEP,
          payload: {},
          expectedFrom: "CONFIRMED",
          // the row and the London day: a retry inside the same day must not write `placement.started` twice
          idempotencyKey: `placement-start-sweep:${row.placementId as string}:${today as string}`,
          at: now,
        });
        if (moved.ok) handled += 1;
      }
      return ok(Object.freeze({ handled, skipped: due.length - handled }));
    },
  });
}
