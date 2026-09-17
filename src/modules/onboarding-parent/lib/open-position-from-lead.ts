// 04 §3.1 step 5–6 (path B) — the one-go signup converts the wizard's lead into an `OPEN` position through the
// stage model (03 §2.4 P-2: `∅ → OPEN`, mover `signup-convert-lead`), whose own cascade opens the call the
// parent lands on (C-a, 04 §3.3 trigger a), and then runs `matching.autofire` after the commit (03 §7.4).
//
// **The caller assembles the payload; `positions` reads no lead.** `parent_leads` is `matching`'s table
// (02 §4.7) and `positions` has no arrow to `matching` (01 §2.3; fix: A-1 / R2), so the lead is read here —
// where both arrows exist — and handed over as facts. A lead with no area (or an age label config does not
// know) cannot make a position: that is a refusal, not a guessed district.
//
// A failed autofire never fails the signup (§7.4 — the `dfy-waves` sweep re-fires); a failed P-2 never fails the
// signup either — the account stands and the parent routes to S-P-03 state 0, which is path C's own rule.
import { err, log, newId, ok } from "@/modules/platform";
import { advance } from "@/modules/positions";
import { matching, positionDetailOf } from "@/modules/matching";
import type {
  Actor,
  LeadId,
  ParentId,
  PositionId,
  Result,
} from "@/modules/shared-types";
import type { ParentSignupInput } from "../types";

export async function openPositionFromLead(
  leadId: LeadId,
  actor: Actor,
  parent: Pick<ParentSignupInput, "email" | "firstName" | "mobile">,
): Promise<Result<PositionId>> {
  const lead = await matching.getLead(leadId);
  if (!lead.ok) return lead;
  if (lead.value === null)
    return err("NOT_FOUND", "That lead is no longer available", {
      reason: "E_ENTITY_NOT_FOUND" as const,
    });
  const detail = positionDetailOf(lead.value.answers);
  if (detail === null)
    return err("VALIDATION", "The answers do not make a position yet", {
      reason: "E_PAYLOAD_INVALID" as const,
      which: "area",
    });

  const positionId = newId<PositionId>();
  const opened = await advance({
    entity: { kind: "position", id: positionId },
    transition: "P-2",
    actor,
    payload: {
      parentId: actor.id as string as ParentId,
      source: "results_signup",
      detail,
      recipient: { email: parent.email, name: parent.firstName },
      mobile: parent.mobile,
      leadId,
    },
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
  return ok(positionId);
}
