// The 25 K rows' own claims (ADR-120 rule 1). Everything the merge rests on is here as something that runs.
//
// The suite plays the boot file's part: it registers the K slice, the L slice and a **fake position slice** with
// `positions.registerSlice`, and hands the K slice `positions.advance` as its dispatcher. That is not a
// convenience — it is the only legal shape. `connections` has no arrow to `positions` (01 §2.3), so a suite
// that imported one to fire P-3 would be asserting something the module cannot do.
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
import type { Comms } from "@/modules/comms";
import {
  createConnectionsSlice,
  connectionsSliceRegistration,
  memoryConnectionStore,
} from "@/modules/connections";
import type { ConnectionRecord, ConnectionsDeps } from "@/modules/connections";
import {
  createPlacementsSlice,
  memoryPlacementStore,
  placementsSliceRegistration,
} from "@/modules/placements";
import type {
  Actor,
  AdvanceInput,
  ConnectionId,
  Email,
  Instant,
  NannyId,
  ParentId,
  PositionId,
  PositionStage,
  TransitionHandler,
  TransitionId,
  UserId,
  Uuid,
} from "@/modules/shared-types";

/**
 * The suite's own dispatcher, and the reason it exists is the point of the unit: the boundary lint forbids this
 * module — tests included — from importing `positions` (01 §2.3). So the suite cannot call `advance`; it builds
 * the one thing `advance` is, a map from `TransitionId` to a registered handler, run inside one unit of work.
 * That makes the claim stronger than a `positions` import would: the slice works against **any** conforming
 * dispatcher, which is exactly what the injected `AdvanceFn` promises.
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

const parentActor: Actor = {
  kind: "user",
  id: "00000000-0000-4000-8000-0000000000a1" as UserId,
  role: "parent",
};
const nannyA: Actor = {
  kind: "user",
  id: "00000000-0000-4000-8000-0000000000n1" as UserId,
  role: "nanny",
};
const nannyB: Actor = {
  kind: "user",
  id: "00000000-0000-4000-8000-0000000000n2" as UserId,
  role: "nanny",
};
const adminActor: Actor = { kind: "admin", id: "admin-1" as never };
const cascadeActor: Actor = { kind: "system", id: "cascade" };

/** A `Comms` that records rather than sends — 03 §8.4's stub shape, local because the suite owns the claim. */
/** ADR-136 — every message the slice posts, so a suite can ask HOW a party was addressed, not only whether. */
const posted: Array<{ templateId: string; to: Record<string, unknown> }> = [];

const recordingComms = (sent: Array<string>): Comms =>
  ({
    send: async () => ok("m1" as never),
    sendMany: async (
      messages: ReadonlyArray<{
        templateId: string;
        to: Record<string, unknown>;
      }>,
    ) => {
      for (const message of messages) {
        sent.push(message.templateId);
        posted.push({ templateId: message.templateId, to: message.to });
      }
      return ok([]);
    },
    schedule: async () => ok("m1" as never),
    cancel: async () => ok({ cancelled: 0 }),
    status: async () => ok({ status: "sent" as const }),
    createInboxMessage: async () => ok({ id: "i1" as never }),
  }) as unknown as Comms;

const POSITION = "00000000-0000-4000-8000-0000000000p1" as PositionId;
const PARENT = "00000000-0000-4000-8000-0000000000a1" as ParentId;
const NANNY_A = "00000000-0000-4000-8000-0000000000n1" as NannyId;
/** The nanny's `auth.users` id — what `nannyFacts` answers under ADR-136, and what a `Recipient` now takes. */
const NANNY_USER = "00000000-0000-4000-8000-0000000000u1" as Uuid;
const NANNY_B = "00000000-0000-4000-8000-0000000000n2" as NannyId;
const C1 = "00000000-0000-4000-8000-0000000000c1" as ConnectionId;
const C2 = "00000000-0000-4000-8000-0000000000c2" as ConnectionId;
const NOW = "2026-02-02T09:00:00+00:00" as Instant;

/**
 * The fake position slice. It records every P row that reached it and answers a plausible `StateAfter`, which
 * is all a cascade assertion needs — `positions`' own P-row behaviour is `1e`'s suite, not this one's.
 */
