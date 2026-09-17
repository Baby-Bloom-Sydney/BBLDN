"use server";
// S-A-04 "clear the slot on behalf" (04 §6.4). C-2 with `bookingId: null`; the family gets `call-cancelled`
// (03 §3.5 seq 4). The reason is `admin-cancelled` because that is what it is — `clearSlot` takes a
// `CancelReason` and the honest one is the only one this screen can offer.
import { adminOnBehalf } from "@/modules/admin-on-behalf";
import { ok, toActionResult } from "@/modules/platform";
import type { ClearCallSlotAction } from "../types";
import { malformedRequest } from "../../lib/malformed-request";
import { onBehalfOfParent } from "../lib/on-behalf-actor";
import { positionBelongsTo } from "../lib/position-belongs-to";

export const clearCallSlotAction: ClearCallSlotAction = async (input) => {
  if (
    typeof input?.positionId !== "string" ||
    typeof input?.parentId !== "string"
  )
    return toActionResult(malformedRequest());
  // ADR-145 (1) as ADR-146 (3) extends it. This action carries the same caller-supplied pair as
  // `book-call-slot-action` and had no check that the two belong together, so 07 §5.4 row 6's audit subject was
  // forgeable on the **destructive** half of the screen: clearing cancels the family's call and sends her
  // `call-cancelled` (03 §3.5 seq 4). Checked before the lever, so a mismatch costs no write.
  const owns = await positionBelongsTo(input.positionId, input.parentId);
  if (!owns.ok) return toActionResult(owns);
  const cleared = await adminOnBehalf.clearSlot(
    input.positionId,
    onBehalfOfParent(input.parentId),
    "admin-cancelled",
  );
  return toActionResult(cleared.ok ? ok(undefined) : cleared);
};
