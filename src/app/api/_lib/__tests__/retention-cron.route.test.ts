// The cron shell for `/api/cron/retention-sweep` (07 §6.2; 01 §4e / §4f; L-009 `3h`).
//
// This route has answered `no-handler-registered` since `1h` wrote the shells, and 07 §6.2 names it in nearly
// every row — so the first claim here is simply that it has an inside now.
//
// The second is the **mapping**, which is where an operator could be misled and where this sweep's words differ
// again from its two siblings'. For `delete-account`, `skipped` is a backlog someone must clear. For
// `purge-scrubbed-users`, `retained` is a person a window still holds. Here, `skipped` is a **class** the
// schedule carries and no job acts on today — 07 §6.2's ★ windows awaiting BAI, plus the evidence log and the
// backups — a standing number that does not fall and is not stuck. `failed` and `capped` are the two an operator
// should actually read, so they are logged under their own names rather than folded into the shared line.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "a-configured-cron-secret";
const PATH = "/api/cron/retention-sweep";
const request = () =>
  new Request(`https://example.test${PATH}`, {
    headers: { authorization: `Bearer ${SECRET}` },
  });

const stubs = (value: {
  handled: number;
  skipped: number;
  failed: number;
  capped: ReadonlyArray<string>;
}) => {
  const sweepRetention = vi.fn(async (_now: string) => ({ ok: true, value }));
  vi.doMock("@/modules/config/server", () => ({
    env: { environment: "test", public: {}, server: { CRON_SECRET: SECRET } },
  }));
  vi.doMock("@/modules/platform", async () => {
    const actual =
      await vi.importActual<typeof import("@/modules/platform")>(
        "@/modules/platform",
      );
    return { ...actual, privacy: { ...actual.privacy, sweepRetention } };
  });
  return { sweepRetention };
};

// The clock is pinned because `runCron` now gates on the London hour (02:00 London): `vercel.json` schedules a declared
// London time at both candidate UTC hours and the gate discards the one that is not it (`4b`). A test that ran at
// the wall-clock of whoever is running it would pass or skip by the hour of day.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-15T02:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.doUnmock("@/modules/config/server");
  vi.doUnmock("@/modules/platform");
  vi.resetModules();
});

describe("/api/cron/retention-sweep", () => {
  it("★ has an inside at last: it calls the job with the run's instant", async () => {
    const { sweepRetention } = stubs({
      handled: 0,
      skipped: 0,
      failed: 0,
      capped: [],
    });
    const { GET } = await import("@/app/api/cron/retention-sweep/route");

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(sweepRetention).toHaveBeenCalledTimes(1);
    expect(String(sweepRetention.mock.calls[0][0])).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
  });

  it("★ rows acted on are `handled`; a class no job acts on today is `skipped`", async () => {
    stubs({ handled: 41, skipped: 9, failed: 0, capped: [] });
    const { GET } = await import("@/app/api/cron/retention-sweep/route");

    const response = await GET(request());

    expect(await response.json()).toMatchObject({
      data: { handled: 41, skipped: 9 },
    });
  });

  it("refuses without the Bearer secret", async () => {
    const { sweepRetention } = stubs({
      handled: 0,
      skipped: 0,
      failed: 0,
      capped: [],
    });
    const { GET } = await import("@/app/api/cron/retention-sweep/route");

    const response = await GET(new Request(`https://example.test${PATH}`));

    expect(response.status).not.toBe(200);
    expect(sweepRetention).not.toHaveBeenCalled();
  });

  it("★ is a DECLARED cron, and the declaration names the job 07 §6.2 names", async () => {
    const { CRONS } = await import("@/modules/config");

    expect(CRONS.map((cron) => cron.path)).toContain(PATH);
    expect(CRONS.find((cron) => cron.path === PATH)?.job).toBe(
      "retention-sweep",
    );
  });
});
