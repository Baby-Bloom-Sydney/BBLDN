// The cron shell for `/api/cron/purge-scrubbed-users` (07 §6.1 step 6; 01 §4e / §4f; L-009 `3g`).
//
// The one thing worth driving at this layer is the **mapping**, because it is where the two sweeps' words differ
// and where an operator could be misled. For `delete-account`, `skipped` is a backlog someone must clear. Here,
// `retained` is a person a retention window still holds — a correct outcome that only changes when a date
// arrives — and it maps to the same `skipped` field of the shared run-summary line. A reader who assumes the two
// mean the same thing will chase a queue that is not stuck, so the breakdown is logged under its own names.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "a-configured-cron-secret";
const PATH = "/api/cron/purge-scrubbed-users";
const request = () =>
  new Request(`https://example.test${PATH}`, {
    headers: { authorization: `Bearer ${SECRET}` },
  });

const stubs = (value: { purged: number; retained: number }) => {
  const purgeScrubbedUsers = vi.fn(async (_now: string) => ({
    ok: true,
    value,
  }));
  vi.doMock("@/modules/config/server", () => ({
    env: { environment: "test", public: {}, server: { CRON_SECRET: SECRET } },
  }));
  vi.doMock("@/modules/platform", async () => {
    const actual =
      await vi.importActual<typeof import("@/modules/platform")>(
        "@/modules/platform",
      );
    return {
      ...actual,
      privacy: { ...actual.privacy, purgeScrubbedUsers },
    };
  });
  return { purgeScrubbedUsers };
};

// The clock is pinned because `runCron` gates on the London hour (02:45 London): `vercel.json` schedules a declared
// London time at both candidate UTC hours and the gate discards the one that is not it (`4b`). Left unpinned,
// this file would pass or skip depending on what time of day it was run at.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-15T02:45:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock("@/modules/config/server");
  vi.doUnmock("@/modules/platform");
  vi.resetModules();
});

describe("/api/cron/purge-scrubbed-users", () => {
  it("★ has an inside: it calls the job with the run's instant", async () => {
    const { purgeScrubbedUsers } = stubs({ purged: 0, retained: 0 });
    const { GET } = await import("@/app/api/cron/purge-scrubbed-users/route");

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(purgeScrubbedUsers).toHaveBeenCalledTimes(1);
    expect(purgeScrubbedUsers.mock.calls[0]).toHaveLength(1);
    expect(String(purgeScrubbedUsers.mock.calls[0][0])).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
  });

  it("★ a purge is `handled`; a subject a window still holds is `skipped`", async () => {
    stubs({ purged: 2, retained: 7 });
    const { GET } = await import("@/app/api/cron/purge-scrubbed-users/route");

    const response = await GET(request());

    expect(await response.json()).toMatchObject({
      data: { handled: 2, skipped: 7 },
    });
  });

  it("refuses without the Bearer secret — housekeeping does not soften the door", async () => {
    const { purgeScrubbedUsers } = stubs({ purged: 0, retained: 0 });
    const { GET } = await import("@/app/api/cron/purge-scrubbed-users/route");

    const response = await GET(new Request(`https://example.test${PATH}`));

    expect(response.status).not.toBe(200);
    expect(purgeScrubbedUsers).not.toHaveBeenCalled();
  });

  it("★ the route is a DECLARED cron, or `runCron` refuses it before the secret is even checked", async () => {
    const { CRONS } = await import("@/modules/config");

    expect(CRONS.map((cron) => cron.path)).toContain(PATH);
    expect(CRONS.find((cron) => cron.path === PATH)?.job).toBe(
      "purge-scrubbed-users",
    );
  });
});