const positionSlice = (stage: { current: PositionStage }) => {
  const fired: Array<string> = [];
  const handlers: ReadonlyArray<TransitionHandler> = (
    ["P-3", "P-4", "P-5", "P-6", "P-7"] as const
  ).map((id) => ({
    id,
    run: async (input) => {
      fired.push(id);
      const to: PositionStage =
        id === "P-3"
          ? "CONNECTING"
          : id === "P-4"
            ? "OPEN"
            : id === "P-5"
              ? "ACTIVE"
              : "ENDED";
      stage.current = to;
      return ok({
        entity: input.entity,
        stage: to,
        version: 2,
        changedAt: NOW,
        cascaded: [],
        events: [],
      });
    },
  }));
  return { fired, registration: { entity: "position" as const, handlers } };
};

const connection = (over: Partial<ConnectionRecord>): ConnectionRecord =>
  Object.freeze({
    connectionId: C1,
    positionId: POSITION,
    parentId: PARENT,
    nannyId: NANNY_A,
    stage: "REQUEST_SENT",
    origin: "parent_request",
    createdAt: NOW,
    version: 1,
    ...over,
  });

type World = {
  readonly deps: ConnectionsDeps;
  readonly fired: Array<string>;
  readonly stage: { current: PositionStage };
  readonly advance: (
    input: AdvanceInput<TransitionId>,
  ) => ReturnType<TransitionHandler["run"]>;
  readonly calls: Array<string>;
};

/**
 * The fake call slice. K-1 cascades into C-c and `connections` may never import `call-layer` (01 §2.3), so the
 * seam is proved with a registered fake — the device `1e` used for the P-2 -> C-a cascade, for the same reason.
 */
const callSlice = (fired: Array<string>) => ({
  entity: "call" as const,
  handlers: [
    {
      id: "C-c" as TransitionId,
      run: async (input: AdvanceInput<TransitionId>) => {
        fired.push(
          (
            input.payload as {
              readonly recipient?: { readonly email?: string };
            }
          ).recipient?.email ?? "",
        );
        return ok({
          entity: input.entity,
          stage: "awaiting-slot" as const,
          version: 1,
          changedAt: NOW,
          cascaded: [],
          events: [],
        });
      },
    },
  ],
});

function world(
  seed: ReadonlyArray<ConnectionRecord> = [],
  nanny: { level?: string; isolated?: boolean } = {},
  sent: Array<string> = [],
  calls: Array<string> = [],
): World {
  configureUnitOfWork(createUnitOfWork(memoryTransactionOpener()));
  configureEvents(createEvents({ store: memoryEventLogStore(), log }));

  const stage = { current: "OPEN" as PositionStage };
  const fake = positionSlice(stage);
  const bus = makeDispatcher();
  bus.register(fake.registration);
  bus.register(callSlice(calls));

  const store = memoryConnectionStore(seed);
  const deps: ConnectionsDeps = {
    store,
    advance: bus.dispatch,
    comms: recordingComms(sent),
    clock: () => NOW,
    positionFacts: async () => ok({ stage: stage.current, parentId: PARENT }),
    nannyFacts: async () =>
      ok({
        verificationLevel: nanny.level ?? "L3_PROVISIONALLY_VERIFIED",
        isolated: nanny.isolated ?? false,
        // ADR-136 — an id, not an address. `comms` resolves the address inside the send.
        userId: NANNY_USER,
      }),
    recipientOf: async () =>
      ok({ email: "family@example.test" as Email, name: "Rina" }),
  };
  bus.register(connectionsSliceRegistration(createConnectionsSlice(deps)));
  bus.register(
    placementsSliceRegistration(
      createPlacementsSlice({
        store: memoryPlacementStore(),
        advance: bus.dispatch,
        clock: () => NOW,
      }),
    ),
  );
  return { deps, fired: fake.fired, stage, advance: bus.dispatch, calls };
}

