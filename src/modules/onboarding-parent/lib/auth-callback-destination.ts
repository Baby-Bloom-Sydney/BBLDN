// `03.06` — the auth callback (ADR-042): exchange the code through `auth.handleAuthCallback`, then send the person
// to the safe `next=` path or their own dashboard; a code that cannot be exchanged goes back to S-X-08. The
// `user_profiles.email` re-sync 02 C-8 names lives inside `auth`'s callback (its file says so), not here.
import { auth, roleDashboardPath } from "@/modules/auth";
import { ROUTE_MAP } from "@/modules/auth";
import { safeNextPath } from "./safe-next-path";

export async function authCallbackDestination(
  code: string | null,
  next: string | null,
): Promise<string> {
  if (code === null || code === "") return ROUTE_MAP.loginPath;
  const session = await auth.handleAuthCallback(code);
  if (!session.ok) return ROUTE_MAP.loginPath;
  return safeNextPath(next) ?? roleDashboardPath(session.value.role);
}
