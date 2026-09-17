// Every claim `1f`'s merge rests on, executable (ADR-120 rule 1). The two the document makes and the code
// cannot keep are pinned as failing tests, not written down as prose (ADR-120 rule 2).
import { beforeEach, describe, expect, it } from "vitest";
import { SCHEDULING } from "@/modules/config";
import {
  configureEvents,
  createEvents,
  log,
  memoryEventLogStore,
} from "@/modules/platform";
import type {
  Actor,
  BlockId,
  BookingId,
  ISO,
  PositionId,
  RuleId,
  SlotId,
  Subject,
  UserId,
} from "@/modules/shared-types";
import { createScheduling } from "../lib/create-scheduling";
import { fakeSchedulingPort } from "./fake-scheduling-port";

const CALENDAR = "cal-1";
const NOW = "2026-01-08T08:00:00.000Z" as ISO; // Thursday, GMT
const FRIDAY = "2026-01-09";
const POSITION = "pos-1" as PositionId;
const PARENT = "parent-1" as UserId;
const NANNY = "nanny-1" as UserId;

const admin: Actor = { kind: "admin", id: "admin-1" as never };
const parent: Actor = { kind: "user", id: PARENT, role: "parent" };
const parentSubject: Subject = {
  kind: "position",
  positionId: POSITION,
  parentId: PARENT,
};
const nannySubject: Subject = { kind: "nanny", nannyId: NANNY };

const slotAt = (time: string) => `default:${FRIDAY}T${time}:00.000Z` as SlotId;

const calendarRow = {
  id: CALENDAR,
  name: "London calls",
  timezone: "Europe/London", // config-literal-ok: a `calendars` ROW fixture — 02 §4.4 row 1 stores the zone on the row and ADR-076 makes it editable, so the inside reads it from here, not from LOCALE
  slot_minutes: 30,
  booking_horizon_days: 14,
  lead_time_minutes: 120,
  hold_minutes: 5,
};

/** Friday 09:00–11:00, Monday = 0 (02 §4.4 row 2; ADR-118 (c)) — Friday is weekday 4. */
const fridayRule = {
  id: "rule-fri",
  calendar_id: CALENDAR,
  weekday: 4,
  start_time: "09:00:00",
  end_time: "11:00:00",
  effective_from: null,
  effective_to: null,
  created_by: null,
};

const bookingRow = (over: Record<string, unknown>) => ({
  id: "bk-1",
  calendar_id: CALENDAR,
  kind: "matchmaking",
  booked_by_role: "parent",
  booked_by_user_id: PARENT,
  subject_type: "position",
  subject_id: POSITION,
  start_at: `${FRIDAY}T10:00:00.000Z`,
  end_at: `${FRIDAY}T10:30:00.000Z`,
  status: "booked",
  priority: 2,
  hold_expires_at: null,
  idempotency_key: null,
  rescheduled_from_at: null,
  rescheduled_at: null,
  displaced_by_booking_id: null,
  displaced_from_at: null,
  displaced_at: null,
  displacement_count: 0,
  displacement_count_day: null,
  needs_attention: false,
  attention_reason: null,
  next_attempt_at: null,
  cancel_reason: null,
  call_outcome: null,
  call_note: null,
  done_by: null,
  done_at: null,
  notes: null,
  version: 1,
  created_at: NOW,
  updated_at: NOW,
  ...over,
});

const calendarOf = (
  over: {
    readonly bookings?: ReadonlyArray<Record<string, unknown>>;
    readonly blocks?: ReadonlyArray<Record<string, unknown>>;
    readonly rules?: ReadonlyArray<Record<string, unknown>>;
    readonly admin?: boolean;
  } = {},
) => {
  const port = fakeSchedulingPort({
    tables: {
      calendars: [calendarRow],
      availability_rules: over.rules ?? [fridayRule],
      availability_blocks: over.blocks ?? [],
      bookings: over.bookings ?? [],
    },
    ...(over.admin === undefined ? {} : { admin: over.admin }),
  });
  return {
    port,
    calendar: createScheduling({ auth: port.auth, clock: () => NOW }),
  };
};

