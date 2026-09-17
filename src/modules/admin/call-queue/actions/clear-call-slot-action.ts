"use server";
// S-A-04 "clear the slot on behalf" (04 §6.4). C-2 with `bookingId: null`; the family gets `call-cancelled`
// (03 §3.5 seq 4). The reason is `admin-cancelled` because that is what it is — `clearSlot` takes a
// `CancelReason` and the honest one is the only one this screen can offer.
import { adminOnBehalf } from "@/modules/admin-on-behalf";
import { ok, toActionResult } from "@/modules/platform";
import type { ClearCallSlotAction } from "../types";
import { malformedRequest } from "../../lib/malformed-request";
import { onBehalfOfParent } from "../lib/on-behalf-actor";

export const clearCallSlotAction: ClearCallSlotAction = async (input) => {
  if (
    typeof input?.positionId !== "string" ||
    typeof input?.parentId !== "string"
  )
    return toActionResult(malformedRequest());
  const cleared = await adminOnBehalf.clearSlot(
    input.positionId,
    onBehalfOfParent(input.parentId),
    "admin-cancelled",
  );
  return toActionResult(cleared.ok ? ok(undefined) : cleared);
};
