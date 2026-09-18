// ★ **ADR-158 (2)'s third road — the notification side of the silent hold.** REVIEW-4 H-2, now closed.
//
// `2d`'s own `security-reviewer` found that a held connection reached both parent **screens** and closed it in
// `visibleToParent`, at the two consumption points, with `connections.held-invisible.test.ts` holding both
// halves. That fix is sound and this file does not touch it.
//
// R-14's sentence is *"held rows withhold parent **notification** until L4"*, and notification was a third
// road. `sendRowMessages` ran unconditionally after every committed K row (`create-connections-slice.ts:172`)
// and read only `fillInitiatedBy`; the held flag appeared nowhere in `connections`' comms path. `MESSAGES_OF`
// (`connection-messages.ts:22-52`) carries six parent-addressed templates: `K-5 connection-accepted`,
// `K-6 connection-declined`, `K-8`/`K-10 connection-expired-parent`, `K-9`/`K-11 meeting-scheduled`,
// `K-17 confirm-nanny` and `K-20`'s pair.
//
// **And the held case is the main line, not an edge.** `MATCHING.minVerificationLevel` is L3, so a nanny enters
// the pool at L3 and `heldPair` (`create-connections-slice.ts:88-91`) holds every connection made for anyone
// below L4 — which is every nanny between entering the pool and her Update Service check. So the ordinary
// sequence *parent Connects → nanny accepts* emailed the family "your connection was accepted" about a row her
// own screens are built to hide, and she then found nothing when she looked.
//
// **The fix, ruled by the planner (REVIEW-4 §8 R-5).** The hold is consulted **once**, where the recipient set
// is built — exactly the shape `2d` used on the read side. A held row has no parent recipient, so every one of
// the six parent-addressed templates drops, and the nanny-addressed rows are untouched. One consult, one place,
// stage-blind: the hold is not about where the connection has got to but about whether this family may be told
// about this nanny at all yet. The uniform rule is the ruling; K-20's pair is covered by it, and the residual
// question *may a held row reach K-20 at all* is recorded for its owner rather than answered by a filter here.
//
// The last two cases are the control and the boundary: right for the unheld row, right for K-1.
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
  connectionsSliceRegistration,
  createConnectionsSlice,
  memoryConnectionStore,
} from "@/modules/connections";
import type { ConnectionRecord, ConnectionsDeps } from "@/modules/connections";
import { sendRowMessages } from "../lib/send-row-messages";
import type {
  Actor,
  AdvanceInput,
  ConnectionId,
  Email,
  Instant,
  NannyId,
  ParentId,
  PositionId,
  TransitionHandler,
  TransitionId,
  UserId,
  Uuid,
} from "@/modules/shared-types";

const POSITION = "00000000-0000-4000-8000-0000000000p1" as PositionId;
const PARENT = "00000000-0000-4000-8000-0000000000a1" as ParentId;
const NANNY = "00000000-0000-4000-8000-0000000000n1" as NannyId;
const NANNY_USER = "00000000-0000-4000-8000-0000000000u1" as Uuid;
const C1 = "00000000-0000-4000-8000-0000000000c1" as ConnectionId;
const NOW = "2026-09-19T09:00:00+00:00" as Instant;

const parentActor: Actor = {
  kind: "user",
  id: PARENT as string as UserId,
  role: "parent",
};
/** The actor rule compares against the RECORD's party, so the mover is the `nannyId`, not her `auth.users` id. */
const nannyActor: Actor = {
  kind: "user",
  id: NANNY as string as UserId,
  role: "nanny",
};

type Posted = { readonly templateId: string; readonly to: string };

