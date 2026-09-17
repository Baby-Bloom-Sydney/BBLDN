"use server";
// S-A-04 "move the slot on behalf" (04 §6.4). The same C-2 a parent fires from S-P-02, with the admin named and
// `onBehalfOf` on the event (P-1, ADR-001) — so the customer still gets `call-rescheduled` (03 §3.5 seq 4).
//
// This is also half of what ADR-077 leaves the admin to do by hand: a booking flagged `blocked-over` is moved
// here or cleared, and never auto-cancelled.
import { adminOnBehalf } from "@/modules/admin-on-behalf";
import { ok, toActionResult } from "@/modules/platform";
import type { MoveCallSlotAction } from "../types";
import { callRefOf } from "../lib/call-ref-of";
import { partyActor } from "../lib/party-actor";

export const moveCallSlotAction: MoveCallSlotAction = async (input) => {
  const moved = await adminOnBehalf.moveSlot(
    callRefOf(input.ref),
    input.slotId,
    partyActor(input.ref),
  );
  return toActionResult(moved.ok ? ok(undefined) : moved);
};
