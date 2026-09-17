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
  FamilyId,
  ParentId,
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
  readonly onboardingParent: typeof import("@/modules/onboarding-parent");
  readonly payments: typeof import("@/modules/payments");
  readonly purchasePaths: typeof import("@/modules/purchase-paths");
  readonly accessGate: typeof import("@/modules/access-gate");
};

const DISTRICT = Object.freeze({ area: "Lambeth", district: "SW4" });
const POSITION = "0f1e2d3c-0000-4000-8000-000000000001" as PositionId;
const PARENT = "0a1b2c3d-0000-4000-8000-000000000011" as UserId;
// The `ParentId` / `UserId` seam `1e` recorded: `findLive` is keyed by `ParentId` (03 §2.5 `JourneyOwner`) and
// a session carries a `UserId`. The same id, two brands — spelled out here rather than cast at the call site.
const PARENT_OWNER = PARENT as unknown as ParentId;
const NANNY = "0a1b2c3d-0000-4000-8000-000000000021" as NannyId;
const FAMILY = "0a1b2c3d-0000-4000-8000-000000000031" as FamilyId;

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
    onboardingParent: await import("@/modules/onboarding-parent"),
    payments: await import("@/modules/payments"),
    purchasePaths: await import("@/modules/purchase-paths"),
    accessGate: await import("@/modules/access-gate"),
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

  it("events — the db event-log store is installed and its reads are live; only an unkeyed query is refused", async () => {
    // ADR-131 (1): `queryEvents` now answers on the two indexed access paths. A query with no key is not a read
    // model — the refusal is the store's own, not the dark `event-log-read-not-available` P1-WIRE had to install.
    const page = await m.platform.Events.queryEvents({});
    expect(reasonOf(page)).toBe("event-log-read-requires-key");
  });

  it("consent — the db consent store is installed and its cookie half reads instead of refusing", async () => {
    // ADR-131 (1): `currentCookie` is a keyed read on `visitor_id`, so `hasMarketing` answers from the record.
    // The boot's claim is that the dark binding is gone; that one row round-trips is proved deterministically in
    // `db-consent-store.cookie.test.ts` against a fake port, not against whatever this environment can reach.
    const marketing = await m.platform.consent.hasMarketing({
      kind: "visitor",
      id: "v" as never,
    });
    expect(reasonOf(marketing)).not.toBe("cookie-consent-not-available");
  });

  it("rate limiter — a shared store is declared, so assertSharedStore no longer denies (07 §8; 0017)", async () => {
    // P1-WIRE pinned the opposite: with no `rate_limit_buckets` table there was nothing to declare, so every
    // consume denied. `0017` created it and `wire-rate-limiter.ts` declares it — the denial that remains, if
    // any, comes from the limit or from the database, never from the assertion refusing an undeclared store.
    const policy = Object.values(m.config.SECURITY.rateLimits)[0];
    expect(policy).toBeDefined();
    const result = await m.platform.rateLimiter.consume(
      "boot-probe",
      policy as never,
    );
    expect(reasonOf(result)).not.toBe("rate-limit-store-not-shared");
  });

  it("parent profile — the signup pair store is installed, so signup no longer fails closed (02 §4.1; 1c)", async () => {
    // `1c` shipped `parentProfileStore` fail-closed because 0000–0016 had no definer to write through. 0017
    // has one; the claim here is only that boot replaced the default — the row it writes is proved against
    // the port seam in `db-0017-stores.test.ts`.
    const created = await m.onboardingParent.parentProfileStore.create({
      userId: "00000000-0000-4000-8000-000000000000" as never,
      firstName: "Boot",
      lastName: "Probe",
      mobile: `${m.config.LOCALE.phonePrefix}7700900123` as never,
    });
    expect(reasonOf(created)).not.toBe("profile-store-not-configured");
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

  // `1f`: the db inside replaced the stub in every environment. Asserted on the REASON, not on a happy path —
  // this boot has no database, so the calendar cannot answer; what it must not do is answer as the fail-closed
  // default, because that would mean nothing had wired it at all.
  it("scheduling — the db inside replaced the fail-closed default", async () => {
    const result = await m.scheduling.scheduling.expireHolds(
      "2026-09-17T09:00:00.000Z" as never,
    );
    expect(
      result.ok || result.error.details?.reason !== "SCHEDULING_NOT_CONFIGURED",
    ).toBe(true);
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

  // `1g` changed what this claim is worth. The mirror used to be `memoryCallMirrorStore`, so the port answered
  // `ok(null)` in a process with no database — a comfortable answer that was not a fact about anything. It is
  // now `dbCallMirrorStore`, so the same call reaches `auth`'s data port and fails there, in an environment
  // that has no database. **That failure is the claim**: the port is installed (it no longer says
  // `call-layer-not-configured`) and it is installed over the schema, not over a map that can only agree.
  it("call-layer — the orchestrator is installed on preview, over the db mirror", async () => {
    const open = await m.callLayer.callLayer.findOpenCall(PARENT);
    expect(reasonOf(open)).not.toBe("call-layer-not-configured");
    expect(open.ok).toBe(false);
  });

  it("call-layer — its C rows are registered with the stage model, so advance dispatches into the slice (03 §2.1)", async () => {
    // What boot owes is that the row reaches the registered slice at all; the slice's own behaviour is `1d`'s
    // `call-layer.inside.test.ts`. Since `1g` the handler reads the mirror from the database **before** it
    // reaches its actor gate, so in an environment with no database the probe is refused by the store rather
    // than by the gate — and either way it never reaches a write. `E_SLICE_NOT_REGISTERED` is the answer that
    // would mean boot had not registered anything, and that is what is pinned.
    const moved = await m.positions.advance({
      transition: "C-a",
      entity: { kind: "call", id: POSITION },
      actor: { kind: "system", id: "autofire" },
      payload: { parentId: PARENT, type: "matchmaking", recipient: "parent" },
      expectedFrom: null,
      idempotencyKey: "boot-probe",
    });
    expect(moved.ok).toBe(false);
    expect(reasonOf(moved)).not.toBe("E_SLICE_NOT_REGISTERED");
    expect(reasonOf(moved)).not.toBe("E_TRANSITION_UNKNOWN");
  });

  // AUTH-2 — the wiring `1e` left owed, in the same shape and asserted the same way: against the *named*
  // fail-closed reason, never a happy path. **P1-STORES re-pointed it**, exactly as `1g` re-pointed the C-row
  // probe above and for the same reason: the read now reaches `nanny_positions` through `auth`'s port, so in an
  // environment with no reachable database it fails as the **store** rather than answering `null` out of memory.
  // The claim boot owes is that the seam is bound, and `positions-not-configured` is what "not bound" says.
  it("positions — the reads are installed over the schema; `positions-not-configured` is gone and a failure is the store's, not an unwired seam's", async () => {
    const live = await m.positions.positions.findLive(PARENT_OWNER);
    expect(reasonOf(live)).not.toBe("positions-not-configured");
    expect(live.ok).toBe(false);
    const stage = await m.positions.positions.getStage({
      kind: "position",
      id: POSITION,
    });
    expect(reasonOf(stage)).not.toBe("positions-not-configured");
  });

  it("positions — the P rows are registered with the stage model, so advance dispatches into the slice (03 §2.1 / §2.5)", async () => {
    // Same deliberate refusal the C-row probe uses. `P-2` names exactly one system job (`signup-convert-lead`,
    // 03 §2.4), so `autofire` — a real `SystemJobName` and not that one — would be turned away by the handler's
    // own actor rule. **Since P1-STORES the handler reads the position from the database before it reaches that
    // gate**, so in an environment with no database the probe is refused by the store instead — the same move
    // `1g` made on the C-row probe when the mirror became a db store. Either way it never reaches a write, and
    // `E_SLICE_NOT_REGISTERED` is the answer that would mean boot had registered nothing.
    const moved = await m.positions.advance({
      transition: "P-2",
      entity: { kind: "position", id: POSITION },
      actor: { kind: "system", id: "autofire" },
      payload: {
        parentId: PARENT,
        source: "signup",
        detail: { district: DISTRICT.district },
      },
      expectedFrom: null,
      idempotencyKey: "boot-probe-p2",
    } as never);
    expect(moved.ok).toBe(false);
    expect(reasonOf(moved)).not.toBe("E_SLICE_NOT_REGISTERED");
    expect(reasonOf(moved)).not.toBe("E_TRANSITION_UNKNOWN");
  });

  // `1h`. P1-WIRE left `configurePurchaseProvider` unwired because reaching `stub-stripe` from the boot file
  // put `node:crypto` in the edge instrumentation bundle. That is fixed at the source (the compare is pure
  // arithmetic now), so both ports must actually be installed here — and each is asserted on the **named**
  // fail-closed reason it replaced, never on a happy path, so a port that answered by accident cannot pass.
  it("purchase-paths — stub-stripe replaced provider-not-configured (07 §5.5)", async () => {
    const minted = await m.purchasePaths.purchaseProvider.ensureCustomer({
      id: FAMILY,
      email: "p@example.test" as Email,
      name: "Ada",
    });
    expect(reasonOf(minted)).not.toBe("provider-not-configured");
    expect(minted.ok).toBe(true);
  });

  it("payments — the db inside replaced payments-not-configured, on a read that must not open a gate", async () => {
    // `getAccess` is the read every paywall in the app stands on. Unconfigured it is `payments-not-configured`;
    // wired, it reaches the database, which this environment does not have — so it is `E_STORE`, the store's
    // own reason. Either answer closes the gate; only one of them proves the wiring.
    const state = await m.payments.payments.getAccess(FAMILY);
    expect(reasonOf(state)).not.toBe("payments-not-configured");
    expect(reasonOf(state)).toBe("E_STORE");
  });

  it("payments — prices() renders the config presets, which the unconfigured registry cannot", async () => {
    const presets = m.payments.payments.prices();
    expect(presets.length).toBeGreaterThan(0);
    expect(presets.map((preset) => preset.preset)).toContain("deposit");
  });

  it("payments — the five cron jobs have a binding, so a cron shell no longer answers no-handler", async () => {
    const run = await m.payments.paymentsJobs.run(
      "payment-due-sweep",
      "2026-09-17T09:00:00.000Z" as never,
    );
    expect(reasonOf(run)).not.toBe("payments-not-configured");
  });

  it("access-gate — it derives from payments and therefore fails closed with payments' reason (fix: A-3)", async () => {
    const decision = await m.accessGate.accessGate.hasAccess(FAMILY);
    // The gate never invents an answer: `payments` could not read, so the gate could not decide. A defaulted
    // `open: false` here would be indistinguishable from a real closed gate and would hide the outage.
    expect(decision.ok).toBe(false);
    expect(reasonOf(decision)).toBe("E_STORE");
  });
});

/**
 * ★ `1g`'s pin, flipped — and the one that takes its place, measured on the real wired port.
 *
 * `1g` pinned that `positions` and the call mirror disagreed about where a position lives: the mirror,
 * `connections` and `placements` were db stores while `wire-positions.ts` installed `memoryPositionStore` and
 * refused in production. `dbPositionStore` closes that, in every environment, so the first claim below is a
 * plain `it` — the binding is the db store and the two halves now look in the same table.
 *
 * What remains is one database object, and it is pinned rather than written down. ADR-127 makes one unit of work
 * one RPC: `guard-unit-of-work-query.ts` replaces `insert` / `update` with a refusal for every table reached
 * under a `{ uow }`, and **every** position write runs inside the caller's unit of work
 * (`create-positions-slice.ts` `commit`; `create-positions.ts` `amend` / `recordPrecheck`). `0006` / `0017` /
 * `0018` define no `SECURITY DEFINER` function for `nanny_positions`, so there is nothing to call instead.
 *
 * **What `0019` owes, exactly:**
 *   `public.upsert_position(p_id uuid, p_parent_id uuid, p_source position_source, p_stage position_stage,
 *    p_columns jsonb, p_details jsonb, p_schedule jsonb, p_expected_version integer) returns integer`
 *   — `SECURITY DEFINER`, `search_path` pinned, `EXECUTE` revoked from `public` and granted to `service_role`
 *   only, the owner-bypasses-RLS assertion S5b's review added, writing `nanny_positions` **and**
 *   `position_schedule` in one transaction with the compare-and-set on `version` that `advance` already sends,
 *   and returning the new version. Modelled on `upsert_call_mirror()` (`0018`) — the same shape, for the same
 *   reason — with the same `int.rpc-00NN` functional suite beside it, because S5b's lesson was that metadata
 *   assertions pass over a function that cannot write.
 *
 * **The same gap sits under `connections` and `placements`.** `db-connection-store.ts` and
 * `db-placement-store.ts` (`1g`) write their tables as table writes and pass the caller's `uow` through too, so
 * `0019` owes `connection_requests` and `nanny_placements` the same treatment. Measured here on the seam they
 * all share rather than claimed, so one test failing is the whole family reported.
 *
 * Red on purpose. The unit that writes `0019` flips it; it is never bent to match the code.
 */
describe("boot — the position store, and what 0019 still owes", () => {
  it("positions and the call mirror agree about where a position lives", async () => {
    const { wirePorts } = await import("@/boot/wire-ports");
    const { env } = await import("@/modules/config/server");
    const report = wirePorts(env);
    const positions = report.find((row) => row.port === "positions");
    expect(positions?.binding).not.toContain("memory");
    expect(positions?.binding).not.toBe("unconfigured");
  });

  it.fails(
    "PINNED (ADR-127): a write to nanny_positions inside a unit of work is not refused",
    async () => {
      const refused = await m.platform.withUnitOfWork((uow: UnitOfWork) =>
        m.auth.auth.data.run(
          {
            name: "positions.probeWrite",
            exec: async (q) =>
              q
                .from("nanny_positions")
                .insert({ id: POSITION, parent_id: PARENT } as never),
          },
          { scope: "service", uow },
        ),
      );
      expect(reasonOf(refused)).not.toBe("write-outside-rpc");
    },
  );
});
