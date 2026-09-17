// One `bookings` row (02 §4.4 row 4) → the `Booking` of 03 §3.2. The row carries more than the contract does
// (the attention pair, the displacement counters, the call note); what the connector promises is exactly this
// shape, so the extra columns stay inside the module and reach `admin` as `CallListItem.flags` instead.
//
// ★ Recorded gap, pinned as a failing test (`scheduling.inside.test.ts`, "a position subject read back carries
// the parent"): 03 §3.2's `Subject` for a position carries `parentId`, and `bookings` (02 §4.4 row 4) stores
// only `subject_type` + `subject_id`. The parent is recoverable from `booked_by_user_id` **when the parent
// booked**; after an admin-on-behalf booking that column is the admin. This file fills what the row can answer
// and never invents the rest — the correction is owed to 02 §4.4 (a `parent_id` column) or to 03 §3.2 (the
// field optional on read-back), and 03 §3.6 already says `admin` decorates the subject from `positions`.
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

const actorOf = (row: BookingRow): Actor => {
  if (row.booked_by_role === "admin")
    return { kind: "admin", id: (row.booked_by_user_id ?? "") as AdminId };
  if (row.booked_by_role === "system") return { kind: "system", id: "cascade" };
  return {
    kind: "user",
    id: (row.booked_by_user_id ?? "") as UserId,
    role: row.booked_by_role,
  };
};

const subjectOf = (row: BookingRow): Subject =>
  row.subject_type === "nanny"
    ? { kind: "nanny", nannyId: row.subject_id as UserId }
    : {
        kind: "position",
        positionId: row.subject_id as PositionId,
        parentId: (row.booked_by_role === "parent"
          ? (row.booked_by_user_id ?? "")
          : "") as UserId,
      };

/** `undefined`, never `null`: 03 §3.2 writes the optional fields as `?`, and a `null` would not satisfy them. */
const present = <V>(
  key: string,
  value: V | null,
): Readonly<Record<string, V>> =>
  value === null ? {} : Object.freeze({ [key]: value });

export function bookingFromRow(row: BookingRow): Booking {
  return Object.freeze({
    id: row.id as BookingId,
    calendarId: "default",
    kind: row.kind,
    priority: (row.priority === 1 ? "nanny" : "parent") as Priority,
    status: row.status,
    subject: subjectOf(row),
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