describe("scheduling inside — the slot list (03 §3.1)", () => {
  it("computes rules minus blocks minus active bookings, inside the window", async () => {
    const { calendar } = calendarOf({
      bookings: [bookingRow({})],
      blocks: [
        {
          id: "blk-1",
          calendar_id: CALENDAR,
          kind: "blocked",
          start_at: `${FRIDAY}T09:00:00.000Z`,
          end_at: `${FRIDAY}T09:30:00.000Z`,
          reason: "holiday",
          created_by: null,
        },
      ],
    });
    const slots = await calendar.getAvailableSlots({
      kind: "matchmaking",
      from: NOW,
      to: `${FRIDAY}T23:00:00.000Z` as ISO,
    });
    expect(slots.ok).toBe(true);
    if (!slots.ok) return;
    // 09:00 blocked, 10:00 booked by a parent — 09:30 and 10:30 survive.
    expect(slots.value.map((slot) => slot.start)).toEqual([
      `${FRIDAY}T09:30:00.000Z`,
      `${FRIDAY}T10:30:00.000Z`,
    ]);
  });

  it("shows a nanny's slot to a parent as displaceable and to a nanny not at all (I-2)", async () => {
    const nannyBooking = bookingRow({
      id: "bk-n",
      kind: "nanny-commission",
      priority: 1,
      subject_type: "nanny",
      subject_id: NANNY,
      booked_by_role: "nanny",
      booked_by_user_id: NANNY,
    });
    const { calendar } = calendarOf({ bookings: [nannyBooking] });
    const range = { from: NOW, to: `${FRIDAY}T23:00:00.000Z` as ISO };
    const forParent = await calendar.getAvailableSlots({
      kind: "matchmaking",
      ...range,
    });
    const forNanny = await calendar.getAvailableSlots({
      kind: "nanny-commission",
      ...range,
    });
    expect(
      forParent.ok &&
        forParent.value.find((slot) => slot.start === `${FRIDAY}T10:00:00.000Z`)
          ?.displaceable,
    ).toBe(true);
    expect(
      forNanny.ok &&
        forNanny.value.some((slot) => slot.start === `${FRIDAY}T10:00:00.000Z`),
    ).toBe(false);
  });

  it("stops showing her slot as displaceable at the I-13 cap — it reads as taken", async () => {
    const atCap = bookingRow({
      id: "bk-n",
      kind: "nanny-commission",
      priority: 1,
      subject_type: "nanny",
      subject_id: NANNY,
      displacement_count: SCHEDULING.maxDisplacementsPerNannyPerDay,
      displacement_count_day: FRIDAY,
    });
    const { calendar } = calendarOf({ bookings: [atCap] });
    const slots = await calendar.getAvailableSlots({
      kind: "matchmaking",
      from: NOW,
      to: `${FRIDAY}T23:00:00.000Z` as ISO,
    });
    expect(
      slots.ok &&
        slots.value.some((slot) => slot.start === `${FRIDAY}T10:00:00.000Z`),
    ).toBe(false);
  });

  it("refuses nothing but answers empty when the lead time swallows the range (I-7)", async () => {
    const { calendar } = calendarOf();
    const slots = await calendar.getAvailableSlots({
      kind: "matchmaking",
      from: NOW,
      to: "2026-01-08T09:00:00.000Z" as ISO, // inside the 120-minute notice
    });
    expect(slots.ok && slots.value).toEqual([]);
  });
});

