// The inside (1d): `createCallLayer` over the scheduling stub + the memory mirror store, with the C-row slice
// registered through the seam and every write inside a memory unit of work. Each `it` is a claim the merge
// rests on (ADR-123 keeps ADR-120's rule 1): the mirror moves only through `advance`, a booking never outlives
// a failed transition, the actor rule holds, and the displacement path the contract describes is pinned as
// **not built** (`it.fails`) rather than papered over.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCHEDULING } from "@/modules/config";
import type { Comms, Message } from "@/modules/comms";
import {
  callLayer,
  configureCallLayer,
  createCallLayer,
  createCallLayerSlice,
  memoryCallMirrorStore,
  registerCallLayerSlice,
} from "@/modules/call-layer";
import { advance } from "@/modules/positions";
import {
  configureEvents,
  configureUnitOfWork,
  createEvents,
  createUnitOfWork,
  log,
  memoryEventLogStore,
  memoryTransactionOpener,
  ok,
} from "@/modules/platform";
import { createSchedulingStub } from "@/modules/scheduling";
import type { Scheduling } from "@/modules/scheduling";
import type {
  Actor,
  AvailabilityRule,
  Email,
  ISO,
  PositionId,
  RuleId,
  SlotId,
  UserId,
} from "@/modules/shared-types";
import type { CallMirror } from "@/modules/call-layer";
import { EVENT_SCHEMAS } from "@/modules/platform";

// **Measured platform defect, pinned, not worked around in the module.** `platform`'s `piiSafeString` (03 §9.3
// "ids only") refuses 14.7 % of random uuids (2 944 / 20 000 measured 2026-09-17): a hex group whose digits run
// 9+ across the hyphens reads as a phone number to `scrubFreeText`. Under a unit of work that fails the whole
// C row, so a real booking id would fail `chooseSlot` one time in seven. The scheduling stub mints ids with
// `crypto.randomUUID`, so these suites pin the mint to uuids with a letter in every group — the tests must be
// deterministic — and the defect itself is the `it.fails` at the bottom of this file, owned by `platform`.
const mintedIds = { count: 0 };
const deterministicUuid =
  (): `${string}-${string}-${string}-${string}-${string}` => {
    mintedIds.count += 1;
    const tail = mintedIds.count.toString(16).padStart(5, "0");
    return `a1b2c3d4-e5f6-4a7b-8c9d-aaaaab${tail}a`;
  };

// A Friday in GMT at 08:00; the first slots are that Friday from 10:00 (lead time 120 min — ADR-076).
const NOW = "2026-01-09T08:00:00.000Z" as ISO;
const POSITION = "0f1e2d3c-0000-4000-8000-000000000001" as PositionId;
const OTHER_POSITION = "0f1e2d3c-0000-4000-8000-000000000002" as PositionId;
const PARENT = "0a1b2c3d-0000-4000-8000-000000000011" as UserId;
/** 03 §3.2's amended `hold` (see `scheduling/types.ts`): a held row says whose call it is and of what kind. */
const heldFor = {
  kind: "matchmaking" as const,
  subject: {
    kind: "position" as const,
    positionId: POSITION,
    parentId: PARENT,
  },
};
const OTHER_PARENT = "0a1b2c3d-0000-4000-8000-000000000012" as UserId;
const NANNY = "0a1b2c3d-0000-4000-8000-000000000021" as UserId;

const parent: Actor = { kind: "user", id: PARENT, role: "parent" };
const otherParent: Actor = { kind: "user", id: OTHER_PARENT, role: "parent" };
const admin: Actor = { kind: "admin", id: "admin-1" as never };
const nannyActor: Actor = { kind: "user", id: NANNY, role: "nanny" };

const rules: ReadonlyArray<AvailabilityRule> = [0, 1, 2, 3, 4].map(
  (weekday) => ({
    id: `rule-${weekday}` as RuleId,
    weekday: weekday as AvailabilityRule["weekday"],
    startLocal: "09:00",
    endLocal: "11:00",
  }),
);

