// The `auth` contract (03 §1.4), written once and run twice — against the real inside (`createAuth` over a driver
// double) and against `stub-auth` (05 §3 rule 2). A behaviour the stub cannot honour is a connector defect.
import { describe, expect, it } from "vitest";
import { createAuth, stubAuth } from "..";
import type { Auth, Role, Session } from "../types";
import type { Actor, Email, UserId } from "@/modules/shared-types";
import { aDriverUser, fakeDriver } from "./fixtures/fake-driver";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "22222222-2222-4222-8222-222222222222";
const EMAIL = "parent@example.test" as Email;
const PASSWORD = "a-long-enough-password";

type Seed = {
  readonly signedIn?: {
    readonly userId?: string;
    readonly role?: Role | null;
    readonly hasPassword?: boolean;
    readonly mfaVerified?: boolean;
  };
};

const realInside = (seed: Seed): Auth => {
  const signedIn = seed.signedIn;
  const { driver } = fakeDriver({
    user:
      signedIn === undefined
        ? null
        : aDriverUser({
            id: signedIn.userId ?? USER_ID,
            hasPassword: signedIn.hasPassword ?? true,
            aal: (signedIn.mfaVerified ?? false) ? "aal2" : "aal1",
          }),
    role: signedIn?.role === undefined ? "parent" : signedIn.role,
  });
  return createAuth({ driver });
};

const stubInside = (seed: Seed): Auth => {
  const signedIn = seed.signedIn;
  if (signedIn === undefined) return stubAuth();
  const id = signedIn.userId ?? USER_ID;
  const role = signedIn.role === undefined ? "parent" : signedIn.role;
  return stubAuth({
    users: [
      {
        id,
        email: EMAIL,
        ...((signedIn.hasPassword ?? true) ? { password: PASSWORD } : {}),
        ...(role === null ? {} : { role }),
        mfaVerified: signedIn.mfaVerified ?? false,
      },
    ],
    signedInUserId: id,
  });
};

const implementations: ReadonlyArray<
  readonly [name: string, make: (seed: Seed) => Auth]
> = [
  ["real inside", realInside],
  ["stub-auth", stubInside],
];

