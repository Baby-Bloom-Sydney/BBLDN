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
import type {
  Email,
  NannyId,
  PositionId,
  UnitOfWork,
  UserId,
} from "@/modules/shared-types";

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
  readonly scoring: typeof import("@/modules/scoring");
  readonly matching: typeof import("@/modules/matching");
  readonly callLayer: typeof import("@/modules/call-layer");
  readonly positions: typeof import("@/modules/positions");
};

const DISTRICT = Object.freeze({ area: "Lambeth", district: "SW4" });
const POSITION = "0f1e2d3c-0000-4000-8000-000000000001" as PositionId;
const PARENT = "0a1b2c3d-0000-4000-8000-000000000011" as UserId;
const NANNY = "0a1b2c3d-0000-4000-8000-000000000021" as NannyId;

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
    scoring: await import("@/modules/scoring"),
    matching: await import("@/modules/matching"),
    callLayer: await import("@/modules/call-layer"),
    positions: await import("@/modules/positions"),
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

  // P1-WIRE-2 — the three ports 1b and 1d left owed. Each claim is the replacement of a named fail-closed
  // default, asserted against the *reason* rather than a happy path, so a port that answered by accident could
  // not pass: `scoring-not-configured`, `matching-not-configured` and `call-layer-not-configured` are what the
  // registries say with no wiring, and `ports.fail-closed.test.ts` proves they still say it.
  it("scoring — the three-layer engine is installed; an empty candidate set scores rather than refusing", async () => {
    const result = await m.scoring.scoring.quickMatch(null, DISTRICT, []);
    expect(reasonOf(result)).not.toBe("scoring-not-configured");
    expect(result).toEqual({ ok: true, value: { total: 0, top: [] } });
  });

  it("matching — the inside over auth's data port is installed; the two 1e methods answer their own not-built", async () => {
    const results = await m.matching.matching.resultsFor(POSITION, {
      kind: "system",
      id: "cascade",
    });
    expect(reasonOf(results)).toBe("not-built");
    expect(reasonOf(results)).not.toBe("matching-not-configured");
    // `connect` is the ADR-126 entry point and is pure, so it answers here with no database at all: a guest is
    // sent to the wizard with the nanny remembered. Only the inside can decide that — the registry refuses.
    const decided = await m.matching.matching.connect({
      nannyId: NANNY,
      surface: "browse",
      session: null,
      leadId: null,
    });
    expect(decided.ok && decided.value.kind).toBe("redirect");
  });

  it("call-layer — the orchestrator is installed on preview, over one memory mirror", async () => {
    const open = await m.callLayer.callLayer.findOpenCall(PARENT);
    expect(reasonOf(open)).not.toBe("call-layer-not-configured");
    expect(open).toEqual({ ok: true, value: null });
  });

  it("call-layer — its C rows are registered with the stage model, so advance dispatches into the slice (03 §2.1)", async () => {
    // `C-a` names three system jobs (03 §2.4) — `call-request`, `signup-convert-lead`, `cascade`. `autofire` is
    // a real `SystemJobName` and is none of them, so the **handler's own** actor rule
    // answers. That is the claim: the row reached the registered slice. The probe is deliberately refused at the
    // actor gate rather than allowed to run, because a row that passed would write the mirror and then emit
    // `call.requested` through the event-log store — a real database this environment does not have. The slice's
    // own behaviour is 1d's `call-layer.inside.test.ts`; what boot owes is that the slice is reachable at all.
    const moved = await m.positions.advance({
      transition: "C-a",
      entity: { kind: "call", id: POSITION },
      actor: { kind: "system", id: "autofire" },
      payload: { parentId: PARENT, type: "matchmaking", recipient: "parent" },
      expectedFrom: null,
      idempotencyKey: "boot-probe",
    });
    expect(reasonOf(moved)).not.toBe("E_SLICE_NOT_REGISTERED");
    expect(reasonOf(moved)).toBe("E_ACTOR_FORBIDDEN");
  });
});