describe("scheduling inside — booking is one RPC (ADR-127)", () => {
  const answerWith = (booking: Record<string, unknown>) => () => ({
    booking,
    displaced: null,
    replayed: false,
  });

  it("books through book_slot() once, with no p_displace_to when nobody is there", async () => {
    const { port, calendar } = calendarOf();
    port.rpcAnswer = answerWith(bookingRow({}));
    const booked = await calendar.book({
      slotId: slotAt("09:30"),
      kind: "matchmaking",
      actor: parent,
      subject: parentSubject,
      idempotencyKey: "k-1",
    });
    expect(booked.ok).toBe(true);
    expect(port.rpcCalls).toHaveLength(1);
    expect(port.rpcCalls[0]?.name).toBe("book_slot");
    expect(port.rpcCalls[0]?.args).toMatchObject({
      p_calendar_id: CALENDAR,
      p_kind: "matchmaking",
      p_subject_type: "position",
      p_subject_id: POSITION,
      p_start_at: `${FRIDAY}T09:30:00.000Z`,
      p_actor_role: "parent",
      p_actor_user_id: PARENT,
      p_idempotency_key: "k-1",
      p_displacement_cap: SCHEDULING.maxDisplacementsPerNannyPerDay,
    });
    expect(port.rpcCalls[0]?.args).not.toHaveProperty("p_displace_to");
  });

  it("displaces in the SAME call: p_displace_to is her next free start (I-2)", async () => {
    const nannyAt10 = bookingRow({
      id: "bk-n",
      kind: "nanny-commission",
      priority: 1,
      subject_type: "nanny",
      subject_id: NANNY,
    });
    const { port, calendar } = calendarOf({ bookings: [nannyAt10] });
    port.rpcAnswer = answerWith(bookingRow({ id: "bk-p" }));
    const booked = await calendar.book({
      slotId: slotAt("10:00"),
      kind: "matchmaking",
      actor: parent,
      subject: parentSubject,
      idempotencyKey: "k-2",
    });
    expect(booked.ok).toBe(true);
    // One RPC, and the nanny's new time is the next slot a nanny could be shown, not an earlier one, // config-literal-ok: prose naming the fixture's own slots
    // because `nextFreeSlot` searches at or **after** where she was.
    expect(port.rpcCalls).toHaveLength(1);
    expect(port.rpcCalls[0]?.args.p_displace_to).toBe(
      `${FRIDAY}T10:30:00.000Z`,
    );
  });

  it("sends no p_displace_to when she has nowhere to go, so book_slot() takes the I-3 branch", async () => {
    const rows = [
      bookingRow({
        id: "bk-n",
        kind: "nanny-commission",
        priority: 1,
        subject_type: "nanny",
        subject_id: NANNY,
      }),
      bookingRow({
        id: "bk-x",
        start_at: `${FRIDAY}T10:30:00.000Z`,
        end_at: `${FRIDAY}T11:00:00.000Z`,
      }),
    ];
    // The rule stops after this Friday, so the 14-day horizon holds nothing later for her to move to.
    const { port, calendar } = calendarOf({
      bookings: rows,
      rules: [{ ...fridayRule, effective_to: FRIDAY }],
    });
    port.rpcAnswer = answerWith(bookingRow({ id: "bk-p" }));
    await calendar.book({
      slotId: slotAt("10:00"),
      kind: "matchmaking",
      actor: parent,
      subject: parentSubject,
      idempotencyKey: "k-3",
    });
    expect(port.rpcCalls[0]?.args).not.toHaveProperty("p_displace_to");
  });

  it("never computes a displacement for a nanny — a nanny never displaces (I-2)", async () => {
    const parentAt10 = bookingRow({});
    const { port, calendar } = calendarOf({ bookings: [parentAt10] });
    port.rpcAnswer = answerWith(bookingRow({ id: "bk-n" }));
    await calendar.book({
      slotId: slotAt("10:00"),
      kind: "nanny-commission",
      actor: { kind: "user", id: NANNY, role: "nanny" },
      subject: nannySubject,
      idempotencyKey: "k-4",
    });
    expect(port.rpcCalls[0]?.args).not.toHaveProperty("p_displace_to");
  });

  it("maps a raise from 0009 back to its 03 §3.4 reason", async () => {
    const { port, calendar } = calendarOf();
    port.rpcAnswer = () => {
      throw new Error("SLOT_TAKEN");
    };
    const booked = await calendar.book({
      slotId: slotAt("09:30"),
      kind: "matchmaking",
      actor: parent,
      subject: parentSubject,
      idempotencyKey: "k-5",
    });
    expect(!booked.ok && booked.error.details?.reason).toBe("SLOT_TAKEN");
    expect(!booked.ok && booked.error.code).toBe("CONFLICT");
  });
});

