// The three connection sweeps of 01 §4f, and the only file in the group that does I/O. It reads the stages the
// job sweeps, asks `connection-sweep-targets.ts` which rows are due, and hands each one to `advance` as the K
// row that already exists. Four things are deliberate:
//
//   1. **It moves nothing itself.** Every row goes through the stage model, so the sweep inherits K-8 / K-12 /
//      K-16's preconditions, events, cascades and messages rather than carrying a second copy of them. A cron
//      that wrote `connection_requests` directly would be a second writer of a table 03 §2.1 gives one.
//   2. **A row that fails does not stop the sweep.** A cron that aborts on the first bad row leaves the rest of
//      the cohort unswept and tells no one which; each row is counted `handled` or `skipped` and the run
//      summary is the truth (01 §4f). A failure on the **read** does fail the run — there is nothing to do.
//   3. **A second fire is a no-op**, twice over: the selection reads the stage the row is moving out of, so the
//      row is gone from the next run's cohort; and all three K rows are `idempotency: 'noop'`, so a row that
//      somehow arrives again is answered without a write. Neither depends on the other.
//   4. **No timezone code.** `4b`'s due-gate has already discarded the wrong candidate UTC fire, so `now` is
//      the declared London instant. The one London-shaped fact a sweep needs — today's date, for the trial —
//      is read here, once per run, through `platform`.
import { londonWallClock, ok } from "@/modules/platform";
import type {
  Actor,
  ConnectionId,
  ConnectionStage,
  Instant,
  ISODate,
  Result,
} from "@/modules/shared-types";
import type {
  AdvanceFn,
  ConnectionJobName,
  ConnectionJobRun,
  ConnectionRecord,
  ConnectionsErrorDetails,
  ConnectionsJobs,
  ConnectionsResult,
  ConnectionStore,
} from "../types";
import { connectionSweepTargets } from "./connection-sweep-targets";
import { SWEPT_STAGES } from "./swept-stages";

export type ConnectionsJobsDeps = {
  readonly store: ConnectionStore;
  readonly advance: AdvanceFn;
};

const asConnections = <T>(result: Result<T>): ConnectionsResult<T> =>
  result as Result<T, ConnectionsErrorDetails>;

/** The cron is the actor, and it is the job's own name, so the event log says which sweep moved the row. */
const actorFor = (job: ConnectionJobName): Actor => ({
  kind: "system",
  id: job,
});

/** Every row at the stages this job sweeps, one keyed read per stage (03 §1.4 offers one predicate). */
async function cohort(
  store: ConnectionStore,
  job: ConnectionJobName,
): Promise<ConnectionsResult<ReadonlyArray<ConnectionRecord>>> {
  const gathered: Array<ConnectionRecord> = [];
  for (const stage of SWEPT_STAGES[job]) {
    const rows = await store.forStage(stage as ConnectionStage);
    if (!rows.ok) return asConnections(rows);
    gathered.push(...rows.value);
  }
  return ok(Object.freeze(gathered));
}

/**
 * The key is the row and the London day, not the instant: `expire-connections` fires every fifteen minutes, and
 * a retry that lands in the next fire must be the same idempotency key as the first so the event is not written
 * twice for one expiry.
 */
const keyFor = (
  job: ConnectionJobName,
  row: ConnectionRecord,
  today: ISODate,
): string => `${job}:${row.connectionId as string}:${today as string}`;

export function createConnectionsJobs(
  deps: ConnectionsJobsDeps,
): ConnectionsJobs {
  return Object.freeze({
    run: async (
      job: ConnectionJobName,
      now: Instant,
    ): Promise<ConnectionsResult<ConnectionJobRun>> => {
      const rows = await cohort(deps.store, job);
      if (!rows.ok) return rows;
      const today = londonWallClock(now).date as ISODate;
      const targets = connectionSweepTargets(job, rows.value, now, today);

      let handled = 0;
      for (const target of targets) {
        const moved = await deps.advance({
          entity: {
            kind: "connection",
            id: target.row.connectionId as ConnectionId,
          },
          transition: target.transition,
          actor: actorFor(job),
          payload: {},
          expectedFrom: target.row.stage,
          idempotencyKey: keyFor(job, target.row, today),
          at: now,
        });
        if (moved.ok) handled += 1;
      }
      return ok(Object.freeze({ handled, skipped: targets.length - handled }));
    },
  });
}
