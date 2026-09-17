"use server";
// S-P-02 "tap = 5-minute hold" (04 §3.1 step 9; ADR-076). The hold is `scheduling`'s own write, reached from
// inside the one module that may import it (R3). The parent's identity comes from the session, never the form.
//
// The hold says what it is for (03 §3.2's amended `hold` — see `scheduling/types.ts`): a held row is an
// **active** row under I-10, so it carries its subject and its call type like every other row. Both are
// assembled here, where they are trustworthy — the position from the page's own route, the parent from the
// session, the call type from the call's state — and never taken from the client.
import { callLayer } from "../lib/default-call-layer";
import { scheduling } from "@/modules/scheduling";
import { toActionResult } from "@/modules/platform";
import type { PositionId, SlotId } from "@/modules/shared-types";
import type { HoldSlotAction } from "../types";
import { parentActor } from "../lib/parent-actor";

export const holdSlotAction: HoldSlotAction = async (
  slotId: SlotId,
  positionId: PositionId,
) => {
  const actor = await parentActor();
  if (!actor.ok) return toActionResult(actor);
  const state = await callLayer.getCallState({
    kind: "call",
    positionId,
  });
  if (!state.ok) return toActionResult(state);
  const held = await scheduling.hold(slotId, actor.value, {
    kind: state.value.type,
    subject: { kind: "position", positionId, parentId: actor.value.id },
  });
  return toActionResult(
    held.ok ? { ok: true, value: { holdId: held.value } } : held,
  );
};
