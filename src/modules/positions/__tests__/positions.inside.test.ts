// The inside (1e): the P-row slice over the memory store, registered through the same seam every other slice
// uses, with every write inside a memory unit of work. Each `it` is a claim the merge rests on (ADR-123 keeps
// ADR-120 rule 1): the position moves only through `advance`, I-1 holds, the actor rule holds, the two cascades
// a P row owns actually fire, and what the document has and this unit does not build is pinned `it.fails`
// rather than quietly dropped.
import { beforeEach, describe, expect, it } from "vitest";
import { LOCALE } from "@/modules/config";
import {
  POSITION_TRANSITIONS,
  advance,
  configurePositions,
  createPositions,
  createPositionsSlice,
  memoryPositionStore,
  positions,
  registerPositionsSlice,
  registerSlice,
} from "@/modules/positions";
import type { PositionMatchDetail, PositionStore } from "@/modules/positions";
import { configureConnections } from "@/modules/connections";
import type { ConnectionSummary } from "@/modules/connections";
import {
  configureEvents,
  configureUnitOfWork,
  createEvents,
  createUnitOfWork,
  err,
  log,
  memoryEventLogStore,
  memoryTransactionOpener,
  ok,
} from "@/modules/platform";
import type {
  Actor,
  ConnectionId,
  Email,
  Instant,
  NannyId,
  ParentId,
  PositionId,
  TransitionSpec,
  UserId,
} from "@/modules/shared-types";

const NOW = "2026-01-09T08:00:00.000Z" as Instant;
const POSITION = "0f1e2d3c-0000-4000-8000-0000000000a1" as PositionId;
const OTHER = "0f1e2d3c-0000-4000-8000-0000000000a2" as PositionId;
const PARENT = "0a1b2c3d-0000-4000-8000-0000000000b1" as UserId;
const OTHER_PARENT = "0a1b2c3d-0000-4000-8000-0000000000b2" as UserId;
const NANNY = "0a1b2c3d-0000-4000-8000-0000000000c1" as NannyId;

const parent: Actor = { kind: "user", id: PARENT, role: "parent" };
const stranger: Actor = { kind: "user", id: OTHER_PARENT, role: "parent" };
const admin: Actor = { kind: "admin", id: "admin-1" as never };
const convert: Actor = { kind: "system", id: "signup-convert-lead" };
const cascadeActor: Actor = { kind: "system", id: "cascade" };

const DETAIL: PositionMatchDetail = Object.freeze({
  area: { area: "Islington", district: "N1" },
  schedule: { type: "Fixed", blocks: [{ day: 0, part: "morning" }] } as const,
  requirements: {
    childAgeMonths: [{ min: 12, max: 24 }],
    capacity: 1,
    specialNeeds: false,
    licence: false,
    car: false,
    vaccination: false,
    nonSmoker: false,
    pets: false,
    roleType: "",
  },
});

const openPayload = (parentId: UserId = PARENT) => ({
  parentId: parentId as string as ParentId,
  source: "results_signup" as const,
  detail: DETAIL,
  recipient: { email: "ada@example.test" as Email, name: "Ada" },
  mobile: `${LOCALE.phonePrefix}7700900123`,
});

let store: PositionStore;
let inServiceArea: boolean;
let callSliceRefuses: boolean;
const cascadesSeen: string[] = [];
/** H-12 — what the `connections` connector answers for this position, and whether it answers at all. */
let connectionRows: ReadonlyArray<ConnectionSummary>;
let connectionsRefuse: boolean;
const k24Actors: Array<Actor> = [];

/**
 * A stand-in for `call-layer`'s C rows, registered through the same seam the real slice uses. It exists so this
 * suite can prove what P-2 and P-7 do to the call **without** importing `call-layer` — which `positions` may
 * never do (fix: A-2 / R2), and which is the whole point of the registry.
 */
const fakeCallSlice = () =>
  (["C-a", "C-4"] as const).map((id) => ({
    id,
    run: async () => {
      cascadesSeen.push(id);
      return callSliceRefuses
        ? err("CONFLICT", "the call refused", { reason: "E_STALE_STATE" })
        : ok({
            entity: { kind: "call" as const, id: POSITION },
            stage:
              id === "C-a" ? ("awaiting-slot" as const) : ("done" as const),
            version: 1,
            changedAt: NOW,
            cascaded: [],
            events: [],
          });
    },
  }));

