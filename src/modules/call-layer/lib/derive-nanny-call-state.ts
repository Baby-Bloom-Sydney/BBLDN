// 03 §2.7 — a nanny-commission call's state is **derived** from its booking row, never stored: `booked` /
// `rescheduled` → `slot-chosen`; `done` / `cancelled` → `done`; `no-answer` → `awaiting-slot` (the row is
// terminal, the retry is a new booking — R5).
import type { Booking, CallState } from "@/modules/shared-types";

export function deriveNannyCallState(booking: Booking): CallState {
  if (booking.status === "no-answer") return "awaiting-slot";
  if (booking.status === "done" || booking.status === "cancelled")
    return "done";
  return "slot-chosen";
}