describe("scheduling inside — the hold carries what the row needs (I-10)", () => {
  it("writes a held row with the subject, the kind, the priority and a TTL", async () => {
    const { port, calendar } = calendarOf();
    const held = await calendar.hold(slotAt("09:30"), parent, {
      kind: "matchmaking",
      subject: parentSubject,
    });
    expect(held.ok).toBe(true);
    const row = port.rows.get("bookings")?.[0];
    expect(row).toMatchObject({
      status: "held",
      kind: "matchmaking",
      subject_type: "position",
      subject_id: POSITION,
      priority: 2,
      booked_by_role: "parent",
      start_at: `${FRIDAY}T09:30:00.000Z`,
      end_at: `${FRIDAY}T10:00:00.000Z`,
    });
    expect(row?.hold_expires_at).toBe("2026-01-08T08:05:00.000Z");
  });

  it("releases a hold by cancelling the row, never by deleting it", async () => {
    const heldRow = bookingRow({
      id: "bk-h",
      status: "held",
      hold_expires_at: "2026-01-08T08:05:00.000Z",
    });
    const { port, calendar } = calendarOf({ bookings: [heldRow] });
    const released = await calendar.release("bk-h" as never, parent);
    expect(released.ok).toBe(true);
    expect(port.rows.get("bookings")).toHaveLength(1);
    expect(port.rows.get("bookings")?.[0]).toMatchObject({
      status: "cancelled",
      cancel_reason: "other",
      hold_expires_at: null,
    });
  });

  it("expires only the holds that have run out (I-8)", async () => {
    const rows = [
      bookingRow({
        id: "bk-stale",
        status: "held",
        hold_expires_at: "2026-01-08T07:00:00.000Z",
      }),
      bookingRow({
        id: "bk-fresh",
        start_at: `${FRIDAY}T09:30:00.000Z`,
        end_at: `${FRIDAY}T10:00:00.000Z`,
        status: "held",
        hold_expires_at: "2026-01-08T09:00:00.000Z",
      }),
    ];
    const { port, calendar } = calendarOf({ bookings: rows });
    const swept = await calendar.expireHolds(NOW);
    expect(swept.ok && swept.value.expired).toBe(1);
    expect(port.rows.get("bookings")?.[0]?.status).toBe("cancelled");
    expect(port.rows.get("bookings")?.[1]?.status).toBe("held");
  });
});

describe("scheduling inside — the status lattice gates every move (I-9)", () => {
  it("refuses a move out of a terminal row before any write is attempted", async () => {
    const done = bookingRow({
      id: "bk-d",
      status: "done",
      call_outcome: "proceeding",
    });
    const { port, calendar } = calendarOf({ bookings: [done] });
    const moved = await calendar.markNoAnswer("bk-d" as BookingId, null, admin);
    expect(!moved.ok && moved.error.details?.reason).toBe(
      "INVALID_STATUS_MOVE",
    );
    expect(port.names).not.toContain("scheduling.moveTo:no-answer");
  });

  it("marks a call done with its outcome, who did it and when", async () => {
    const { port, calendar } = calendarOf({ bookings: [bookingRow({})] });
    const moved = await calendar.markDone(
      "bk-1" as BookingId,
      "proceeding",
      admin,
    );
    expect(moved.ok).toBe(true);
    expect(port.rows.get("bookings")?.[0]).toMatchObject({
      status: "done",
      call_outcome: "proceeding",
      done_by: "admin-1",
      done_at: NOW,
    });
  });

  it("closes a no-answer row and records the next attempt (C-5's booking half; R5)", async () => {
    const { port, calendar } = calendarOf({ bookings: [bookingRow({})] });
    const moved = await calendar.markNoAnswer(
      "bk-1" as BookingId,
      `${FRIDAY}T14:00:00.000Z` as ISO,
      admin,
    );
    expect(moved.ok).toBe(true);
    expect(port.rows.get("bookings")?.[0]).toMatchObject({
      status: "no-answer",
      call_outcome: "no-answer",
      next_attempt_at: `${FRIDAY}T14:00:00.000Z`,
    });
  });

  it("moves the same row on a reschedule and keeps where it came from", async () => {
    const { port, calendar } = calendarOf({ bookings: [bookingRow({})] });
    const moved = await calendar.reschedule(
      "bk-1" as BookingId,
      slotAt("09:30"),
      admin,
    );
    expect(moved.ok).toBe(true);
    expect(port.rows.get("bookings")).toHaveLength(1);
    expect(port.rows.get("bookings")?.[0]).toMatchObject({
      status: "rescheduled",
      start_at: `${FRIDAY}T09:30:00.000Z`,
      rescheduled_from_at: `${FRIDAY}T10:00:00.000Z`,
    });
  });
});

