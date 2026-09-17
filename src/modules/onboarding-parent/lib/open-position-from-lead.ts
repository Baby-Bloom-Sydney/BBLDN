// 04 §3.1 step 5–6 (path B) — the one-go signup converts the wizard's lead into an `OPEN` position through the
// stage model (03 §2.4 P-2: `∅ → OPEN`, mover `signup-convert-lead`), then runs `matching.autofire` after the
// commit (03 §7.4; 01 §2.3 row). The P-2 slice is `1e`'s: until it registers, `advance` answers INTERNAL
// `E_SLICE_NOT_REGISTERED` and the caller routes the parent to S-P-03 state 0 instead of the call page — the
// account stands, nothing is faked. A failed autofire never fails the signup (the wave sweep re-fires).
import { log, newId } from "@/modules/platform";
import { advance } from "@/modules/positions";
import { matching } from "@/modules/matching";
import type { Actor, LeadId, PositionId, Result } from "@/modules/shared-types";

export async function openPositionFromLead(
  leadId: LeadId,
  actor: Actor,
): Promise<Result<PositionId>> {
  const positionId = newId<PositionId>();
  const opened = await advance({
    entity: { kind: "position", id: positionId },
    transition: "P-2",
    actor,
    payload: { leadId },
    expectedFrom: null,
    idempotencyKey: `signup-convert-lead:${leadId}`,
  });
  if (!opened.ok) return opened;
  const fired = await matching.autofire(positionId, actor);
  if (!fired.ok)
    log.warn("autofire after signup failed", {
      module: "onboarding-parent",
      action: "openPositionFromLead",
      cause: fired.error,
    });
  return { ok: true, value: positionId };
}
