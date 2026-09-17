"use server";
// S-P-02 "[Book my call] = booked" (04 §3.1 step 9): the one write behind the button. While the call is
// `awaiting-slot` it is C-1 (`callLayer.chooseSlot`); while `slot-chosen` ("Change time") it is C-2
// (`callLayer.moveSlot`). The position is checked against the session's open call, so a parent cannot set a
// time on a position that is not hers.
import { err, toActionResult } from "@/modules/platform";
import type { CallErrorDetails, ChooseSlotAction, OpenCall } from "../types";
import { callLayer } from "../lib/default-call-layer";
import { parentActor } from "../lib/parent-actor";

const notHers = () =>
  err<CallErrorDetails>("NOT_FOUND", "No call for this position", {
    reason: "E_ENTITY_NOT_FOUND",
  });

const chosenTime = async (call: OpenCall) => {
  const state = await callLayer.getCallState({
    kind: "call",
    positionId: call.positionId,
  });
  return state.ok && state.value.booking !== undefined
    ? {
        ok: true as const,
        value: {
          start: state.value.booking.start,
          end: state.value.booking.end,
        },
      }
    : err<CallErrorDetails>("INTERNAL", "The chosen time could not be read", {
        reason: "E_ENTITY_NOT_FOUND",
      });
};

export const chooseSlotAction: ChooseSlotAction = async (input) => {
  const actor = await parentActor();
  if (!actor.ok) return toActionResult(actor);
  const call = await callLayer.findOpenCall(actor.value.id);
  if (!call.ok) return toActionResult(call);
  if (call.value === null || call.value.positionId !== input.positionId)
    return toActionResult(notHers());
  const moved =
    call.value.state === "slot-chosen"
      ? await callLayer.moveSlot(
          { kind: "call", positionId: input.positionId },
          input.slotId,
          actor.value,
        )
      : await callLayer.chooseSlot(
          input.positionId,
          input.slotId,
          input.holdId,
          actor.value,
          `${input.positionId}:${input.slotId}:${input.holdId ?? "no-hold"}`,
        );
  if (!moved.ok) return toActionResult(moved);
  return toActionResult(await chosenTime(call.value));
};
