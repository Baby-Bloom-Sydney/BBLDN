// The three L rows' own claims (ADR-120 rule 1). The suite plays the boot file's part: it registers the L slice
// and a fake connection / position slice, and hands the L slice `positions.advance` as its dispatcher —
// `placements` has no arrow to `positions` (01 §2.3), so anything else would assert something it cannot do.
//
// The clauses under test are the ones the money model hangs off, and each is a sentence from 03 §2.4 or an ADR:
// `placement.confirmed` is emitted by L-1 and never by K-20; **nothing is charged at placement** (ADR-094);
// L-1b is where done-for-you access opens (ADR-093) and where `placement.started` — the event `1h` consumes —
// is emitted; and L-2 takes the position and the connection with it.
import { describe, expect, it } from "vitest";
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
  withUnitOfWork,
} from "@/modules/platform";
import {
  createPlacementsSlice,
  memoryPlacementStore,
  placementsSliceRegistration,
  PLACEMENT_TRANSITIONS,
} from "@/modules/placements";
import type { PlacementRecord, PlacementStore } from "@/modules/placements";
import type { EventEnvelope } from "@/modules/platform";
import type {
  Actor,
  AdvanceInput,
  ConnectionId,
  Instant,
  ISODate,
  NannyId,
  ParentId,
  PlacementId,
  PositionId,
  TransitionHandler,
  TransitionId,
  UserId,
} from "@/modules/shared-types";

/**
 * The suite's own dispatcher, and the reason it exists is the point of the unit: the boundary lint forbids this
 * module — tests included — from importing `positions` (01 §2.3). So the suite cannot call `advance`; it builds
 * the one thing `advance` is, a map from `TransitionId` to a registered handler, run inside one unit of work.
 * That makes the claim stronger than a `positions` import would: the slice works against **any** conforming
 * dispatcher, which is exactly what the injected `PlacementAdvanceFn` promises.
 */
function makeDispatcher() {
  const handlers = new Map<TransitionId, TransitionHandler>();
  const register = (slice: {
    readonly handlers: ReadonlyArray<TransitionHandler>;
  }) => {
    for (const handler of slice.handlers) handlers.set(handler.id, handler);
  };
  const dispatch = async (input: AdvanceInput<TransitionId>) => {
    const handler = handlers.get(input.transition);
    if (handler === undefined)
      return err("INTERNAL", "No slice is registered for this transition", {
        reason: "E_SLICE_NOT_REGISTERED" as const,
      });
    if (input.uow !== undefined) return handler.run(input, input.uow);
    return withUnitOfWork((uow) => handler.run(input, uow));
  };
  return { register, dispatch };
}

const NOW = "2026-03-02T09:00:00+00:00" as Instant;
const PLACEMENT = "00000000-0000-4000-8000-0000000000l1" as PlacementId;
const POSITION = "00000000-0000-4000-8000-0000000000p1" as PositionId;
const CONNECTION = "00000000-0000-4000-8000-0000000000c1" as ConnectionId;
const PARENT = "00000000-0000-4000-8000-0000000000a1" as ParentId;
const NANNY = "00000000-0000-4000-8000-0000000000n1" as NannyId;

const cascadeActor: Actor = { kind: "system", id: "cascade" };
const sweep: Actor = { kind: "system", id: "placement-start-sweep" };
const parentActor: Actor = {
  kind: "user",
  id: "00000000-0000-4000-8000-0000000000a1" as UserId,
  role: "parent",
};

const TERMS = Object.freeze({
  connectionId: CONNECTION,
  positionId: POSITION,
  parentId: PARENT,
  nannyId: NANNY,
  weeklyHours: 40,
  hourlyRatePence: 1800, // config-literal-ok: a placement fixture, not a price — PRICES owns real money (03 §5.2)
  startDate: "2026-03-02" as ISODate,
});

/** Records every row that reached it — the same device `connections.inside.test.ts` uses. */
const otherSlices = () => {
  const fired: Array<TransitionId> = [];
  const make = (
    entity: "connection" | "position",
    ids: ReadonlyArray<TransitionId>,
  ) => ({
    entity,
    handlers: ids.map(
      (id): TransitionHandler => ({
        id,
        run: async (input) => {
          fired.push(id);
          return ok({
            entity: input.entity,
            stage: "ACTIVE",
            version: 2,
            changedAt: NOW,
            cascaded: [],
            events: [],
          });
        },
      }),
    ),
  });
  return {
    fired,
    connection: make("connection", ["K-21", "K-23"]),
    position: make("position", ["P-6"]),
  };
};

