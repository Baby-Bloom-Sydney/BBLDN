"use server";
// S-P-05's one lever (04 §6.2 "close"; 03 §2.4 P-7). The signed-in parent closes her own position: the role
// gate resolves the actor (never a caller-supplied id), `advance` checks that she is party to it, and P-7's own
// cascade closes the open call (C-4). A parent chooses only her own reason — `parent_closed`; `no_candidates`
// is the sweep's and `admin_closed` the matchmaker's.
import { auth } from "@/modules/auth";
import { toActionResult } from "@/modules/platform";
import type { ClientResult } from "@/modules/platform";
import type { PositionId, PositionStage } from "@/modules/shared-types";
import { advance } from "../lib/advance";

export async function closePositionAction(input: {
  readonly positionId: PositionId;
  readonly expectedFrom: PositionStage;
}): Promise<ClientResult<void>> {
  const session = await auth.requireRole("parent");
  if (!session.ok) return toActionResult(session);
  const closed = await advance({
    entity: { kind: "position", id: input.positionId },
    transition: "P-7",
    actor: { kind: "user", id: session.value.userId, role: "parent" },
    payload: { closeReason: "parent_closed" },
    expectedFrom: input.expectedFrom,
    idempotencyKey: `parent-close:${input.positionId}`,
  });
  return toActionResult(closed.ok ? { ok: true, value: undefined } : closed);
}
