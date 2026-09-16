// Supabase's user → the `DriverUser` the module is written against (no `@supabase/*` type crosses the seam).
// `getUser()` is the validated read (it asks the auth server); `getSession()` is used only for the expiry stamp
// and the assurance level, both of which are local claims on an already-validated session.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DriverUser } from "../types";

/** ADR-042: an account created without a password has no `email` identity to sign in with. */
const EMAIL_IDENTITY = "email";

const readAal = async (client: SupabaseClient): Promise<string | null> => {
  try {
    const { data } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    return data?.currentLevel ?? null;
  } catch {
    // An assurance level we cannot read is not an assurance level: `mfaVerified` stays false and `requireRole`
    // refuses `admin`. Fail closed, and never throw out of a session read.
    return null;
  }
};

export async function readDriverUser(
  client: SupabaseClient,
): Promise<DriverUser | null> {
  const { data, error } = await client.auth.getUser();
  const user = data?.user;
  if (error !== null || user === undefined || user === null) return null;
  const { data: sessionData } = await client.auth.getSession();
  return {
    id: user.id,
    email: user.email ?? null,
    hasPassword: (user.identities ?? []).some(
      (identity) => identity.provider === EMAIL_IDENTITY,
    ),
    aal: await readAal(client),
    expiresAtEpochSeconds: sessionData?.session?.expires_at ?? null,
  };
}