type World = {
  readonly store: PlacementStore;
  readonly fired: Array<TransitionId>;
  readonly events: () => ReadonlyArray<EventEnvelope>;
  readonly dfy: Array<string>;
  readonly advance: (
    input: AdvanceInput<TransitionId>,
  ) => ReturnType<TransitionHandler["run"]>;
};

const record = (over: Partial<PlacementRecord>): PlacementRecord =>
  Object.freeze({
    placementId: PLACEMENT,
    positionId: POSITION,
    connectionId: CONNECTION,
    parentId: PARENT,
    nannyId: NANNY,
    source: "connection",
    state: "CONFIRMED",
    weeklyHours: 40,
    hourlyRatePence: 1800, // config-literal-ok: a placement fixture, not a price — PRICES owns real money (03 §5.2)
    startDate: "2026-03-02" as ISODate,
    createdAt: NOW,
    version: 1,
    ...over,
  });

function world(
  seed: ReadonlyArray<PlacementRecord> = [],
  withDfy = true,
): World {
  configureUnitOfWork(createUnitOfWork(memoryTransactionOpener()));
  const store = memoryEventLogStore();
  configureEvents(createEvents({ store, log }));

  const others = otherSlices();
  const bus = makeDispatcher();
  bus.register(others.connection);
  bus.register(others.position);

  const placementStore = memoryPlacementStore(seed);
  const dfy: Array<string> = [];
  bus.register(
    placementsSliceRegistration(
      createPlacementsSlice({
        store: placementStore,
        advance: bus.dispatch,
        clock: () => NOW,
        ...(withDfy
          ? {
              openDfyAccess: async (input: {
                readonly placementId: PlacementId;
              }) => {
                dfy.push(input.placementId as string);
                return ok(undefined);
              },
            }
          : {}),
      }),
    ),
  );
  return {
    store: placementStore,
    fired: others.fired,
    events: () => store.rows,
    dfy,
    advance: bus.dispatch,
  };
}

const namesOf = (w: World): ReadonlyArray<string> =>
  w.events().map((row) => row.name);

describe("placements — L-1, the placement K-20 creates", () => {
  it("writes the terms and emits placement.confirmed", async () => {
    const w = world();
    const moved = await w.advance({
      entity: { kind: "placement", id: PLACEMENT },
      transition: "L-1",
      actor: cascadeActor,
      payload: TERMS,
      expectedFrom: null,
      idempotencyKey: "l1-1",
    });
    expect(moved.ok).toBe(true);
    const stored = await w.store.get(PLACEMENT);
    expect(stored.ok && stored.value?.state).toBe("CONFIRMED");
    expect(stored.ok && stored.value?.weeklyHours).toBe(40);
    expect(stored.ok && stored.value?.hourlyRatePence).toBe(1800);
    expect(namesOf(w)).toEqual(["placement.confirmed"]);
  });

  // ADR-094 / fix: offer-1. "**No payment trigger here** — nothing is charged on the call or at placement."
  // The claim is negative and it is the one the money model rests on, so it is asserted rather than assumed.
  it("fires no cascade and opens no access — nothing is charged at placement (ADR-094)", async () => {
    const w = world();
    await w.advance({
      entity: { kind: "placement", id: PLACEMENT },
      transition: "L-1",
      actor: cascadeActor,
      payload: TERMS,
      expectedFrom: null,
      idempotencyKey: "l1-2",
    });
    expect(w.fired).toEqual([]);
    expect(w.dfy).toEqual([]);
  });

  // I-3: "≤ 1 non-ended placement per position and per parent". `0007`'s partial unique index enforces it
  // underneath; refusing here is what makes it read as a rule rather than as a driver error.
  it("refuses a second live placement on one position", async () => {
    const w = world([record({})]);
    const moved = await w.advance({
      entity: {
        kind: "placement",
        id: "00000000-0000-4000-8000-0000000000l2" as PlacementId,
      },
      transition: "L-1",
      actor: cascadeActor,
      payload: TERMS,
      expectedFrom: null,
      idempotencyKey: "l1-dup",
    });
    expect(
      !moved.ok && (moved.error.details as { readonly which?: string }).which,
    ).toBe("PLACEMENT_ALREADY_LIVE");
  });

  it("refuses a system job the row does not name", async () => {
    const w = world();
    const moved = await w.advance({
      entity: { kind: "placement", id: PLACEMENT },
      transition: "L-1",
      actor: { kind: "system", id: "autofire" },
      payload: TERMS,
      expectedFrom: null,
      idempotencyKey: "l1-job",
    });
    expect(
      !moved.ok && (moved.error.details as { readonly reason?: string }).reason,
    ).toBe("E_ACTOR_FORBIDDEN");
  });
});

