"use server";
// S-P-02's retry (04 §6.2 "slots failed to load → error + retry"; "slot taken → refresh"): the calendar re-read
// for the signed-in parent's open call, grouped by London day.
import { nowInstant, err, toActionResult } from "@/modules/platform";
import type { CallErrorDetails, ListSlotsAction } from "../types";
import { callLayer } from "../lib/default-call-layer";
import { groupSlotsByDay } from "../lib/group-slots-by-day";
import { parentActor } from "../lib/parent-actor";
import { slotRange } from "../lib/slot-range";

export const listSlotsAction: ListSlotsAction = async () => {
  const actor = await parentActor();
  if (!actor.ok) return toActionResult(actor);
  const call = await callLayer.findOpenCall(actor.value.id);
  if (!call.ok) return toActionResult(call);
  if (call.value === null)
    return toActionResult(
      err<CallErrorDetails>("NOT_FOUND", "No call is open", {
        reason: "E_ENTITY_NOT_FOUND",
      }),
    );
  const slots = await callLayer.listSlots(
    call.value.type,
    slotRange(nowInstant()),
  );
  return toActionResult(
    slots.ok ? { ok: true, value: groupSlotsByDay(slots.value) } : slots,
  );
};