const mirrorOf = (
  positionId: PositionId,
  parentId: UserId,
  extra: Partial<CallMirror> = {},
): CallMirror => ({
  positionId,
  parentId,
  type: "matchmaking",
  state: "awaiting-slot",
  bookingId: null,
  requestedAt: NOW,
  recipient: { email: "parent@example.test" as Email, name: "Ada" },
  noAnswerCount: 0,
  version: 1,
  ...extra,
});

type Sent = { readonly sent: Message[]; readonly scheduled: Message[] };

const fakeComms = (): Comms & Sent => {
  const sent: Message[] = [];
  const scheduled: Message[] = [];
  return {
    sent,
    scheduled,
    send: async (message) => {
      sent.push(message);
      return ok("m-1" as never);
    },
    sendMany: async () => ok([]),
    schedule: async (message) => {
      scheduled.push(message);
      return ok("m-2" as never);
    },
    cancel: async () => ok({ cancelled: 0 }),
    status: async () => ok({ status: "sent" as const }),
    createInboxMessage: async () => ok({ id: "i-1" as never }),
  };
};

let scheduling: Scheduling;
let comms: Comms & Sent;

const firstSlot = async (
  kind: "matchmaking" | "nanny-commission" = "matchmaking",
) => {
  const slots = await scheduling.getAvailableSlots({
    kind,
    from: NOW,
    to: "2026-01-23T00:00:00.000Z" as ISO,
  });
  if (!slots.ok) throw new Error("no slots");
  return slots.value[0]!;
};

const wire = (seed: ReadonlyArray<CallMirror>) => {
  const store = memoryCallMirrorStore(seed);
  scheduling = createSchedulingStub({ clock: () => NOW, rules });
  comms = fakeComms();
  registerCallLayerSlice(
    createCallLayerSlice({ store, scheduling, clock: () => NOW }),
  );
  configureCallLayer(
    createCallLayer({ store, scheduling, comms, clock: () => NOW }),
  );
};