describe("scheduling inside — the admin methods (ADR-077; 07 §5.4)", () => {
  it("a block FLAGS every booking it covers and cancels none (I-4 / ADR-077)", async () => {
    const { port, calendar } = calendarOf({ bookings: [bookingRow({})] });
    const blocked = await calendar.block(
      {
        start: `${FRIDAY}T09:45:00.000Z` as ISO,
        end: `${FRIDAY}T11:00:00.000Z` as ISO,
      },
      "holiday",
      admin,
    );
    expect(blocked.ok).toBe(true);
    if (!blocked.ok) return;
    expect(blocked.value.affected.map((b) => b.id)).toEqual(["bk-1"]);
    expect(port.rows.get("bookings")?.[0]).toMatchObject({
      status: "booked",
      needs_attention: true,
      attention_reason: "blocked-over",
    });
    expect(port.rows.get("availability_blocks")?.[0]).toMatchObject({
      kind: "blocked",
      reason: "holiday",
    });
  });

  it("refuses an overlapping availability rule (RULE_OVERLAP)", async () => {
    const { calendar } = calendarOf();
    const set = await calendar.setAvailabilityRule(
      { weekday: 4, startLocal: "10:00", endLocal: "12:00" },
      admin,
    );
    expect(!set.ok && set.error.details?.reason).toBe("RULE_OVERLAP");
  });

  it("closes a rule with effectiveTo rather than deleting it", async () => {
    const { port, calendar } = calendarOf();
    const removed = await calendar.removeAvailabilityRule(
      "rule-fri" as RuleId,
      admin,
    );
    expect(removed.ok).toBe(true);
    expect(port.rows.get("availability_rules")).toHaveLength(1);
    expect(port.rows.get("availability_rules")?.[0]?.effective_to).toBe(
      "2026-01-07",
    );
  });

  it("takes its authority from the SESSION, not from the Actor it was handed (FIX-1)", async () => {
    const { calendar } = calendarOf({ admin: false });
    const blocked = await calendar.block(
      {
        start: `${FRIDAY}T09:00:00.000Z` as ISO,
        end: `${FRIDAY}T10:00:00.000Z` as ISO,
      },
      "holiday",
      admin, // an `Actor` claiming to be an admin — the session says otherwise
    );
    const listed = await calendar.listSchedule(
      { from: NOW, to: `${FRIDAY}T23:00:00.000Z` as ISO },
      admin,
    );
    const ruled = await calendar.setAvailabilityRule(
      { weekday: 1, startLocal: "09:00", endLocal: "10:00" },
      admin,
    );
    for (const refused of [blocked, listed, ruled]) {
      expect(!refused.ok && refused.error.code).toBe("FORBIDDEN");
    }
  });
});