/**
 * The K-row receiver, registered through the same seam `connections` uses at boot. It exists so this suite can
 * prove what P-7 does to a connection **without** importing `connections`' slice — the arrow `positions` has is
 * to the connector's reads, never to the slice (fix: A-2 / R2).
 */
const fakeConnectionSlice = () => [
  {
    id: "K-24" as const,
    run: async (input: {
      readonly entity: { readonly kind: string; readonly id: string };
      readonly actor: Actor;
    }) => {
      cascadesSeen.push("K-24");
      k24Actors.push(input.actor);
      return ok({
        entity: input.entity as never,
        stage: "CANCELLED_BY_PARENT" as const,
        version: 1,
        changedAt: NOW,
        cascaded: [],
        events: [],
      });
    },
  },
];

const wire = () => {
  store = memoryPositionStore();
  inServiceArea = true;
  callSliceRefuses = false;
  connectionsRefuse = false;
  cascadesSeen.length = 0;
  k24Actors.length = 0;
  // Two live connections on the position by default, so P-7's K-24 fan-out has something to fan out to.
  connectionRows = [
    {
      connectionId: "conn-1" as ConnectionId,
      positionId: POSITION,
      nannyId: NANNY,
      stage: "REQUEST_SENT",
      origin: "parent_request",
    },
    {
      connectionId: "conn-2" as ConnectionId,
      positionId: POSITION,
      nannyId: NANNY,
      stage: "INTRO_SCHEDULED",
      origin: "parent_request",
    },
  ];
  registerPositionsSlice(
    createPositionsSlice({
      store,
      isInServiceArea: async () => inServiceArea,
      clock: () => NOW,
    }),
  );
  registerSlice({ entity: "call", handlers: fakeCallSlice() });
  registerSlice({ entity: "connection", handlers: fakeConnectionSlice() });
  configureConnections({
    liveNannyIdsForParent: async () => ok([]),
    liveCountForPosition: async () => ok(connectionRows.length),
    forParent: async () =>
      connectionsRefuse
        ? err("INTERNAL", "the connection list did not answer", {
            reason: "connections-not-configured" as const,
          })
        : ok(connectionRows),
    // `2d` — the rail's `{nanny}` read. This suite is about the stage model, not the name, so it answers none:
    // every row below renders the nameless line, which is the fallback the rail is required to keep.
    nannyNameOf: async () => ok(null),
  });
  configurePositions(createPositions({ store }));
};

beforeEach(() => {
  configureUnitOfWork(createUnitOfWork(memoryTransactionOpener()));
  configureEvents(createEvents({ store: memoryEventLogStore(), log }));
  wire();
});

const open = (
  positionId: PositionId = POSITION,
  actor: Actor = convert,
  parentId: UserId = PARENT,
) =>
  advance({
    entity: { kind: "position", id: positionId },
    transition: "P-2",
    actor,
    payload: openPayload(parentId),
    expectedFrom: null,
    idempotencyKey: `open:${positionId}`,
  });

describe("the §2.4 position table", () => {
  it("carries exactly the seven P rows, each with the document's movers and idempotency", () => {
    expect(POSITION_TRANSITIONS.map((spec) => spec.id)).toEqual([
      "P-1",
      "P-2",
      "P-3",
      "P-4",
      "P-5",
      "P-6",
      "P-7",
    ]);
    const byId = (id: string): TransitionSpec =>
      POSITION_TRANSITIONS.find((spec) => spec.id === id) as TransitionSpec;
    expect(byId("P-2").from).toEqual([null, "DRAFT"]);
    expect(byId("P-2").systemJobs).toEqual(["signup-convert-lead"]);
    expect(byId("P-5").idempotency).toBe("reject");
    expect(byId("P-7").from).toEqual(["DRAFT", "OPEN", "CONNECTING"]);
  });

  it.fails(
    "PINNED (03 §2.5 `declare const TRANSITIONS` — the 44 rows as one table): every §2.4 row id resolves to a spec",
    () => {
      // `1e` owns the seven P rows; the C rows are `call-layer`'s and the 25 K + 3 L rows are `1f` / `1g`'s. The
      // table test the contract asks for (every `TransitionId` ↔ §2.4) cannot run until all four tables exist,
      // and building the K / L specs here would put another module's rules in this one.
      expect(POSITION_TRANSITIONS).toHaveLength(44);
    },
  );
});

