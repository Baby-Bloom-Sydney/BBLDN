// 03 §11 row 2 — the scheduling swap test, in the part that is reachable today. The stub is the only
// implementation on `main`; the real inside and an external calendar provider (Google / Cal.com) land later
// behind this same `Scheduling` type, and these cases are what they must also pass.
import { beforeEach, describe, expect, it } from "vitest";
import { SCHEDULING } from "@/modules/config";
import type {
  Actor,
  AvailabilityRule,
  ISO,
  RuleId,
  SlotId,
  Subject,
  UserId,
} from "@/modules/shared-types";
import {
  canMoveStatus,
  configureScheduling,
  createSchedulingStub,
  generateSlots,
  londonInstant,
  nextFreeSlot,
  scheduling,
  unconfiguredScheduling,
} from "../index";

// A Saturday in GMT and a Saturday in BST, so I-6 is asserted on both sides of a transition.
const GMT_FRIDAY = "2026-01-09";
const BST_FRIDAY = "2026-07-10";

const admin: Actor = { kind: "admin", id: "admin-1" as never };
const parent: Actor = {
  kind: "user",
  id: "parent-1" as UserId,
  role: "parent",
};
const parentSubject: Subject = {
  kind: "position",
  positionId: "position-1" as never,
  parentId: "parent-1" as UserId,
};
const nannySubject: Subject = { kind: "nanny", nannyId: "nanny-1" as UserId };

const weekdayRules: ReadonlyArray<AvailabilityRule> = [0, 1, 2, 3, 4].map(
  (weekday) => ({
    id: `rule-${weekday}` as RuleId,
    weekday: weekday as AvailabilityRule["weekday"],
    startLocal: "09:00",
    endLocal: "11:00",
  }),
);

const clockAt = (isoDate: string) => () => `${isoDate}T00:00:00.000Z` as ISO;

const stub = (clockDate = GMT_FRIDAY) =>
  createSchedulingStub({ clock: clockAt(clockDate), rules: weekdayRules });

describe("scheduling — the London wall clock (03 §3.3 I-6)", () => {
  it("reads 09:00 as 09:00Z in GMT and 08:00Z in BST", () => {
    expect(londonInstant(GMT_FRIDAY, "09:00")).toBe("2026-01-09T09:00:00.000Z");
    expect(londonInstant(BST_FRIDAY, "09:00")).toBe("2026-07-10T08:00:00.000Z");
  });

  it("puts a slot on the config grid and never past the rule's end", () => {
    const slots = generateSlots({
      rules: weekdayRules,
      from: `${GMT_FRIDAY}T00:00:00.000Z` as ISO,
      to: `${GMT_FRIDAY}T23:59:00.000Z` as ISO,
      slotMinutes: SCHEDULING.slotMinutes,
    });
    const first = slots[0]?.start;
    const last = slots.at(-1)?.end;
    expect(slots.length).toBeGreaterThan(0);
    expect(first).toBe("2026-01-09T09:00:00.000Z");
    expect(last).toBe("2026-01-09T11:00:00.000Z");
  });
});

describe("scheduling — the window and the grid (I-7)", () => {
  it("offers nothing before now + the config lead time", async () => {
    const calendar = stub();
    const slots = await calendar.getAvailableSlots({
      kind: "matchmaking",
      from: `${GMT_FRIDAY}T00:00:00.000Z` as ISO,
      to: `${GMT_FRIDAY}T23:59:00.000Z` as ISO,
    });
    expect(slots.ok).toBe(true);
    const earliest = slots.ok ? slots.value[0]?.start : undefined;
    expect(earliest).toBeDefined();
    expect(Date.parse(earliest ?? "")).toBeGreaterThanOrEqual(
      Date.parse(`${GMT_FRIDAY}T00:00:00.000Z`) +
        SCHEDULING.leadTimeMinutes * 60_000,
    );
  });
});