describe("connections — K-1, the Connect a parent makes (04.12)", () => {
  it("creates the request and takes its parent from the position, not from the caller", async () => {
    const w = world();
    const moved = await w.advance({
      entity: { kind: "connection", id: C1 },
      transition: "K-1",
      actor: parentActor,
      payload: { positionId: POSITION, nannyId: NANNY_A },
      expectedFrom: null,
      idempotencyKey: "k1-1",
    });
    expect(moved.ok).toBe(true);
    const stored = await w.deps.store.get(C1);
    expect(stored.ok && stored.value?.stage).toBe("REQUEST_SENT");
    // the parent is the position's, so a caller cannot file a request against someone else's family
    expect(stored.ok && stored.value?.parentId).toBe(PARENT);
    expect(stored.ok && stored.value?.origin).toBe("parent_request");
  });

  // I-5 / ADR-017: an invited nanny belongs to the family that invited her and is out of every candidate set.
  it("refuses an isolated nanny by that name, not as 'not found'", async () => {
    const w = world([], { isolated: true });
    const moved = await w.advance({
      entity: { kind: "connection", id: C1 },
      transition: "K-1",
      actor: parentActor,
      payload: { positionId: POSITION, nannyId: NANNY_A },
      expectedFrom: null,
      idempotencyKey: "k1-iso",
    });
    expect(moved.ok).toBe(false);
    expect(
      !moved.ok && (moved.error.details as { readonly which?: string }).which,
    ).toBe("ISOLATED_NANNY");
  });

  it("refuses a nanny below the matching verification floor", async () => {
    const w = world([], { level: "L1_REGISTERED" });
    const moved = await w.advance({
      entity: { kind: "connection", id: C1 },
      transition: "K-1",
      actor: parentActor,
      payload: { positionId: POSITION, nannyId: NANNY_A },
      expectedFrom: null,
      idempotencyKey: "k1-level",
    });
    expect(
      !moved.ok && (moved.error.details as { readonly which?: string }).which,
    ).toBe("NANNY_NOT_VERIFIED");
  });

  it("refuses a second live request to the same nanny on the same position", async () => {
    const w = world([connection({})]);
    const moved = await w.advance({
      entity: { kind: "connection", id: C2 },
      transition: "K-1",
      actor: parentActor,
      payload: { positionId: POSITION, nannyId: NANNY_A },
      expectedFrom: null,
      idempotencyKey: "k1-dup",
    });
    expect(
      !moved.ok && (moved.error.details as { readonly which?: string }).which,
    ).toBe("DUPLICATE_LIVE_CONNECTION");
  });

  // 04 §3.3 trigger (c) and `04.12`: the Connect is what opens her call, and the call page is where she lands.
  it("opens the parent's call — K-1 cascades into C-c with her resolved address", async () => {
    const calls: Array<string> = [];
    const w = world([], {}, [], calls);
    const moved = await w.advance({
      entity: { kind: "connection", id: C1 },
      transition: "K-1",
      actor: parentActor,
      payload: { positionId: POSITION, nannyId: NANNY_A },
      expectedFrom: null,
      idempotencyKey: "k1-call",
    });
    expect(moved.ok).toBe(true);
    expect(calls).toEqual(["family@example.test"]);
    expect(moved.ok && moved.value.cascaded.map((c) => c.transition)).toEqual([
      "C-c",
    ]);
  });

  /**
   * The create-time half of the actor rule, and a real hole without it: `checkActor` compares a user against
   * the **record's** party, and a creating row has no record — so a signed-in parent could post K-1 with a
   * stranger's `positionId`. The position's own parent is the authority. Same class as `1f`'s CRITICAL.
   */
  it("refuses a parent who posts another family's position id", async () => {
    const w = world();
    const moved = await w.advance({
      entity: { kind: "connection", id: C1 },
      transition: "K-1",
      actor: {
        kind: "user",
        id: "00000000-0000-4000-8000-0000000000zz" as UserId,
        role: "parent",
      },
      payload: { positionId: POSITION, nannyId: NANNY_A },
      expectedFrom: null,
      idempotencyKey: "k1-idor",
    });
    expect(moved.ok).toBe(false);
    expect(
      !moved.ok && (moved.error.details as { readonly which?: string }).which,
    ).toBe("not-party");
    // and nothing was written: the refusal is before the store, not after it
    const stored = await w.deps.store.get(C1);
    expect(stored.ok && stored.value).toBeNull();
  });

  it("refuses a nanny's own attempt to file a parent's Connect (the actor rule, not a UI check)", async () => {
    const w = world();
    const moved = await w.advance({
      entity: { kind: "connection", id: C1 },
      transition: "K-1",
      actor: nannyA,
      payload: { positionId: POSITION, nannyId: NANNY_A },
      expectedFrom: null,
      idempotencyKey: "k1-nanny",
    });
    expect(
      !moved.ok && (moved.error.details as { readonly reason?: string }).reason,
    ).toBe("E_ACTOR_FORBIDDEN");
  });
});

