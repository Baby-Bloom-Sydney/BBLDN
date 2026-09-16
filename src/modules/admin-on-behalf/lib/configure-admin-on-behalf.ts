// Boot hook: installs the inside the module-level `adminOnBehalf` binding delegates to — **through the gate**.
//
// The wrap is not optional and not the caller's to remember (FIX-1; REVIEW-1 C-1). Whatever inside a boot file
// hands in, every lever reached through `adminOnBehalf` first passes `auth.requireRole('admin')` with
// `mfaVerified` (07 §5.4 rows 1–2) and runs with an actor built from the session. There is no argument that
// configures this module into a live, ungated state.
import type { AdminOnBehalf } from "../types";
import { ADMIN_ON_BEHALF_REGISTRY } from "./admin-on-behalf-registry";
import { gateAdminOnBehalf } from "./gate-admin-on-behalf";

export function configureAdminOnBehalf(inside: AdminOnBehalf): void {
  ADMIN_ON_BEHALF_REGISTRY.set(gateAdminOnBehalf(inside));
}
