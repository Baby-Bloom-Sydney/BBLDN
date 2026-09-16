// The `auth` inside (03 §1.4): the connector assembled over one `AuthDriver`. Every method lives in its own file
// (L1) and is curried over the driver, so this file is wiring only — and so `stub-auth` and the Supabase driver
// are the *only* thing that differs between the real module and the swap.
import type { AppDatabase, Auth, AuthDeps, Session } from "../types";
import { createDataAccessPort } from "./create-data-access-port";
import { getCurrentUserIdWith } from "./get-current-user-id";
import { getSessionWith } from "./get-session";
import { grantRoleWith } from "./grant-role";
import { handleAuthCallbackWith } from "./handle-auth-callback";
import { isAdminRole } from "./is-admin-role";
import { isNannyRole } from "./is-nanny-role";
import { isParentRole } from "./is-parent-role";
import { needsPasswordSetupWith } from "./needs-password-setup";
import { refreshSessionWith } from "./refresh-session";
import { requireRoleWith } from "./require-role";
import { setPasswordWith } from "./set-password";
import { signInWith } from "./sign-in";
import { signOutWith } from "./sign-out";
import { signUpWith } from "./sign-up";

export function createAuth(deps: AuthDeps<AppDatabase>): Auth<AppDatabase> {
  const { driver } = deps;
  const getSession = getSessionWith(driver);
  return Object.freeze({
    getSession,
    requireRole: requireRoleWith(getSession),
    getCurrentUserId: getCurrentUserIdWith(driver),
    data: createDataAccessPort(driver),
    refreshSession: refreshSessionWith(driver),
    needsPasswordSetup: needsPasswordSetupWith(driver),
    signUp: signUpWith(driver),
    signIn: signInWith(driver),
    signOut: signOutWith(driver),
    setPassword: setPasswordWith(driver, getSession),
    handleAuthCallback: handleAuthCallbackWith(driver),
    grantRole: grantRoleWith(driver),
    isParent: (s: Session) => isParentRole(s.role),
    isNanny: (s: Session) => isNannyRole(s.role),
    isAdmin: (s: Session) => isAdminRole(s.role),
  });
}
