// `book_slot()`'s `jsonb` answer, narrowed by a check rather than by an assertion (REVIEW-2, typescript-review
// HIGH).
//
// **The mechanism this closes.** `database.types.ts` declares `book_slot.Returns: Json`, and `RpcResult`
// forwards that verbatim — `Json` admits `null`, a scalar and an array. `scheduling-booking-writes.ts` used to
// write `answer.value as unknown as BookSlotResult` and then call `bookingFromRow(result.booking)` on the next
// line. On any non-object answer that is `bookingFromRow(undefined)` → a `TypeError` on `row.booked_by_role`,
// **thrown out of a function whose declared type is `Promise<Result<BookOutcome, SchedulingErrorDetails>>`**.
// Every caller checks `if (!booked.ok)` and none wraps in `try`, so the failure skipped the coded-error registry
// entirely and surfaced as a 500 — on the money-adjacent path that books a family's introduction call.
//
// The shape check is deliberately shallow: `booking` present and an object, `displaced` present and either an
// object or null. Validating every column would duplicate `bookingFromRow`'s own reading of the row and would
// go stale against the migration; what matters is that the two dereferences on the next lines are safe, and
// that anything else becomes a named reason instead of a throw.
import type { BookSlotResult } from "../types";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function bookSlotResultOf(value: unknown): BookSlotResult | null {
  if (!isObject(value)) return null;
  if (!isObject(value.booking)) return null;
  if (value.displaced !== null && !isObject(value.displaced)) return null;
  return value as unknown as BookSlotResult;
}
