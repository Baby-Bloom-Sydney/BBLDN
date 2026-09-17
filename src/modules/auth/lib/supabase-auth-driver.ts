// The real `AuthDriver` over `@supabase/ssr` — the only place in `auth` that touches the SDK, and (03 §11 row 9)
// the only place in the repo's module tree that may import `@supabase/*`. Every client is built **inside** the
// call that needs it, and `next/headers` and the service-role client are reached by dynamic import, so the edge
// middleware bundle carries neither.
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";
import { publicEnv } from "@/modules/config";
import { log } from "@/modules/platform";
import type { Query } from "@/modules/shared-types";
import type {
  AppDatabase,
  AuthDriver,
  DataScope,
  DriverUser,
  Role,
  SignInInput,
  SignUpInput,
  StorageRef,
} from "../types";
import { readDriverUser } from "./read-driver-user";
import { toRole } from "./to-role";
import { supabaseQuery } from "./supabase-query";

const URL_NAME = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Next refuses a cookie write inside a Server Component; that one case is expected, anything else is not. */
const READ_ONLY_COOKIE_STORE = "read-only-cookie-store";
const isReadOnlyRefusal = (thrown: unknown): boolean =>
  thrown instanceof Error &&
  /can only be modified|read-?only/i.test(thrown.message);

/** The RSC cookie jar: writes are refused inside a Server Component, where middleware has already refreshed. */
const serverClient = async (): Promise<SupabaseClient> => {
  const { cookies } = await import("next/headers");
  const store = cookies();
  return createServerClient(URL_NAME, ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list)
            store.set(name, value, options);
        } catch (thrown) {
          // `debug` is dropped in production, so a genuine rotation bug would leave no trace at all: warn, and
          // only claim the benign reason when the error actually is Next's read-only refusal.
          log.warn("session cookie write failed", {
            module: "auth",
            action: "serverClient",
            ...(isReadOnlyRefusal(thrown)
              ? { reason: READ_ONLY_COOKIE_STORE, expected: true }
              : { cause: thrown }),
          });
        }
      },
    },
  });
};

const requestClient = (req: NextRequest, res: NextResponse): SupabaseClient =>
  createServerClient(URL_NAME, ANON_KEY, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value, options } of list)
          res.cookies.set(name, value, options);
      },
    },
  });

const elevated = async (): Promise<SupabaseClient> =>
  (await import("./elevated-client")).elevatedClient();

/**
 * The credential calls report `aal1`: Supabase has no MFA-challenge-during-sign-in path wired here, so a session
 * that has just been created has not passed a second factor. It is never the value the gate reads — `requireRole`
 * and `gateDecision` always re-derive from `getSession` / `refreshSession`, which read the real assurance level.
 * **If MFA at sign-in is ever added, this hardcode must go**, or an `aal2` session would under-report as `aal1`.
 */
const unwrapUser = (
  user: { id: string; email?: string } | null,
  session: { expires_at?: number } | null,
  hasPassword: boolean,
): DriverUser => {
  if (user === null) throw new Error("no user on the provider response");
  return {
    id: user.id,
    email: user.email ?? null,
    hasPassword,
    aal: "aal1",
    expiresAtEpochSeconds: session?.expires_at ?? null,
  };
};

export function supabaseAuthDriver(): AuthDriver<AppDatabase> {
  const clientFor = async (scope: DataScope): Promise<SupabaseClient> =>
    scope === "service" ? elevated() : serverClient();

  const roleOf = async (userId: string): Promise<Role | null> => {
    const { data, error } = await (await serverClient())
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (error !== null) throw new Error(error.message);
    return toRole(data?.role);
  };

  return Object.freeze({
    currentUser: async () => readDriverUser(await serverClient()),
    refresh: async (req: NextRequest, res: NextResponse) =>
      readDriverUser(requestClient(req, res)),
    roleOf,
    signInWithPassword: async (input: SignInInput) => {
      const { data, error } = await (
        await serverClient()
      ).auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });
      if (error !== null) throw new Error(error.message);
      return unwrapUser(data.user, data.session, true);
    },
    signUpWithPassword: async (input: SignUpInput) => {
      const { data, error } = await (
        await serverClient()
      ).auth.signUp({
        email: input.email,
        password: input.password,
        ...(input.emailRedirectTo === undefined
          ? {}
          : { options: { emailRedirectTo: input.emailRedirectTo } }),
      });
      if (error !== null) throw new Error(error.message);
      return unwrapUser(data.user, data.session, true);
    },
    signOut: async () => {
      const { error } = await (await serverClient()).auth.signOut();
      if (error !== null) throw new Error(error.message);
    },
    updatePassword: async (newPassword: string) => {
      const { error } = await (
        await serverClient()
      ).auth.updateUser({ password: newPassword });
      if (error !== null) throw new Error(error.message);
    },
    // ADR-132 / 07 §4: GoTrue answers this the same way for an address it knows and one it does not, so the
    // no-enumeration property is the provider's, not a rule this module re-implements over a user lookup. The
    // email itself is Supabase's own Recovery template (`08.05`, dashboard-configured) — see the module README.
    sendRecoveryEmail: async (email: string, redirectTo: string) => {
      const { error } = await (
        await serverClient()
      ).auth.resetPasswordForEmail(email, { redirectTo });
      if (error !== null) throw new Error(error.message);
    },
    exchangeCodeForSession: async (code: string) => {
      const { data, error } = await (
        await serverClient()
      ).auth.exchangeCodeForSession(code);
      if (error !== null) throw new Error(error.message);
      return unwrapUser(data.user, data.session, true);
    },
    // Named service-role use (module README): `user_roles` has no client INSERT or UPDATE policy (02 §4.1).
    writeRole: async (userId: string, role: Role) => {
      const { error } = await (await elevated())
        .from("user_roles")
        .upsert({ user_id: userId, role }, { onConflict: "user_id" });
      if (error !== null) throw new Error(error.message);
    },
    query: (scope: DataScope): Query<AppDatabase> =>
      supabaseQuery(() => clientFor(scope)),
    // Signed URLs bypass RLS by design (07 §5.3 rule 2 — the buckets have no user SELECT policy), so the minter
    // is service-scoped; `DataAccessPort.signUrl` is the one caller and it validates bucket, path and TTL first.
    createSignedUrl: async (ref: StorageRef, ttlSeconds: number) => {
      const { data, error } = await (await elevated()).storage
        .from(ref.bucket)
        .createSignedUrl(ref.path, ttlSeconds);
      if (error !== null) throw new Error(error.message);
      return data.signedUrl;
    },
  });
}
