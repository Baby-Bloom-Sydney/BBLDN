"use server";
// S-A-04 "book the slot on behalf" (04 §6.4; 04 §5.2 steps 4 and 6). Two moments need it: a parent who left
// S-P-02 without picking, and the retry after a no-answer (R5; ADR-073).
//
// No hold: 03 §3.2 says `hold` and `book` both take a `slotId` precisely "so a caller that never held (admin on
// behalf, the nanny's form) still books". The admin is looking at the calendar, not racing another parent for a
// slot, so `holdId` is `undefined` and `book_slot()` takes its no-hold path.
import { adminOnBehalf } from "@/modules/admin-on-behalf";
import { ok, toActionResult } from "@/modules/platform";
import type { BookCallSlotAction } from "../types";
import { onBehalfOfParent } from "../lib/on-behalf-actor";

export const bookCallSlotAction: BookCallSlotAction = async (input) => {
  const booked = await adminOnBehalf.chooseSlot(
    input.positionId,
    input.slotId,
    undefined,
    onBehalfOfParent(input.parentId),
    `admin:${input.positionId}:${input.slotId}`,
  );
  return toActionResult(booked.ok ? ok(undefined) : booked);
};
