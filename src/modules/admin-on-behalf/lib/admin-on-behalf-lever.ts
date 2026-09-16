// The delegating lever set: refuse anything that is not an admin actor, otherwise pass the call to the module
// that owns the move (01 §2.2's reading of the admin edges; R2). `stubAdminOnBehalf` is this, and the real inside
// will be this **plus** the `auth.requireRole('admin')` + `mfaVerified` gate (07 §5.4 row 2) that ADR-117 Tier A
// puts behind a security review — which is why the gate is absent here rather than approximated.
import { advance as stageAdvance, positions } from "@/modules/positions";
import { callLayer } from "@/modules/call-layer";
import { matching } from "@/modules/matching";
import { err } from "@/modules/platform";
import type { Actor } from "@/modules/shared-types";
import type { AdminOnBehalf } from "../types";

const FORBIDDEN = err("FORBIDDEN", "Not an admin actor", {
  reason: "E_ACTOR_FORBIDDEN" as const,
  which: "mover",
});

const isAdmin = (actor: Actor): boolean => actor.kind === "admin";

export function adminOnBehalfLever(): AdminOnBehalf {
  return Object.freeze({
    advance: async (input) =>
      isAdmin(input.actor) ? stageAdvance(input) : FORBIDDEN,
    listAllowed: async (entity, actor) =>
      isAdmin(actor) ? positions.listAllowed(entity, actor) : Object.freeze([]),
    chooseSlot: async (positionId, slotId, holdId, actor, idempotencyKey) =>
      isAdmin(actor)
        ? callLayer.chooseSlot(
            positionId,
            slotId,
            holdId,
            actor,
            idempotencyKey,
          )
        : FORBIDDEN,
    moveSlot: async (ref, slotId, actor) =>
      isAdmin(actor) ? callLayer.moveSlot(ref, slotId, actor) : FORBIDDEN,
    clearSlot: async (positionId, actor, reason) =>
      isAdmin(actor)
        ? callLayer.clearSlot(positionId, actor, reason)
        : FORBIDDEN,
    recordOutcome: async (ref, outcome, notes, actor) =>
      isAdmin(actor)
        ? callLayer.recordOutcome(ref, outcome, notes, actor)
        : FORBIDDEN,
    bookNannyCall: async (input) =>
      isAdmin(input.actor) ? callLayer.openNannyCall(input) : FORBIDDEN,
    autofire: async (positionId, actor) =>
      isAdmin(actor) ? matching.autofire(positionId, actor) : FORBIDDEN,
  });
}
