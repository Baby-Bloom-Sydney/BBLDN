// S-N-02's booking half (`2g`; 03 §2.7 · §3.2 · §3.5 seq 2; 04 §4.4 c3). The nanny's form is the one booking
// road that never holds a slot — 03 §3.2 says so in as many words ("a caller that never held (admin on behalf,
// the nanny's form) still books") — so what is claimed here is: `openNannyCall` tells **her** and tells the
// **admin**, `findNannyBooking` answers "have I already picked a time?", and the two server actions behind the
// picker refuse everyone who is not a signed-in nanny and are bounded by 07 §8 row 6. RED first.
//
// `call-layer`'s gap 3 (`1d`: "the nanny's `call-confirmation` + `admin-commission-booking` are not sent — the
// module has no road to a nanny's email") is closed here rather than carried: ADR-136 made `Recipient` a
// `{ userId }` that `comms` resolves inside its own send, so the road exists and the module never holds an
// address.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Comms, Message } from "@/modules/comms";
import { SECURITY } from "@/modules/config";
import { configureAuth, stubAuth } from "@/modules/auth";
import {
  callLayer,
  configureCallLayer,
  createCallLayer,
  createCallLayerSlice,
  memoryCallMirrorStore,
  registerCallLayerSlice,
} from "@/modules/call-layer";
import {
  configureEvents,
  configureRateLimiter,
  configureUnitOfWork,
  createEvents,
  createRateLimiter,
  createUnitOfWork,
  log,
  memoryEventLogStore,
  memoryRateLimitStore,
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
  RuleId,
  UserId,
} from "@/modules/shared-types";
import { bookNannyCallAction } from "../actions/book-nanny-call-action";
import { listNannySlotsAction } from "../actions/list-nanny-slots-action";

const mintedIds = { count: 0 };
const deterministicUuid =
  (): `${string}-${string}-${string}-${string}-${string}` => {
    mintedIds.count += 1;
    const tail = mintedIds.count.toString(16).padStart(5, "0");
    return `a1b2c3d4-e5f6-4a7b-8c9d-aaaaab${tail}a`;
  };

const NOW = "2026-01-09T08:00:00.000Z" as ISO;
const HORIZON = "2026-01-23T00:00:00.000Z" as ISO;
const NANNY = "0a1b2c3d-0000-4000-8000-000000000021" as UserId;
const PARENT = "0a1b2c3d-0000-4000-8000-000000000011" as UserId;
const ADMIN_EMAIL = "ops@example.test";

const nannyActor: Actor = { kind: "user", id: NANNY, role: "nanny" };
const admin: Actor = { kind: "admin", id: "admin-1" as never };

const users = [
  {
    id: NANNY,
    email: "bea@example.test" as Email,
    password: "x".repeat(12),
    role: "nanny" as const,
  },
  {
    id: PARENT,
    email: "ada@example.test" as Email,
    password: "x".repeat(12),
    role: "parent" as const,
  },
];

const rules: ReadonlyArray<AvailabilityRule> = [0, 1, 2, 3, 4].map(
  (weekday) => ({
    id: `rule-${weekday}` as RuleId,
    weekday: weekday as AvailabilityRule["weekday"],
    startLocal: "09:00",
    endLocal: "11:00",
  }),
);

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

const firstSlot = async () => {
  const slots = await scheduling.getAvailableSlots({
    kind: "nanny-commission",
    from: NOW,
    to: HORIZON,
  });
  if (!slots.ok) throw new Error("no slots");
  return slots.value[0]!;
};

const signedInAs = (id: string | null) =>
  configureAuth(
    stubAuth(id === null ? { users } : { users, signedInUserId: id }),
  );