describe("scheduling — booking invariants", () => {
  const slotOn = (isoDate: string, localTime: string) =>
    `default:${londonInstant(isoDate, localTime)}` as SlotId;

  it("rejects an unknown calendar (I-5)", async () => {
    const booked = await stub().book({
      slotId: "other:2026-01-09T10:00:00.000Z" as SlotId,
      kind: "matchmaking",
      actor: parent,
      subject: parentSubject,
      idempotencyKey: "one",
    });
    expect(booked.ok).toBe(false);
    expect(!booked.ok && booked.error.details?.reason).toBe("CALENDAR_UNKNOWN");
  });

  it("takes a slot once and answers SLOT_TAKEN for the same priority (I-1)", async () => {
    const calendar = stub();
    const slotId = slotOn(GMT_FRIDAY, "10:00");
    const first = await calendar.book({
      slotId,
      kind: "matchmaking",
      actor: parent,
      subject: parentSubject,
      idempotencyKey: "one",
    });
    const second = await calendar.book({
      slotId,
      kind: "matchmaking",
      actor: parent,
      subject: { kind: "nanny", nannyId: "other" as UserId },
      idempotencyKey: "two",
    });
    expect(first.ok).toBe(true);
    expect(!second.ok && second.error.details?.reason).toBe("SLOT_TAKEN");
  });

  it("replays an idempotency key instead of double-booking (I-11)", async () => {
    const calendar = stub();
    const input = {
      slotId: slotOn(GMT_FRIDAY, "10:00"),
      kind: "matchmaking" as const,
      actor: parent,
      subject: parentSubject,
      idempotencyKey: "same",
    };
    const first = await calendar.book(input);
    const replay = await calendar.book(input);
    expect(first.ok && replay.ok).toBe(true);
    expect(first.ok && replay.ok && first.value.booking.id).toBe(
      replay.ok ? replay.value.booking.id : undefined,
    );
  });

  it("allows one active booking per subject (I-10)", async () => {
    const calendar = stub();
    await calendar.book({
      slotId: slotOn(GMT_FRIDAY, "10:00"),
      kind: "matchmaking",
      actor: parent,
      subject: parentSubject,
      idempotencyKey: "one",
    });
    const again = await calendar.book({
      slotId: slotOn(GMT_FRIDAY, "10:30"),
      kind: "matchmaking",
      actor: parent,
      subject: parentSubject,
      idempotencyKey: "two",
    });
    expect(!again.ok && again.error.details?.reason).toBe("ALREADY_BOOKED");
  });

  it("expires a hold rather than silently booking another slot (I-8)", async () => {
    const calendar = stub();
    const slotId = slotOn(GMT_FRIDAY, "10:00");
    const held = await calendar.hold(slotId, parent, {
      kind: "matchmaking",
      subject: parentSubject,
    });
    expect(held.ok).toBe(true);
    const swept = await calendar.expireHolds("2099-01-01T00:00:00.000Z" as ISO);
    expect(swept.ok && swept.value.expired).toBe(1);
    const late = await calendar.book({
      slotId,
      holdId: held.ok ? held.value : ("x" as never),
      kind: "matchmaking",
      actor: parent,
      subject: parentSubject,
      idempotencyKey: "late",
    });
    expect(!late.ok && late.error.details?.reason).toBe("HOLD_EXPIRED");
  });

  it("holds the status lattice in one place (I-9)", async () => {
    expect(canMoveStatus("held", "booked")).toBe(true);
    expect(canMoveStatus("done", "rescheduled")).toBe(false);
    const calendar = stub();
    const booked = await calendar.book({
      slotId: slotOn(GMT_FRIDAY, "10:00"),
      kind: "matchmaking",
      actor: parent,
      subject: parentSubject,
      idempotencyKey: "one",
    });
    const id = booked.ok ? booked.value.booking.id : ("x" as never);
    expect((await calendar.markDone(id, "proceeding", admin)).ok).toBe(true);
    const after = await calendar.markNoAnswer(id, null, admin);
    expect(!after.ok && after.error.details?.reason).toBe(
      "INVALID_STATUS_MOVE",
    );
  });

  // REVIEW-2 §6.2 row 4. This used to assert `NOT_IMPLEMENTED` — an honest claim while the stub refused I-2,
  // and a false one once the real inside built it (`displace-to.ts` + `book_slot()`'s `p_displace_to`). The stub
  // now does the same move with the same pure `nextFreeSlot`, so the claim the swap rests on is the behaviour
  // itself: the parent gets the slot and the nanny is moved, not cancelled and not silently refused.
  it("moves the nanny rather than refusing the parent (I-2)", async () => {
    const calendar = stub();
    const slotId = slotOn(GMT_FRIDAY, "10:00");
    const hers = await calendar.book({
      slotId,
      kind: "nanny-commission",
      actor: parent,
      subject: nannySubject,
      idempotencyKey: "nanny",
    });
    const overriding = await calendar.book({
      slotId,
      kind: "matchmaking",
      actor: parent,
      subject: parentSubject,
      idempotencyKey: "parent",
    });
    expect(overriding.ok).toBe(true);
    if (!overriding.ok || !hers.ok) return;
    expect(overriding.value.displaced?.id).toBe(hers.value.booking.id);
    expect(overriding.value.displaced?.status).toBe("rescheduled");
    expect(overriding.value.displaced?.start).not.toBe(
      hers.value.booking.start,
    );
  });
});

