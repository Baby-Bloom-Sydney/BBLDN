// S-P-01's server read (04 §3.1 steps 8–9): who is signed in → her open call → the calendar's slots for the
// call's type, grouped by London day. One function so the route file stays thin (05 §7 rule 5). A slot read
// that fails leaves `days: null` — the page still says the matchmaker will call (04 §6.2 S-P-01 L·E·E).
import { nowInstant } from "@/modules/platform";
import type { CallPageLoad } from "../types";
import { callLayer } from "./default-call-layer";
import { callPageView } from "./call-page-view";
import { groupSlotsByDay } from "./group-slots-by-day";
import { parentActor } from "./parent-actor";
import { slotRange } from "./slot-range";

export async function loadCallPage(): Promise<CallPageLoad> {
  const actor = await parentActor();
  if (!actor.ok) return { kind: "signed-out" };
  const call = await callLayer.findOpenCall(actor.value.id);
  if (!call.ok) return { kind: "failed" };
  if (call.value === null) return { kind: "no-call" };
  const slots = await callLayer.listSlots(
    call.value.type,
    slotRange(nowInstant()),
  );
  return {
    kind: "page",
    view: callPageView(call.value),
    days: slots.ok ? groupSlotsByDay(slots.value) : null,
  };
}