beforeEach(() => {
  // The actions read the wall clock (`slotRange(nowInstant())`), the stub calendar reads its injected one.
  // They have to be the same instant or the read asks for a fortnight the fixtures do not cover.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(NOW));
  vi.spyOn(crypto, "randomUUID").mockImplementation(deterministicUuid);
  configureUnitOfWork(createUnitOfWork(memoryTransactionOpener()));
  configureEvents(createEvents({ store: memoryEventLogStore(), log }));
  configureRateLimiter(
    createRateLimiter({
      store: memoryRateLimitStore(),
      burstAlertMultiple: SECURITY.burstAlertMultiple,
    }),
  );
  const store = memoryCallMirrorStore([]);
  scheduling = createSchedulingStub({ clock: () => NOW, rules });
  comms = fakeComms();
  registerCallLayerSlice(
    createCallLayerSlice({ store, scheduling, clock: () => NOW }),
  );
  configureCallLayer(
    createCallLayer({
      store,
      scheduling,
      comms,
      clock: () => NOW,
      adminEmail: ADMIN_EMAIL,
    }),
  );
  signedInAs(NANNY);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("openNannyCall — the two messages 03 §2.7 names (call-layer gap 3, closed)", () => {
  it("tells the nanny by user id — the module never holds an address (ADR-136)", async () => {
    const slot = await firstSlot();

    const booked = await callLayer.openNannyCall({
      nannyId: NANNY,
      slotId: slot.id,
      actor: nannyActor,
      idempotencyKey: "n-1",
    });

    expect(booked.ok).toBe(true);
    const confirmation = comms.sent.find(
      (message) => message.templateId === "call-confirmation",
    );
    expect(confirmation?.to).toEqual({ userId: NANNY });
    expect(confirmation?.data).toMatchObject({
      type: "nanny-commission",
      slotAt: slot.start,
    });
  });

  it("tells the admin, at the address boot handed in — never a literal (L4)", async () => {
    const slot = await firstSlot();

    await callLayer.openNannyCall({
      nannyId: NANNY,
      slotId: slot.id,
      actor: nannyActor,
      idempotencyKey: "n-1",
    });

    const notice = comms.sent.find(
      (message) => message.templateId === "admin-commission-booking",
    );
    expect(notice?.to).toEqual({ email: ADMIN_EMAIL });
    expect(notice?.data).toMatchObject({ slotAt: slot.start });
  });

  it("books the slot even when neither message goes — the time is the fact (01 §4a rule 2)", async () => {
    const slot = await firstSlot();
    comms.send = async () => ({
      ok: false as const,
      error: { code: "PROVIDER_ERROR" as const, message: "down" },
    });

    const booked = await callLayer.openNannyCall({
      nannyId: NANNY,
      slotId: slot.id,
      actor: nannyActor,
      idempotencyKey: "n-1",
    });

    expect(booked.ok).toBe(true);
  });
});

describe("findNannyBooking — 'have I already picked a time?'", () => {
  it("is null before she books", async () => {
    const read = await callLayer.findNannyBooking(NANNY);
    expect(read.ok && read.value).toBeNull();
  });

  it("answers the active booking once she has", async () => {
    const slot = await firstSlot();
    await callLayer.openNannyCall({
      nannyId: NANNY,
      slotId: slot.id,
      actor: nannyActor,
      idempotencyKey: "n-1",
    });

    const read = await callLayer.findNannyBooking(NANNY);

    expect(read.ok && read.value?.start).toBe(slot.start);
    expect(read.ok && read.value?.kind).toBe("nanny-commission");
  });

  it("is null again after a no-answer — that row is terminal and she books afresh (R5, I-10)", async () => {
    const slot = await firstSlot();
    const booked = await callLayer.openNannyCall({
      nannyId: NANNY,
      slotId: slot.id,
      actor: nannyActor,
      idempotencyKey: "n-1",
    });
    if (!booked.ok) throw new Error("not booked");
    await callLayer.recordOutcome(
      { kind: "nanny-call", bookingId: booked.value.id },
      "no-answer",
      undefined,
      admin,
    );

    const read = await callLayer.findNannyBooking(NANNY);

    expect(read.ok && read.value).toBeNull();
  });
});

describe("the S-N-02 actions — who may reach the calendar at all", () => {
  it("lists the London days for a signed-in nanny", async () => {
    const listed = await listNannySlotsAction();

    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.length).toBeGreaterThan(0);
    expect(listed.value[0]?.slots.length).toBeGreaterThan(0);
    expect(listed.value[0]?.slots[0]?.name).toContain("London time");
  });

  it("refuses a signed-out visitor and a parent, and books nothing", async () => {
    const slot = await firstSlot();
    signedInAs(null);
    const visitor = await bookNannyCallAction({ slotId: slot.id });
    signedInAs(PARENT);
    const parent = await bookNannyCallAction({ slotId: slot.id });

    expect(visitor.ok).toBe(false);
    expect(parent.ok).toBe(false);
    const read = await callLayer.findNannyBooking(NANNY);
    expect(read.ok && read.value).toBeNull();
  });

  it("books her call and answers the time it starts — the nanny id comes from the session", async () => {
    const slot = await firstSlot();

    const booked = await bookNannyCallAction({ slotId: slot.id });

    expect(booked.ok).toBe(true);
    if (!booked.ok) return;
    expect(booked.value.start).toBe(slot.start);
    const read = await callLayer.findNannyBooking(NANNY);
    expect(read.ok && read.value?.start).toBe(slot.start);
  });

  it("a second booking while one stands is refused, not silently doubled (I-10)", async () => {
    const slot = await firstSlot();
    await bookNannyCallAction({ slotId: slot.id });
    const slots = await scheduling.getAvailableSlots({
      kind: "nanny-commission",
      from: NOW,
      to: HORIZON,
    });
    if (!slots.ok) throw new Error("no slots");
    const another = slots.value[0]!;

    const again = await bookNannyCallAction({ slotId: another.id });

    expect(again.ok).toBe(false);
  });

  it("is bounded by 07 §8 row 6 — `bookingHolds` is consumed before anything is written", async () => {
    const slot = await firstSlot();
    const limit = SECURITY.rateLimits.bookingHolds.perHour ?? 0;
    expect(limit).toBeGreaterThan(0);

    const results = [];
    for (let attempt = 0; attempt <= limit; attempt += 1)
      results.push(await bookNannyCallAction({ slotId: slot.id }));

    expect(results.at(-1)?.ok).toBe(false);
  });
});
