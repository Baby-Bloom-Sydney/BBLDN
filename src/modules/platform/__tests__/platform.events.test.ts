// The events connector (03 §9.2 / §9.5; 01 §7) and swap test 8 (05 §3): every props fixture parses, PII is
// rejected, `emit` is ok with zero sinks, a failing sink is logged not thrown, only the event-log store under
// `opts.uow` fails the caller, client names are an allow-list, the memory store dedups + reads.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CLIENT_EVENT_NAMES, EVENT_NAMES } from "@/modules/shared-types";
import type {
  EventId,
  EventName,
  Instant,
  PositionId,
  UnitOfWork,
  UserId,
} from "@/modules/shared-types";
import {
  Events,
  EVENT_SCHEMAS,
  configureEvents,
  consoleEventSink,
  createEvents,
  createLogger,
  createUnitOfWork,
  isClientEventName,
  memoryEventLogStore,
  memorySink,
  memoryTransactionOpener,
  ok,
  validateEmitInput,
} from "@/modules/platform";
import type {
  EventEnvelope,
  EventLogStore,
  EventsDeps,
  LogLine,
  Sink,
} from "@/modules/platform";
import { EVENT_PROPS_FIXTURES } from "./fixtures/event-props";

const FIXED = "2026-09-15T08:00:00.000Z" as Instant;
const USER = "00000000-0000-4000-8000-0000000000aa" as UserId;
const POSITION = "00000000-0000-4000-8000-0000000000bb" as PositionId;
const actor = { kind: "user", id: USER, role: "parent" } as const;

function harness(overrides: Partial<EventsDeps> = {}) {
  const lines: LogLine[] = [];
  const log = createLogger({
    sink: (line) => void lines.push(line),
    clock: () => FIXED,
  });
  const store = memoryEventLogStore();
  const idState = { n: 0 };
  const events = createEvents({
    store,
    log,
    clock: () => FIXED,
    newId: () => `evt-${(idState.n += 1)}` as EventId,
    ...overrides,
  });
  return { events, lines, store };
}

describe("platform/events — per-event schemas (03 §9.3; swap test 8 table checks)", () => {
  it("has exactly one schema per EventName, and the augmentation lists every name", () => {
    expect(Object.keys(EVENT_SCHEMAS).sort()).toEqual([...EVENT_NAMES].sort());
    const augmentation = readFileSync(
      resolve(__dirname, "../events/types.ts"),
      "utf8",
    );
    const declared = [
      ...augmentation.matchAll(
        /^\s+"?([a-z.-]+)"?: InferredProps<"[^"]+">;$/gm,
      ),
    ].map((m) => m[1]);
    expect(declared.sort()).toEqual([...EVENT_NAMES].sort());
  });

  it.each(EVENT_NAMES)("%s — the fixture parses", (name) => {
    const parsed = EVENT_SCHEMAS[name].safeParse(EVENT_PROPS_FIXTURES[name]);
    expect(
      parsed.success,
      JSON.stringify(parsed.success ? null : parsed.error.issues),
    ).toBe(true);
  });

  it.each(EVENT_NAMES)("%s — an unlisted key is rejected (strict)", (name) => {
    const parsed = EVENT_SCHEMAS[name].safeParse({
      ...EVENT_PROPS_FIXTURES[name],
      email: "a@b.test",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects PII-shaped strings in any string field (03 §9.2 rule 3; 07 §4.44)", () => {
    expect(
      EVENT_SCHEMAS["ui.click"].safeParse({
        surface: "pricing",
        target: "ann@example.test",
      }).success,
    ).toBe(false);
    expect(
      EVENT_SCHEMAS["ui.click"].safeParse({
        surface: "+44 7700 900123", // config-literal-ok: PII fixture the schema must reject
        target: "x",
      }).success,
    ).toBe(false);
    expect(
      EVENT_SCHEMAS.visit.safeParse({ path: "/x?email=ann@example.test" })
        .success,
    ).toBe(false);
    expect(
      EVENT_SCHEMAS["position.amended"].safeParse({
        fields: ["Ann Smith wants…".repeat(20)],
        version: 1,
      }).success,
    ).toBe(false);
  });

  it("every ClientEventName is an EventName and isClientEventName is the allow-list", () => {
    for (const name of CLIENT_EVENT_NAMES) expect(EVENT_NAMES).toContain(name);
    expect(isClientEventName("ui.click")).toBe(true);
    expect(isClientEventName("bundle.paid")).toBe(false);
    expect(isClientEventName("not.an.event")).toBe(false);
  });

  it("validateEmitInput names the failure: unknown-name · props · server-only-name", () => {
    const unknown = validateEmitInput(
      { name: "nope", actor, props: {} } as never,
      "server",
    );
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.details?.reason).toBe("unknown-name");

    const props = validateEmitInput(
      { name: "visit", actor, props: { path: 3 } as never },
      "server",
    );
    expect(props.ok).toBe(false);
    if (!props.ok) {
      expect(props.error.code).toBe("VALIDATION");
      expect(props.error.details?.reason).toBe("props");
      expect(props.error.details?.issues?.[0]).toContain("path");
    }

    const serverOnly = validateEmitInput(
      {
        name: "bundle.paid",
        actor,
        props: EVENT_PROPS_FIXTURES["bundle.paid"] as never,
      },
      "client",
    );
    expect(serverOnly.ok).toBe(false);
    if (!serverOnly.ok)
      expect(serverOnly.error.details?.reason).toBe("server-only-name");

    expect(
      validateEmitInput(
        { name: "visit", actor, props: { path: "/" } },
        "client",
      ).ok,
    ).toBe(true);
  });
});

