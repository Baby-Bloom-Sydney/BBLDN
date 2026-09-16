// The gate binding every app surface calls (01 §2.3 row `access-gate`). It is a **derivation**, not a store: it
// reads `payments.getAccess` and applies `decideAccess`. `setAccess` is a straight re-export of
// `payments.setAccess` for S-A-10 — the admin-only check and the `access.toggled` event live there, so there is
// exactly one place that can flip a family's access (ADR-093; fix: offer-4).
//
// Fails closed by construction: when `payments` is unconfigured, `getAccess` is `INTERNAL` and this returns the
// same error — never a defaulted "open".
import { payments } from "@/modules/payments";
import { nowInstant } from "@/modules/platform";
import type { FamilyId, Instant } from "@/modules/shared-types";
import type { AccessDecision, AccessGateResult } from "../types";
import { decideAccess } from "./decide-access";

export const accessGate = Object.freeze({
  /** S-P-10 / 11 / 12 / 13, the rail and every `app` surface ask this one question. */
  async hasAccess(
    familyId: FamilyId,
    now?: Instant,
  ): Promise<AccessGateResult<AccessDecision>> {
    const state = await payments.getAccess(familyId);
    if (!state.ok) return state;
    return { ok: true, value: decideAccess(state.value, now ?? nowInstant()) };
  },

  /** S-A-10's "access on / off" — `payments.setAccess` under `auth.requireRole('admin')` (03 §5.4.6). */
  setAccess: payments.setAccess,
});
