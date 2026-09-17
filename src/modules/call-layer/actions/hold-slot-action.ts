"use server";
// S-P-02 "tap = 5-minute hold" (04 §3.1 step 9; ADR-076). The hold is `scheduling`'s own write, reached from
// inside the one module that may import it (R3). The parent's identity comes from the session, never the form.
import { scheduling } from "@/modules/scheduling";
import { toActionResult } from "@/modules/platform";
import type { SlotId } from "@/modules/shared-types";
import type { HoldSlotAction } from "../types";
import { parentActor } from "../lib/parent-actor";

export const holdSlotAction: HoldSlotAction = async (slotId: SlotId) => {
  const actor = await parentActor();
  if (!actor.ok) return toActionResult(actor);
  const held = await scheduling.hold(slotId, actor.value);
  return toActionResult(
    held.ok ? { ok: true, value: { holdId: held.value } } : held,
  );
};
