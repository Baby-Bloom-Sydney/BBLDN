// ★ **ADR-158 (2)'s third road — the one the read-side fix does not cover.** REVIEW-4 H-2.
//
// `2d`'s own `security-reviewer` found that a held connection reached both parent **screens** and closed it in
// `visibleToParent`, at the two consumption points, with `connections.held-invisible.test.ts` holding both
// halves. That fix is sound and this file does not touch it.
//
// But R-14's sentence is *"held rows withhold parent **notification** until L4"*, and notification is a third
// road. `sendRowMessages` runs unconditionally after every committed K row (`create-connections-slice.ts:172`),
// takes the record, and reads only `fillInitiatedBy` — the held flag appears nowhere in `connections`' comms
// path. `MESSAGES_OF` (`connection-messages.ts:22-52`) carries six parent-addressed templates:
// `K-5 connection-accepted`, `K-6 connection-declined`, `K-8`/`K-10 connection-expired-parent`,
// `K-9`/`K-11 meeting-scheduled`, `K-17 confirm-nanny` and `K-20`'s pair.
//
// **And the held case is the main line, not an edge.** `MATCHING.minVerificationLevel` is L3, so a nanny enters
// the pool at L3 and `heldPair` (`create-connections-slice.ts:88-91`) holds every connection made for anyone
// below L4 — which is every nanny between entering the pool and her Update Service check. So the ordinary
// sequence *parent Connects → nanny accepts* emails the family "your connection was accepted" about a row her
// own screens are built to hide, and she then finds nothing when she looks. `recipientOf` is wired in
// production (`boot/wire-connections.ts:44-56`), so the address resolves and the message goes.
//
// **Pinned rather than fixed, and the reason is not scope but judgement.** Suppressing `to === "parent"` on a
// held row is one early return, and for K-5 it is unambiguously what R-14 asks. It is not obviously right for
// all six: K-20's `placement-confirmed-parent` and `hire-confirmation-family` are the hire itself, and
// swallowing those to honour a hold would be a worse failure than the one being fixed. Which of the six a hold
// silences — and whether a held row should be able to reach K-20 at all — is 03 §8.3's and ADR-158's owner's
// call, not a checkpoint sweep's. **Owner: `connections` / ADR-158 (2)'s owner.** REVIEW-4 §8 R-5.
//
// The first case is the pin. The second and third are the control and the boundary, and both pass today, so
// the pin cannot be read as "comms are broken" — they are right for the unheld row and right for K-1.
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
import type { ConnectionsDeps } from "@/modules/connections";
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
   * PINNED — REVIEW-4 H-2. Measured on the shipped tree: `posted` carries
   * `{ templateId: "connection-accepted", to: "parent" }`. `visibleToParent` then hides the row from both of
   * her screens, so the email is about a connection she cannot find.
   *
   * **Owner: `connections` / ADR-158 (2)'s owner** — which of `MESSAGES_OF`'s six parent templates a hold
   * silences is 03 §8.3's call. REVIEW-4 §8 R-5.
   */
  it.fails(
    "★ PINNED — K-5 on a held row sends the family nothing (owner: `connections` / ADR-158 (2))",
    async () => {
      const w = world("L3_PROVISIONALLY_VERIFIED");

      await connectThenAccept(w);

      expect(w.posted.filter((m) => m.to === "parent")).toEqual([]);
    },
  );

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
