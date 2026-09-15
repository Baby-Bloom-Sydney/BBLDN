// The identity-layer limiter (07 §8): windows from a `SECURITY.rateLimits` policy, RATE_LIMITED with
// retryAfterSeconds on a trip, burst alert at `SECURITY.burstAlertMultiple`, a store failure denies (fail closed).
import { describe, expect, it } from "vitest";
import { SECURITY } from "@/modules/config";
import type { Instant } from "@/modules/shared-types";
import {
  configureRateLimiter,
  createLogger,
  createRateLimiter,
  memoryRateLimitStore,
  policyWindows,
  rateLimiter,
} from "@/modules/platform";
import type { LogLine, RateLimitStore } from "@/modules/platform";

const T0 = Date.parse("2026-09-15T08:00:00.000Z");
const at = (offsetSeconds: number) =>
  new Date(T0 + offsetSeconds * 1000).toISOString() as Instant;

function harness(opts: { burst?: number } = {}) {
  const lines: LogLine[] = [];
  const clockState = { now: at(0) };
  const limiter = createRateLimiter({
    store: memoryRateLimitStore(),
    clock: () => clockState.now,
    log: createLogger({
      sink: (line) => void lines.push(line),
      clock: () => clockState.now,
    }),
    burstAlertMultiple: opts.burst ?? SECURITY.burstAlertMultiple,
  });
  return { limiter, lines, clockState };
}

describe("platform/rate-limit — policyWindows", () => {
  it("turns a config policy into ascending windows with their limits", () => {
    expect(policyWindows({ key: "ip", perMinute: 30, perDay: 300 })).toEqual([
      { window: "minute", seconds: 60, limit: 30 },
      { window: "day", seconds: 86400, limit: 300 },
    ]);
    expect(policyWindows({ key: "user", perHour: 10 })).toEqual([
      { window: "hour", seconds: 3600, limit: 10 },
    ]);
  });
});

describe("platform/rate-limit — consume", () => {
  it("allows up to the limit and reports the tightest remaining count", async () => {
    const { limiter } = harness();
    const policy = { key: "ip", perMinute: 3, perDay: 100 };
    const first = await limiter.consume("1.2.3.4", policy);
    expect(first.ok).toBe(true);
    if (first.ok)
      expect(first.value).toEqual({ remaining: 2, resetAt: at(60) });
    await limiter.consume("1.2.3.4", policy);
    const third = await limiter.consume("1.2.3.4", policy);
    if (third.ok) expect(third.value.remaining).toBe(0);
  });

  it("trips with RATE_LIMITED { reason, window, retryAfterSeconds } and recovers after the window", async () => {
    const { limiter, clockState } = harness();
    const policy = { key: "ip", perMinute: 2 };
    await limiter.consume("k", policy);
    await limiter.consume("k", policy);
    clockState.now = at(15);
    const tripped = await limiter.consume("k", policy);
    expect(tripped.ok).toBe(false);
    if (!tripped.ok) {
      expect(tripped.error.code).toBe("RATE_LIMITED");
      expect(tripped.error.details).toEqual({
        reason: "limit",
        window: "minute",
        retryAfterSeconds: 45,
      });
    }
    clockState.now = at(61);
    expect((await limiter.consume("k", policy)).ok).toBe(true);
  });

  it("keys are independent and policies are namespaced by their config key", async () => {
    const { limiter } = harness();
    const policy = { key: "ip", perMinute: 1 };
    expect((await limiter.consume("a", policy)).ok).toBe(true);
    expect((await limiter.consume("b", policy)).ok).toBe(true);
    expect(
      (await limiter.consume("a", { key: "ip+ua", perMinute: 1 })).ok,
    ).toBe(true);
    expect((await limiter.consume("a", policy)).ok).toBe(false);
  });

  it("logs ALERT_RATE_LIMIT_BURST once a key trips the multiple within an hour", async () => {
    const { limiter, lines } = harness({ burst: 3 });
    const policy = { key: "ip", perMinute: 1 };
    await limiter.consume("noisy", policy);
    for (let i = 0; i < 3; i += 1) await limiter.consume("noisy", policy);
    const alerts = lines.filter(
      (line) => line.alert === "ALERT_RATE_LIMIT_BURST",
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ level: "warn", policy: "ip", trips: 3 });
    expect(JSON.stringify(alerts[0])).not.toContain("noisy");
  });

  it("denies (INTERNAL) when the store fails — fail closed, logged", async () => {
    const lines: LogLine[] = [];
    const broken: RateLimitStore = {
      increment: async () => ({
        ok: false,
        error: { code: "INTERNAL", message: "db down" },
      }),
    };
    const limiter = createRateLimiter({
      store: broken,
      log: createLogger({ sink: (line) => void lines.push(line) }),
      burstAlertMultiple: 10,
    });
    const result = await limiter.consume("k", { key: "ip", perMinute: 5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INTERNAL");
    expect(lines.some((line) => line.level === "error")).toBe(true);
  });

  it("the module-level limiter runs on the memory store until configured", async () => {
    const policy = { key: "ip", perMinute: 1 };
    expect((await rateLimiter.consume("default-key", policy)).ok).toBe(true);
    expect((await rateLimiter.consume("default-key", policy)).ok).toBe(false);
    const { limiter } = harness();
    configureRateLimiter(limiter);
    expect((await rateLimiter.consume("default-key", policy)).ok).toBe(true);
  });
});