/** A dispatcher over just the K slice — `connections` may not import `positions` (01 §2.3). */
function world(level: string) {
  configureUnitOfWork(createUnitOfWork(memoryTransactionOpener()));
  configureEvents(createEvents({ store: memoryEventLogStore(), log }));

  const posted: Posted[] = [];
  const comms = {
    send: async () => ok("m-1" as never),
    sendMany: async (
      messages: ReadonlyArray<{
        templateId: string;
        to: Record<string, unknown>;
      }>,
    ) => {
      for (const message of messages)
        posted.push({
          templateId: message.templateId,
          to: "email" in message.to ? "parent" : "nanny",
        });
      return ok([]);
    },
    schedule: async () => ok("m-2" as never),
    cancel: async () => ok({ cancelled: 0 }),
    status: async () => ok({ status: "sent" as const }),
    createInboxMessage: async () => ok({ id: "i-1" as never }),
    notifyAdmin: async () => ok({ id: "n-1" as never }),
  } as unknown as Comms;

  const deps: ConnectionsDeps = {
    store: memoryConnectionStore(),
    // K-5 cascades P-3 into `positions`, which this module may not import (01 §2.3) — the dispatcher is
    // injected, so a conforming answer is all the cascade needs.
    advance: async (input: AdvanceInput<TransitionId>) =>
      ok({
        entity: input.entity,
        stage: "CONNECTING",
        version: 2,
        changedAt: NOW,
        cascaded: [],
        events: [],
      }) as never,
    comms,
    clock: () => NOW,
    positionFacts: async () => ok({ stage: "OPEN", parentId: PARENT }),
    nannyFacts: async () =>
      ok({ verificationLevel: level, isolated: false, userId: NANNY_USER }),
    recipientOf: async () =>
      ok({ email: "family@example.test" as Email, name: "Rina" }),
  };

  const handlers = new Map<TransitionId, TransitionHandler>();
  for (const handler of connectionsSliceRegistration(
    createConnectionsSlice(deps),
  ).handlers)
    handlers.set(handler.id, handler);

  const advance = async (input: AdvanceInput<TransitionId>) => {
    const handler = handlers.get(input.transition);
    if (handler === undefined)
      return err("INTERNAL", "no slice", { reason: "E_SLICE_NOT_REGISTERED" });
    return withUnitOfWork((uow) => handler.run(input, uow));
  };

  return { advance, posted, deps };
}

/** Parent Connects, then the nanny accepts — the ordinary sequence, on one connection. */
async function connectThenAccept(w: ReturnType<typeof world>) {
  await w.advance({
    entity: { kind: "connection", id: C1 },
    transition: "K-1",
    actor: parentActor,
    payload: { positionId: POSITION, nannyId: NANNY },
    expectedFrom: null,
    idempotencyKey: "held-k1",
  });
  const accepted = await w.advance({
    entity: { kind: "connection", id: C1 },
    transition: "K-5",
    actor: nannyActor,
    payload: { availabilitySlots: 5 },
    expectedFrom: "REQUEST_SENT",
    idempotencyKey: "held-k5",
  });
  if (!accepted.ok)
    throw new Error(`K-5 refused: ${JSON.stringify(accepted.error)}`);
}