describe("scheduling — admin reads and writes", () => {
  it("never auto-cancels a booking a block covers (I-4)", async () => {
    const calendar = stub();
    const slotId = `default:${londonInstant(GMT_FRIDAY, "10:00")}` as SlotId;
    await calendar.book({
      slotId,
      kind: "matchmaking",
      actor: parent,
      subject: parentSubject,
      idempotencyKey: "one",
    });
    const blocked = await calendar.block(
      {
        start: `${GMT_FRIDAY}T09:00:00.000Z` as ISO,
        end: `${GMT_FRIDAY}T12:00:00.000Z` as ISO,
      },
      "training",
      admin,
    );
    expect(blocked.ok && blocked.value.affected).toHaveLength(1);
    const listed = await calendar.listSchedule(
      {
        from: `${GMT_FRIDAY}T00:00:00.000Z` as ISO,
        to: `${GMT_FRIDAY}T23:59:00.000Z` as ISO,
      },
      admin,
    );
    expect(listed.ok && listed.value[0]?.booking.status).toBe("booked");
  });

  it("computes `due` at read, never by a sweep (I-12)", async () => {
    const calendar = createSchedulingStub({
      clock: () => "2099-01-01T00:00:00.000Z" as ISO,
      rules: weekdayRules,
      bookings: [],
    });
    const listed = await calendar.listSchedule(
      {
        from: "2000-01-01T00:00:00.000Z" as ISO,
        to: "2099-01-01T00:00:00.000Z" as ISO,
      },
      admin,
    );
    expect(listed.ok).toBe(true);
  });

  it("finds the next free slot with one shared rule (03 §3.6)", () => {
    const slots = generateSlots({
      rules: weekdayRules,
      from: `${GMT_FRIDAY}T00:00:00.000Z` as ISO,
      to: `${GMT_FRIDAY}T23:59:00.000Z` as ISO,
      slotMinutes: SCHEDULING.slotMinutes,
    });
    const taken = new Set([slots[0]?.start ?? ""]);
    expect(
      nextFreeSlot(slots, `${GMT_FRIDAY}T00:00:00.000Z` as ISO, taken)?.start,
    ).toBe(slots[1]?.start);
  });
});

describe("scheduling — swap the whole module (03 §11 row 2)", () => {
  beforeEach(() => configureScheduling(unconfiguredScheduling));

  it("fails closed until an implementation is configured, then follows it", async () => {
    const before = await scheduling.listForSubject(nannySubject);
    expect(before.ok).toBe(false);
    expect(!before.ok && before.error.details?.reason).toBe(
      "SCHEDULING_NOT_CONFIGURED",
    );

    configureScheduling(stub());
    const after = await scheduling.listForSubject(nannySubject);
    expect(after.ok && after.value).toEqual([]);
  });
});
