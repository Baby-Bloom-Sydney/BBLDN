// The three connection sweeps of 01 §4f as one **pure** rule: (the job, the rows at the stage it sweeps, now,
// today in London) → the rows this run acts on and the K row each one moves by. No store, no clock, no
// `advance` — so the boundary each sweep turns on is a table of unit tests rather than an integration guess,
// and `create-connections-jobs.ts` is the only file in the group that does I/O.
//
//   expire-connections      `REQUEST_SENT` / `NANNY_APPLIED` past the request window  → K-8  `REQUEST_EXPIRED`
//   meeting-complete-sweep  `INTRO_SCHEDULED` whose `meeting_at` has passed           → K-12 `INTRO_COMPLETE`
//   trial-complete-sweep    `TRIAL_ARRANGED` whose trial date is before today         → K-16 `TRIAL_COMPLETE`
//
// **Re-running is idempotent by construction**: every job selects on the stage its row moves a row *out of*, so
// a second fire in the same minute finds nothing. That is the same property `payments`' `sweep-targets.ts`
// relies on, and it is why none of these needs a "swept at" column or any memory of the last run.
//
// **K-10 is absent on purpose** (`ACCEPTED → SCHEDULE_EXPIRED` after `CONNECTIONS.scheduleWindowDays`). Its
// window runs from the acceptance and no column on the record says when that was: `0007` has `expires_at`, but
// no K row writes it and `StepPayload` has no field for it, so the only anchor available here is `createdAt` —
// the *request* time. Sweeping K-10 off that would expire an accepted, live connection early by however long
// the request sat unanswered, in front of a family who did nothing wrong. See the pin in
// `__tests__/connection-sweeps.test.ts`; the anchor is K-4 / K-5's to write.
//
// **No timezone arithmetic lives here.** `4b`'s due-gate delivers each sweep at its declared London instant and
// hands `now`; the one London-shaped comparison — the trial date, which is a date and not an instant — takes
// today's London date as an argument rather than deriving it.
import { CONNECTIONS } from "@/modules/config";
import type { Instant, ISODate } from "@/modules/shared-types";
import type { ConnectionJobName, ConnectionRecord } from "../types";

/** One row this run acts on, with the K row that moves it. */
export type ConnectionSweepTarget = {
  readonly row: ConnectionRecord;
  readonly transition: "K-8" | "K-12" | "K-16";
};

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * When a request stops being open. `expires_at` wins where a row carries one — nothing writes it today, but a
 * row that names its own deadline must be believed over a derived one — otherwise the window 03 §2.4 K-8 names
 * (`config.connections.requestWindow`), measured from the moment the request was sent, which for both
 * `REQUEST_SENT` and `NANNY_APPLIED` is the row's creation.
 */
const requestDeadline = (row: ConnectionRecord): number =>
  row.expiresAt === undefined
    ? Date.parse(row.createdAt as string) +
      CONNECTIONS.requestWindowHours * MS_PER_HOUR
    : Date.parse(row.expiresAt as string);

/** Strictly past: a deadline that falls exactly on this instant has not passed yet. */
const passed = (deadlineMs: number, now: Instant): boolean =>
  deadlineMs < Date.parse(now as string);

export function connectionSweepTargets(
  job: ConnectionJobName,
  rows: ReadonlyArray<ConnectionRecord>,
  now: Instant,
  londonToday: ISODate,
): ReadonlyArray<ConnectionSweepTarget> {
  switch (job) {
    case "expire-connections":
      return rows
        .filter(
          (row) =>
            (row.stage === "REQUEST_SENT" || row.stage === "NANNY_APPLIED") &&
            passed(requestDeadline(row), now),
        )
        .map((row) => ({ row, transition: "K-8" as const }));
    // 01 §4f: "when `meeting_at` has passed". A row at `INTRO_SCHEDULED` with no meeting time is not a meeting
    // that has finished — it is a row K-9 has not filled in — so it is skipped, never completed by default.
    case "meeting-complete-sweep":
      return rows
        .filter(
          (row) =>
            row.stage === "INTRO_SCHEDULED" &&
            row.meetingAt !== undefined &&
            passed(Date.parse(row.meetingAt as string), now),
        )
        .map((row) => ({ row, transition: "K-12" as const }));
    // The trial is a **date**, not an instant: it is complete once London has moved on to a later date. A trial
    // dated today is still today's trial at 04:00 this morning, which is when this job runs.
    case "trial-complete-sweep":
      return rows
        .filter(
          (row) =>
            row.stage === "TRIAL_ARRANGED" &&
            row.trialDate !== undefined &&
            (row.trialDate as string) < (londonToday as string),
        )
        .map((row) => ({ row, transition: "K-16" as const }));
  }
}