describe("P-2 — the position opens, and its own cascade opens the call (03 §2.4)", () => {
  it("creates the position at OPEN and emits position.created", async () => {
    const result = await open();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stage).toBe("OPEN");
    expect(result.value.events).toEqual(["position.created"]);
    const read = await positions.getStage({ kind: "position", id: POSITION });
    expect(read.ok && read.value.stage).toBe("OPEN");
  });

  it("is a noop the second time, so a retried signup never opens two positions", async () => {
    await open();
    const again = await advance({
      entity: { kind: "position", id: POSITION },
      transition: "P-2",
      actor: convert,
      payload: openPayload(),
      expectedFrom: "OPEN",
      idempotencyKey: `open:${POSITION}`,
    });
    expect(again.ok && again.value.events).toEqual([]);
    expect(again.ok && again.value.stage).toBe("OPEN");
  });

  it("refuses a second live position for the same parent (I-1)", async () => {
    await open();
    const second = await open(OTHER, convert, PARENT);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe("CONFLICT");
    expect(second.error.details).toMatchObject({
      reason: "E_PRECONDITION_FAILED",
      which: "ONE_LIVE_POSITION",
    });
  });

  it("refuses a district the areas table does not carry (03 §6)", async () => {
    inServiceArea = false;
    const result = await open();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details).toMatchObject({
      which: "DISTRICT_NOT_IN_AREAS",
    });
  });

  it("refuses a parent with no mobile", async () => {
    const result = await advance({
      entity: { kind: "position", id: POSITION },
      transition: "P-2",
      actor: convert,
      payload: { ...openPayload(), mobile: "  " },
      expectedFrom: null,
      idempotencyKey: "k",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details).toMatchObject({ which: "PARENT_HAS_MOBILE" });
  });

  it("refuses a job the row does not name, and a stale expectedFrom", async () => {
    const wrongJob = await advance({
      entity: { kind: "position", id: POSITION },
      transition: "P-2",
      actor: { kind: "system", id: "autofire" },
      payload: openPayload(),
      expectedFrom: null,
      idempotencyKey: "k",
    });
    expect(wrongJob.ok).toBe(false);
    expect(!wrongJob.ok && wrongJob.error.code).toBe("FORBIDDEN");

    const stale = await advance({
      entity: { kind: "position", id: POSITION },
      transition: "P-2",
      actor: convert,
      payload: openPayload(),
      expectedFrom: "DRAFT",
      idempotencyKey: "k",
    });
    expect(!stale.ok && stale.error.details).toMatchObject({
      reason: "E_STALE_STATE",
    });
  });

  it("fires C-a inside the same advance, and reports it on `cascaded` (§2.4 P-2 side effects)", async () => {
    const result = await open();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(cascadesSeen).toEqual(["C-a"]);
    expect(result.value.cascaded).toEqual([
      {
        entity: { kind: "call", id: POSITION },
        transition: "C-a",
        stage: "awaiting-slot",
      },
    ]);
  });

  it("carries a refusing call cascade up rather than committing half the row", async () => {
    callSliceRefuses = true;
    const result = await open();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CONFLICT");
  });
});

