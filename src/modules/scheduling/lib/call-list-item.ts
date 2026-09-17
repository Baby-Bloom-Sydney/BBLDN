// 03 §3.2 `CallListItem` and I-12: **`due` is computed at read from `now`, `end` and `overdueGraceMinutes` — no
// sweep changes a status** (ADR-070). The flags are the row's own attention pair (02 §4.4 row 4), which is what
// `booking.blocked-over` and the displacement rows write; `admin/call-queue` decorates the item with the people
// (03 §3.6) and never recomputes either of these.
import { SCHEDULING } from "@/modules/config";
import type { AttentionFlag, CallListItem, ISO } from "@/modules/shared-types";
import type { BookingRow } from "../types";
import { bookingFromRow } from "./booking-from-row";

const MINUTE_MS = 60_000;

/** A row is only ever flagged by what the database wrote on it — never by re-deriving the reason here. */
const flagsOf = (row: BookingRow): ReadonlyArray<AttentionFlag> =>
  row.needs_attention &&
  (row.attention_reason === "blocked-over" ||
    row.attention_reason === "displaced")
    ? Object.freeze([row.attention_reason])
    : Object.freeze([]);

/** `held`, `booked` and `rescheduled` are the rows still in front of the admin; the rest are behind her. */
const TERMINAL = new Set<string>(["cancelled", "done", "no-answer"]);

export function callListItem(row: BookingRow, now: ISO): CallListItem {
  const start = Date.parse(row.start_at);
  const end = Date.parse(row.end_at);
  const at = Date.parse(now);
  const grace = SCHEDULING.overdueGraceMinutes * MINUTE_MS;
  const due: CallListItem["due"] = TERMINAL.has(row.status)
    ? "past"
    : at < start
      ? "upcoming"
      : at <= end + grace
        ? "due"
        : "overdue";
  return Object.freeze({
    booking: bookingFromRow(row),
    due,
    flags: flagsOf(row),
  });
}
