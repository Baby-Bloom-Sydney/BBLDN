// Wraps an `AdminOnBehalf` inside so that **every** lever passes the admin gate before it runs (FIX-1;
// REVIEW-1 C-1, `docs/review-sweep-160926.md` §2).
//
// The gate lives on the seam, not in the value. REVIEW-1's finding was not that the lever set was wrong but
// that `configureAdminOnBehalf` accepted any `AdminOnBehalf`-shaped object with no compile-time signal that it
// had to be wrapped first — one line in a boot file (`configureAdminOnBehalf(stubAdminOnBehalf())`) would have
// granted full on-behalf stage-advance, call-booking and autofire power to anyone able to shape an `Actor`.
// Putting the gate here, and calling it from `configureAdminOnBehalf`, makes that line safe by construction:
// there is no argument a boot file can pass that reaches a lever ungated. The claim is executable — see
// `__tests__/admin-on-behalf.gate.test.ts`, "the seam carries the gate" (ADR-120).
//
// Gating is idempotent: an inside that is already gated is returned unchanged, so a stub that gates itself and
// a boot file that gates again cost one session read, not two.
import { gatedCall } from "./gated-call";
import { gatedAdminActor } from "./gated-admin-actor";
import type { AdminOnBehalf } from "../types";

const GATED = new WeakSet<AdminOnBehalf>();

export function gateAdminOnBehalf(inside: AdminOnBehalf): AdminOnBehalf {
  if (GATED.has(inside)) return inside;

  const gated: AdminOnBehalf = Object.freeze({
    advance: (input) =>
      gatedCall(input.actor, (actor) => inside.advance({ ...input, actor })),
    // 03 §2.5 gives `listAllowed` no `Result`, so a refused caller is offered no levers rather than an error —
    // the closed answer, which is what every other unconfigured / forbidden path here returns too.
    listAllowed: async (entity, supplied) => {
      const actor = await gatedAdminActor(supplied);
      return actor.ok ? inside.listAllowed(entity, actor.value) : [];
    },
    chooseSlot: (positionId, slotId, holdId, supplied, idempotencyKey) =>
      gatedCall(supplied, (actor) =>
        inside.chooseSlot(positionId, slotId, holdId, actor, idempotencyKey),
      ),
    moveSlot: (ref, slotId, supplied) =>
      gatedCall(supplied, (actor) => inside.moveSlot(ref, slotId, actor)),
    clearSlot: (positionId, supplied, reason) =>
      gatedCall(supplied, (actor) =>
        inside.clearSlot(positionId, actor, reason),
      ),
    recordOutcome: (ref, outcome, notes, supplied) =>
      gatedCall(supplied, (actor) =>
        inside.recordOutcome(ref, outcome, notes, actor),
      ),
    bookNannyCall: (input) =>
      gatedCall(input.actor, (actor) =>
        inside.bookNannyCall({ ...input, actor }),
      ),
    autofire: (positionId, supplied) =>
      gatedCall(supplied, (actor) => inside.autofire(positionId, actor)),
  });

  GATED.add(gated);
  return gated;
}