describe("placements — L-1b, the nanny's first day (ADR-093 / 094)", () => {
  it("activates the placement, fires K-21 and emits placement.started", async () => {
    const w = world([record({})]);
    const moved = await w.advance({
      entity: { kind: "placement", id: PLACEMENT },
      transition: "L-1b",
      actor: sweep,
      payload: {},
      expectedFrom: "CONFIRMED",
      idempotencyKey: "l1b-1",
    });
    expect(moved.ok).toBe(true);
    const stored = await w.store.get(PLACEMENT);
    expect(stored.ok && stored.value?.state).toBe("ACTIVE");
    expect(stored.ok && stored.value?.startedAt).toBe(NOW);
    expect(w.fired).toEqual(["K-21"]);
    expect(namesOf(w)).toEqual(["placement.started"]);
  });

  it("opens done-for-you access for the family (ADR-093 — no trial)", async () => {
    const w = world([record({})]);
    await w.advance({
      entity: { kind: "placement", id: PLACEMENT },
      transition: "L-1b",
      actor: sweep,
      payload: {},
      expectedFrom: "CONFIRMED",
      idempotencyKey: "l1b-2",
    });
    expect(w.dfy).toEqual([PLACEMENT as string]);
  });

  /**
   * The claim `1h` was told to expect. Access is opened through an **injected port**, and boot deliberately
   * does not wire one yet (`wire-placements.ts`): `1h` owns the payments inside, and a fail-closed binding
   * would take a nanny's recorded first day down with it. So the row must land, and the event must be emitted,
   * with no port at all.
   */
  it("lands, and still emits placement.started, when no access port is wired", async () => {
    const w = world([record({})], false);
    const moved = await w.advance({
      entity: { kind: "placement", id: PLACEMENT },
      transition: "L-1b",
      actor: sweep,
      payload: {},
      expectedFrom: "CONFIRMED",
      idempotencyKey: "l1b-3",
    });
    expect(moved.ok).toBe(true);
    expect(namesOf(w)).toEqual(["placement.started"]);
    expect(w.dfy).toEqual([]);
  });
});

describe("placements — L-2, the end of a placement", () => {
  it("ends it and takes the position (P-6) and the connection (K-23) with it", async () => {
    const w = world([record({ state: "ACTIVE", startedAt: NOW })]);
    const moved = await w.advance({
      entity: { kind: "placement", id: PLACEMENT },
      transition: "L-2",
      actor: parentActor,
      payload: { endReason: "no_longer_needed", endNotes: "moved away" },
      expectedFrom: "ACTIVE",
      idempotencyKey: "l2-1",
    });
    expect(moved.ok).toBe(true);
    const stored = await w.store.get(PLACEMENT);
    expect(stored.ok && stored.value?.state).toBe("ENDED");
    expect(stored.ok && stored.value?.endReason).toBe("no_longer_needed");
    expect(w.fired).toEqual(["P-6", "K-23"]);
    expect(namesOf(w)).toEqual(["placement.ended"]);
    expect(moved.ok && moved.value.cascaded.map((c) => c.transition)).toEqual([
      "P-6",
      "K-23",
    ]);
  });

  it("refuses a reason that is not in the enum, rather than writing a free string", async () => {
    const w = world([record({ state: "ACTIVE" })]);
    const moved = await w.advance({
      entity: { kind: "placement", id: PLACEMENT },
      transition: "L-2",
      actor: parentActor,
      payload: { endReason: "she was unkind" },
      expectedFrom: "ACTIVE",
      idempotencyKey: "l2-bad",
    });
    expect(
      !moved.ok && (moved.error.details as { readonly reason?: string }).reason,
    ).toBe("E_PAYLOAD_INVALID");
  });

  it("refuses a stranger — the actor rule is about the parties, not the role", async () => {
    const w = world([record({ state: "ACTIVE" })]);
    const moved = await w.advance({
      entity: { kind: "placement", id: PLACEMENT },
      transition: "L-2",
      actor: {
        kind: "user",
        id: "00000000-0000-4000-8000-0000000000zz" as UserId,
        role: "parent",
      },
      payload: { endReason: "mutual" },
      expectedFrom: "ACTIVE",
      idempotencyKey: "l2-stranger",
    });
    expect(
      !moved.ok && (moved.error.details as { readonly which?: string }).which,
    ).toBe("not-party");
  });
});

describe("placements — the table", () => {
  it("is the three L rows of 03 §2.4, and keeps L-1b's literal id", () => {
    expect(PLACEMENT_TRANSITIONS.map((spec) => spec.id)).toEqual([
      "L-1",
      "L-1b",
      "L-2",
    ]);
    expect(
      PLACEMENT_TRANSITIONS.every((spec) => spec.entity === "placement"),
    ).toBe(true);
  });
});
