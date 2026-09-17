// One `bookings` row (02 §4.4 row 4) → the `Booking` of 03 §3.2. The row carries more than the contract does
// (the attention pair, the displacement counters, the call note); what the connector promises is exactly this
// shape, so the extra columns stay inside the module and reach `admin` as `CallListItem.flags` instead.
//
// **ADR-143 closes the two holes REVIEW-2 found here, and neither is closed by inventing a value.**
//
//   1. The booker. `(row.booked_by_user_id ?? "") as AdminId` minted a well-typed reference to nobody, and
//      `0009`'s `on delete set null` makes that reachable from 07 §6's own account-deletion path. `bookedBy` is
//      now `Actor | null` and a NULL user id reads back as `null`. The one NULL that is *not* an absence is a
//      `system` row: `actor-columns.ts` writes those with no user id by construction, so it stays the named job.
//   2. The position subject's parent. `bookings` stores `subject_type` + `subject_id` only, and ADR-143 rules
//      out a new column: the parent is **joined from `nanny_positions.parent_id` at read** and handed in here.
//      This file never guesses it — a caller that cannot resolve the position refuses instead
//      (`scheduling-calendar-reads.ts`).
import type {
  Actor,
  AdminId,
  Booking,
  BookingId,
  CallOutcome,
  CancelReason,
  ISO,
  PositionId,
  Priority,
  Subject,
  UserId,
} from "@/modules/shared-types";
import type { BookingRow } from "../types";

const actorOf = (row: BookingRow): Actor | null => {
  // A named job, never a person: `booked_by_user_id` is NULL on purpose here (`actor-columns.ts`).
  if (row.booked_by_role === "system") return { kind: "system", id: "cascade" };
  if (row.booked_by_user_id === null) return null;
  if (row.booked_by_role === "admin")
    return { kind: "admin", id: row.booked_by_user_id as AdminId };
  return {
    kind: "user",
    id: row.booked_by_user_id as UserId,
    role: row.booked_by_role,
  };
};

/** `null` for the one case the row cannot answer: a position subject whose position no longer exists. */
const subjectOf = (
  row: BookingRow,
  parentId: UserId | null,
): Subject | null => {
  if (row.subject_type === "nanny")
    return { kind: "nanny", nannyId: row.subject_id as UserId };
  return parentId === null
    ? null
    : { kind: "position", positionId: row.subject_id as PositionId, parentId };
};

/** `undefined`, never `null`: 03 §3.2 writes the optional fields as `?`, and a `null` would not satisfy them. */
const present = <V>(
  key: string,
  value: V | null,
): Readonly<Record<string, V>> =>
  value === null ? {} : Object.freeze({ [key]: value });

/**
 * `null` when the row is a position subject whose `nanny_positions` row is gone — the one thing this mapper
 * cannot answer, handed back to the caller to refuse rather than filled with an invented parent.
 *
 * @param positionParentId `nanny_positions.parent_id` for a position subject, resolved by the caller (ADR-143).
 * It is unused for a nanny subject, which has no parent.
 */
export function bookingFromRow(
  row: BookingRow,
  positionParentId: UserId | null,
): Booking | null {
  const subject = subjectOf(row, positionParentId);
  if (subject === null) return null;
  return Object.freeze({
    id: row.id as BookingId,
    calendarId: "default",
    kind: row.kind,
    priority: (row.priority === 1 ? "nanny" : "parent") as Priority,
    status: row.status,
    subject,
    start: row.start_at as ISO,
    end: row.end_at as ISO,
    bookedBy: actorOf(row),
    bookedAt: row.created_at as ISO,
    version: row.version,
    ...present<ISO>("rescheduledFrom", row.rescheduled_from_at as ISO | null),
    ...present<ISO>("displacedFrom", row.displaced_from_at as ISO | null),
    ...present<CallOutcome>("outcome", row.call_outcome),
    ...present<ISO>("nextAttemptAt", row.next_attempt_at as ISO | null),
    ...present<CancelReason>("cancelReason", row.cancel_reason),
  }) as Booking;
}
