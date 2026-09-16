// 03 §3.3 I-9 — the booking status lattice, as a pure function shared by the stub and the real inside
// (03 §3.6). `held → booked`; `booked | rescheduled → rescheduled | cancelled | done | no-answer`;
// `cancelled | done | no-answer` are terminal. Anything else is `INVALID_STATUS_MOVE`.
import type { BookingStatus } from "@/modules/shared-types";

const LATTICE: Readonly<Record<BookingStatus, ReadonlyArray<BookingStatus>>> =
  Object.freeze({
    held: Object.freeze(["booked", "cancelled"] as const),
    booked: Object.freeze([
      "rescheduled",
      "cancelled",
      "done",
      "no-answer",
    ] as const),
    rescheduled: Object.freeze([
      "rescheduled",
      "cancelled",
      "done",
      "no-answer",
    ] as const),
    cancelled: Object.freeze([] as const),
    done: Object.freeze([] as const),
    "no-answer": Object.freeze([] as const),
  });

export function canMoveStatus(from: BookingStatus, to: BookingStatus): boolean {
  return LATTICE[from].includes(to);
}
