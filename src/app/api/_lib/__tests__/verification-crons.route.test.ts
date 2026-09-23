// The two cron shells `2c` gives an inside (ADR-161): `send-delayed-emails` hosts the four sweeps of 01 §4f and
// answers their counts; `vetting-expiry` hands the run's instant to `verification.sweepExpiry`. The shells are
// asserted on what they hand `runCron` — the Bearer rule is `run-cron.test.ts`'s. And the recorded gap is pinned:
// the delayed-queue DELIVERY (`08.20` proper) is not in this run until a renderer exists (Phase 4a `08.01`).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "a-configured-cron-secret";
const request = (path: string) =>
  new Request(`https://example.test${path}`, {
    headers: { authorization: `Bearer ${SECRET}` },
  });

const stubs = () => {
  const sweepStaleProcessing = vi.fn(async () => ({
    ok: true,
    value: { handled: 2, skipped: 0 },
  }));
  const sweepReminders = vi.fn(async () => ({
    ok: true,
    value: { handled: 3, skipped: 1 },
  }));
  const sweepExpiry = vi.fn(async () => ({
    ok: true,
    value: { handled: 1, skipped: 4 },
  }));
  const callDueSweep = vi.fn(async () => ({
    kind: "swept",
    overdue: 1,
    waiting: 2,
    notified: true,
  }));
  const expireHolds = vi.fn(async () => ({ ok: true, value: { expired: 5 } }));
  vi.doMock("@/modules/config/server", () => ({
    env: { environment: "test", public: {}, server: { CRON_SECRET: SECRET } },
    SENDERS: { admin: { address: "admin@example.test", name: "Admin" } },
  }));
  vi.doMock("@/modules/verification", () => ({
    verification: { sweepStaleProcessing, sweepReminders, sweepExpiry },
  }));
  vi.doMock("@/modules/admin", () => ({ callDueSweep }));
  vi.doMock("@/modules/scheduling", () => ({ scheduling: { expireHolds } }));
  return {
    sweepStaleProcessing,
    sweepReminders,
    sweepExpiry,
    callDueSweep,
    expireHolds,
  };
};

// The clock is pinned because `runCron` now gates on the London hour (04:30 London for vetting-expiry; send-delayed-emails runs every five minutes and is never gated): `vercel.json` schedules a declared
// London time at both candidate UTC hours and the gate discards the one that is not it (`4b`). A test that ran at
// the wall-clock of whoever is running it would pass or skip by the hour of day.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-15T04:30:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.doUnmock("@/modules/config/server");
  vi.doUnmock("@/modules/verification");
  vi.doUnmock("@/modules/admin");
  vi.doUnmock("@/modules/scheduling");
  vi.resetModules();
});

describe("/api/cron/send-delayed-emails — the 5-minute run (01 §4f; ADR-161)", () => {
  it("runs the call-due sweep, the slot-hold sweep, the stale sweep and the reminder funnel, and sums their counts", async () => {
    vi.resetModules();
    const s = stubs();
    const { GET } = await import("../../cron/send-delayed-emails/route");
    const response = await GET(request("/api/cron/send-delayed-emails"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { handled: number; skipped: number };
    };
    expect(body.data).toEqual({ handled: 1 + 2 + 5 + 2 + 3, skipped: 1 });
    expect(s.callDueSweep).toHaveBeenCalledWith(
      { kind: "system", id: "admin-call-due" },
      expect.any(String),
      { email: "admin@example.test" },
    );
    expect(s.expireHolds).toHaveBeenCalledTimes(1);
    expect(s.sweepStaleProcessing).toHaveBeenCalledTimes(1);
    expect(s.sweepReminders).toHaveBeenCalledTimes(1);
  });

  /**
   * ★ REVIEW-4 H-1 — the four sweeps must fail the run the same way.
   *
   * `stale` and `reminders` return their error, which `runCron` turns into `log.error` + `ALERT_CRON_FAILED`
   * and a non-200 (`run-cron.ts:57-68`, whose own comment says "a thrown-away error is how a silent cron
   * becomes a week of unswept rows"). `holds` alone was folded into `skipped: +1` and the run answered `ok`, so
   * a scheduling outage stopped every slot hold expiring — parents shown times that are not free — behind an
   * HTTP 200 and an `info` line whose `skipped` is indistinguishable from a real skip.
   *
   * Written RED against the shipped handler, which answered 200 with `{ handled: 8, skipped: 2 }`.
   */
  it("a refused slot-hold sweep fails the run, like its two siblings (REVIEW-4 H-1)", async () => {
    vi.resetModules();
    const s = stubs();
    s.expireHolds.mockResolvedValueOnce({
      ok: false,
      error: { code: "INTERNAL", message: "scheduling is down" },
    } as never);
    const { GET } = await import("../../cron/send-delayed-emails/route");

    const response = await GET(request("/api/cron/send-delayed-emails"));

    expect(response.status).not.toBe(200);
    // and the other three still ran — the failure is reported, never a reason to skip the rest of the pass
    expect(s.callDueSweep).toHaveBeenCalledTimes(1);
    expect(s.sweepStaleProcessing).toHaveBeenCalledTimes(1);
    expect(s.sweepReminders).toHaveBeenCalledTimes(1);
  });

  it.fails(
    "delivers the queued email_logs rows that are due (08.20) — PINNED: no renderer exists until Phase 4a (08.01), owner Phase 4a",
    async () => {
      vi.resetModules();
      stubs();
      const route = await import("../../cron/send-delayed-emails/route");
      expect("deliverDue" in route).toBe(true);
    },
  );
});

describe("/api/cron/vetting-expiry (03 §4.3; ADR-157 (4))", () => {
  it("hands the run's instant to verification.sweepExpiry and answers its counts", async () => {
    vi.resetModules();
    const s = stubs();
    const { GET } = await import("../../cron/vetting-expiry/route");
    const response = await GET(request("/api/cron/vetting-expiry"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { handled: number; skipped: number };
    };
    expect(body.data).toEqual({ handled: 1, skipped: 4 });
    expect(s.sweepExpiry).toHaveBeenCalledWith(expect.any(String));
  });
});
