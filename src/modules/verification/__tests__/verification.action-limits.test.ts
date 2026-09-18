// ── REVIEW-3 M-1 / R-3 — the three wizard actions that reached a write with no limiter at all ─────────────
//
// `submitIdentity` / `submitDbs` / `submitRightToWork` each consume 07 §8 row 11 one boundary in
// (`verification/lib/submit-*.ts`). Their three siblings did not consume anything: `saveVerificationContact`
// writes `user_profiles`, `recordBiometricConsent` writes an AGR-04 consent record, and `processVerification`
// claims and applies. All three are `"use server"` exports, i.e. HTTP endpoints a signed-in session can call
// without the form, so "the blast radius is the caller's own rows" is a statement about damage, not about
// whether the surface is bounded (ADR-134: a mutating surface refuses rather than running unbounded).
//
// Every case below was written first and verified RED against the shipped actions.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SECURITY } from "@/modules/config";
import {
  configureRateLimiter,
  createRateLimiter,
  err,
  memoryRateLimitStore,
  ok,
} from "@/modules/platform";
import type { Instant, UserId } from "@/modules/shared-types";

const NANNY = "nanny-1" as UserId;

vi.mock("@/modules/auth", () => ({
  auth: {
    requireRole: async () => ({
      ok: true as const,
      value: {
        userId: NANNY,
        role: "nanny" as const,
        mfaVerified: false,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString() as Instant,
      },
    }),
  },
}));

const submitContact = vi.fn();
const process = vi.fn();
vi.mock("../lib/default-verification", () => ({
  verification: {
    submitContact: async (...args: ReadonlyArray<unknown>) => {
      submitContact(...args);
      return ok(undefined);
    },
    process: async (...args: ReadonlyArray<unknown>) => {
      process(...args);
      return ok({ nannyId: NANNY, level: "L0_SIGNED_UP", sections: [] });
    },
  },
}));

const recordConsent = vi.fn();
vi.mock("../lib/record-biometric-notice-consent", () => ({
  recordBiometricNoticeConsent: async (...args: ReadonlyArray<unknown>) => {
    recordConsent(...args);
    return ok("consent-1");
  },
}));

const { saveVerificationContactAction } =
  await import("../actions/save-verification-contact-action");
const { recordBiometricConsentAction } =
  await import("../actions/record-biometric-consent-action");
const { processVerificationAction } =
  await import("../actions/process-verification-action");

const contactForm = (): FormData => {
  const data = new FormData();
  data.set("mobile", "07700900123");
  data.set("district", "SW4");
  data.set("area", "Clapham");
  return data;
};

/** A notice the server's plausibility floor accepts: opened, scrolled well after, ticked after that. */
const noticeForm = (): FormData => {
  const opened = Date.now() - 600_000;
  const data = new FormData();
  data.set("noticeOpenedAt", new Date(opened).toISOString());
  data.set("noticeScrollCompletedAt", new Date(opened + 120_000).toISOString());
  data.set("checkboxesEnabledAt", new Date(opened + 130_000).toISOString());
  data.set("consent", "on");
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

/** A limiter that cannot answer — ADR-134's outage, which every policy here must fail closed on. */
const brokenLimiter = (): void => {
  configureRateLimiter({
    consume: async () =>
      err("INTERNAL", "the limiter is down", {
        reason: "store-failed",
      }) as never,
  });
};

beforeEach(() => {
  submitContact.mockClear();
  process.mockClear();
  recordConsent.mockClear();
  freshLimiter();
});

describe("verification actions — every one of them is bounded (REVIEW-3 M-1)", () => {
  it("stops saveVerificationContact reaching user_profiles once the day's budget is spent", async () => {
    const perDay = SECURITY.rateLimits.verificationSubmissions.perDay ?? 0;
    expect(perDay).toBeGreaterThan(0);

    for (let n = 0; n < perDay + 3; n += 1)
      await saveVerificationContactAction(null, contactForm());

    expect(submitContact).toHaveBeenCalledTimes(perDay);
  });

  it("answers saveVerificationContact's caller with her own line, not a store failure", async () => {
    const perDay = SECURITY.rateLimits.verificationSubmissions.perDay ?? 0;
    for (let n = 0; n < perDay; n += 1)
      await saveVerificationContactAction(null, contactForm());

    const refused = await saveVerificationContactAction(null, contactForm());

    expect(refused.ok).toBe(false);
    expect(refused.ok === false && refused.error.details?.reason).toBe(
      "too-many-attempts",
    );
  });

  it("stops recordBiometricConsent writing an AGR-04 record once its budget is spent", async () => {
    const perDay = SECURITY.rateLimits.verificationSubmissions.perDay ?? 0;

    for (let n = 0; n < perDay + 3; n += 1)
      await recordBiometricConsentAction(null, noticeForm());

    expect(recordConsent).toHaveBeenCalledTimes(perDay);
  });

  it("keeps the consent budget in its own bucket — spending it does not close the contact step", async () => {
    const perDay = SECURITY.rateLimits.verificationSubmissions.perDay ?? 0;
    for (let n = 0; n < perDay + 3; n += 1)
      await recordBiometricConsentAction(null, noticeForm());

    const saved = await saveVerificationContactAction(null, contactForm());

    expect(saved.ok).toBe(true);
    expect(submitContact).toHaveBeenCalledTimes(1);
  });

  it("stops processVerification claiming once the poll's per-minute budget is spent", async () => {
    const perMinute = SECURITY.rateLimits.verificationPolls.perMinute ?? 0;
    expect(perMinute).toBeGreaterThan(0);

    for (let n = 0; n < perMinute + 3; n += 1)
      await processVerificationAction();

    expect(process).toHaveBeenCalledTimes(perMinute);
  });

  it("leaves the S-N-08 poll room to run: the budget is above the interval the screen polls at", () => {
    const perMinute = SECURITY.rateLimits.verificationPolls.perMinute ?? 0;
    // `VETTING.wizard.pollMs` is 2 000 ms, so an honest screen spends 30 a minute. A ceiling at or under that
    // would refuse the wizard itself — the reason this policy is not row 11's five a day.
    expect(perMinute).toBeGreaterThan(30);
  });

  it("fails closed on a limiter outage — none of the three writes when the limiter cannot answer", async () => {
    brokenLimiter();

    const saved = await saveVerificationContactAction(null, contactForm());
    const consented = await recordBiometricConsentAction(null, noticeForm());
    const processed = await processVerificationAction();

    expect(saved.ok).toBe(false);
    expect(consented.ok).toBe(false);
    expect(processed.ok).toBe(false);
    expect(submitContact).not.toHaveBeenCalled();
    expect(recordConsent).not.toHaveBeenCalled();
    expect(process).not.toHaveBeenCalled();
  });
});
