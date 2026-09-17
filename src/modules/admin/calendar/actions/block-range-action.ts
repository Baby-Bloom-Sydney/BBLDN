"use server";
// S-A-03 "open / block / unblock" — the block half (04 §6.4; ADR-077).
//
// **A block never cancels a booking.** `scheduling.block` flags every active booking the range covers
// (`needs_attention` + `blocked-over`) and hands them back; this action reports how many now need the admin's
// hand, and S-A-04 is where each is moved or cleared (I-4). The count is the whole point of the return value:
// an admin who blocks a morning must learn immediately that two families are inside it.
//
// Authority is `scheduling`'s own `requireRole('admin')`, read from the session (03 §3.6; 07 §5.4 rows 1–2).
import { scheduling } from "@/modules/scheduling";
import { ok, toActionResult } from "@/modules/platform";
import type { Actor, AdminId } from "@/modules/shared-types";
import { malformedRequest } from "../../lib/malformed-request";
import type { BlockRangeAction } from "../types";

/** The connector asks for an `Actor`; `scheduling` ignores it for authority and reads the session instead. */
const SESSION_ADMIN: Actor = Object.freeze({
  kind: "admin",
  id: "session" as AdminId,
});

export const blockRangeAction: BlockRangeAction = async (input) => {
  // The boundary, before the range reaches the calendar (security review, MEDIUM). A start that is not before
  // its end is refused here rather than by a CHECK constraint, so the admin gets a sentence, not a 500.
  if (
    typeof input?.start !== "string" ||
    typeof input?.end !== "string" ||
    typeof input?.reason !== "string" ||
    input.reason.trim() === "" ||
    !(input.start < input.end)
  )
    return toActionResult(malformedRequest());
  const blocked = await scheduling.block(
    { start: input.start, end: input.end },
    input.reason,
    SESSION_ADMIN,
  );
  return toActionResult(
    blocked.ok ? ok({ affected: blocked.value.affected.length }) : blocked,
  );
};