describe("platform/events — emit (03 §9.2 rules 1–5)", () => {
  it("is ok with zero sinks, writes the event-log row, and logs one line per emit", async () => {
    const { events, lines, store } = harness();
    const result = await events.emit({
      name: "visit",
      actor: { kind: "anonymous" },
      props: { path: "/" },
      requestId: "req-1",
    });
    expect(result).toEqual({ ok: true, value: { id: "evt-1" } });
    expect(events.listSinks()).toEqual(["event-log"]);
    const rows = await store.query({});
    expect(rows.ok && rows.value.rows).toHaveLength(1);
    expect(rows.ok && rows.value.rows[0]).toMatchObject({
      id: "evt-1",
      name: "visit",
      ts: FIXED,
      source: "server",
      requestId: "req-1",
    });
    const emitted = lines.filter((line) => line.msg === "event.emitted");
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      level: "info",
      eventName: "visit",
      eventId: "evt-1",
      requestId: "req-1",
    });
  });

  it("returns VALIDATION for an unknown name or bad props and writes nothing", async () => {
    const { events, store } = harness();
    const bad = await events.emit({
      name: "visit",
      actor,
      props: { path: 1 } as never,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe("VALIDATION");
    const rows = await store.query({});
    expect(rows.ok && rows.value.rows).toHaveLength(0);
  });

  it("fans out to subscribed sinks after the log write; a failing or slow sink is logged with ALERT_EVENT_SINK_FAILED, never thrown", async () => {
    const { events, lines } = harness({ defaultTimeoutMs: 20 });
    const good = memorySink({ id: "console" });
    const failing: Sink = {
      id: "meta",
      handle: async () => ({
        ok: false,
        error: {
          code: "PROVIDER_ERROR",
          message: "meta 500",
          details: { provider: "meta" },
        },
      }),
    };
    const throwing: Sink = {
      id: "vercel-analytics",
      handle: async () => {
        throw new Error("boom");
      },
    };
    const slow: Sink = {
      id: "meta",
      timeoutMs: 5,
      handle: () =>
        new Promise((resolveSlow) =>
          setTimeout(() => resolveSlow(ok(undefined)), 200),
        ),
    };
    events.subscribe("*", good);
    events.subscribe(["visit"], failing);
    events.subscribe("ui.click", throwing);
    events.subscribe("*", slow);
    expect(events.listSinks()).toEqual([
      "event-log",
      "console",
      "meta",
      "vercel-analytics",
      "meta",
    ]);

    const result = await events.emit({
      name: "visit",
      actor: { kind: "anonymous" },
      props: { path: "/" },
    });
    expect(result.ok).toBe(true);
    expect(good.envelopes).toHaveLength(1);
    expect(good.envelopes[0]?.name).toBe("visit");
    const alerts = lines.filter(
      (line) => line.alert === "ALERT_EVENT_SINK_FAILED",
    );
    expect(alerts.map((line) => [line.sink, line.reason])).toEqual([
      ["meta", "PROVIDER_ERROR"],
      ["meta", "timeout"],
    ]);
    expect(alerts.every((line) => line.level === "warn")).toBe(true);

    const clicked = await events.emit({
      name: "ui.click",
      actor: { kind: "anonymous" },
      props: { surface: "s", target: "t" },
    });
    expect(clicked.ok).toBe(true);
    const thrown = lines.filter(
      (line) =>
        line.alert === "ALERT_EVENT_SINK_FAILED" &&
        line.sink === "vercel-analytics",
    );
    expect(thrown).toHaveLength(1);
    expect(thrown[0]?.reason).toBe("INTERNAL");
  });

  it("unsubscribe removes the sink", async () => {
    const { events } = harness();
    const sink = memorySink();
    const off = events.subscribe("*", sink);
    off();
    await events.emit({
      name: "visit",
      actor: { kind: "anonymous" },
      props: { path: "/" },
    });
    expect(sink.envelopes).toHaveLength(0);
    expect(events.listSinks()).toEqual(["event-log"]);
  });

  it("without opts.uow a failed event-log write is logged (warn, ALERT_EVENT_SINK_FAILED) and the caller still gets ok", async () => {
    const broken: EventLogStore = {
      ...memoryEventLogStore(),
      insert: async () => ({
        ok: false,
        error: { code: "INTERNAL", message: "db down" },
      }),
    };
    const { events, lines } = harness({ store: broken });
    const result = await events.emit({
      name: "visit",
      actor: { kind: "anonymous" },
      props: { path: "/" },
    });
    expect(result.ok).toBe(true);
    expect(
      lines.some(
        (line) =>
          line.alert === "ALERT_EVENT_SINK_FAILED" && line.sink === "event-log",
      ),
    ).toBe(true);
  });

  it("with opts.uow the event-log write is inside the unit of work: its failure fails the caller (INTERNAL), and the row joins the transaction", async () => {
    const seen: Array<UnitOfWork | undefined> = [];
    const store = memoryEventLogStore();
    const observing: EventLogStore = {
      ...store,
      insert: async (envelope, opts) => {
        seen.push(opts?.uow);
        return store.insert(envelope, opts);
      },
    };
    const { events } = harness({ store: observing });
    const binding = createUnitOfWork(memoryTransactionOpener());
    const outcome = await binding.withUnitOfWork(async (uow) =>
      events.emit(
        { name: "visit", actor: { kind: "anonymous" }, props: { path: "/" } },
        { uow },
      ),
    );
    expect(outcome.ok).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeDefined();

    const failing: EventLogStore = {
      ...store,
      insert: async () => ({
        ok: false,
        error: { code: "INTERNAL", message: "db down" },
      }),
    };
    const strict = harness({ store: failing });
    const failed = await binding.withUnitOfWork(async (uow) =>
      strict.events.emit(
        { name: "visit", actor: { kind: "anonymous" }, props: { path: "/" } },
        { uow },
      ),
    );
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.error.code).toBe("INTERNAL");
  });

  it("strips fbclid from attribution unless the ConsentReader says marketing is on (03 §9.2; 07 §2.9)", async () => {
    const no = harness({ consent: { hasMarketing: async () => ok(false) } });
    await no.events.emit({
      name: "visit",
      actor: { kind: "anonymous" },
      props: { path: "/" },
      attribution: { fbclid: "abc", referrer: "google.com", src: "std" },
    });
    const rows = await no.store.query({});
    expect(rows.ok && rows.value.rows[0]?.attribution).toEqual({
      referrer: "google.com",
      src: "std",
    });

    const yes = harness({ consent: { hasMarketing: async () => ok(true) } });
    await yes.events.emit({
      name: "visit",
      actor: { kind: "visitor", id: "v1" as never },
      props: { path: "/" },
      attribution: { fbclid: "abc" },
    });
    const kept = await yes.store.query({});
    expect(kept.ok && kept.value.rows[0]?.attribution).toEqual({
      fbclid: "abc",
    });
  });

  it("rejects a referrer that is not a bare hostname (03 §9.2 hostname only)", async () => {
    const { events } = harness();
    const result = await events.emit({
      name: "visit",
      actor: { kind: "anonymous" },
      props: { path: "/" },
      attribution: { referrer: "https://google.com/search?q=ann" },
    });
    expect(result.ok).toBe(false);
  });

  it("never throws: a programmer error inside emit becomes INTERNAL and an error log line", async () => {
    const exploding: EventLogStore = {
      ...memoryEventLogStore(),
      insert: async () => {
        throw new Error("unexpected");
      },
    };
    const { events, lines } = harness({ store: exploding });
    const result = await events.emit({
      name: "visit",
      actor: { kind: "anonymous" },
      props: { path: "/" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INTERNAL");
    expect(lines.some((line) => line.level === "error")).toBe(true);
  });

  it("the console sink writes one structured log line per envelope through platform.log, ids only", async () => {
    const { events, lines } = harness();
    const log = createLogger({
      sink: (line) => void lines.push(line),
      clock: () => FIXED,
    });
    events.subscribe("*", consoleEventSink(log));
    await events.emit({
      name: "profile.viewed",
      actor,
      props: { nannyId: USER },
      positionId: POSITION,
      requestId: "req-7",
    });
    const line = lines.find((entry) => entry.msg === "event");
    expect(line).toMatchObject({
      level: "info",
      eventName: "profile.viewed",
      eventId: "evt-1",
      actorKind: "user",
      positionId: POSITION,
      requestId: "req-7",
    });
    expect(JSON.stringify(line)).not.toContain("props");
  });
});

describe("platform/events — memoryEventLogStore (the event-log stub; 02 §4.6 semantics)", () => {
  it("dedups on id and on (name, idempotencyKey)", async () => {
    const store = memoryEventLogStore();
    const base = {
      id: "e1" as EventId,
      name: "visit" as const,
      ts: FIXED,
      source: "server" as const,
      actor: { kind: "anonymous" as const },
      props: { path: "/" },
    };
    expect((await store.insert(base)).ok).toBe(true);
    expect((await store.insert(base)).ok).toBe(true);
    expect(
      (
        await store.insert({
          ...base,
          id: "e2" as EventId,
          idempotencyKey: "k",
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await store.insert({
          ...base,
          id: "e3" as EventId,
          idempotencyKey: "k",
        })
      ).ok,
    ).toBe(true);
    const rows = await store.query({});
    expect(rows.ok && rows.value.rows.map((row) => row.id)).toEqual([
      "e1",
      "e2",
    ]);
  });

  it("queries by names, positionId, subject, window, with limit + cursor; counts by name and by day", async () => {
    const store = memoryEventLogStore();
    const mk = (
      id: string,
      name: EventName,
      ts: string,
      positionId?: PositionId,
    ): EventEnvelope =>
      ({
        id,
        name,
        ts,
        source: "server",
        actor: { kind: "anonymous" },
        props: {},
        positionId,
        subject: { kind: "lead", id: "lead-1" },
      }) as unknown as EventEnvelope;
    await store.insert(mk("a", "visit", "2026-09-14T10:00:00.000Z"));
    await store.insert(mk("b", "visit", "2026-09-15T10:00:00.000Z", POSITION));
    await store.insert(
      mk("c", "lead.created", "2026-09-15T11:00:00.000Z", POSITION),
    );

    const byName = await store.query({ names: ["visit"] });
    expect(byName.ok && byName.value.rows.map((row) => row.id)).toEqual([
      "a",
      "b",
    ]);
    const byPosition = await store.query({ positionId: POSITION });
    expect(byPosition.ok && byPosition.value.rows.map((row) => row.id)).toEqual(
      ["b", "c"],
    );
    const bySubject = await store.query({
      subject: { kind: "lead", id: "lead-1" },
      from: "2026-09-15T00:00:00.000Z" as Instant,
      to: "2026-09-15T10:30:00.000Z" as Instant,
    });
    expect(bySubject.ok && bySubject.value.rows.map((row) => row.id)).toEqual([
      "b",
    ]);

    const page1 = await store.query({ limit: 2 });
    expect(page1.ok && page1.value.rows.map((row) => row.id)).toEqual([
      "a",
      "b",
    ]);
    expect(page1.ok && page1.value.nextCursor).toBe("2");
    const page2 = await store.query({
      limit: 2,
      cursor: page1.ok ? page1.value.nextCursor : undefined,
    });
    expect(page2.ok && page2.value.rows.map((row) => row.id)).toEqual(["c"]);
    expect(page2.ok && page2.value.nextCursor).toBeUndefined();

    const counts = await store.countByName({
      names: ["visit", "lead.created"],
      from: "2026-09-14T00:00:00.000Z" as Instant,
      to: "2026-09-16T00:00:00.000Z" as Instant,
    });
    expect(counts.ok && counts.value).toEqual([
      { name: "visit", count: 2 },
      { name: "lead.created", count: 1 },
    ]);
    const byDay = await store.countByName({
      names: ["visit"],
      from: "2026-09-14T00:00:00.000Z" as Instant,
      to: "2026-09-16T00:00:00.000Z" as Instant,
      groupBy: "day",
    });
    expect(byDay.ok && byDay.value).toEqual([
      { name: "visit", day: "2026-09-14", count: 1 },
      { name: "visit", day: "2026-09-15", count: 1 },
    ]);
  });

  it("the connector's read helpers delegate to the store", async () => {
    const { events } = harness();
    await events.emit({
      name: "visit",
      actor: { kind: "anonymous" },
      props: { path: "/" },
    });
    const page = await events.queryEvents({ names: ["visit"] });
    expect(page.ok && page.value.rows).toHaveLength(1);
    const counts = await events.countByName({
      names: ["visit"],
      from: "2026-09-01T00:00:00.000Z" as Instant,
      to: "2026-10-01T00:00:00.000Z" as Instant,
    });
    expect(counts.ok && counts.value).toEqual([{ name: "visit", count: 1 }]);
  });
});

describe("platform/events — the module-level Events connector", () => {
  it("delegates to whatever configureEvents installed (swap: event-log → memory store, nothing else changes)", async () => {
    const { events, store } = harness();
    configureEvents(events);
    const result = await Events.emit({
      name: "visit",
      actor: { kind: "anonymous" },
      props: { path: "/" },
    });
    expect(result.ok).toBe(true);
    const rows = await store.query({});
    expect(rows.ok && rows.value.rows).toHaveLength(1);
    expect(Events.listSinks()).toEqual(["event-log"]);
  });
});
