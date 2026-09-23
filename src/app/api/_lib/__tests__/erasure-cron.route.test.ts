// The cron shell L-009 `3f` gives an inside: `/api/cron/delete-account` (01 §4f; 07 §6.1; B-46). It has been
// declared since Phase 0 and has answered `no-handler-registered` ever since, which was the honest answer while
// the job did not exist — a 200 would have read as "the deletion requests were processed".
//
// It is a **re-attempt**, not the product path, and the sweep's counts are what say so: `skipped` is the number
// of people whose Art 17 request is still open after this run, which is the one number an operator needs.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "a-configured-cron-secret";
const PATH = "/api/cron/delete-account";
const request = () =>
  new Request(`https://example.test${PATH}`, {
    headers: { authorization: `Bearer ${SECRET}` },
  });

const stubs = () => {
  const sweepRequests = vi.fn(async (_now: string) => ({
    ok: true,
    value: { handled: 2, skipped: 1 },
  }));
  vi.doMock("@/modules/config/server", () => ({
    env: { environment: "test", public: {}, server: { CRON_SECRET: SECRET } },
  }));
  vi.doMock("@/modules/platform", async () => {
    const actual =
      await vi.importActual<typeof import("@/modules/platform")>(
        "@/modules/platform",
      );
    return { ...actual, privacy: { ...actual.privacy, sweepRequests } };
  });
  return { sweepRequests };
};

// The clock is pinned because `runCron` gates on the London hour (02:30 London): `vercel.json` schedules a declared
// London time at both candidate UTC hours and the gate discards the one that is not it (`4b`). Left unpinned,
// this file would pass or skip depending on what time of day it was run at.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-15T02:30:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock("@/modules/config/server");
  vi.doUnmock("@/modules/platform");
  vi.resetModules();
});

describe("/api/cron/delete-account — the erasure sweep (07 §6.1; B-46)", () => {
  it("★ has an inside now: it calls `privacy.sweepRequests` with the run's instant and answers its counts", async () => {
    const { sweepRequests } = stubs();
    const { GET } = await import("@/app/api/cron/delete-account/route");

    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(sweepRequests).toHaveBeenCalledTimes(1);
    // One argument, and it is the instant `runCron` produced — the handler takes no clock of its own.
    expect(sweepRequests.mock.calls[0]).toHaveLength(1);
    expect(String(sweepRequests.mock.calls[0][0])).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
    // `skipped: 1` is a person still waiting. It reaches the run-summary line rather than being folded into
    // `handled`, because "the sweep ran" and "everybody who asked has been erased" are not the same fact.
    expect(await response.json()).toMatchObject({
      data: { handled: 2, skipped: 1 },
    });
  });

  it("still refuses without the Bearer secret — an inside does not soften the door", async () => {
    const { sweepRequests } = stubs();
    const { GET } = await import("@/app/api/cron/delete-account/route");

    const response = await GET(new Request(`https://example.test${PATH}`));
    expect(response.status).not.toBe(200);
    expect(sweepRequests).not.toHaveBeenCalled();
  });
});
