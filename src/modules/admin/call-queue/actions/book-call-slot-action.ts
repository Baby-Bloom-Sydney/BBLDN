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
import { malformedRequest } from "../../lib/malformed-request";
import { onBehalfOfParent } from "../lib/on-behalf-actor";
import { positionBelongsTo } from "../lib/position-belongs-to";

export const bookCallSlotAction: BookCallSlotAction = async (input) => {
  if (
    typeof input?.positionId !== "string" ||
    typeof input?.parentId !== "string" ||
    typeof input?.slotId !== "string"
  )
    return toActionResult(malformedRequest());
  // ADR-145 (1). Both ids come from the caller and nothing tied them together, so the `onBehalfOf` this action
  // records — 07 §5.4 row 6's audit subject, and the control the whole on-behalf design rests on — was
  // forgeable. Checked before the lever, so a mismatch costs no write and leaves no half-move behind.
  const owns = await positionBelongsTo(input.positionId, input.parentId);
  if (!owns.ok) return toActionResult(owns);
  const booked = await adminOnBehalf.chooseSlot(
    input.positionId,
    input.slotId,
    undefined,
    onBehalfOfParent(input.parentId),
    `admin:${input.positionId}:${input.slotId}`,
  );
  return toActionResult(booked.ok ? ok(undefined) : booked);
};