describe("connections — the cascades into the position (03 §2.4)", () => {
  it("K-5 moves the position to CONNECTING, and only the first one does", async () => {
    const w = world([
      connection({}),
      connection({ connectionId: C2, nannyId: NANNY_B }),
    ]);
    const first = await w.advance({
      entity: { kind: "connection", id: C1 },
      transition: "K-5",
      actor: nannyA,
      payload: { availabilitySlots: 5 },
      expectedFrom: "REQUEST_SENT",
      idempotencyKey: "k5-1",
    });
    expect(first.ok).toBe(true);
    expect(w.fired).toEqual(["P-3"]);
    expect(first.ok && first.value.cascaded.map((c) => c.transition)).toEqual([
      "P-3",
    ]);

    const second = await w.advance({
      entity: { kind: "connection", id: C2 },
      transition: "K-5",
      actor: nannyB,
      payload: { availabilitySlots: 5 },
      expectedFrom: "REQUEST_SENT",
      idempotencyKey: "k5-2",
    });
    expect(second.ok).toBe(true);
    // the position is already CONNECTING; a second acceptance is a clean success, not a refusal
    expect(w.fired).toEqual(["P-3"]);
  });

  it("K-5 refuses a nanny who offered fewer slots than the config floor", async () => {
    const w = world([connection({})]);
    const moved = await w.advance({
      entity: { kind: "connection", id: C1 },
      transition: "K-5",
      actor: nannyA,
      payload: { availabilitySlots: 1 },
      expectedFrom: "REQUEST_SENT",
      idempotencyKey: "k5-slots",
    });
    expect(
      !moved.ok && (moved.error.details as { readonly which?: string }).which,
    ).toBe("NOT_ENOUGH_AVAILABILITY");
  });

  it("K-24 reopens the position only when it was the last live connection", async () => {
    const w = world([
      connection({ stage: "ACCEPTED" }),
      connection({ connectionId: C2, nannyId: NANNY_B, stage: "ACCEPTED" }),
    ]);
    w.stage.current = "CONNECTING";

    await w.advance({
      entity: { kind: "connection", id: C1 },
      transition: "K-24",
      actor: parentActor,
      payload: {},
      expectedFrom: "ACCEPTED",
      idempotencyKey: "k24-1",
    });
    expect(w.fired).toEqual([]);

    await w.advance({
      entity: { kind: "connection", id: C2 },
      transition: "K-24",
      actor: parentActor,
      payload: {},
      expectedFrom: "ACCEPTED",
      idempotencyKey: "k24-2",
    });
    expect(w.fired).toEqual(["P-4"]);
  });

  // K-24's own row: "cascade P-4 if last live **and not from P-7**". A position being closed is not a position
  // being reopened, and P-4 firing from inside P-7 would move CLOSED back to OPEN under the closer's feet.
  it("K-24 fired as P-7's cascade does not reopen the position", async () => {
    const w = world([connection({ stage: "ACCEPTED" })]);
    w.stage.current = "CONNECTING";
    await w.advance({
      entity: { kind: "connection", id: C1 },
      transition: "K-24",
      actor: cascadeActor,
      payload: {},
      expectedFrom: "ACCEPTED",
      idempotencyKey: "k24-from-p7",
    });
    expect(w.fired).toEqual([]);
  });
});

describe("connections — K-20, the hire (03 §2.4: one atomic cascade)", () => {
  const confirmed = async (w: World) =>
    w.advance({
      entity: { kind: "connection", id: C1 },
      transition: "K-20",
      actor: adminActor,
      payload: {
        terms: {
          weeklyHours: 40,
          hourlyRatePence: 1800, // config-literal-ok: a placement fixture, not a price — PRICES owns real money (03 §5.2)
          startDate: "2026-03-02",
        },
      },
      expectedFrom: "OFFERED",
      idempotencyKey: "k20-1",
    });

  it("creates the placement, activates the position and drops the other nannies — in one call", async () => {
    const w = world([
      connection({ stage: "OFFERED" }),
      connection({ connectionId: C2, nannyId: NANNY_B, stage: "ACCEPTED" }),
    ]);
    w.stage.current = "CONNECTING";
    const moved = await confirmed(w);
    expect(moved.ok).toBe(true);
    const fired = moved.ok
      ? moved.value.cascaded.map((each) => each.transition)
      : [];
    expect(fired).toEqual(["L-1", "P-5", "K-26"]);
    expect(w.fired).toEqual(["P-5"]);

    const other = await w.deps.store.get(C2);
    expect(other.ok && other.value?.stage).toBe("NOT_SELECTED");
  });

  // 03 §2.4: `placement.confirmed` is "emitted here, by the K-20 cascade, **never by K-20**" (fix: A-28 / R9).
  it("emits no connection event of its own — the fact has one name, and it is the placement's", async () => {
    const w = world([connection({ stage: "OFFERED" })]);
    w.stage.current = "CONNECTING";
    const moved = await confirmed(w);
    expect(moved.ok && moved.value.events).toEqual([]);
  });

  it("refuses a second offer on a position that already has one", async () => {
    const w = world([
      connection({ stage: "INTRO_COMPLETE" }),
      connection({ connectionId: C2, nannyId: NANNY_B, stage: "OFFERED" }),
    ]);
    const moved = await w.advance({
      entity: { kind: "connection", id: C1 },
      transition: "K-17",
      actor: parentActor,
      payload: { fillInitiatedBy: "parent" },
      expectedFrom: "INTRO_COMPLETE",
      idempotencyKey: "k17-dup",
    });
    expect(
      !moved.ok && (moved.error.details as { readonly which?: string }).which,
    ).toBe("ANOTHER_NANNY_OFFERED");
  });
});

