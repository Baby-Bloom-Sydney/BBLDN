// A provider identity + its `user_roles` row → the `Session` of 03 §1.4. `null` when there is no role row: a
// `Session` carries a role by definition, so an authenticated principal that is not a known actor is *not* a
// session — the gate then treats it as signed out (fail closed) rather than guessing a role.
import type { Instant, UserId } from "@/modules/shared-types";
import type { DriverUser, GateSession, Role } from "../types";

/** Supabase's assurance level for a session that has passed a second factor (07 §5.4 row 2). */
const MFA_ASSURANCE_LEVEL = "aal2";
const MILLISECONDS_PER_SECOND = 1000;

export function toSession(
  user: DriverUser | null,
  role: Role | null,
): GateSession | null {
  if (user === null || role === null) return null;
  const expiresAt = (
    user.expiresAtEpochSeconds === null
      ? new Date(0)
      : new Date(user.expiresAtEpochSeconds * MILLISECONDS_PER_SECOND)
  ).toISOString() as Instant;
  return Object.freeze({
    userId: user.id as UserId,
    role,
    mfaVerified: user.aal === MFA_ASSURANCE_LEVEL,
    expiresAt,
    needsPasswordSetup: !user.hasPassword,
    isRecovery: user.isRecovery,
  });
}
