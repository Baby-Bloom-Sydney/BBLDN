"use server";
// S-N-02's one write (04 §4.4 c3; 03 §2.7 "`openNannyCall` — the only S-N-02 write"; 03 §3.5 seq 2).
//
// **No hold, by contract.** 03 §3.2 names this caller in as many words: "`hold` and `book` both accept
// `slotId` so a caller that never held (admin on behalf, **the nanny's form**) still books". The parent's
// picker holds because she is choosing between people's time on a page she may sit on; the nanny's form is one
// tap and a confirm, and a hold she cannot see expiring is worse than a `SLOT_TAKEN` she can act on.
//
// **The nanny is the session, never the form.** Unlike the parent's `chooseSlotAction` there is no id to check
// ownership of — 03 §3.2's `Subject` for this kind *is* `{ kind: 'nanny', nannyId }` — so taking it from the
// session is the whole authorisation, and there is no shape in which a caller could book somebody else's call.
// A second booking while one is active is refused by I-10 (`ALREADY_BOOKED`), not by a check here.
//
// The idempotency key is the nanny and the slot: a double-submit of the same tap is one booking, and a
// different slot is a different intent (which I-10 then refuses while one stands).
import { toActionResult } from "@/modules/platform";
import type { BookNannyCallAction } from "../types";
import { callLayer } from "../lib/default-call-layer";
import { consumeBookingLimit } from "../lib/consume-booking-limit";
import { nannyActor } from "../lib/nanny-actor";
import { refuseBooking } from "../lib/refuse-booking";

export const bookNannyCallAction: BookNannyCallAction = async (input) => {
  const actor = await nannyActor();
  if (!actor.ok) return toActionResult(actor);
  if (!(await consumeBookingLimit(actor.value.id, "bookNannyCall")))
    return toActionResult(refuseBooking());

  const booked = await callLayer.openNannyCall({
    nannyId: actor.value.id,
    slotId: input.slotId,
    ...(input.holdId === undefined ? {} : { holdId: input.holdId }),
    actor: actor.value,
    idempotencyKey: `${actor.value.id}:${input.slotId}`,
  });
  return toActionResult(
    booked.ok
      ? {
          ok: true,
          value: { start: booked.value.start, end: booked.value.end },
        }
      : booked,
  );
};