describe("connections — the two reads positions calls (03 §7.5)", () => {
  it("counts only live connections, and never the terminal ones", async () => {
    const w = world([
      connection({ stage: "ACCEPTED" }),
      connection({ connectionId: C2, nannyId: NANNY_B, stage: "DECLINED" }),
    ]);
    const { createConnections } = await import("@/modules/connections");
    const reads = createConnections({ store: w.deps.store });
    const count = await reads.liveCountForPosition(POSITION);
    expect(count.ok && count.value).toBe(1);
    const ids = await reads.liveNannyIdsForParent(PARENT);
    expect(ids.ok && ids.value).toEqual([NANNY_A]);
  });
});

describe("connections — the vocabulary a parent never sees", () => {
  it("names every one of the 25 rows in 03 §2.4, and does not invent a K-25", async () => {
    const { CONNECTION_TRANSITIONS } = await import("@/modules/connections");
    const ids = CONNECTION_TRANSITIONS.map((spec) => spec.id);
    expect(ids).toHaveLength(25);
    expect(ids).not.toContain("K-25");
    expect(ids[ids.length - 1]).toBe("K-26");
    expect(new Set(ids).size).toBe(25);
    expect(
      CONNECTION_TRANSITIONS.every((spec) => spec.entity === "connection"),
    ).toBe(true);
  });
});

// ── `1g`'s pin, flipped by ADR-136 ──

describe("connections — the nanny is reachable", () => {
  /**
   * 03 §2.4 K-1's side effect is `connection-requested` **to the nanny**. `1g` pinned this `it.fails` because
   * 03 §8.1 then said the caller passes a fully resolved address, `nanny_public` deliberately carries none
   * (07 §5.2), and no document authorised a service-scope read of her contact details — so `dbNannyFacts`
   * answered `email: undefined` and the message was not sent.
   *
   * **ADR-136 removed the reason rather than the rule.** A `Recipient` is `{ userId } | { email }`; `comms`
   * resolves the address inside the send, from its own store, and never returns it. So `connections` names the
   * nanny and can still not obtain an address — the claim below, and the one after it, are the two halves of
   * that, and the second is the one that must never regress.
   */
  it("K-1 sends the nanny her connection-requested message", async () => {
    const sent: Array<string> = [];
    const w = world([], {}, sent);
    await w.advance({
      entity: { kind: "connection", id: C1 },
      transition: "K-1",
      actor: parentActor,
      payload: { positionId: POSITION, nannyId: NANNY_A },
      expectedFrom: null,
      idempotencyKey: "k1-msg",
    });
    expect(sent).toContain("connection-requested");
  });

  it("names the nanny by id and never by address — no module outside comms can obtain one", async () => {
    posted.length = 0;
    const sent: Array<string> = [];
    const w = world([], {}, sent);
    await w.advance({
      entity: { kind: "connection", id: C1 },
      transition: "K-1",
      actor: parentActor,
      payload: { positionId: POSITION, nannyId: NANNY_A },
      expectedFrom: null,
      idempotencyKey: "k1-addressing",
    });
    const toNanny = posted.find(
      (message) => message.templateId === "connection-requested",
    );
    expect(toNanny?.to).toEqual({ userId: NANNY_USER });
    // The claim that must never regress: there is no address anywhere in what this module posted about her.
    expect(Object.keys(toNanny?.to ?? {})).not.toContain("email");
  });
});
