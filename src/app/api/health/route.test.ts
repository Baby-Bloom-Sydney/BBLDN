// ADR-121 / ADR-130 — `/api/health` answers what 06 §7.3 specifies: `{ data: { sha, env, db } }` in the 01 §4c
// envelope, with `db` a **real** read through the data port that fails closed, **200 when it is ok and 503 when
// it is not** — the body is the report, the status is what an uptime probe alerts on. The happy half is pinned here against `stub-auth`
// (a reachable in-memory port); the fail-closed half both here (a port that answers an error) and in the shell
// smoke, where Supabase is unreachable by construction (`scripts/ci/lib/smoke-env.sh`).
//
// Every test loads `auth` and the route **together, after a module reset**: `config/env.ts` parses the environment
// once at module load (so the sha case needs a fresh graph), and the route's `auth` binding must be the same
// instance the test configures — a `configureAuth` on a stale graph would leave the route on the unconfigured
// default, whose real driver fails against no database and would let the fail-closed case pass for the wrong reason.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Auth } from "@/modules/auth";
import { err } from "@/modules/platform";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const get = (headers: Readonly<Record<string, string>> = {}) =>
  new Request("https://example.test/api/health", { method: "GET", headers });

type HealthBody = {
  readonly data?: {
    readonly sha?: unknown;
    readonly env?: unknown;
    readonly db?: unknown;
  };
  readonly error?: unknown;
  readonly requestId?: unknown;
};

async function load() {
  const authModule = await import("@/modules/auth");
  const route = await import("./route");
  return { ...authModule, GET: route.GET };
}

beforeEach(() => {
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", SHA);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("GET /api/health — 06 §7.3 shape in the 01 §4c envelope (ADR-121)", () => {
  it("answers { data: { sha, env, db: 'ok' }, requestId } after one read through the data port", async () => {
    const { GET, configureAuth, stubAuth } = await load();
    configureAuth(stubAuth());

    const response = await GET(get());
    const body = (await response.json()) as HealthBody;

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body.data).toEqual({ sha: SHA, env: "development", db: "ok" });
    expect(body.error).toBeUndefined();
    expect(UUID.test(String(body.requestId))).toBe(true);
    expect(response.headers.get("x-request-id")).toBe(body.requestId);
  });

  it("honours a caller-supplied x-request-id (01 §4c)", async () => {
    const { GET, configureAuth, stubAuth } = await load();
    configureAuth(stubAuth());
    const supplied = "3f9d2c1e-7b4a-4e6f-9a1b-2c3d4e5f6a7b";

    const response = await GET(get({ "x-request-id": supplied }));
    const body = (await response.json()) as HealthBody;

    expect(body.requestId).toBe(supplied);
    expect(response.headers.get("x-request-id")).toBe(supplied);
  });

  it("answers 503 with db: 'failed' — never 'ok', never 200 — when the data port answers an error (ADR-130)", async () => {
    const { GET, configureAuth, stubAuth } = await load();
    const base = stubAuth();
    const run = vi.fn(async () =>
      err("INTERNAL", "Something went wrong on our side.", {
        reason: "db-unreachable",
      }),
    );
    const failingPort: Auth = Object.freeze({
      ...base,
      data: Object.freeze({ ...base.data, run }),
    });
    configureAuth(failingPort);

    const response = await GET(get());
    const body = (await response.json()) as HealthBody;

    expect(run).toHaveBeenCalledTimes(1);
    // ADR-130: the status is what a monitor reads; a 200 here is a watch that never fires.
    expect(response.status).toBe(503);
    // and the body is unchanged — the runbook still learns *which* dependency failed
    expect(body.data).toEqual({ sha: SHA, env: "development", db: "failed" });
    expect(body.error).toBeUndefined();
    expect(UUID.test(String(body.requestId))).toBe(true);
  });

  it("reports the sha as 'unknown' when Vercel's VERCEL_GIT_COMMIT_SHA is absent (a local run)", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", undefined);
    const { GET, configureAuth, stubAuth } = await load();
    configureAuth(stubAuth());

    const body = (await (await GET(get())).json()) as HealthBody;

    expect(body.data).toEqual({ sha: "unknown", env: "development", db: "ok" });
  });
});