beforeEach(() => {
  vi.spyOn(crypto, "randomUUID").mockImplementation(deterministicUuid);
  configureUnitOfWork(createUnitOfWork(memoryTransactionOpener()));
  configureEvents(createEvents({ store: memoryEventLogStore(), log }));
  wire([mirrorOf(POSITION, PARENT), mirrorOf(OTHER_POSITION, OTHER_PARENT)]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("chooseSlot — book, then advance(C-1), then the messages (03 §2.7; 03 §3.5 seq 1)", () => {
  it("moves the call to slot-chosen with the booking pointed at, and emits call.slot-chosen", async () => {
    const slot = await firstSlot();
    const result = await callLayer.chooseSlot(
      POSITION,
      slot.id,
      undefined,
      parent,
      "k-1",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stage).toBe("slot-chosen");
    expect(result.value.events).toEqual(["call.slot-chosen"]);
    const read = await callLayer.getCallState({
      kind: "call",
      positionId: POSITION,
    });
    expect(read.ok && read.value.state).toBe("slot-chosen");
    expect(read.ok && read.value.booking?.start).toBe(slot.start);
    expect(read.ok && read.value.booking?.subject).toEqual({
      kind: "position",
      positionId: POSITION,
      parentId: PARENT,
    });
  });

  it("sends call-confirmation and schedules one call-reminder per config offset, before the slot", async () => {
    const slots = await scheduling.getAvailableSlots({
      kind: "matchmaking",
      from: NOW,
      to: "2026-01-23T00:00:00.000Z" as ISO,
    });
    if (!slots.ok) return;
    const farthestOffset = Math.max(...SCHEDULING.reminderOffsetsMinutes);
    const slot = slots.value.find(
      (each) =>
        Date.parse(each.start) - farthestOffset * 60_000 > Date.parse(NOW),
    )!;
    await callLayer.chooseSlot(POSITION, slot.id, undefined, parent, "k-1");

    expect(comms.sent.map((m) => m.templateId)).toEqual(["call-confirmation"]);
    // ADR-136 — a `Recipient` is a union now, and the mirror's parent half is the `{ email }` branch
    // (the address is on the record, resolved when the mirror was hydrated).
    const to = comms.sent[0]?.to;
    expect(to !== undefined && "email" in to && to.email).toBe(
      "parent@example.test",
    );
    expect(comms.scheduled.map((m) => m.templateId)).toEqual(
      SCHEDULING.reminderOffsetsMinutes.map(() => "call-reminder"),
    );
    for (const [index, offset] of SCHEDULING.reminderOffsetsMinutes.entries()) {
      const expected = new Date(
        Date.parse(slot.start) - offset * 60_000,
      ).toISOString();
      expect(comms.scheduled[index]?.sendAt).toBe(expected);
    }
  });

  it("schedules no reminder whose send time has already passed (a slot sooner than the offset)", async () => {
    const slot = await firstSlot();
    await callLayer.chooseSlot(POSITION, slot.id, undefined, parent, "k-1");
    expect(comms.sent.map((m) => m.templateId)).toEqual(["call-confirmation"]);
    expect(comms.scheduled).toEqual([]);
  });

  it("books through a hold, and refuses a hold that has run out with HOLD_EXPIRED", async () => {
    const slot = await firstSlot();
    const held = await scheduling.hold(slot.id, parent, heldFor);
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    const early = await callLayer.chooseSlot(
      POSITION,
      slot.id,
      held.value,
      parent,
      "k-1",
    );
    expect(early.ok).toBe(true);

    wire([mirrorOf(POSITION, PARENT)]);
    const stale = await scheduling.hold(
      (await firstSlot()).id,
      parent,
      heldFor,
    );
    if (!stale.ok) return;
    scheduling = createSchedulingStub({
      clock: () => "2026-01-09T09:00:00.000Z" as ISO,
      rules,
    });
    configureCallLayer(
      createCallLayer({
        store: memoryCallMirrorStore([mirrorOf(POSITION, PARENT)]),
        scheduling,
        comms,
      }),
    );
    const late = await callLayer.chooseSlot(
      POSITION,
      (await firstSlot()).id,
      stale.value,
      parent,
      "k-2",
    );
    expect(late.ok).toBe(false);
    expect(!late.ok && late.error.details?.reason).toBe("HOLD_EXPIRED");
  });

  it("says SLOT_TAKEN when another parent got there first, and the mirror stays awaiting-slot", async () => {
    const slot = await firstSlot();
    await callLayer.chooseSlot(
      OTHER_POSITION,
      slot.id,
      undefined,
      otherParent,
      "k-other",
    );

    const result = await callLayer.chooseSlot(
      POSITION,
      slot.id,
      undefined,
      parent,
      "k-1",
    );

    expect(!result.ok && result.error.code).toBe("CONFLICT");
    expect(!result.ok && result.error.details?.reason).toBe("SLOT_TAKEN");
    const read = await callLayer.getCallState({
      kind: "call",
      positionId: POSITION,
    });
    expect(read.ok && read.value.state).toBe("awaiting-slot");
  });

  it("refuses a second slot while one is chosen (ALREADY_BOOKED — 03 §3.3 I-10): reschedule instead", async () => {
    const slots = await scheduling.getAvailableSlots({
      kind: "matchmaking",
      from: NOW,
      to: "2026-01-23T00:00:00.000Z" as ISO,
    });
    if (!slots.ok) return;
    await callLayer.chooseSlot(
      POSITION,
      slots.value[0]!.id,
      undefined,
      parent,
      "k-1",
    );

    const again = await callLayer.chooseSlot(
      POSITION,
      slots.value[1]!.id,
      undefined,
      parent,
      "k-2",
    );

    expect(!again.ok && again.error.details?.reason).toBe("ALREADY_BOOKED");
  });

  it("replays the same idempotency key without a second booking (I-11; C-1 is `key`)", async () => {
    const slot = await firstSlot();
    const first = await callLayer.chooseSlot(
      POSITION,
      slot.id,
      undefined,
      parent,
      "k-1",
    );
    const second = await callLayer.chooseSlot(
      POSITION,
      slot.id,
      undefined,
      parent,
      "k-1",
    );

    expect(first.ok && second.ok).toBe(true);
    const mine = await scheduling.listForSubject({
      kind: "position",
      positionId: POSITION,
      parentId: PARENT,
    });
    expect(mine.ok && mine.value.length).toBe(1);
  });

  it("undoes the booking when advance refuses — another parent cannot set a time on this position", async () => {
    const slot = await firstSlot();
    const result = await callLayer.chooseSlot(
      POSITION,
      slot.id,
      undefined,
      otherParent,
      "k-x",
    );

    expect(!result.ok && result.error.code).toBe("FORBIDDEN");
    expect(!result.ok && result.error.details?.reason).toBe(
      "E_ACTOR_FORBIDDEN",
    );
    const free = await scheduling.getAvailableSlots({
      kind: "matchmaking",
      from: NOW,
      to: "2026-01-23T00:00:00.000Z" as ISO,
    });
    expect(free.ok && free.value.some((each) => each.id === slot.id)).toBe(
      true,
    );
  });

  it("answers NOT_FOUND for a position with no call mirror", async () => {
    const slot = await firstSlot();
    const result = await callLayer.chooseSlot(
      "0f1e2d3c-0000-4000-8000-0000000000ff" as PositionId,
      slot.id,
      undefined,
      admin,
      "k-9",
    );
    expect(!result.ok && result.error.code).toBe("NOT_FOUND");
  });
});

describe("moveSlot · clearSlot · recordOutcome (C-2 · C-3 · C-5)", () => {
  const chosen = async () => {
    const slots = await scheduling.getAvailableSlots({
      kind: "matchmaking",
      from: NOW,
      to: "2026-01-23T00:00:00.000Z" as ISO,
    });
    if (!slots.ok) throw new Error("no slots");
    await callLayer.chooseSlot(
      POSITION,
      slots.value[0]!.id,
      undefined,
      parent,
      "k-1",
    );
    return slots.value;
  };

  it("moves the slot and sends call-rescheduled; the mirror stays slot-chosen on the same row", async () => {
    const slots = await chosen();
    const moved = await callLayer.moveSlot(
      { kind: "call", positionId: POSITION },
      slots[2]!.id,
      parent,
    );

    expect(moved.ok && moved.value.kind).toBe("call");
    const read = await callLayer.getCallState({
      kind: "call",
      positionId: POSITION,
    });
    expect(read.ok && read.value.booking?.start).toBe(slots[2]!.start);
    expect(read.ok && read.value.booking?.status).toBe("rescheduled");
    expect(comms.sent.map((m) => m.templateId)).toEqual([
      "call-confirmation",
      "call-rescheduled",
    ]);
  });

  it("clears the slot: the booking is cancelled, the call returns to awaiting-slot, call-cancelled is sent", async () => {
    await chosen();
    const cleared = await callLayer.clearSlot(
      POSITION,
      parent,
      "user-cancelled",
    );

    expect(cleared.ok && cleared.value.stage).toBe("awaiting-slot");
    expect(cleared.ok && cleared.value.events).toEqual(["call.rescheduled"]);
    const read = await callLayer.getCallState({
      kind: "call",
      positionId: POSITION,
    });
    expect(read.ok && read.value.booking).toBeUndefined();
    expect(comms.sent.at(-1)?.templateId).toBe("call-cancelled");
  });

  it("refuses to clear or move a call that has no slot", async () => {
    const cleared = await callLayer.clearSlot(
      POSITION,
      parent,
      "user-cancelled",
    );
    expect(!cleared.ok && cleared.error.details?.reason).toBe(
      "E_PRECONDITION_FAILED",
    );
    const moved = await callLayer.moveSlot(
      { kind: "call", positionId: POSITION },
      (await firstSlot()).id,
      parent,
    );
    expect(!moved.ok && moved.error.details?.reason).toBe(
      "E_PRECONDITION_FAILED",
    );
  });

  it("no-answer (C-5): the row ends no-answer, the call is awaiting-slot again and says so, and a retry books anew (R5)", async () => {
    const slots = await chosen();
    const outcome = await callLayer.recordOutcome(
      { kind: "call", positionId: POSITION },
      "no-answer",
      undefined,
      admin,
    );
    expect(
      outcome.ok && outcome.value.kind === "call" && outcome.value.state.stage,
    ).toBe("awaiting-slot");

    const open = await callLayer.findOpenCall(PARENT);
    expect(open.ok && open.value?.afterNoAnswer).toBe(true);
    expect(open.ok && open.value?.state).toBe("awaiting-slot");

    const retry = await callLayer.chooseSlot(
      POSITION,
      slots[1]!.id,
      undefined,
      parent,
      "k-retry",
    );
    expect(retry.ok && retry.value.stage).toBe("slot-chosen");
    const rows = await scheduling.listForSubject({
      kind: "position",
      positionId: POSITION,
      parentId: PARENT,
    });
    expect(rows.ok && rows.value.map((row) => row.status).sort()).toEqual([
      "booked",
      "no-answer",
    ]);
  });

  it("no-answer needs a slot to have been set", async () => {
    const outcome = await callLayer.recordOutcome(
      { kind: "call", positionId: POSITION },
      "no-answer",
      undefined,
      admin,
    );
    expect(!outcome.ok && outcome.error.details?.reason).toBe(
      "E_PRECONDITION_FAILED",
    );
  });

  it("done (C-3): the outcome is recorded, the booking marked done, and the parent has no open call", async () => {
    await chosen();
    const outcome = await callLayer.recordOutcome(
      { kind: "call", positionId: POSITION },
      "proceeding",
      "keen on two",
      admin,
    );

    expect(
      outcome.ok && outcome.value.kind === "call" && outcome.value.state.stage,
    ).toBe("done");
    const read = await callLayer.getCallState({
      kind: "call",
      positionId: POSITION,
    });
    expect(read.ok && read.value.outcome).toBe("proceeding");
    expect(read.ok && read.value.booking?.status).toBe("done");
    const open = await callLayer.findOpenCall(PARENT);
    expect(open.ok && open.value).toBeNull();
  });

  it("done is admin-only (03 §2.4 C-3 movers)", async () => {
    await chosen();
    const outcome = await callLayer.recordOutcome(
      { kind: "call", positionId: POSITION },
      "proceeding",
      undefined,
      parent,
    );
    expect(!outcome.ok && outcome.error.code).toBe("FORBIDDEN");
  });

  it("done is `reject`: a second C-3 on a done call is E_STALE_STATE", async () => {
    await chosen();
    await callLayer.recordOutcome(
      { kind: "call", positionId: POSITION },
      "proceeding",
      undefined,
      admin,
    );
    const again = await callLayer.recordOutcome(
      { kind: "call", positionId: POSITION },
      "not-now",
      undefined,
      admin,
    );
    expect(!again.ok && again.error.details?.reason).toBe("E_STALE_STATE");
  });
});

describe("the C-row slice through advance (C-a · C-c) and the nanny call (§2.7)", () => {
  const requestPayload = {
    parentId: PARENT,
    type: "matchmaking" as const,
    recipient: { email: "parent@example.test" as Email },
  };
  const NEW_POSITION = "0f1e2d3c-0000-4000-8000-000000000003" as PositionId;
  const job: Actor = { kind: "system", id: "call-request" };

  it("C-a creates the mirror at awaiting-slot for the named job; a second C-a is a noop", async () => {
    const first = await advance({
      entity: { kind: "call", id: NEW_POSITION },
      transition: "C-a",
      actor: job,
      payload: requestPayload,
      expectedFrom: null,
      idempotencyKey: "req-1",
    });
    expect(first.ok && first.value.stage).toBe("awaiting-slot");
    expect(first.ok && first.value.events).toEqual(["call.requested"]);

    const again = await advance({
      entity: { kind: "call", id: NEW_POSITION },
      transition: "C-a",
      actor: job,
      payload: requestPayload,
      expectedFrom: "awaiting-slot",
      idempotencyKey: "req-2",
    });
    expect(again.ok && again.value.events).toEqual([]);
    const open = await callLayer.findOpenCall(PARENT);
    expect(open.ok && open.value?.positionId).toBe(POSITION);
  });

  it("C-a refuses a job the row does not name, and a stale expectedFrom", async () => {
    const wrongJob = await advance({
      entity: { kind: "call", id: NEW_POSITION },
      transition: "C-a",
      actor: { kind: "system", id: "autofire" },
      payload: requestPayload,
      expectedFrom: null,
      idempotencyKey: "req-3",
    });
    expect(!wrongJob.ok && wrongJob.error.details?.reason).toBe(
      "E_ACTOR_FORBIDDEN",
    );

    const stale = await advance({
      entity: { kind: "call", id: POSITION },
      transition: "C-1",
      actor: parent,
      payload: { bookingId: "nope" },
      expectedFrom: "slot-chosen",
      idempotencyKey: "req-4",
    });
    expect(!stale.ok && stale.error.details?.reason).toBe("E_STALE_STATE");
  });

  it("C-1 refuses a booking that is not this position's (BOOKING_NOT_FOR_SUBJECT)", async () => {
    const slot = await firstSlot();
    await callLayer.chooseSlot(
      OTHER_POSITION,
      slot.id,
      undefined,
      otherParent,
      "k-other",
    );
    const theirs = await scheduling.listForSubject({
      kind: "position",
      positionId: OTHER_POSITION,
      parentId: OTHER_PARENT,
    });
    if (!theirs.ok) return;

    const result = await advance({
      entity: { kind: "call", id: POSITION },
      transition: "C-1",
      actor: parent,
      payload: { bookingId: theirs.value[0]!.id },
      expectedFrom: "awaiting-slot",
      idempotencyKey: "k-steal",
    });
    expect(!result.ok && result.error.details).toEqual(
      expect.objectContaining({
        reason: "E_PRECONDITION_FAILED",
        which: "BOOKING_NOT_FOR_SUBJECT",
      }),
    );
  });

  it("C-c re-arms a call after done, naming the nanny (trigger (c))", async () => {
    const slot = await firstSlot();
    await callLayer.chooseSlot(POSITION, slot.id, undefined, parent, "k-1");
    await callLayer.recordOutcome(
      { kind: "call", positionId: POSITION },
      "proceeding",
      undefined,
      admin,
    );

    const rearmed = await advance({
      entity: { kind: "call", id: POSITION },
      transition: "C-c",
      actor: { kind: "system", id: "cascade" },
      payload: { ...requestPayload, aboutNanny: "Priya" },
      expectedFrom: "done",
      idempotencyKey: "c-1",
    });
    expect(rearmed.ok && rearmed.value.stage).toBe("awaiting-slot");
    const open = await callLayer.findOpenCall(PARENT);
    expect(open.ok && open.value?.aboutNanny).toBe("Priya");
    expect(open.ok && open.value?.afterNoAnswer).toBe(false);
  });

  it("openNannyCall books a nanny-commission row; its call state is derived from the row", async () => {
    const slot = await firstSlot("nanny-commission");
    const booked = await callLayer.openNannyCall({
      nannyId: NANNY,
      slotId: slot.id,
      actor: nannyActor,
      idempotencyKey: "n-1",
    });
    expect(booked.ok && booked.value.kind).toBe("nanny-commission");
    if (!booked.ok) return;

    const read = await callLayer.getCallState({
      kind: "nanny-call",
      bookingId: booked.value.id,
    });
    expect(read.ok && read.value).toEqual(
      expect.objectContaining({
        state: "slot-chosen",
        type: "nanny-commission",
      }),
    );

    const noAnswer = await callLayer.recordOutcome(
      { kind: "nanny-call", bookingId: booked.value.id },
      "no-answer",
      undefined,
      admin,
    );
    expect(
      noAnswer.ok &&
        noAnswer.value.kind === "nanny-call" &&
        noAnswer.value.booking.status,
    ).toBe("no-answer");
    const after = await callLayer.getCallState({
      kind: "nanny-call",
      bookingId: booked.value.id,
    });
    expect(after.ok && after.value.state).toBe("awaiting-slot");
  });

  it("listSlots passes the calendar through, and a nanny never sees a parent's slot as displaceable", async () => {
    const slot = await firstSlot();
    await callLayer.chooseSlot(POSITION, slot.id, undefined, parent, "k-1");
    const forNanny = await callLayer.listSlots("nanny-commission", {
      from: NOW,
      to: "2026-01-23T00:00:00.000Z" as ISO,
    });
    expect(
      forNanny.ok && forNanny.value.some((each) => each.id === slot.id),
    ).toBe(false);
  });

  // 03 §3.5 seq 3 / I-2: a parent books a `displaceable` slot and the nanny is moved to the next free one.
  //
  // **This was an `it.fails` whose reason had expired** (REVIEW-2 §6.2 row 4). Displacement *is* built —
  // `scheduling-booking-writes.ts` computes `displaceTo` and hands `book_slot()` its `p_displace_to`, and
  // `scheduling.inside.test.ts` pins that it is one RPC — but this suite wires `createSchedulingStub`, which
  // answered `NOT_IMPLEMENTED`, so the pin had stopped pinning a doc/code disagreement and started pinning test
  // scaffolding. Its own promise ("the day it is built this `it.fails` turns red") was already false.
  //
  // Closed the way ADR-123 rule 2 asks: by making the claim true of real behaviour. The stub now implements
  // I-2 / I-3 with the same pure `nextFreeSlot` the real inside uses, so the two implementations agree about
  // what "next free" means — which is what 03 §11 row 2's swap rests on.
  it("a parent books over a nanny's slot and the nanny is moved (03 §3.5 seq 3)", async () => {
    const slot = await firstSlot("nanny-commission");
    const nannyCall = await callLayer.openNannyCall({
      nannyId: NANNY,
      slotId: slot.id,
      actor: nannyActor,
      idempotencyKey: "n-1",
    });
    expect(nannyCall.ok).toBe(true);
    if (!nannyCall.ok) return;
    const displaceable = await callLayer.listSlots("matchmaking", {
      from: NOW,
      to: "2026-01-23T00:00:00.000Z" as ISO,
    });
    expect(
      displaceable.ok &&
        displaceable.value.find((each) => each.id === slot.id)?.displaceable,
    ).toBe(true);

    const result = await callLayer.chooseSlot(
      POSITION,
      slot.id as SlotId,
      undefined,
      parent,
      "k-displace",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // I-2: her call is not cancelled, it is moved — to a later start, carrying where it came from.
    const hers = await scheduling.getBooking(nannyCall.value.id, admin);
    expect(hers.ok).toBe(true);
    if (!hers.ok) return;
    expect(hers.value.status).toBe("rescheduled");
    expect(hers.value.start > slot.start).toBe(true);
    expect(hers.value.displacedFrom).toBe(slot.start);
  });
});

describe("platform — the event id schema (03 §9.3 'ids only'; owned by platform, pinned here because 1d hit it)", () => {
  // **Closed by P1-WIRE-2.** 1d pinned this `it.fails` because a uuid whose digits ran 9+ across the hyphens was
  // redacted by `scrubFreeText` and so refused (2 904 / 20 000 measured on the fixed tree before the change).
  // `piiSafeString` now exempts a whole-value canonical uuid before the scrub, so the pin is flipped to a
  // passing test rather than removed — the claim 1d made is the claim that now holds. The exhaustive half lives
  // in `platform/__tests__/platform.pii-safe-string.test.ts`; this stays as the C row's own regression.
  it("accepts every canonical uuid as an id", () => {
    const phoneLikeUuid = "750a1806-4696-48bc-a5b0-e23b717d495c";
    const parsed = EVENT_SCHEMAS["call.slot-chosen"].safeParse({
      bookingId: phoneLikeUuid,
      type: "matchmaking",
      slotAt: NOW,
    });
    expect(parsed.success).toBe(true);
  });
});
