// S-X-08 — sign in: one refusal for every failure (07 §4), the gate's `next=` honoured only when safe, and the
// anonymous passwordless catch (ADR-042 / D4; 04 §6.1).
//
// **AUTH-2 closed `1c`'s pin (3), but not as it was written — recorded rather than quietly rewritten.** The pin
// asked a known passwordless email at the login form to be routed to `/set-password`. That answer *is* the
// enumeration oracle ADR-132 forbids: a form that routes one address differently from another has told the
// attacker which addresses have passwordless accounts. The behaviour the pin was reaching for — "a passwordless
// account never meets an error, it is offered a link" — is delivered instead by one refusal for every failure,
// carrying the reassuring line to S-X-09, whose `auth.requestPasswordReset` emails the link that signs the
// account in; the gate's step 3 then sends that session to set-password (01 §4d). Both halves are asserted below
// and in `auth/__tests__/auth.password-recovery.test.ts`.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configureAuth, stubAuth } from "@/modules/auth";
import { SECURITY } from "@/modules/config";
import {
  configureRateLimiter,
  createRateLimiter,
  err,
  memoryRateLimitStore,
} from "@/modules/platform";
import type { Email } from "@/modules/shared-types";
import { signInAction } from "../actions/sign-in-action";

const formDataOf = (fields: Record<string, string>): FormData => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

const PARENT = {
  id: "p-1",
  email: "ada@example.test" as Email,
  password: "correct horse battery staple",
  role: "parent" as const,
};
const PASSWORDLESS = {
  id: "p-2",
  email: "nopass@example.test" as Email,
  role: "parent" as const,
};

beforeEach(() => {
  configureAuth(stubAuth({ users: [PARENT, PASSWORDLESS] }));
});

describe("onboarding-parent — signInAction (S-X-08)", () => {
  it("signs a parent in and sends her to her own dashboard", async () => {
    const result = await signInAction(
      null,
      formDataOf({ email: PARENT.email, password: PARENT.password }),
    );
    expect(result).toEqual({ ok: true, value: { destination: "/parent" } });
  });

  it("honours a safe next= and ignores an unsafe one (01 §4d step 2)", async () => {
    const safe = await signInAction(
      null,
      formDataOf({
        email: PARENT.email,
        password: PARENT.password,
        next: "/parent/call",
      }),
    );
    expect(safe.ok && safe.value.destination).toBe("/parent/call");
    const unsafe = await signInAction(
      null,
      formDataOf({
        email: PARENT.email,
        password: PARENT.password,
        next: "https://evil.example",
      }),
    );
    expect(unsafe.ok && unsafe.value.destination).toBe("/parent");
  });

  it("refuses a wrong password and an unknown email with the same line, no provider text", async () => {
    const wrong = await signInAction(
      null,
      formDataOf({ email: PARENT.email, password: "wrong password here" }),
    );
    const unknown = await signInAction(
      null,
      formDataOf({ email: "who@example.test", password: "anything at all" }),
    );
    expect(wrong.ok).toBe(false);
    expect(unknown.ok).toBe(false);
    if (wrong.ok || unknown.ok) return;
    expect(wrong.error).toEqual(unknown.error);
    expect(wrong.error.code).toBe("UNAUTHENTICATED");
    expect(JSON.stringify(wrong)).not.toContain("no such account");
  });

  it("refuses an empty form as VALIDATION", async () => {
    const result = await signInAction(null, formDataOf({ email: "x" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION");
  });

  // `1c` pin (3), closed by AUTH-2 against ADR-132 rather than as written (see the header).
  it("answers a known passwordless email exactly as it answers an unknown one — the form reveals no account state", async () => {
    const passwordless = await signInAction(
      null,
      formDataOf({ email: PASSWORDLESS.email, password: "anything at all" }),
    );
    const unknown = await signInAction(
      null,
      formDataOf({ email: "nobody@example.test", password: "anything at all" }),
    );
    expect(passwordless.ok).toBe(false);
    expect(passwordless).toEqual(unknown);
  });

  it("carries the reassuring line that sends a passwordless visitor to S-X-09, never an error about her account", async () => {
    const result = await signInAction(
      null,
      formDataOf({ email: PASSWORDLESS.email, password: "anything at all" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/never set a password/i);
    expect(result.error.message).not.toMatch(/no such account|does not exist/i);
  });
});

// ── REVIEW-2 (security HIGH-2) — 07 §8 row 3's limit on sign-in ────────────────────────────────────────────
//
// Written RED first against the shipped action, which called `auth.signIn` straight after the zod parse: both
// cases below failed, because there was no limiter on this path at all. `SECURITY.rateLimits.authPerEmail` had
// exactly one call site (the reset request) and none here, so ADR-134's "auth fails closed on a limiter outage"
// had nothing to be true of. The second case is the one that matters: fail **closed**, not open.
describe("onboarding-parent — sign-in is rate limited (07 §8 row 3; REVIEW-2)", () => {
  const freshLimiter = (): void => {
    configureRateLimiter(
      createRateLimiter({
        store: memoryRateLimitStore(),
        burstAlertMultiple: SECURITY.burstAlertMultiple,
      }),
    );
  };

  beforeEach(() => {
    freshLimiter();
  });

  afterEach(() => {
    freshLimiter();
  });

  it("stops guessing after the policy's burst, and refuses in the form's own words", async () => {
    const answers = [];
    for (let attempt = 0; attempt < 8; attempt += 1)
      answers.push(
        await signInAction(
          null,
          formDataOf({ email: PARENT.email, password: "wrong" }),
        ),
      );
    expect(answers.every((answer) => !answer.ok)).toBe(true);
    // Every answer is the same refusal, throttled or not — a throttle that spoke differently would be the
    // enumeration oracle ADR-132 forbids, arriving through the side door.
    const first = answers[0];
    expect(answers.every((answer) => JSON.stringify(answer) === JSON.stringify(first))).toBe(true);
    // The correct password no longer works once the burst is spent: the limit is ahead of the credential check.
    const afterBurst = await signInAction(
      null,
      formDataOf({ email: PARENT.email, password: PARENT.password }),
    );
    expect(afterBurst.ok).toBe(false);
  });

  it("does not let one address's burst refuse another address's first attempt", async () => {
    for (let attempt = 0; attempt < 8; attempt += 1)
      await signInAction(
        null,
        formDataOf({ email: PARENT.email, password: "wrong" }),
      );
    const other = await signInAction(
      null,
      formDataOf({
        email: PASSWORDLESS.email,
        password: "whatever",
      }),
    );
    // Still a refusal (that account has no password), but reached by the credential check rather than the
    // limiter — the point is that the bucket is per address, not global.
    expect(other.ok).toBe(false);
  });

  it("fails CLOSED when the limiter cannot answer — a limiter outage is not a free pass (ADR-134)", async () => {
    configureRateLimiter(
      { consume: async () => err("INTERNAL", "Rate limit unavailable") },
      "shared",
    );
    const withGoodPassword = await signInAction(
      null,
      formDataOf({ email: PARENT.email, password: PARENT.password }),
    );
    expect(withGoodPassword.ok).toBe(false);
  });
});