describe("scheduling inside — the queue's read (03 §3.2; I-12)", () => {
  it("computes `due` from now at read and carries the row's own flags", async () => {
    const rows = [
      bookingRow({ id: "bk-up", start_at: `${FRIDAY}T10:00:00.000Z` }),
      bookingRow({
        id: "bk-flag",
        start_at: "2026-01-08T07:00:00.000Z",
        end_at: "2026-01-08T07:30:00.000Z",
        needs_attention: true,
        attention_reason: "displaced",
      }),
      bookingRow({
        id: "bk-done",
        start_at: "2026-01-08T06:00:00.000Z",
        end_at: "2026-01-08T06:30:00.000Z",
        status: "done",
        call_outcome: "proceeding",
      }),
    ];
    const { calendar } = calendarOf({ bookings: rows });
    const listed = await calendar.listSchedule(
      {
        from: "2026-01-01T00:00:00.000Z" as ISO,
        to: `${FRIDAY}T23:00:00.000Z` as ISO,
      },
      admin,
    );
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const byId = new Map(listed.value.map((item) => [item.booking.id, item]));
    expect(byId.get("bk-up" as BookingId)?.due).toBe("upcoming");
    expect(byId.get("bk-flag" as BookingId)?.due).toBe("overdue");
    expect(byId.get("bk-flag" as BookingId)?.flags).toEqual(["displaced"]);
    expect(byId.get("bk-done" as BookingId)?.due).toBe("past");
  });

  it("filters by call type so the queue can group matchmaking, onboarding and commission calls", async () => {
    const rows = [
      bookingRow({}),
      bookingRow({
        id: "bk-o",
        kind: "onboarding",
        start_at: `${FRIDAY}T09:30:00.000Z`,
        end_at: `${FRIDAY}T10:00:00.000Z`,
      }),
    ];
    const { calendar } = calendarOf({ bookings: rows });
    const listed = await calendar.listSchedule(
      {
        from: "2026-01-01T00:00:00.000Z" as ISO,
        to: `${FRIDAY}T23:00:00.000Z` as ISO,
      },
      admin,
      { kind: "onboarding" },
    );
    expect(listed.ok && listed.value.map((item) => item.booking.id)).toEqual([
      "bk-o",
    ]);
  });
});

describe("scheduling inside — what the document says and the code cannot yet do", () => {
  // ★ 03 §3.2: `unblock(blockId, actor)` removes a block and its slots come back. 02 §4.4 row 3 gives
  // `availability_blocks` no revocation column and 03 §1.4's `Query` has no `delete`, so there is no honest
  // write that does it. Flipping `kind` to `'open'` was rejected — precedence is blocked > open > rule, so an
  // `open` row ADDS availability and a block laid outside the rules would come back as new open time.
  // Owed: a `delete` on `TableQuery` (the ADR-131 (1) class) or `availability_blocks.revoked_at` in `0018`.
  it("the document's `unblock` lifts a block and the slots return", async () => {
    const block = {
      id: "blk-1",
      calendar_id: CALENDAR,
      kind: "blocked",
      start_at: `${FRIDAY}T09:00:00.000Z`,
      end_at: `${FRIDAY}T10:00:00.000Z`,
      reason: "holiday",
      created_by: null,
    };
    const { calendar } = calendarOf({ blocks: [block] });
    const lifted = await calendar.unblock("blk-1" as BlockId, admin);
    expect(lifted.ok).toBe(true);
  });

  // ★ 03 §3.2's `Subject` for a position carries `parentId`; `bookings` (02 §4.4 row 4) stores only
  // `subject_type` + `subject_id`. After an admin books on behalf, `booked_by_user_id` is the admin, so the
  // parent is simply not in the row. Owed to 02 §4.4 (a `parent_id` column) or to 03 §3.2 (optional on
  // read-back). 03 §3.6 already says `admin` decorates the subject from `positions`, which is the workaround
  // the queue uses today.
  it.fails(
    "a position booked on behalf reads back carrying its parent",
    async () => {
      const onBehalf = bookingRow({
        booked_by_role: "admin",
        booked_by_user_id: "admin-1",
      });
      const { calendar } = calendarOf({ bookings: [onBehalf] });
      const read = await calendar.getBooking("bk-1" as BookingId, admin);
      expect(read.ok).toBe(true);
      if (!read.ok) return;
      expect(
        read.value.subject.kind === "position" && read.value.subject.parentId,
      ).toBe(PARENT);
    },
  );
});

/**
 * 03 §3.6's five, and who they belong to (`1g`).
 *
 * `1f`'s handover read §3.6 as putting these on `call-layer`; the document does not. §3.6 lists them under the
 * `scheduling` contract and its exception names only the `call.*` family ("Booking creation, reschedule,
 * cancel, done and no-answer are **call facts** emitted by `call-layer`"). §3.5 sequence 3 settles it by where
 * it puts the attribution: `booking.displaced` fires, "then `call.slot-chosen` (parent, **from `call-layer`**)".
 * The contradiction is recorded in the `1g` PROGRESS entry and resolved the document's way.
 *
 * The events are emitted **outside** the write and are never allowed to fail it, so the assertion is on what
 * reached the log — a real `platform` events binding over a memory store, not a spy on the module.
 */
