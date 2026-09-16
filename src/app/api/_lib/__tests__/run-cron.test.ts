// The inherited bug, pinned at the route: eleven Sydney cron routes wrote `if (cronSecret) { …check… }`, so with
// `CRON_SECRET` **unset** every caller was treated as authorised (`docs/build-progress.md`, Known bugs;
// security-reviewer CRITICAL at S2). 01 §4e says a route handler fails closed when the secret is unset.
//
// `env` is parsed once at module load, so the unset case is reached by stubbing the one config reader and
// re-importing the route graph — the same technique S3b used for its production wiring guard.
import { afterEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => {
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

describe("every declared cron has a route file, and every route file is declared", () => {
  it("matches config/crons.ts one-for-one", async () => {
    const { CRONS } = await import("@/modules/config");
    const { readdirSync } = await import("node:fs");

    const declared = [...CRONS.map((c) => c.path.split("/").pop())].sort();
    const onDisk = readdirSync("src/app/api/cron").sort();

    expect(onDisk).toEqual(declared);
  });
});
