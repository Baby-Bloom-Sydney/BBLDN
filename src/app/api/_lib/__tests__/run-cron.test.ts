// The inherited bug, pinned at the route: eleven Sydney cron routes wrote `if (cronSecret) { …check… }`, so with
// `CRON_SECRET` **unset** every caller was treated as authorised (`docs/build-progress.md`, Known bugs;
// security-reviewer CRITICAL at S2). 01 §4e says a route handler fails closed when the secret is unset.
//
// `env` is parsed once at module load, so the unset case is reached by stubbing the one config reader and
// re-importing the route graph — the same technique S3b used for its production wiring guard.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CRON_PATH = "/api/cron/expire-trials";
const SECRET = "a-configured-cron-secret";

const withCronSecret = async (value: string | undefined) => {
  vi.resetModules();
  vi.doMock("@/modules/config/server", () => ({
    env: { environment: "test", public: {}, server: { CRON_SECRET: value } },
  }));
  const { runCron } = await import("../run-cron");
  return runCron;
};

const request = (authorization?: string) =>
  new Request(`https://example.test${CRON_PATH}`, {
    headers: authorization === undefined ? {} : { authorization },
  });

// The clock is pinned because `runCron` gates on the London hour (03:00 London for expire-trials): `vercel.json` schedules a declared
// London time at both candidate UTC hours and the gate discards the one that is not it (`4b`). Left unpinned,
// this file would pass or skip depending on what time of day it was run at.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-15T03:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock("@/modules/config/server");
  vi.resetModules();
});

describe("an unset CRON_SECRET rejects every caller (the Sydney fail-open bug)", () => {
  it("rejects a request carrying no authorization header", async () => {
    const runCron = await withCronSecret(undefined);

    const response = await runCron(request(), CRON_PATH);

    expect(response.status).toBe(401);
  });

  it("rejects a request carrying any bearer at all — nothing can match an absent secret", async () => {
    const runCron = await withCronSecret(undefined);

    const response = await runCron(request("Bearer anything"), CRON_PATH);

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects when the secret is configured as an empty string", async () => {
    const runCron = await withCronSecret("");

    expect((await runCron(request("Bearer "), CRON_PATH)).status).toBe(401);
  });
});

describe("a configured CRON_SECRET is enforced", () => {
  it("rejects a wrong bearer", async () => {
    const runCron = await withCronSecret(SECRET);

    expect((await runCron(request("Bearer wrong"), CRON_PATH)).status).toBe(
      401,
    );
  });

  it("lets the correct bearer past the gate", async () => {
    const runCron = await withCronSecret(SECRET);

    const response = await runCron(request(`Bearer ${SECRET}`), CRON_PATH);

    expect(response.status).not.toBe(401);
  });

  it("does not answer 200 with no handler registered — a shell must not read as 'the job ran'", async () => {
    const runCron = await withCronSecret(SECRET);

    const response = await runCron(request(`Bearer ${SECRET}`), CRON_PATH);

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INTERNAL");
  });
});

describe("an undeclared path never runs", () => {
  it("refuses a cron path that config/crons.ts does not declare, even with the right bearer", async () => {
    const runCron = await withCronSecret(SECRET);

    const response = await runCron(
      request(`Bearer ${SECRET}`),
      "/api/cron/not-a-declared-job",
    );

    expect(response.status).toBe(500);
  });
});

// The route-files-versus-`config/crons.ts` census moved to `cron-declared-vs-used.test.ts` when `4d` struck seven
// crons off the schedule and kept their shells: the account is now three-way (scheduled · owed-but-unscheduled ·
// nothing else), and two copies of a one-for-one assertion would drift the day one of them was widened.
//
// What belongs here is the runtime half of the same ruling, which no static list can show: a shell that is no
// longer declared is **refused**, so striking a cron out of the config really does stop it running even if
// something still calls its URL.
describe("a shell whose schedule was struck off no longer runs", () => {
  it("refuses the seven BAI struck off, with the right bearer, because they are undeclared", async () => {
    const runCron = await withCronSecret(SECRET);

    for (const path of [
      "/api/cron/expire-subscribe-invites",
      "/api/cron/usage-weekly-check",
      "/api/cron/proactive",
      "/api/cron/compact-daily",
      "/api/cron/cleanup-orphan-children",
      "/api/cron/soft-lock-stale-children",
      "/api/cron/snapshot-pipeline",
    ]) {
      const response = await runCron(request(`Bearer ${SECRET}`), path);
      expect(response.status, path).toBe(500);
    }
  });
});
