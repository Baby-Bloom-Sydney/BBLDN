// S-A-19's call rows (04 §6.4: the per-family timeline — "invite, payment-link paid, trial events", and now
// the calls). One booking is one row: when it was set, whether it moved, whether it was displaced by another
// family, and how it ended.
//
// ★ **Built and exported, not yet mounted, and the reason is a gap not a choice.** S-A-19 is keyed on a
// `userId`; `scheduling.listForSubject` is keyed on a `Subject`, which for a family is a **position**. No
// connector answers "which positions does this parent have" — `PositionsReads` has `getForMatching(positionId)`
// and no list — so the page cannot reach a family's bookings from the id it has. Owed: a positions-for-a-parent
// read on 03 §2.5. Until then `1g` can mount this wherever a position id is already in hand (S-A-06).
import { londonSlotWords } from "@/modules/call-layer";
import type { Booking, ISO } from "@/modules/shared-types";
import { CALL_OUTCOME_LABEL } from "./call-outcome-label";
import { CALL_TYPE_LABEL } from "./call-type-label";

export type CallTimelineRow = {
  readonly id: string;
  readonly at: ISO;
  readonly title: string;
  readonly detail: string;
};

const endedAs = (booking: Booking): string | null => {
  if (booking.status === "no-answer")
    return "No answer — waiting for a new time";
  if (booking.status === "cancelled") return "Time cleared";
  if (booking.status === "done")
    return booking.outcome === undefined
      ? "Call done"
      : `Call done — ${CALL_OUTCOME_LABEL[booking.outcome]}`;
  return null;
};

export function callTimelineRows(
  bookings: ReadonlyArray<Booking>,
): ReadonlyArray<CallTimelineRow> {
  return Object.freeze(
    [...bookings]
      .sort((left, right) => right.start.localeCompare(left.start))
      .map((booking) => {
        const words = londonSlotWords(booking.start);
        const moved =
          booking.displacedFrom !== undefined
            ? " · moved by a family booking"
            : booking.rescheduledFrom !== undefined
              ? " · time changed"
              : "";
        const ended = endedAs(booking);
        return Object.freeze({
          id: booking.id,
          at: booking.start,
          title: `${CALL_TYPE_LABEL[booking.kind]} call — ${words.full}`,
          detail: `${ended ?? "Time set"}${moved}`,
        });
      }),
  );
}
