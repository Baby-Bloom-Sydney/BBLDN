// 07 §8 rows 2 and 3, the **per-IP** halves (`signupPerIp`, `authPerIp`) — ADR-140 (2): both were declared in
// `config/security.ts` with no call site anywhere, which reads as a control in force and is not (ADR-142 (2)).
//
// The email-hash half (already wired) stops one address being hammered. This half is what stops one machine
// working through a list of addresses, which is the other road in the same row — and it was left to "the edge
// layer", an argument ADR-140 struck: `vercel.json` carries no firewall rule, so nothing was taking it.
//
// The limiter is recorded rather than run, because what is under test is **which policies each surface spends**;
// the counting itself is `platform.rate-limit.test.ts`'s.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SECURITY } from "@/modules/config";
import {
  configureRateLimiter,
  createRateLimiter,
  memoryRateLimitStore,
} from "@/modules/platform";
import type { RateLimitPolicy } from "@/modules/platform";
import type { Email } from "@/modules/shared-types";
import { consumeResetRequestLimit } from "../lib/consume-reset-request-limit";
import { consumeSignInLimit } from "../lib/consume-sign-in-limit";
import { consumeSignupLimit } from "../lib/consume-signup-limit";

const EMAIL = "ada@example.test" as Email;
const spent: RateLimitPolicy[] = [];

/** Records every policy a surface spends and allows all of them, so the order and the set are both visible. */
function recordingLimiter() {
  const inner = createRateLimiter({
    store: memoryRateLimitStore(),
    burstAlertMultiple: SECURITY.burstAlertMultiple,
  });
  return {
    consume: async (key: string, policy: RateLimitPolicy) => {
      spent.push(policy);
      return inner.consume(key, policy);
    },
  };
}

const namesSpent = () => spent.map((policy) => policy.name);

beforeEach(() => {
  spent.length = 0;
  configureRateLimiter(recordingLimiter(), "shared");
});

afterEach(() => {
  spent.length = 0;
});

describe("the per-IP halves of 07 §8 rows 2 and 3", () => {
  it("signup spends signupPerIp beside signupPerEmail", async () => {
    expect(await consumeSignupLimit(EMAIL)).toBe(true);

    expect(namesSpent()).toContain("signupPerIp");
    expect(namesSpent()).toContain("signupPerEmail");
  });

  it("sign-in spends authPerIp beside authPerEmail", async () => {
    expect(await consumeSignInLimit(EMAIL)).toBe(true);

    expect(namesSpent()).toContain("authPerIp");
    expect(namesSpent()).toContain("authPerEmail");
  });

  it("the reset request spends authPerIp beside authPerEmail", async () => {
    expect(await consumeResetRequestLimit(EMAIL)).toBe("send");

    expect(namesSpent()).toContain("authPerIp");
    expect(namesSpent()).toContain("authPerEmail");
  });

  it("a per-IP trip refuses the surface, whatever the address's own count is", async () => {
    const perHour = SECURITY.rateLimits.signupPerIp.perHour ?? 0;
    expect(perHour).toBeGreaterThan(0);
    // Every call is a different address, so only the shared per-IP bucket can be what refuses.
    for (let i = 0; i < perHour; i += 1)
      expect(await consumeSignupLimit(`p${i}@example.test` as Email)).toBe(
        true,
      );

    expect(await consumeSignupLimit("last@example.test" as Email)).toBe(false);
  });
});
