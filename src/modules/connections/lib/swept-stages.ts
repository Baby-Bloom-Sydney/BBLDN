// Which stages each of the three sweeps reads, in its own file because L1 gives a file one export (05 §7 rule 4)
// — and it earns the separation anyway: this is the list `create-connections-jobs.ts` asks the store for and
// the list `connection-sweep-targets.ts` filters, so the two halves cannot drift apart by editing one of them.
//
// Each entry is the stage the job's K row moves a row **out of**. That is not a detail: it is what makes every
// sweep idempotent without a "swept at" column, because a row that has moved is no longer in the next run's
// cohort at all.
import type { ConnectionStage } from "@/modules/shared-types";
import type { ConnectionJobName } from "../types";

/** The stages each job reads. The store is asked once per stage (03 §1.4 offers one equality predicate). */
export const SWEPT_STAGES: Readonly<
  Record<ConnectionJobName, ReadonlyArray<ConnectionStage>>
> = Object.freeze({
  "expire-connections": Object.freeze([
    "REQUEST_SENT",
    "NANNY_APPLIED",
  ] as ReadonlyArray<ConnectionStage>),
  "meeting-complete-sweep": Object.freeze([
    "INTRO_SCHEDULED",
  ] as ReadonlyArray<ConnectionStage>),
  "trial-complete-sweep": Object.freeze([
    "TRIAL_ARRANGED",
  ] as ReadonlyArray<ConnectionStage>),
});
