// Supabase's user → the `DriverUser` the module is written against (no `@supabase/*` type crosses the seam).
// `getUser()` is the validated read (it asks the auth server); `getSession()` is used only for the expiry stamp
// and the assurance level, both of which are local claims on an already-validated session.
import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "@/modules/platform";
import type { DriverUser } from "../types";
import { isMissingSessionError } from "./is-missing-session-error";

/** ADR-042: an account created without a password has no `email` identity to sign in with. */
const EMAIL_IDENTITY = "email";

/** The provider's `amr` entry for a session created by a password-recovery link (04 §6.1 S-X-09). */
const RECOVERY_METHOD = "recovery";

type Assurance = { readonly aal: string | null; readonly isRecovery: boolean };

const readAssurance = async (client: SupabaseClient): Promise<Assurance> => {
  try {
    const { data } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    return {
      aal: data?.currentLevel ?? null,
      // The SDK types an entry as either the bare method name or `{ method }`; both are read, because a shape
      // this module did not expect must not silently answer "not a recovery session".
      isRecovery: (data?.currentAuthenticationMethods ?? []).some((entry) =>
        typeof entry === "string"
          ? entry === RECOVERY_METHOD
          : entry.method === RECOVERY_METHOD,
      ),
    };
  } catch (thrown) {
    // An assurance level we cannot read is not an assurance level: `mfaVerified` stays false and `requireRole`
    // refuses `admin`. Fail closed — but say so, or an MFA outage is indistinguishable from a room full of admins
    // who never enrolled (07 §5.4 row 2).
    log.warn("could not read the assurance level; failing closed", {
      module: "auth",
      action: "readAssurance",
      cause: thrown,
    });
    // Fail closed on both halves: no assurance level and no recovery claim. A session we cannot read is not
    // handed the `/reset-password` exception either — it is simply an ordinary session (01 §4d).
    return { aal: null, isRecovery: false };
  }
};

export async function readDriverUser(
  client: SupabaseClient,
): Promise<DriverUser | null> {
  const { data, error } = await client.auth.getUser();
  const user = data?.user;
  if (error !== null && error !== undefined) {
    // 4xx = there is no valid session; anything else = we could not tell, which the port turns into INTERNAL.
    if (!isMissingSessionError(error)) throw error;
    return null;
  }
  if (user === undefined || user === null) return null;
  const { data: sessionData } = await client.auth.getSession();
  const assurance = await readAssurance(client);
  return {
    id: user.id,
    email: user.email ?? null,
    hasPassword: (user.identities ?? []).some(
      (identity) => identity.provider === EMAIL_IDENTITY,
    ),
    aal: assurance.aal,
    isRecovery: assurance.isRecovery,
    expiresAtEpochSeconds: sessionData?.session?.expires_at ?? null,
  };
}
