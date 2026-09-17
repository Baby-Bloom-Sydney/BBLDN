// I-2 / I-3 — where the displaced nanny goes, computed **before** `book_slot()` and handed to it as
// `p_displace_to`.
//
// **This is why displacement lands as one RPC (ADR-127), not as a second definer.** `0009`'s comment on
// `book_slot()` is explicit that it "does not generate slots or search for the next free one", because
// re-implementing 03 §3.6's window / DST / grid rules in PL/pgSQL would be a second source of truth for I-6 and
// I-7 that could drift silently. So the module computes the target with the *same* pure `nextFreeSlot` the stub
// uses, and the function does the only part that must be atomic: lock, move, insert. S5's note that a hold is a
// bookings row and sequence 1 therefore "has no path" was about the **hold**, not about the move: a parent who
// books without a hold — which is every parent taking a displaceable slot, because a hold on an occupied slot
// cannot be inserted under `bookings_active_slot_unique_idx` — reaches the whole of I-2 and I-3 in one call.
//
// `null` means "nothing to displace, or nowhere to move her": `book_slot()` reads a null `p_displace_to` as
// I-3 and cancels the nanny's row `displaced-no-slot`, flagged for the admin. The parent still succeeds either
// way, which is the invariant.
import { ok } from "@/modules/platform";
import type { BookingKind, ISO, Result } from "@/modules/shared-types";
import type { CalendarReads, SchedulingErrorDetails } from "../types";
import { nextFreeSlot } from "./next-free-slot";

const DAY_MS = 86_400_000;

export async function displaceTo(
  calendarReads: CalendarReads,
  kind: BookingKind,
  start: ISO,
): Promise<Result<ISO | null, SchedulingErrorDetails>> {
  // A nanny never displaces (I-2), so there is nothing to move.
  if (kind === "nanny-commission") return ok(null);
  const loaded = await calendarReads.loadCalendar();
  if (!loaded.ok) return loaded;
  const occupant = loaded.value.bookings.find(
    (row) =>
      row.start_at === start &&
      (row.status === "held" ||
        row.status === "booked" ||
        row.status === "rescheduled"),
  );
  // Nobody there, or a parent there — the latter is `SLOT_TAKEN`, which `book_slot()` raises under the lock.
  if (occupant === undefined || occupant.priority !== 1) return ok(null);
  // Her next free time is what a nanny would be shown: `getAvailableSlots` already excludes every occupied
  // start and every block, so the first one at or after hers is 03 §3.6's "next free slot".
  const horizon = new Date(
    Date.parse(start) + 14 * DAY_MS,
  ).toISOString() as ISO;
  const free = await calendarReads.getAvailableSlots({
    kind: "nanny-commission",
    from: start,
    to: horizon,
  });
  if (!free.ok) return free;
  const target = nextFreeSlot(
    free.value.filter((slot) => slot.start !== start),
    start,
    new Set<string>(),
  );
  return ok(target === null ? null : target.start);
}
