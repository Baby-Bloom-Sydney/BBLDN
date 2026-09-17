// S-X-09 (`03.05`) — the forgot half now runs on `auth.requestPasswordReset` (AUTH-2), and the reset half's
// screen is reachable by the session the link creates (the gate's recovery exception, ADR-132 / 04 §6.1).
//
// `1c` pinned both as failing and named the owner; both pins are closed here. The property under test is the one
// ADR-132 rules: **the form answers the same thing for every address**, and the only difference is which account
// receives a link.
import { beforeEach, describe, expect, it } from "vitest";
import {
  configureAuth,
  gateDecision,
  ROUTE_MAP,
  stubAuth,
} from "@/modules/auth";
import type { GateSession } from "@/modules/auth";
import type { Email, UserId } from "@/modules/shared-types";
import { requestPasswordResetAction } from "../actions/request-password-reset-action";

const formDataOf = (fields: Record<string, string>): FormData => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

const KNOWN = "ada@example.test" as Email;
const UNKNOWN = "nobody@example.test" as Email;

let outbox: Array<{ readonly email: Email }> = [];

beforeEach(() => {
  outbox = [];
  configureAuth(
    stubAuth({
      users: [
        {
          id: "p-1",
          email: KNOWN,
          password: "correct horse battery staple",
          role: "parent",
        },
      ],
      onRecoveryEmail: (sent) => {
        outbox.push(sent);
      },
    }),
  );
});

describe("onboarding-parent — requestPasswordResetAction (S-X-09 forgot half)", () => {
  it("refuses a bad address as VALIDATION", async () => {
    const result = await requestPasswordResetAction(
      null,
      formDataOf({ email: "nope" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION");
  });

  // `1c` pin (4), closed by AUTH-2.
  it("answers ok for a well-formed address whether or not it is known — one 'check your email' state (07 §4)", async () => {
    const known = await requestPasswordResetAction(
      null,
      formDataOf({ email: KNOWN }),
    );
    const unknown = await requestPasswordResetAction(
      null,
      formDataOf({ email: UNKNOWN }),
    );
    expect(known).toEqual({ ok: true, value: undefined });
    expect(unknown).toEqual(known);
  });

  it("sends the link to the known address only — the difference the attacker cannot see", async () => {
    await requestPasswordResetAction(null, formDataOf({ email: KNOWN }));
    await requestPasswordResetAction(null, formDataOf({ email: UNKNOWN }));
    expect(outbox.map((sent) => sent.email)).toEqual([KNOWN]);
  });

  it("normalises the address before it reaches the connector, so casing cannot split one account in two", async () => {
    await requestPasswordResetAction(
      null,
      formDataOf({ email: "  ADA@Example.Test  " }),
    );
    expect(outbox.map((sent) => sent.email)).toEqual([KNOWN]);
  });
});

describe("onboarding-parent — /reset-password behind the gate (S-X-09 reset half)", () => {
  const sessionOf = (over: Partial<GateSession>): GateSession => ({
    userId: "u-1" as UserId,
    role: "parent",
    mfaVerified: false,
    expiresAt: "2030-01-01T00:00:00.000Z" as GateSession["expiresAt"],
    needsPasswordSetup: false,
    isRecovery: false,
    ...over,
  });

  // `1c` pin (6), closed by AUTH-2.
  it("lets the session the recovery link created reach /reset-password", () => {
    expect(
      gateDecision({
        pathname: ROUTE_MAP.resetPasswordPath,
        session: sessionOf({ isRecovery: true }),
      }),
    ).toEqual({ kind: "allow" });
  });

  it("still bounces an ordinary signed-in session off /reset-password (01 §4d: the (auth) group is signed-out only)", () => {
    expect(
      gateDecision({
        pathname: ROUTE_MAP.resetPasswordPath,
        session: sessionOf({}),
      }),
    ).toEqual({ kind: "redirect", to: "/parent" });
  });
});
