"use server";
// S-N-02's calendar read (04 §4.4 c3 "live slots from the admin calendar, read through `call-layer` — never
// `scheduling` directly, R3"), grouped by London day.
//
// She sees **only truly free slots**: `getAvailableSlots({ kind: 'nanny-commission' })` excludes a parent's
// booking and a `displaceable` slot is one of her own kind, so 03 §3.5 seq 2's "displaceable never shown to a
// nanny" falls out of the query rather than being filtered here. Nothing in this read identifies her, so it
// carries no limiter of its own — the write does (07 §8 row 6).
import { nowInstant, toActionResult } from "@/modules/platform";
import type { ListSlotsAction } from "../types";
import { callLayer } from "../lib/default-call-layer";
import { groupSlotsByDay } from "../lib/group-slots-by-day";
import { nannyActor } from "../lib/nanny-actor";
import { slotRange } from "../lib/slot-range";

export const listNannySlotsAction: ListSlotsAction = async () => {
  const actor = await nannyActor();
  if (!actor.ok) return toActionResult(actor);
  const slots = await callLayer.listSlots(
    "nanny-commission",
    slotRange(nowInstant()),
  );
  return toActionResult(
    slots.ok ? { ok: true, value: groupSlotsByDay(slots.value) } : slots,
  );
};
