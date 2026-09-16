// The `admin-on-behalf` stub — every lever refuses a non-admin actor and otherwise delegates to the connector
// that owns the move. That is the whole shape of this module (P-1, ADR-001: the same transition, with
// `actor.kind = 'admin'`), and it is what the admin panels can be built against today.
//
// **It is not the real inside.** The real one begins with `auth.requireRole('admin')` and the `mfaVerified`
// check of 07 §5.4 row 2 — a security-reviewed surface this unit does not write (ADR-117 Tier A). The stub's
// actor check is a shape, not a gate: it trusts the `Actor` it is handed.
import { adminOnBehalfLever } from "./lib/admin-on-behalf-lever";
import type { AdminOnBehalf } from "./types";

export function stubAdminOnBehalf(): AdminOnBehalf {
  return adminOnBehalfLever();
}
