// The five scheduled jobs of 01 §4f as one **pure** rule: (the job, every spine row, now) → the rows this job
// acts on and, where it writes, the patch. No store, no clock, no email — so each job is a table of unit tests
// rather than an integration guess, and `payments-jobs.ts` is the only file that does I/O.
//
//   expire-trials                   `trial` past `trial_ends_at`     → `lapsed`, `access.lapsed{trial-ended}`
//   expire-past-due                 `past_due` past the grace end    → `lapsed`, `access.lapsed{past-due}`
//   expire-cancelled-subscriptions  `cancelled` past the period end  → `lapsed`, `access.lapsed{cancelled}`
//   trial-reminders                 `trial`, T-5, not yet reminded   → stamp + email, no standing change
//   payment-due-sweep               `placed`, bill due, no link sent → **writes nothing** (02 §4.5)
//
// A row whose window has not passed is not in the result at all, so a re-run is idempotent by construction: the
// three lapse jobs move a row out of the status they select on, `trial-reminders` stamps the column it filters
// on, and `payment-due-sweep` selects rows with no link and mints none.
import type { Instant } from "@/modules/shared-types";
import type { LapseReason, PaymentJobName } from "../types";
import { addDays } from "./add-days";
import type { SpinePatch, SpineRow } from "./spine-store";

/** A row the job acts on, with the patch to write; `patch` is `null` where the job writes nothing. */
export type SweepTarget = {
  readonly row: SpineRow;
  readonly patch: SpinePatch | null;
  readonly lapseReason?: LapseReason;
};

const LAPSED: SpinePatch = Object.freeze({ status: "lapsed" });

/** `null` is **not** an expired window: a row with no end date has not ended, it has no end date yet. */
const passed = (at: string | null, now: string): boolean =>
  at !== null && at <= now;

const lapse =
  (reason: LapseReason) =>
  (row: SpineRow): SweepTarget => ({ row, patch: LAPSED, lapseReason: reason });

const trialsDue = (
  rows: ReadonlyArray<SpineRow>,
  now: string,
  daysBefore: number,
): ReadonlyArray<SweepTarget> =>
  rows
    .filter(
      (row) =>
        row.status === "trial" &&
        row.trial_reminder_sent_at === null &&
        row.trial_ends_at !== null &&
        !passed(row.trial_ends_at, now) &&
        passed(addDays(row.trial_ends_at as Instant, -daysBefore), now),
    )
    .map((row) => ({ row, patch: { trial_reminder_sent_at: now } }));

export function sweepTargets(
  job: PaymentJobName,
  rows: ReadonlyArray<SpineRow>,
  now: string,
  trialReminderDaysBefore: number,
): ReadonlyArray<SweepTarget> {
  switch (job) {
    case "expire-trials":
      return rows
        .filter(
          (row) => row.status === "trial" && passed(row.trial_ends_at, now),
        )
        .map(lapse("trial-ended"));
    case "expire-past-due":
      return rows
        .filter(
          (row) =>
            row.status === "past_due" &&
            passed(row.past_due_grace_ends_at, now),
        )
        .map(lapse("past-due"));
    case "expire-cancelled-subscriptions":
      return rows
        .filter(
          (row) =>
            row.status === "cancelled" &&
            passed(row.current_period_ends_at, now),
        )
        .map(lapse("cancelled"));
    case "trial-reminders":
      return trialsDue(rows, now, trialReminderDaysBefore);
    // ADR-094 / AC-A-41 — a done-for-you family whose nanny started and whose bill has fallen due, with **no
    // balance link sent**. The job flags it for the matchmaker; it never mints a link and never charges, which
    // is why the patch is `null`: 02 §4.5's writers table says `payment-due-sweep` writes nothing on the row.
    case "payment-due-sweep":
      return rows
        .filter(
          (row) =>
            row.status === "placed" &&
            row.balance_link_ref === null &&
            passed(row.payment_due_at, now),
        )
        .map((row) => ({ row, patch: null }));
  }
}
