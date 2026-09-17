// 01 §4d, the whole gate as one pure function so it is readable, testable and cannot drift between the middleware
// and any server-side re-check. Input: the path and the session the cookie rotation produced. Output: allow, or
// the one place to send the person.
import type { GateDecision, GateInput } from "../types";
import { ROUTE_MAP } from "./route-map";
import { isAuthGroupPath } from "./is-auth-group-path";
import { loginRedirectUrl } from "./login-redirect-url";
import { requiredRoleForPath } from "./required-role-for-path";
import { roleDashboardPath } from "./role-dashboard-path";

const allow: GateDecision = Object.freeze({ kind: "allow" });
const go = (to: string): GateDecision =>
  Object.freeze({ kind: "redirect", to });

export function gateDecision(input: GateInput): GateDecision {
  const { pathname, search = "", session } = input;
  const required = requiredRoleForPath(pathname);

  // Step 2, signed out. A failed session read arrives here as `null` too — "we could not tell" is refused, not
  // waved through (Sydney's middleware skipped the gate when Supabase was unreachable; that is not carried).
  if (session === null)
    return required === null ? allow : go(loginRedirectUrl(pathname, search));

  // Step 3. ADR-042: an account that has never set a password goes to set-password from anywhere, never an error.
  if (session.needsPasswordSetup)
    return pathname === ROUTE_MAP.setPasswordPath
      ? allow
      : go(ROUTE_MAP.setPasswordPath);

  // 07 §5.4 row 2: an `aal1` admin is not an admin for routing. There is no enrol / verify screen before the admin
  // panels land, so the gate falls back to login — and deliberately leaves the `(auth)` group reachable below, so
  // this can never become a redirect loop.
  const needsMfa = session.role === "admin" && !session.mfaVerified;

  if (required !== null) {
    if (needsMfa) return go(loginRedirectUrl(pathname, search));
    return session.role === required
      ? allow
      : go(roleDashboardPath(session.role));
  }

  // The recovery exception (ADR-132; 04 §6.1 S-X-09). `/reset-password` is in the `(auth)` group, which the next
  // rule makes signed-out only — and a recovery link arrives *with* a session, so without this the one screen the
  // link exists to reach is the one screen it can never reach. Exactly one path, exactly one session class: a
  // session that did not come from a recovery link falls through and is bounced as before, and a recovery session
  // anywhere else is judged by the ordinary rules above and below (all of it pinned in
  // `__tests__/auth.password-recovery.test.ts`). It is placed after step 3, so an account with no password is
  // still sent to set-password rather than to a screen that would ask it to confirm a password it does not have.
  if (session.isRecovery && pathname === ROUTE_MAP.resetPasswordPath)
    return allow;

  // Step 3, first half: the `(auth)` group is signed-out only.
  if (isAuthGroupPath(pathname))
    return needsMfa ? allow : go(roleDashboardPath(session.role));

  return allow;
}
