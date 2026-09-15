// 03 §9.3 Stage — call (4): `call-layer`, all three call types; no `callId` (fix: A-4).
import { z } from "zod";
import { ENUMS } from "@/modules/shared-types";
import { PROPS_PARTS as P } from "../lib/props-parts";

const call = {
  positionId: P.id.optional(),
  bookingId: P.id.optional(),
  type: z.enum(ENUMS.call_type),
  /** `null` = cleared, with `reason` (fix: A-27) */
  slotAt: P.instant.nullable().optional(),
  reason: z.enum(["cancelled", "no-answer"]).optional(),
  previousSlotAt: P.instant.optional(),
  displaced: z.boolean().optional(),
};

export const CALL_EVENT_SCHEMAS = Object.freeze({
  "call.requested": P.props(call),
  "call.slot-chosen": P.props(call),
  "call.rescheduled": P.props(call),
  "call.done": P.props({ ...call, outcome: z.enum(ENUMS.call_outcome) }),
});