describe("scheduling inside — the five events 03 §3.6 names", () => {
  let store = memoryEventLogStore();
  beforeEach(() => {
    store = memoryEventLogStore();
    configureEvents(createEvents({ store, log }));
  });
  const eventNames = (): ReadonlyArray<string> =>
    store.rows.map((row) => row.name);

  it("emits booking.held when a family takes a slot out of the pool", async () => {
    const { calendar } = calendarOf();
    await calendar.hold(slotAt("09:30"), parent, {
      kind: "matchmaking",
      subject: parentSubject,
    });
    expect(eventNames()).toContain("booking.held");
  });

  // Half of I-2: without this the displaced nanny is never told. The message is `call-layer`'s (§3.5 seq 3);
  // this is the record it is chased from.
  it("emits booking.displaced when book_slot() answers with a moved row", async () => {
    const { port, calendar } = calendarOf();
    port.rpcAnswer = () => ({
      booking: bookingRow({ id: "bk-new" }),
      displaced: bookingRow({
        id: "bk-nanny",
        status: "rescheduled",
        subject_type: "nanny",
        subject_id: NANNY,
        kind: "nanny-commission",
        priority: 1,
      }),
      replayed: false,
    });
    await calendar.book({
      slotId: slotAt("09:30"),
      kind: "matchmaking",
      actor: parent,
      subject: parentSubject,
      idempotencyKey: "k-displace",
    });
    expect(eventNames()).toContain("booking.displaced");
    expect(eventNames()).not.toContain("booking.displacement-failed");
  });

  // I-3's fallback: her call could not be moved, so it was cancelled. A different fact and a different name.
  it("emits booking.displacement-failed when I-3 cancelled her instead", async () => {
    const { port, calendar } = calendarOf();
    port.rpcAnswer = () => ({
      booking: bookingRow({ id: "bk-new" }),
      displaced: bookingRow({
        id: "bk-nanny",
        status: "cancelled",
        subject_type: "nanny",
        subject_id: NANNY,
        kind: "nanny-commission",
        priority: 1,
      }),
      replayed: false,
    });
    await calendar.book({
      slotId: slotAt("09:30"),
      kind: "matchmaking",
      actor: parent,
      subject: parentSubject,
      idempotencyKey: "k-fail",
    });
    expect(eventNames()).toContain("booking.displacement-failed");
    expect(eventNames()).not.toContain("booking.displaced");
  });

  it("emits booking.blocked-over per flagged call, and availability.changed for the block", async () => {
    const { calendar } = calendarOf({
      bookings: [
        bookingRow({ id: "bk-1", start_at: `${FRIDAY}T09:30:00.000Z` }),
      ],
      admin: true,
    });
    await calendar.block(
      {
        start: `${FRIDAY}T09:00:00.000Z` as ISO,
        end: `${FRIDAY}T12:00:00.000Z` as ISO,
      },
      "admin away",
      admin,
    );
    expect(eventNames()).toContain("booking.blocked-over");
    expect(eventNames()).toContain("availability.changed");
  });

  it("emits availability.changed when a block is lifted (0018's revoked_at)", async () => {
    const { calendar } = calendarOf({
      admin: true,
      blocks: [
        {
          id: "blk-1",
          calendar_id: CALENDAR,
          kind: "blocked",
          start_at: `${FRIDAY}T09:00:00.000Z`,
          end_at: `${FRIDAY}T10:00:00.000Z`,
          reason: "holiday",
          created_by: null,
        },
      ],
    });
    const lifted = await calendar.unblock("blk-1" as BlockId, admin);
    expect(lifted.ok).toBe(true);
    expect(eventNames()).toContain("availability.changed");
  });
});

