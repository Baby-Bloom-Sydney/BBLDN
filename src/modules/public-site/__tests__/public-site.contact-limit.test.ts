// ── REVIEW-2 (security HIGH-4) — 07 §8 row 10's limit on the contact form ─────────────────────────────────
//
// `sendContactMessageAction` is an anonymous `"use server"` export that turns one unauthenticated POST into an
// outbound email to the support inbox, with `replyTo` and the rendered body attacker-controlled. It had no
// ceiling of any kind: a loop floods S-A-20 and spends the outbound quota, which takes the password-reset flow
// down with it. `SECURITY.rateLimits.contactForm` was declared in config with zero call sites.
//
// Every case below was written first and verified RED against the shipped action.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SECURITY } from "@/modules/config";
import {
  configureRateLimiter,
  createRateLimiter,
  err,
  memoryRateLimitStore,
  ok,
} from "@/modules/platform";

vi.mock("next/headers", () => ({
  headers: () => ({ get: () => "198.51.100.9" }),
}));

const sends: unknown[] = [];
vi.mock("@/modules/comms", () => ({
  comms: {
    send: async (message: unknown) => {
      sends.push(message);
      return { ok: true as const, value: { providerMessageId: "m-1" } };
    },
  },
}));

const { sendContactMessageAction } = await import(
  "../actions/send-contact-message-action"
);

const VALID = {
  name: "Ada Lovelace",
  email: "ada@example.test",
  role: "parent",
  message: "Could someone call me about a nanny for two children, please?",
};

const formOf = (fields: Record<string, string>): FormData => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

const freshLimiter = (): void => {
  configureRateLimiter(
    createRateLimiter({
      store: memoryRateLimitStore(),
      burstAlertMultiple: SECURITY.burstAlertMultiple,
    }),
  );
};

beforeEach(() => {
  sends.length = 0;
  freshLimiter();
});

describe("public-site — the contact form is rate limited (07 §8 row 10; REVIEW-2)", () => {
  it("stops sending once the hour's allowance is spent", async () => {
    const attempts = SECURITY.rateLimits.contactForm.perHour + 3;
    for (let n = 0; n < attempts; n += 1)
      await sendContactMessageAction(null, formOf(VALID));
    expect(sends.length).toBe(SECURITY.rateLimits.contactForm.perHour);
    expect(sends.length).toBeLessThan(attempts);
  });

  it("fails CLOSED when the limiter cannot answer — a send is not a public read (ADR-134)", async () => {
    configureRateLimiter(
      { consume: async () => err("INTERNAL", "Rate limit unavailable") },
      "shared",
    );
    const answer = await sendContactMessageAction(null, formOf(VALID));
    expect(answer.ok).toBe(false);
    expect(sends).toEqual([]);
  });

  it("keys on IP **and** the submitted address, so neither half alone buys a fresh budget", async () => {
    const keys: string[] = [];
    configureRateLimiter(
      {
        consume: async (key: string) => {
          keys.push(key);
          return ok({ count: 1 });
        },
      },
      "shared",
    );
    await sendContactMessageAction(null, formOf(VALID));
    await sendContactMessageAction(
      null,
      formOf({ ...VALID, email: "grace@example.test" }),
    );
    expect(keys).toHaveLength(2);
    // Same IP, different address -> a different bucket; the IP half is still in both.
    expect(keys[0]).not.toBe(keys[1]);
    const ipHalf = (key: string) => key.split(":")[1];
    expect(ipHalf(keys[0] ?? "")).toBe(ipHalf(keys[1] ?? ""));
  });

  it("never puts the submitted address in the key in the clear (07 §2 class C)", async () => {
    const keys: string[] = [];
    configureRateLimiter(
      {
        consume: async (key: string) => {
          keys.push(key);
          return ok({ count: 1 });
        },
      },
      "shared",
    );
    await sendContactMessageAction(null, formOf(VALID));
    expect(keys[0]).not.toContain(VALID.email);
    expect(keys[0]).not.toContain("198.51.100.9");
  });
});
