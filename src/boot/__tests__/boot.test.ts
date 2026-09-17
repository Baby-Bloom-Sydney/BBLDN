// The positive half of the boot claim: `src/instrumentation.ts` run against a valid **preview** environment
// replaces every fail-closed default it says it does — proved on the module-level bindings (the wiring, not the
// mocks), and pinned where a port is deliberately left closed so the honest state cannot drift silently.
//
// The environment is `.env.test` (vitest.setup) plus exactly the preview-column names it lacks — the same set
// `scripts/ci/lib/smoke-env.sh` exports for the boot guard — and `NODE_ENV=production`, because that is what a
// Vercel preview runtime sees and what `assertSharedStore` keys on. Every import is dynamic and comes after the
// env is stubbed: `config/env.ts` parses the environment once at module load, and `process.exit` is trapped so a
// misconfigured fixture fails this test instead of the worker.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Email, UnitOfWork } from "@/modules/shared-types";

const PREVIEW_ENV: Readonly<Record<string, string | undefined>> = {
  VERCEL_ENV: "preview",
  NODE_ENV: "production",
  EMAIL_DEV_DRY_RUN: undefined, // config-literal-ok: a dev-only NAME being unset so the preview column parses (refineEnv) — no flag is read here
  NEXT_PUBLIC_DEV_MODE: undefined, // config-literal-ok: same — the boot refuses a preview env that carries a dev-only name
  GOOGLE_AI_API_KEY: "placeholder-google",
  NEXT_PUBLIC_SENTRY_DSN: "https://placeholder@o0.ingest.sentry.example.test/0",
  SENTRY_DSN: "https://placeholder@o0.ingest.sentry.example.test/0",
  ALERT_WEBHOOK_URL: "https://hooks.example.test/placeholder",
};

type Modules = {
  readonly platform: typeof import("@/modules/platform");
  readonly auth: typeof import("@/modules/auth");
  readonly areas: typeof import("@/modules/areas");
  readonly comms: typeof import("@/modules/comms");
  readonly scheduling: typeof import("@/modules/scheduling");
  readonly config: typeof import("@/modules/config");
};

const reasonOf = (result: { ok: boolean }): unknown =>
  "error" in result
    ? (result as { error: { details?: { reason?: unknown } } }).error.details
        ?.reason
    : undefined;

let m: Modules;

beforeAll(async () => {
  for (const [name, value] of Object.entries(PREVIEW_ENV))
    vi.stubEnv(name, value);
  vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(
      `process.exit(${String(code)}) — the boot refused this environment`,
    );
  }) as never);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);

  const { register } = await import("@/instrumentation");
  await register();
  m = {
    platform: await import("@/modules/platform"),
    auth: await import("@/modules/auth"),
    areas: await import("@/modules/areas"),
    comms: await import("@/modules/comms"),
    scheduling: await import("@/modules/scheduling"),
    config: await import("@/modules/config"),
  };
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("after register() in a valid preview environment", () => {
  it("unit of work — withUnitOfWork commits over the RPC-boundary opener", async () => {
    const result = await m.platform.withUnitOfWork(async () =>
      m.platform.ok("committed"),
    );
    expect(result).toEqual({ ok: true, value: "committed" });
  });

  it("auth — the data port is joined to the unit of work boot built (ADR-127)", async () => {
    const inside = await m.platform.withUnitOfWork(async (uow) =>
      m.auth.auth.data.run(
        { name: "auth.probe", exec: async () => "ran inside" },
        { uow },
      ),
    );
    expect(inside).toEqual({ ok: true, value: "ran inside" });
    const foreign = await m.auth.auth.data.run(
      { name: "auth.probe", exec: async () => "must not run" },
      { uow: {} as UnitOfWork },
    );
    expect(reasonOf(foreign)).toBe("unit-of-work-unknown");
  });

  it("events — the db event-log store is installed; its reads fail closed with their own reason", async () => {
    const page = await m.platform.Events.queryEvents({});
    expect(reasonOf(page)).toBe("event-log-read-not-available");
  });

  it("consent — the db consent store is installed; the cookie half fails closed with its own reason", async () => {
    const marketing = await m.platform.consent.hasMarketing({
      kind: "visitor",
      id: "v" as never,
    });
    expect(reasonOf(marketing)).toBe("cookie-consent-not-available");
  });

  it("rate limiter — still denies in a production-resolved runtime: no shared store exists to declare (07 §8)", async () => {
    const policy = Object.values(m.config.SECURITY.rateLimits)[0];
    expect(policy).toBeDefined();
    const result = await m.platform.rateLimiter.consume("k", policy as never);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("INTERNAL");
  });

  it("areas — the provider AREAS_SOURCE names answers (stub in .env.test)", async () => {
    expect(await m.areas.areas.isInServiceArea("SW4")).toBe(true);
  });

  it("comms — the provider EMAIL_PROVIDER names is bound; a send fails on the missing renderer, not on the seam", async () => {
    const sent = await m.comms.comms.send({
      channel: "email",
      templateId: "welcome-parent",
      to: { email: "someone@example.test" as Email },
      data: {},
    });
    expect(reasonOf(sent)).toBe("renderer-not-configured");
  });

  it("scheduling — the in-memory stub is installed on preview", async () => {
    const result = await m.scheduling.scheduling.expireHolds(
      "2026-09-17T09:00:00.000Z" as never,
    );
    expect(result).toEqual({ ok: true, value: { expired: 0 } });
  });

  it("the boot alert's env names survive the PII scrubber under their new key (E1 finding 4)", () => {
    const scrubbed = m.platform.scrubPii({ invalidEnvVars: ["CRON_SECRET"] });
    expect(scrubbed.invalidEnvVars).toEqual(["CRON_SECRET"]);
    expect(
      m.platform.scrubPii({ envNames: ["CRON_SECRET"] }).envNames,
    ).not.toEqual(["CRON_SECRET"]);
  });
});
