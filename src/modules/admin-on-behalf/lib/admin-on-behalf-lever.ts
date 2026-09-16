// The delegating lever set: pass each call to the module that owns the move (01 §2.2's reading of the admin
// edges; R2) and return its result unchanged. That forwarding *is* the module — P-1 (ADR-001): an on-behalf
// move is the same move, so a lever that invented its own answer would be a second stage model.
//
// **There is no role check in this file, deliberately** (FIX-1; REVIEW-1 C-1). It used to hold
// `actor.kind === 'admin'` — a test on a field the caller handed in, with no `mfaVerified` — which read like a
// gate and was not one. Authority now has exactly one home: `gated-admin-actor.ts`, over
// `auth.requireRole('admin')` (07 §5.4 rows 1–2), applied to every lever by `gateAdminOnBehalf` at the
// `configureAdminOnBehalf` seam. By the time a call reaches the functions below its actor is session-derived
// and carries the required `onBehalfOf`, so re-testing it here would add a second, weaker answer to a question
// already settled.
import { advance as stageAdvance, positions } from "@/modules/positions";
import { callLayer } from "@/modules/call-layer";
import { matching } from "@/modules/matching";
import type { AdminOnBehalf } from "../types";

export function adminOnBehalfLever(): AdminOnBehalf {
  return Object.freeze({
    advance: (input) => stageAdvance(input),
    listAllowed: (entity, actor) => positions.listAllowed(entity, actor),
    chooseSlot: (positionId, slotId, holdId, actor, idempotencyKey) =>
      callLayer.chooseSlot(positionId, slotId, holdId, actor, idempotencyKey),
    moveSlot: (ref, slotId, actor) => callLayer.moveSlot(ref, slotId, actor),
    clearSlot: (positionId, actor, reason) =>
      callLayer.clearSlot(positionId, actor, reason),
    recordOutcome: (ref, outcome, notes, actor) =>
      callLayer.recordOutcome(ref, outcome, notes, actor),
    bookNannyCall: (input) => callLayer.openNannyCall(input),
    autofire: (positionId, actor) => matching.autofire(positionId, actor),
  });
}
