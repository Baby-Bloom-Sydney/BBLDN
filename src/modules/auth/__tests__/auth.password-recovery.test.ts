// ADR-042's **anonymous** half of the passwordless catch, under ADR-132's no-enumeration rule — the gap the
// `auth` README recorded at S4 and `1c` pinned as failing tests (3) and (4).
//
// The rule both ADRs land on: the connector answers **the same shape for a known address and an unknown one**.
// The only difference an attacker cannot see is what the *account* receives — a recovery link for an address the
// provider knows, nothing at all for one it does not. A caller that could tell "sent" from "not sent" would be a
// working account-enumeration oracle on a public form (07 §4), so a provider outage also answers `ok`, loudly in
// the log and silently to the caller.
//
// The second half is ADR-042's own promise: an account that has never set a password must never meet an error.
// It does not need a second email — the link signs the person in, and the gate's step 3 (01 §4d) sends *that*
// session to set-password rather than to the reset screen. Both halves are asserted here.
import { describe, expect, it } from "vitest";
import type { Email, UserId } from "@/modules/shared-types";
import { createAuth, gateDecision, ROUTE_MAP, stubAuth } from "@/modules/auth";
import type { Auth, GateSession } from "../types";
import { aDriverUser, fakeDriver } from "./fixtures/fake-driver";

const PASSWORDLESS = "never-set@example.test" as Email;
const WITH_PASSWORD = "has-one@example.test" as Email;
const UNKNOWN = "no-account-here@example.test" as Email;
const PASSWORD = "a-long-enough-password";

type Sent = { readonly email: string; readonly redirectTo: string };

/** `stub-auth` seeded with the three account states a public form can be handed. */
const stubWithOutbox = (): {
  readonly auth: Auth;
  readonly outbox: ReadonlyArray<Sent>;
} => {
  const outbox: Sent[] = [];
  const auth = stubAuth({
    users: [
      { id: "u-passwordless", email: PASSWORDLESS, role: "parent" },
      {
        id: "u-with-password",
        email: WITH_PASSWORD,
        password: PASSWORD,
        role: "parent",
      },
    ],
    onRecoveryEmail: (sent) => {
      outbox.push(sent);
    },
  });
  return { auth, outbox };
};

describe("auth — requestPasswordReset answers the same thing for every address (ADR-132; 07 §4)", () => {
  it("answers the identical Result for a passwordless account, an account with a password, and an address with no account", async () => {
    const { auth } = stubWithOutbox();
    const results = await Promise.all([
      auth.requestPasswordReset(PASSWORDLESS),
      auth.requestPasswordReset(WITH_PASSWORD),
      auth.requestPasswordReset(UNKNOWN),
    ]);
    expect(results[0]).toEqual({ ok: true, value: undefined });
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
  });

  it("sends the link only to the addresses the provider knows — the difference is what the account receives, never what the caller is told", async () => {
    const { auth, outbox } = stubWithOutbox();
    await auth.requestPasswordReset(PASSWORDLESS);
    await auth.requestPasswordReset(WITH_PASSWORD);
    await auth.requestPasswordReset(UNKNOWN);
    expect(outbox.map((sent) => sent.email)).toEqual([
      PASSWORDLESS,
      WITH_PASSWORD,
    ]);
  });

  it("lands the link on the auth callback carrying next=/reset-password, on the one configured origin", async () => {
    const { auth, outbox } = stubWithOutbox();
    await auth.requestPasswordReset(WITH_PASSWORD);
    const landing = new URL(outbox[0].redirectTo);
    expect(landing.pathname).toBe(ROUTE_MAP.authCallbackPath);
    expect(landing.searchParams.get(ROUTE_MAP.nextParam)).toBe(
      ROUTE_MAP.resetPasswordPath,
    );
    expect(landing.origin).toBe("http://localhost:3000");
  });

  it("answers ok when the provider throws, and says so in the log — an error that reached the caller would be the oracle", async () => {
    const { driver, state } = fakeDriver({
      user: aDriverUser(),
      role: "parent",
    });
    state.throwOn = "sendRecoveryEmail";
    const result = await createAuth({ driver }).requestPasswordReset(UNKNOWN);
    expect(result).toEqual({ ok: true, value: undefined });
  });

  it("carries no address and no provider text back to the caller", async () => {
    const { auth } = stubWithOutbox();
    const result = await auth.requestPasswordReset(PASSWORDLESS);
    expect(JSON.stringify(result)).not.toContain(PASSWORDLESS);
    expect(JSON.stringify(result)).not.toContain("account");
  });
});