describe("P-7 — close, and the call it closes with it", () => {
  beforeEach(async () => {
    await open();
  });

  it("closes with the reason and emits position.closed", async () => {
    const result = await advance({
      entity: { kind: "position", id: POSITION },
      transition: "P-7",
      actor: parent,
      payload: { closeReason: "parent_closed" },
      expectedFrom: "OPEN",
      idempotencyKey: "close-1",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stage).toBe("CLOSED");
    expect(result.value.events).toEqual(["position.closed"]);
    expect(cascadesSeen).toContain("C-4");
  });

  it("refuses a close reason outside the enum", async () => {
    const result = await advance({
      entity: { kind: "position", id: POSITION },
      transition: "P-7",
      actor: parent,
      payload: { closeReason: "because" },
      expectedFrom: "OPEN",
      idempotencyKey: "close-2",
    });
    expect(!result.ok && result.error.details).toMatchObject({
      reason: "E_PAYLOAD_INVALID",
    });
  });

  it("refuses a parent who is not party to the position", async () => {
    const result = await advance({
      entity: { kind: "position", id: POSITION },
      transition: "P-7",
      actor: stranger,
      payload: { closeReason: "parent_closed" },
      expectedFrom: "OPEN",
      idempotencyKey: "close-3",
    });
    expect(!result.ok && result.error.details).toMatchObject({
      reason: "E_ACTOR_FORBIDDEN",
      which: "not-party",
    });
  });

  // H-12, closed. 03 §2.4's P-7 also cascades **K-24** onto every live connection, and `connections` was already
  // built to receive it (`runCascades`'s `fromPositionClose`, which is true exactly when the actor is the
  // `cascade` job) — but no caller could set it, because `positions` dispatched only C-4. Two halves of one
  // seam, built by two units, never joined. The pin is flipped by joining them, not by changing the assertion.
  it("closing cascades K-24 on every live connection (03 §2.4 P-7)", async () => {
    const result = await advance({
      entity: { kind: "position", id: POSITION },
      transition: "P-7",
      actor: admin,
      payload: { closeReason: "admin_closed" },
      expectedFrom: "OPEN",
      idempotencyKey: "close-4",
    });
    expect(
      result.ok && result.value.cascaded.map((each) => each.transition),
    ).toContain("K-24");
    // One per live connection, and the job is named so `connections` reads `fromPositionClose` as true and does
    // not reopen the position it is being closed with (K-24's own "and not from P-7").
    expect(cascadesSeen.filter((id) => id === "K-24")).toHaveLength(2);
    expect(k24Actors.every((actor) => actor.id === "cascade")).toBe(true);
  });

  // A connection past `ACCEPTED` ends through L-2, never here: K-24's `from` is `CANCELLABLE`, which is
  // `LIVE_STAGES` minus `CONFIRMED` and `ACTIVE` (`connection-transitions.ts`). Cascading onto one would be a
  // refusal the close then had to swallow, which is how a silent half-move starts.
  it("leaves a CONFIRMED connection alone — that one ends through L-2", async () => {
    connectionRows = [
      {
        connectionId: "conn-confirmed" as ConnectionId,
        positionId: POSITION,
        nannyId: NANNY,
        stage: "CONFIRMED",
        origin: "parent_request",
      },
    ];
    await advance({
      entity: { kind: "position", id: POSITION },
      transition: "P-7",
      actor: admin,
      payload: { closeReason: "admin_closed" },
      expectedFrom: "OPEN",
      idempotencyKey: "close-5",
    });
    expect(cascadesSeen).not.toContain("K-24");
  });

  // Fail closed: a close that cannot enumerate its connections has not cascaded, and must not say it has.
  it("refuses the close when the connection list cannot be read", async () => {
    connectionsRefuse = true;
    const result = await advance({
      entity: { kind: "position", id: POSITION },
      transition: "P-7",
      actor: admin,
      payload: { closeReason: "admin_closed" },
      expectedFrom: "OPEN",
      idempotencyKey: "close-6",
    });
    expect(result.ok).toBe(false);
  });
});

describe("the K-row cascades that arrive at a P row", () => {
  beforeEach(async () => {
    await open();
  });

  it("P-3 moves OPEN → CONNECTING for the cascade job only", async () => {
    const byParent = await advance({
      entity: { kind: "position", id: POSITION },
      transition: "P-3",
      actor: parent,
      payload: {},
      expectedFrom: "OPEN",
      idempotencyKey: "p3-user",
    });
    expect(!byParent.ok && byParent.error.code).toBe("FORBIDDEN");

    const result = await advance({
      entity: { kind: "position", id: POSITION },
      transition: "P-3",
      actor: cascadeActor,
      payload: {},
      expectedFrom: "OPEN",
      idempotencyKey: "p3",
    });
    expect(result.ok && result.value.stage).toBe("CONNECTING");
    expect(result.ok && result.value.events).toEqual(["position.connecting"]);
  });

  it("P-5 records who filled the position and rejects a repeat (idempotency `reject`)", async () => {
    await advance({
      entity: { kind: "position", id: POSITION },
      transition: "P-3",
      actor: cascadeActor,
      payload: {},
      expectedFrom: "OPEN",
      idempotencyKey: "p3",
    });
    const active = await advance({
      entity: { kind: "position", id: POSITION },
      transition: "P-5",
      actor: cascadeActor,
      payload: { filledByNannyId: NANNY },
      expectedFrom: "CONNECTING",
      idempotencyKey: "p5",
    });
    expect(active.ok && active.value.stage).toBe("ACTIVE");

    const again = await advance({
      entity: { kind: "position", id: POSITION },
      transition: "P-5",
      actor: cascadeActor,
      payload: { filledByNannyId: NANNY },
      expectedFrom: "ACTIVE",
      idempotencyKey: "p5",
    });
    expect(!again.ok && again.error.details).toMatchObject({
      reason: "E_STALE_STATE",
      which: "already-there",
    });
  });
});

describe("the read models (03 §2.5) — pure, no sweep", () => {
  it("getStage answers NOT_FOUND for a position that does not exist", async () => {
    const read = await positions.getStage({ kind: "position", id: OTHER });
    expect(!read.ok && read.error.code).toBe("NOT_FOUND");
  });

  it("listAllowed gives a parent the levers her role may fire, and an unknown entity none", async () => {
    await open();
    const levers = await positions.listAllowed(
      { kind: "position", id: POSITION },
      parent,
    );
    expect(levers).toEqual(["P-7"]);
    expect(
      await positions.listAllowed({ kind: "position", id: OTHER }, parent),
    ).toEqual([]);
  });

  it("getForMatching carries the district and the detail the engine needs (03 §7.4)", async () => {
    await open();
    const read = await positions.getForMatching(POSITION);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.district).toBe("N1");
    expect(read.value.stage).toBe("OPEN");
    expect(read.value.detail.requirements.capacity).toBe(1);
  });

  it("recordPrecheck writes the lever and moves rail row 2 into motion (03 §2.3 row 2)", async () => {
    await open();
    const before = await positions.getJourneySteps(
      PARENT as string as ParentId,
    );
    expect(before.ok && before.value[1]?.state).toBe("pending");

    const written = await positions.recordPrecheck(POSITION, {
      firedAt: NOW,
      expiresAt: NOW,
      wave: 1,
    });
    expect(written.ok).toBe(true);
    const after = await positions.getJourneySteps(PARENT as string as ParentId);
    expect(after.ok && after.value[1]?.state).toBe("in-motion");
  });

  it("getJourneySteps never hides a step, and row 9 replaces rows 1–8 once closed (04 §7.1)", async () => {
    const cold = await positions.getJourneySteps(PARENT as string as ParentId);
    expect(cold.ok && cold.value).toHaveLength(8);
    expect(cold.ok && cold.value[0]?.state).toBe("in-motion");
    expect(
      cold.ok && cold.value.every((entry) => entry.state !== "hidden"),
    ).toBe(true);

    await open();
    await advance({
      entity: { kind: "position", id: POSITION },
      transition: "P-7",
      actor: parent,
      payload: { closeReason: "parent_closed" },
      expectedFrom: "OPEN",
      idempotencyKey: "close",
    });
    const ended = await positions.getJourneySteps(PARENT as string as ParentId);
    expect(ended.ok && ended.value.map((entry) => entry.row)).toEqual([9]);
  });

  it("row 3 is whatever the call-layer port answers — `positions` never composes the call's words", async () => {
    configurePositions(
      createPositions({
        store,
        rows: {
          callRow: async () => ({
            ok: true,
            value: {
              row: 3,
              label: "Introduction call",
              state: "in-motion",
              detail: "Introduction call — pick a time",
            },
          }),
        },
      }),
    );
    await open();
    const steps = await positions.getJourneySteps(PARENT as string as ParentId);
    expect(steps.ok && steps.value[2]?.detail).toBe(
      "Introduction call — pick a time",
    );
  });
});
