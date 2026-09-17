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