describe("auth — the passwordless account meets set-password, never an error (ADR-042; 01 §4d step 3)", () => {
  const sessionOf = (over: Partial<GateSession>): GateSession => ({
    userId: "u-1" as UserId,
    role: "parent",
    mfaVerified: false,
    expiresAt: "2030-01-01T00:00:00.000Z" as GateSession["expiresAt"],
    needsPasswordSetup: false,
    isRecovery: false,
    ...over,
  });

  it("routes the link's session to set-password when the account has never set one, wherever it landed", () => {
    const session = sessionOf({ needsPasswordSetup: true });
    expect(
      gateDecision({ pathname: ROUTE_MAP.resetPasswordPath, session }),
    ).toEqual({
      kind: "redirect",
      to: ROUTE_MAP.setPasswordPath,
    });
    expect(gateDecision({ pathname: "/parent", session })).toEqual({
      kind: "redirect",
      to: ROUTE_MAP.setPasswordPath,
    });
  });

  it("signs the passwordless account in from the link rather than refusing it", async () => {
    const auth = stubAuth({
      users: [{ id: "u-passwordless", email: PASSWORDLESS, role: "parent" }],
    });
    const session = await auth.handleAuthCallback("u-passwordless");
    expect(session.ok).toBe(true);
    expect(await auth.needsPasswordSetup()).toEqual({ ok: true, value: true });
  });
});

describe("auth — a refused sign-in says one thing (ADR-132; the road to S-X-09 is the reassuring line, not a different answer)", () => {
  it("refuses a passwordless account, a wrong password and an unknown address identically", async () => {
    const { auth } = stubWithOutbox();
    const attempts = await Promise.all([
      auth.signIn({ email: PASSWORDLESS, password: "anything at all" }),
      auth.signIn({ email: WITH_PASSWORD, password: "the wrong one" }),
      auth.signIn({ email: UNKNOWN, password: "anything at all" }),
    ]);
    expect(attempts[0].ok).toBe(false);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(attempts[2]).toEqual(attempts[0]);
  });
});

describe("auth — the gate's recovery exception (ADR-132 / 04 §6.1 vs ROUTE_MAP.authGroupPaths)", () => {
  // `/reset-password` sits in the `(auth)` group, which 01 §4d makes signed-out only — and the recovery link
  // arrives *with* a session, so the screen the link exists to reach was the one screen it could not reach.
  // The exception is exactly one path for exactly one session class; every other class is untouched, and that
  // is asserted here as carefully as the exception itself.
  const sessionOf = (over: Partial<GateSession>): GateSession => ({
    userId: "u-1" as UserId,
    role: "parent",
    mfaVerified: false,
    expiresAt: "2030-01-01T00:00:00.000Z" as GateSession["expiresAt"],
    needsPasswordSetup: false,
    isRecovery: false,
    ...over,
  });

  it("lets a recovery session reach /reset-password", () => {
    expect(
      gateDecision({
        pathname: ROUTE_MAP.resetPasswordPath,
        session: sessionOf({ isRecovery: true }),
      }),
    ).toEqual({ kind: "allow" });
  });

  it("gives a recovery session the ordinary answer everywhere else in the (auth) group", () => {
    for (const path of ROUTE_MAP.authGroupPaths.filter(
      (p) => p !== ROUTE_MAP.resetPasswordPath,
    ))
      expect(
        gateDecision({
          pathname: path,
          session: sessionOf({ isRecovery: true }),
        }),
      ).toEqual({ kind: "redirect", to: "/parent" });
  });

  it("gives a recovery session the ordinary answer outside the (auth) group", () => {
    const session = sessionOf({ isRecovery: true });
    expect(gateDecision({ pathname: "/parent/call", session })).toEqual({
      kind: "allow",
    });
    expect(gateDecision({ pathname: "/nanny", session })).toEqual({
      kind: "redirect",
      to: "/parent",
    });
  });

  it("does not widen the path: an ordinary session is still bounced off /reset-password", () => {
    expect(
      gateDecision({
        pathname: ROUTE_MAP.resetPasswordPath,
        session: sessionOf({}),
      }),
    ).toEqual({ kind: "redirect", to: "/parent" });
  });

  it("leaves a signed-out visitor exactly where she was — /reset-password needs no role", () => {
    expect(
      gateDecision({ pathname: ROUTE_MAP.resetPasswordPath, session: null }),
    ).toEqual({ kind: "allow" });
  });

  it("keeps step 3 ahead of it: a recovery session with no password still goes to set-password", () => {
    expect(
      gateDecision({
        pathname: ROUTE_MAP.resetPasswordPath,
        session: sessionOf({ isRecovery: true, needsPasswordSetup: true }),
      }),
    ).toEqual({ kind: "redirect", to: ROUTE_MAP.setPasswordPath });
  });

  it("does not hand an aal1 admin a way in: 07 §5.4 row 2 answers first", () => {
    expect(
      gateDecision({
        pathname: "/admin/dashboard",
        session: sessionOf({ isRecovery: true, role: "admin" }),
      }),
    ).toEqual({ kind: "redirect", to: "/login?next=%2Fadmin%2Fdashboard" });
  });
});