describe("★ a held connection withholds the parent's notification too (ADR-158 (2) / R-14)", () => {
  it("the row really is held at L3 — the state the whole finding is about", async () => {
    const w = world("L3_PROVISIONALLY_VERIFIED");
    await connectThenAccept(w);

    const stored = await w.deps.store.get(C1);
    expect(stored.ok && stored.value?.heldForVerification).toBe(true);
    expect(stored.ok && stored.value?.stage).toBe("ACCEPTED");
  });

  /**
   * ★ REVIEW-4 H-2's pin, FLIPPED by behaviour. On the shipped tree `posted` carried
   * `{ templateId: "connection-accepted", to: "parent" }` while `visibleToParent` hid the row from both of her
   * screens — an email about a connection she cannot find. The hold is now consulted where the recipient set
   * is built, so a held row has no parent recipient at all. R-14 / ADR-158 (2); REVIEW-4 §8 R-5.
   */
  it("★ K-5 on a held row sends the family nothing (R-14 / ADR-158 (2))", async () => {
    const w = world("L3_PROVISIONALLY_VERIFIED");

    await connectThenAccept(w);

    expect(w.posted.filter((m) => m.to === "parent")).toEqual([]);
  });

  it("the hold silences one audience, not the send — the nanny's K-1 still goes", async () => {
    const w = world("L3_PROVISIONALLY_VERIFIED");

    await connectThenAccept(w);

    expect(w.posted).toEqual([
      { templateId: "connection-requested", to: "nanny" },
    ]);
  });

  it("the control: at L4 the row is not held and the family IS told, as 03 §8.3 says", async () => {
    const w = world("L4_FULLY_VERIFIED");

    await connectThenAccept(w);

    const stored = await w.deps.store.get(C1);
    expect(stored.ok && stored.value?.heldForVerification).toBe(false);
    expect(w.posted).toContainEqual({
      templateId: "connection-accepted",
      to: "parent",
    });
  });

  it("the boundary: K-1 itself already tells only the nanny, so creating a held row leaks nothing", async () => {
    const w = world("L3_PROVISIONALLY_VERIFIED");

    await w.advance({
      entity: { kind: "connection", id: C1 },
      transition: "K-1",
      actor: parentActor,
      payload: { positionId: POSITION, nannyId: NANNY },
      expectedFrom: null,
      idempotencyKey: "held-k1-only",
    });

    expect(w.posted).toEqual([
      { templateId: "connection-requested", to: "nanny" },
    ]);
  });
});

/**
 * The rule at the seam itself, over **every** parent-addressed row rather than the one K-5 drives. Six templates
 * across five transitions carry `to: "parent"`; the ruling is that the hold drops all six, uniformly, because it
 * is consulted once where the recipient set is built. Driving each K row through the slice would prove the same
 * thing five more times over five long chains; this reads the seam directly, which is where the consult lives.
 */
describe("★ the hold is consulted once, where the recipient set is built (REVIEW-4 §8 R-5)", () => {
  const PARENT_ROWS: ReadonlyArray<{
    readonly id: TransitionId;
    readonly templateId: string;
  }> = [
    { id: "K-5", templateId: "connection-accepted" },
    { id: "K-6", templateId: "connection-declined" },
    { id: "K-8", templateId: "connection-expired-parent" },
    { id: "K-9", templateId: "meeting-scheduled" },
    { id: "K-10", templateId: "connection-expired-parent" },
    { id: "K-11", templateId: "meeting-scheduled" },
    { id: "K-17", templateId: "confirm-nanny" },
    { id: "K-20", templateId: "placement-confirmed-parent" },
    { id: "K-20", templateId: "hire-confirmation-family" },
  ];

  function recordOf(held: boolean): ConnectionRecord {
    return {
      connectionId: C1,
      positionId: POSITION,
      parentId: PARENT,
      nannyId: NANNY,
      stage: "ACCEPTED",
      origin: "parent_request",
      createdAt: NOW,
      version: 2,
      ...(held ? { heldForVerification: true, heldAt: NOW } : {}),
    };
  }

  async function postedFor(
    id: TransitionId,
    held: boolean,
  ): Promise<ReadonlyArray<Posted>> {
    const w = world("L3_PROVISIONALLY_VERIFIED");
    await sendRowMessages(w.deps, id, recordOf(held));
    return w.posted;
  }

  for (const row of PARENT_ROWS) {
    it(`${row.id} → ${row.templateId} is withheld from the family on a held row`, async () => {
      const posted = await postedFor(row.id, true);

      expect(posted.filter((m) => m.to === "parent")).toEqual([]);
    });

    it(`${row.id} → ${row.templateId} still reaches the family on an unheld row`, async () => {
      const posted = await postedFor(row.id, false);

      expect(posted).toContainEqual({
        templateId: row.templateId,
        to: "parent",
      });
    });
  }

  it("the nanny-addressed half of every row survives the hold", async () => {
    const posted = await postedFor("K-20", true);

    expect(posted).toEqual([
      { templateId: "placement-confirmed-nanny", to: "nanny" },
      { templateId: "hire-confirmation-nanny", to: "nanny" },
    ]);
  });
});