describe.each(implementations)("Auth contract — %s", (_name, make) => {
  describe("getSession (null for anonymous, never throws)", () => {
    it("returns ok(null) with no session", async () => {
      const result = await make({}).getSession();
      expect(result).toEqual({ ok: true, value: null });
    });

    it("returns the session for a signed-in user with a role row", async () => {
      const result = await make({ signedIn: { role: "nanny" } }).getSession();
      expect(result.ok).toBe(true);
      const session = (result as { value: Session }).value;
      expect(session.userId).toBe(USER_ID);
      expect(session.role).toBe("nanny");
      expect(session.mfaVerified).toBe(false);
      expect(session.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("fails closed to ok(null) when the provider knows the user but no role row exists", async () => {
      // A `Session` requires a role; an authenticated principal that is not a known actor is not a session.
      const result = await make({ signedIn: { role: null } }).getSession();
      expect(result).toEqual({ ok: true, value: null });
    });

    it("reports aal2 as mfaVerified (07 §5.4 row 2)", async () => {
      const result = await make({
        signedIn: { role: "admin", mfaVerified: true },
      }).getSession();
      expect((result as { value: Session }).value.mfaVerified).toBe(true);
    });
  });

  describe("requireRole (UNAUTHENTICATED · FORBIDDEN)", () => {
    it("is UNAUTHENTICATED with no session", async () => {
      const result = await make({}).requireRole("parent");
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error.code).toBe("UNAUTHENTICATED");
    });

    it("is FORBIDDEN reason=role for the wrong role", async () => {
      const result = await make({ signedIn: { role: "nanny" } }).requireRole(
        "parent",
      );
      expect(result.ok === false && result.error.code).toBe("FORBIDDEN");
      expect(result.ok === false && result.error.details?.reason).toBe("role");
    });

    it("accepts any role in an array", async () => {
      const result = await make({ signedIn: { role: "nanny" } }).requireRole([
        "parent",
        "nanny",
      ]);
      expect(result.ok).toBe(true);
    });

    it("is FORBIDDEN reason=mfa for an admin without aal2 (07 §5.4 row 2)", async () => {
      const result = await make({
        signedIn: { role: "admin", mfaVerified: false },
      }).requireRole("admin");
      expect(result.ok === false && result.error.code).toBe("FORBIDDEN");
      expect(result.ok === false && result.error.details?.reason).toBe("mfa");
    });

    it("admits an admin with aal2", async () => {
      const result = await make({
        signedIn: { role: "admin", mfaVerified: true },
      }).requireRole("admin");
      expect(result.ok).toBe(true);
    });

    it("never leaks a cause to the caller's error details", async () => {
      const result = await make({ signedIn: { role: "nanny" } }).requireRole(
        "admin",
      );
      expect(result.ok === false && result.error.details).toEqual({
        reason: "role",
      });
    });
  });

  describe("getCurrentUserId", () => {
    it("is null when anonymous", async () => {
      expect(await make({}).getCurrentUserId()).toEqual({
        ok: true,
        value: null,
      });
    });

    it("is the id when signed in", async () => {
      expect(await make({ signedIn: {} }).getCurrentUserId()).toEqual({
        ok: true,
        value: USER_ID,
      });
    });
  });

  describe("needsPasswordSetup (01 §4d step 3, ADR-042)", () => {
    it("is false when anonymous", async () => {
      expect(await make({}).needsPasswordSetup()).toEqual({
        ok: true,
        value: false,
      });
    });

    it("is false for an ordinary password account", async () => {
      expect(
        await make({ signedIn: { hasPassword: true } }).needsPasswordSetup(),
      ).toEqual({ ok: true, value: false });
    });

    it("is true for a signed-in account with no password", async () => {
      expect(
        await make({ signedIn: { hasPassword: false } }).needsPasswordSetup(),
      ).toEqual({ ok: true, value: true });
    });
  });

  describe("signUp (07 §5.4 row 3 — no self-signup path produces admin)", () => {
    it("refuses an admin role at runtime as well as at the type level", async () => {
      const result = await make({}).signUp({
        email: EMAIL,
        password: PASSWORD,
        role: "admin" as never,
      });
      expect(result.ok === false && result.error.code).toBe("FORBIDDEN");
      expect(result.ok === false && result.error.details?.reason).toBe("scope");
    });

    it("refuses a password below the configured minimum length", async () => {
      const result = await make({}).signUp({
        email: EMAIL,
        password: "short",
        role: "parent",
      });
      expect(result.ok === false && result.error.code).toBe("VALIDATION");
    });

    it("creates the session with the role the server was given", async () => {
      const result = await make({}).signUp({
        email: EMAIL,
        password: PASSWORD,
        role: "nanny",
      });
      expect(result.ok).toBe(true);
      expect(result.ok === true && result.value.role).toBe("nanny");
    });
  });

  describe("signIn / signOut", () => {
    it("signs a known user in", async () => {
      const auth = make({ signedIn: { role: "parent" } });
      const result = await auth.signIn({ email: EMAIL, password: PASSWORD });
      expect(result.ok).toBe(true);
      expect(result.ok === true && result.value.role).toBe("parent");
    });

    it("signs out and the session is gone", async () => {
      const auth = make({ signedIn: { role: "parent" } });
      expect(await auth.signOut()).toEqual({ ok: true, value: undefined });
      expect(await auth.getSession()).toEqual({ ok: true, value: null });
    });
  });

  describe("setPassword (ADR-042; 07 §4 password policy)", () => {
    it("is UNAUTHENTICATED with no session", async () => {
      const result = await make({}).setPassword(PASSWORD);
      expect(result.ok === false && result.error.code).toBe("UNAUTHENTICATED");
    });

    it("refuses a password below the configured minimum", async () => {
      const result = await make({ signedIn: {} }).setPassword("short");
      expect(result.ok === false && result.error.code).toBe("VALIDATION");
    });

    it("sets the password and clears needsPasswordSetup", async () => {
      const auth = make({ signedIn: { hasPassword: false } });
      expect(await auth.needsPasswordSetup()).toEqual({
        ok: true,
        value: true,
      });
      expect(await auth.setPassword(PASSWORD)).toEqual({
        ok: true,
        value: undefined,
      });
      expect(await auth.needsPasswordSetup()).toEqual({
        ok: true,
        value: false,
      });
    });
  });

  describe("grantRole (03 §1.4 — admin actor only, logged)", () => {
    const adminActor: Actor = { kind: "admin", id: ADMIN_ID as never };
    const userActor: Actor = {
      kind: "user",
      id: USER_ID as UserId,
      role: "parent",
    };

    it("refuses a non-admin actor with FORBIDDEN reason=scope", async () => {
      const result = await make({ signedIn: {} }).grantRole(
        USER_ID as UserId,
        "nanny",
        userActor,
      );
      expect(result.ok === false && result.error.code).toBe("FORBIDDEN");
      expect(result.ok === false && result.error.details?.reason).toBe("scope");
    });

    it("refuses a system actor too", async () => {
      const result = await make({ signedIn: {} }).grantRole(
        USER_ID as UserId,
        "nanny",
        { kind: "system", id: "retention-sweep" } as Actor,
      );
      expect(result.ok === false && result.error.code).toBe("FORBIDDEN");
    });

    it("grants for an admin actor", async () => {
      const auth = make({ signedIn: { role: "parent" } });
      expect(
        await auth.grantRole(USER_ID as UserId, "nanny", adminActor),
      ).toEqual({ ok: true, value: undefined });
      const session = await auth.getSession();
      expect(session.ok === true && session.value?.role).toBe("nanny");
    });
  });

  describe("is* helpers are pure (03 §1.4)", () => {
    it("classify a session without touching the driver", async () => {
      const auth = make({ signedIn: { role: "nanny" } });
      const session = (await auth.getSession()) as { value: Session };
      expect([
        auth.isParent(session.value),
        auth.isNanny(session.value),
        auth.isAdmin(session.value),
      ]).toEqual([false, true, false]);
    });
  });
});

describe("Auth — real inside only (provider failures)", () => {
  it("maps a failed sign-in to UNAUTHENTICATED without the provider's text", async () => {
    const { driver } = fakeDriver({ throwOn: "signInWithPassword" });
    const result = await createAuth({ driver }).signIn({
      email: EMAIL,
      password: PASSWORD,
    });
    expect(result.ok === false && result.error.code).toBe("UNAUTHENTICATED");
    expect(result.ok === false && result.error.message).not.toContain(
      "exploded",
    );
  });

  it("never throws out of getSession when the provider throws", async () => {
    const { driver } = fakeDriver({ throwOn: "currentUser" });
    const result = await createAuth({ driver }).getSession();
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe("INTERNAL");
  });

  it("writes the user_roles row from the server value at signup", async () => {
    const { driver, state } = fakeDriver({ user: aDriverUser() });
    await createAuth({ driver }).signUp({
      email: EMAIL,
      password: PASSWORD,
      role: "nanny",
    });
    expect(state.roles).toEqual([{ userId: USER_ID, role: "nanny" }]);
  });

  it("returns INTERNAL — not a half-made account — when the role write fails", async () => {
    const { driver } = fakeDriver({
      user: aDriverUser(),
      throwOn: "writeRole",
    });
    const result = await createAuth({ driver }).signUp({
      email: EMAIL,
      password: PASSWORD,
      role: "parent",
    });
    expect(result.ok === false && result.error.code).toBe("INTERNAL");
  });

  it("exchanges an auth-callback code for a session (ADR-042)", async () => {
    const { driver } = fakeDriver({ user: aDriverUser(), role: "parent" });
    const result = await createAuth({ driver }).handleAuthCallback("a-code");
    expect(result.ok === true && result.value.userId).toBe(USER_ID);
  });

  it("maps a failed code exchange to UNAUTHENTICATED", async () => {
    const { driver } = fakeDriver({ throwOn: "exchangeCodeForSession" });
    const result = await createAuth({ driver }).handleAuthCallback("a-code");
    expect(result.ok === false && result.error.code).toBe("UNAUTHENTICATED");
  });
});
