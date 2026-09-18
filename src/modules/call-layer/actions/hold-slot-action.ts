"use server";
// S-P-02 "tap = 5-minute hold" (04 §3.1 step 9; ADR-076). The hold is `scheduling`'s own write, reached from
// inside the one module that may import it (R3). The parent's identity comes from the session, never the form.
//
// The hold says what it is for (03 §3.2's amended `hold` — see `scheduling/types.ts`): a held row is an
// **active** row under I-10, so it carries its subject and its call type like every other row.
//
// **The position is checked, not taken on trust**, and the reason is a real attack rather than a formality.
// A `"use server"` export is a public HTTP surface: any signed-in parent can call this with any `positionId`.
// Without the check below, parent A could put a `held` row on the calendar whose subject is family B's
// position — and I-10 (one active booking per subject, partial unique) would then stop B booking her own call
// until the hold expired. So the position is read back from the caller's **own** open call
// (`findOpenCall(session parent)`) and a mismatch is refused; the call type comes from the same read, so it is
// not client-supplied either.
import { callLayer } from "../lib/default-call-layer";
import { scheduling } from "@/modules/scheduling";
import { err, toActionResult } from "@/modules/platform";
import { consumeBookingLimit } from "../lib/consume-booking-limit";
import { refuseBooking } from "../lib/refuse-booking";
import type { PositionId, SlotId } from "@/modules/shared-types";
import type { HoldSlotAction } from "../types";
import { parentActor } from "../lib/parent-actor";

/** One message either way: "not yours" and "no such call" must not read differently (07 §4, no enumeration). */
const NOT_HERS = err("FORBIDDEN", "That time cannot be held.", {
  reason: "E_ACTOR_FORBIDDEN" as const,
});

export const holdSlotAction: HoldSlotAction = async (
  slotId: SlotId,
  positionId: PositionId,
) => {
  const actor = await parentActor();
  if (!actor.ok) return toActionResult(actor);
  // 07 §8 row 6 (`2g`): a hold is a calendar write, and I-1 bounds how many rows survive a loop rather than how
  // many attempts are made. Fails closed — `bookingHolds` is not on the fail-open list (ADR-134).
  if (!(await consumeBookingLimit(actor.value.id, "holdSlot")))
    return toActionResult(refuseBooking());
  const open = await callLayer.findOpenCall(actor.value.id);
  if (!open.ok) return toActionResult(open);
  if (open.value === null || open.value.positionId !== positionId)
    return toActionResult(NOT_HERS);
  const held = await scheduling.hold(slotId, actor.value, {
    kind: open.value.type,
    subject: { kind: "position", positionId, parentId: actor.value.id },
  });
  return toActionResult(
    held.ok ? { ok: true, value: { holdId: held.value } } : held,
  );
};
