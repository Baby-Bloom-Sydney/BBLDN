// S-X-09 — the forgot half fails closed while `auth` has no reset-request method (pinned), and the reset half's
// route is bounced by the gate's signed-out-only rule for `/reset-password` (pinned: 04 §6.1 says the recovery link
// lands there with a session).
import { describe, expect, it } from "vitest";
import { gateDecision } from "@/modules/auth";
import type { UserId } from "@/modules/shared-types";
import { requestPasswordResetAction } from "../actions/request-password-reset-action";

const formDataOf = (fields: Record<string, string>): FormData => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

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

  it("fails closed for a well-formed address without saying whether it is known", async () => {
    const result = await requestPasswordResetAction(
      null,
      formDataOf({ email: "ada@example.test" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INTERNAL");
    expect(result.error.details).toBeUndefined();
    expect(result.error.message).not.toMatch(/account|known|exist/i);
  });

  it.fails(
    "PINNED (04 §6.1 S-X-09 `03.05`; auth connector gap): a request sends the email and answers ok whether or not the address is known",
    async () => {
      const result = await requestPasswordResetAction(
        null,
        formDataOf({ email: "ada@example.test" }),
      );
      expect(result.ok).toBe(true);
    },
  );
});

describe("onboarding-parent — /reset-password behind the gate (S-X-09 reset half)", () => {
  it.fails(
    "PINNED (04 §6.1 S-X-09 vs auth ROUTE_MAP.authGroupPaths): a signed-in session from the recovery link may reach /reset-password",
    () => {
      const decision = gateDecision({
        pathname: "/reset-password",
        session: {
          userId: "u-1" as UserId,
          role: "parent",
          mfaVerified: false,
          expiresAt: "2030-01-01T00:00:00.000Z" as never,
          needsPasswordSetup: false,
        },
      });
      expect(decision).toEqual({ kind: "allow" });
    },
  );
});