// ── REVIEW-2 (typescript-review HIGH) — `book_slot` returns `Json`, so its shape is checked, not asserted ──
//
// `database.types.ts` declares `book_slot.Returns: Json` and `RpcResult` forwards that verbatim, so the answer
// may be `null`, a scalar or an array. The module used to write `answer.value as unknown as BookSlotResult` and
// dereference `result.booking` on the very next line: on any non-object answer that is
// `bookingFromRow(undefined)` → a `TypeError` thrown out of a function whose declared type is
// `Promise<Result<BookOutcome, SchedulingErrorDetails>>`. Every caller checks `if (!booked.ok)` and none wraps
// in `try`, so the failure skipped the coded-error registry entirely and became a 500 — on the path that books
// a family's introduction call.
//
// Verified RED first: against the shipped code each case below threw instead of returning.
describe("scheduling inside — an unreadable book_slot answer is a Result, never a throw (REVIEW-2)", () => {
  const unreadable: ReadonlyArray<readonly [string, unknown]> = Object.freeze([
    ["null", null],
    ["a scalar", 7],
    ["an array", []],
    ["an object with no booking", { displaced: null, replayed: false }],
    ["a booking that is not an object", { booking: "bk-1", displaced: null }],
    [
      "a displaced that is neither an object nor null",
      { booking: {}, displaced: "bk-2" },
    ],
  ]);

  for (const [what, answer] of unreadable)
    it(`refuses with a coded reason when book_slot answers ${what}`, async () => {
      const { port, calendar } = calendarOf();
      port.rpcAnswer = () => answer;
      const booked = await calendar.book({
        slotId: slotAt("09:30"),
        kind: "matchmaking",
        actor: parent,
        subject: parentSubject,
        idempotencyKey: `review2-${what.replace(/\s+/g, "-")}`,
      });
      expect(booked.ok).toBe(false);
      if (booked.ok) return;
      // `schedulingFailure`'s own rule: a failure this module cannot name is not one it may translate.
      expect(booked.error.details?.reason).toBe("PROVIDER_ERROR");
    });
});

// ── REVIEW-2 (typescript-review HIGH) — the empty-string sentinel, PINNED rather than invented ─────────────
//
// `booking-from-row.ts` reconstructs an absent booker as a **branded empty string**: `(row.booked_by_user_id ??
// "") as AdminId` for an admin row, and `parentId: "" as UserId` for a position subject whose booker was not the
// parent. A well-typed id belonging to nobody then travels into `schedulingEvents` and the admin call queue as
// the acting party. This is the class-5 defect (a non-authority value typed as an authority) reached with a
// value the type system approves of, so no cast and no `any` is involved and nothing catches it.
//
// **It is reachable, which is what makes it worth pinning.** `0009` declares `booked_by_user_id uuid references
// auth.users (id) ON DELETE SET NULL`. So 07 §6's own account-deletion path turns every booking an admin made
// into `booked_by_role = 'admin'` with a NULL user id — and every one of them reads back as an admin whose id is
// `""`.
//
// **Not fixed here, deliberately.** 03 §3.2's `Actor` and `Subject` have no "booker absent" arm, so any value
// this module chooses is an invention, and REVIEW-2's brief forbids contract changes. ADR-123 rule 2 says what
// to do when code and document disagree: pin the documented behaviour as a failing test and record it. The owner
// is 03 §3.2 (an optional / absent booker) together with 02 §4.4 (whether `parent_id` should be its own column,
// which the sibling pin above already asks for).
describe("scheduling inside — an absent booker is never a branded empty id (REVIEW-2)", () => {
  it.fails(
    'PINNED (03 §3.2): a deleted admin\'s booking reads back without minting `""` as an AdminId',
    async () => {
      const orphan = bookingRow({
        booked_by_role: "admin",
        booked_by_user_id: null,
      });
      const { calendar } = calendarOf({ bookings: [orphan] });
      const read = await calendar.getBooking("bk-1" as BookingId, admin);
      expect(read.ok).toBe(true);
      if (!read.ok) return;
      // Whatever the contract grows, it must not be an id that is a well-typed reference to nobody.
      const bookedBy = read.value?.bookedBy;
      expect(bookedBy?.kind === "admin" ? bookedBy.id : "not-admin").not.toBe(
        "",
      );
    },
  );
});
