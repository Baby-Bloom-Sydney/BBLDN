// `book_slot()` raises by NAME (02 §7 / `0009`), so the reason travels in the exception message and reaches
// here through `DataAccessPort.run`'s `INTERNAL` `Result`. This maps it back to the 03 §3.4 reason the caller
// is promised — matched on the whole set, never on a substring of prose, so a Postgres message that merely
// *contains* "SLOT_TAKEN" in a locale-dependent hint cannot masquerade as the raise.
//
// Anything unrecognised stays `PROVIDER_ERROR`: a failure this module cannot name is not one it may translate.
import { err } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import type { SchedulingErrorDetails, SchedulingReason } from "../types";

const RAISED: ReadonlyArray<SchedulingReason> = Object.freeze([
  "SLOT_TAKEN",
  "SLOT_OUTSIDE_WINDOW",
  "SLOT_BLOCKED",
  "HOLD_EXPIRED",
  "HOLD_NOT_YOURS",
  "ALREADY_BOOKED",
  "NOT_DISPLACEABLE",
  "NO_FREE_SLOT",
  "INVALID_STATUS_MOVE",
  "RULE_OVERLAP",
  "CALENDAR_UNKNOWN",
]);

const MESSAGES: Readonly<Record<SchedulingReason, string>> = Object.freeze({
  SLOT_TAKEN: "That time has just been taken.",
  SLOT_OUTSIDE_WINDOW: "That time is outside the times we can take.",
  SLOT_BLOCKED: "That time is not open.",
  HOLD_EXPIRED: "That time is no longer held.",
  HOLD_NOT_YOURS: "That hold is for another time.",
  ALREADY_BOOKED: "A time is already set for this call.",
  NOT_DISPLACEABLE: "That time cannot be taken.",
  NO_FREE_SLOT: "There is no free time to move to.",
  INVALID_STATUS_MOVE: "This call cannot move from where it is.",
  RULE_OVERLAP: "Those opening times overlap an existing rule.",
  CALENDAR_UNKNOWN: "That calendar does not exist.",
  NOT_FOUND: "That call could not be found.",
  FORBIDDEN: "Only an admin can change the calendar.",
  PROVIDER_ERROR: "The calendar could not answer.",
  NOT_IMPLEMENTED: "That is not available yet.",
  SCHEDULING_NOT_CONFIGURED: "The calendar is not available.",
});

/** Codes follow 03 §3.4: every raise above is a CONFLICT bar the two VALIDATION rows. */
const VALIDATION = new Set<SchedulingReason>([
  "RULE_OVERLAP",
  "CALENDAR_UNKNOWN",
]);

/**
 * A **whole token**, not a substring: `SLOT_TAKEN` matches `SLOT_TAKEN` and PostgREST's wrapping of it, and does
 * not match a hint that merely mentions it inside a longer identifier. Postgres messages are locale-dependent
 * prose around a fixed raise; the raise is the part this matches.
 */
const raised = (text: string, code: SchedulingReason): boolean =>
  new RegExp(`(^|[^A-Z_])${code}([^A-Z_]|$)`).test(text);

/**
 * A write this module makes itself (a hold, a reschedule) hits the partial unique indexes directly rather than
 * through `book_slot()`, and PostgREST reports the **constraint name**. Branching on the name, never on the
 * message prose, is `0009`'s own rule (`database-reviewer` M-2, recorded there).
 */
const CONSTRAINTS: Readonly<Record<string, SchedulingReason>> = Object.freeze({
  bookings_active_slot_unique_idx: "SLOT_TAKEN",
  bookings_active_subject_unique_idx: "ALREADY_BOOKED",
  bookings_idempotency_key_unique_idx: "ALREADY_BOOKED",
});

export function schedulingFailure(
  failure: Readonly<{ message?: string }> | undefined,
  fallback: SchedulingReason = "PROVIDER_ERROR",
): Result<never, SchedulingErrorDetails> {
  const text = failure?.message ?? "";
  const byConstraint = Object.entries(CONSTRAINTS).find(([name]) =>
    text.includes(name),
  );
  const reason =
    RAISED.find((candidate) => raised(text, candidate)) ??
    byConstraint?.[1] ??
    fallback;
  const code =
    reason === "PROVIDER_ERROR"
      ? "PROVIDER_ERROR"
      : reason === "NOT_FOUND" || reason === "FORBIDDEN"
        ? reason
        : reason === "NOT_IMPLEMENTED" || reason === "SCHEDULING_NOT_CONFIGURED"
          ? "INTERNAL"
          : VALIDATION.has(reason)
            ? "VALIDATION"
            : "CONFLICT";
  return err<SchedulingErrorDetails>(code, MESSAGES[reason], { reason });
}
