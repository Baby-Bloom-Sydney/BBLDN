// The `admin-on-behalf` stub — the gate in front of the delegating lever set. That is the whole shape of this
// module (P-1, ADR-001: the same transition, with `actor.kind = 'admin'` and `onBehalfOf` on the event), and it
// is what the admin panels can be built against today.
//
// **The gate is real, and it is the same gate the boot file gets** (FIX-1; REVIEW-1 C-1): every lever passes
// `auth.requireRole('admin')`, which enforces `mfaVerified` / `aal2` (07 §5.4 rows 1–2), and then runs with an
// actor derived from the session. Gating here as well as in `configureAdminOnBehalf` is what makes the stub
// safe to hold directly rather than only behind the module binding — `gateAdminOnBehalf` is idempotent, so
// wrapping it twice costs nothing.
//
// What is still a stub is the *inside*: the levers forward to whatever `positions` / `call-layer` / `matching`
// bindings are configured, and none of them writes a real stage yet (Phase 1e–1g).
import { adminOnBehalfLever } from "./lib/admin-on-behalf-lever";
import { gateAdminOnBehalf } from "./lib/gate-admin-on-behalf";
import type { AdminOnBehalf } from "./types";

export function stubAdminOnBehalf(): AdminOnBehalf {
  return gateAdminOnBehalf(adminOnBehalfLever());
}
