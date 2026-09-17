// The call queue's own claims (ADR-120 rule 1). Everything the screen shows is either the booking's or is
// decorated from a connector — this suite pins which, and pins the one thing the screen deliberately cannot do.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  configureScheduling,
  createSchedulingStub,
} from "@/modules/scheduling";
import { configurePositions } from "@/modules/positions";
import { ok } from "@/modules/platform";
import type {
  Actor,
  AdminId,
  AvailabilityRule,
  Booking,
  BookingId,
  ISO,
  PositionId,
  RuleId,
  UserId,
} from "@/modules/shared-types";
import { loadCallQueue } from "../call-queue/lib/load-call-queue";
import { callStateOf } from "../call-queue/lib/call-state-of";
import { queueGroupOf } from "../call-queue/lib/queue-group-of";
import { QUEUE_HEADINGS } from "../call-queue/lib/queue-headings";
import { CALL_OUTCOME_LABEL } from "../call-queue/lib/call-outcome-label";

const ADMIN: Actor = { kind: "admin", id: "admin-1" as AdminId };
const POSITION = "pos-1" as PositionId;
const PARENT = "parent-1" as UserId;
const NOW = "2026-01-08T08:00:00.000Z";

const rules: ReadonlyArray<AvailabilityRule> = [0, 1, 2, 3, 4].map(
  (weekday) => ({
    id: `rule-${String(weekday)}` as RuleId,
    weekday: weekday as AvailabilityRule["weekday"],
    startLocal: "09:00",
    endLocal: "11:00",
  }),
);

const booking = (over: Partial<Booking>): Booking =>
  ({
    id: "bk-1" as BookingId,
    calendarId: "default",
    kind: "matchmaking",
    priority: "parent",
    status: "booked",
    subject: { kind: "position", positionId: POSITION, parentId: PARENT },
    start: "2026-01-09T10:00:00.000Z" as ISO,
    end: "2026-01-09T10:30:00.000Z" as ISO,
    bookedBy: { kind: "user", id: PARENT, role: "parent" },
    bookedAt: NOW as ISO,
    version: 1,
    ...over,
  }) as Booking;

const wire = (bookings: ReadonlyArray<Booking>) => {
  configureScheduling(
    createSchedulingStub({ clock: () => NOW as ISO, rules, bookings }),
  );
  configurePositions({
    amend: vi.fn(),
    getStage: vi.fn(),
    getJourneySteps: vi.fn(),
    listAllowed: vi.fn(),
    recordPrecheck: vi.fn(),
    getForMatching: vi.fn(async () =>
      ok({
        positionId: POSITION,
        parentId: PARENT,
        stage: "OPEN",
        district: "SW4",
        activeConnectionNannyIds: [],
      }),
    ),
  } as never);
};

beforeEach(() => {
  vi.restoreAllMocks();
  // `loadCallQueue` reads the real clock for its range (the horizon is "from now"); the fixtures sit on the
  // stub's January clock, so the two are pinned to the same instant rather than the range being widened.
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  wire([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("admin/call-queue — where a row sits (04 §6.4)", () => {
  it("groups by the `due` scheduling computed, and never recomputes it (I-12)", () => {
    expect(
      queueGroupOf({ booking: booking({}), due: "overdue", flags: [] }),
    ).toBe("overdue");
    expect(queueGroupOf({ booking: booking({}), due: "past", flags: [] })).toBe(
      "done",
    );
  });

  it("puts a no-answer row in the waiting group, because the call went back to awaiting-slot (R5)", () => {
    const row = {
      booking: booking({ status: "no-answer" }),
      due: "past" as const,
      flags: [],
    };
    expect(queueGroupOf(row)).toBe("awaiting-slot");
    expect(callStateOf(row)).toBe("awaiting-slot");
  });

  it("derives the call state from the booking, the way 03 §2.7 derives a nanny call's", () => {
    const of = (status: Booking["status"]) =>
      callStateOf({ booking: booking({ status }), due: "due", flags: [] });
    expect(of("booked")).toBe("slot-chosen");
    expect(of("rescheduled")).toBe("slot-chosen");
    expect(of("done")).toBe("done");
    expect(of("cancelled")).toBe("done");
    expect(of("no-answer")).toBe("awaiting-slot");
  });

  it("orders the five groups by what needs the admin first", () => {
    expect(QUEUE_HEADINGS.map((each) => each.name)).toEqual([
      "overdue",
      "due",
      "upcoming",
      "awaiting-slot",
      "done",
    ]);
  });
});

describe("admin/call-queue — the read (03 §3.6: scheduling returns ids, admin decorates)", () => {
  /**
   * A fake `Scheduling` rather than the stub, for a reason worth stating: the stub honours I-1 / I-5 / I-7 /
   * I-8 / I-9 / I-10 / I-11 / I-12 and explicitly **not** I-4's flagging (its own header says so), so a
   * blocked-over row cannot exist in it. The flags are `scheduling`'s to write — pinned in
   * `scheduling.inside.test.ts` — and what this panel owes is that it carries them through untouched.
   */
  const withSchedule = (items: ReadonlyArray<unknown>) =>
    configureScheduling({
      ...createSchedulingStub({ clock: () => NOW as ISO, rules }),
      listSchedule: async () => ok(items),
    } as never);

  const refusing = (code: string) =>
    configureScheduling({
      ...createSchedulingStub({ clock: () => NOW as ISO, rules }),
      listSchedule: async () => ({
        ok: false,
        error: { code, message: "no" },
      }),
    } as never);

  const item = (over: Record<string, unknown> = {}) => ({
    booking: booking({}),
    due: "upcoming",
    flags: [],
    ...over,
  });

  const firstRow = async () => {
    const read = await loadCallQueue(ADMIN);
    if (read.kind !== "queue") return null;
    return read.view.groups.flatMap((group) => group.rows)[0] ?? null;
  };

  it("decorates a position row from the `positions` connector and names the parent for the levers", async () => {
    withSchedule([item()]);
    const row = await firstRow();
    expect(row?.about).toBe("SW4 · position open");
    expect(row?.parentId).toBe(PARENT);
    expect(row?.when).toContain("London time");
  });

  it("carries the row's own flags so a blocked-over call is visible without a second read", async () => {
    withSchedule([item({ flags: ["blocked-over"] })]);
    const row = await firstRow();
    expect(row?.flags).toContain("blocked-over");
    // ADR-077 / I-4: the call is still there. A block flags; it never cancels.
    expect(row?.state).toBe("slot-chosen");
  });

  it("says out loud that a never-booked call is not on this screen", async () => {
    withSchedule([]);
    const read = await loadCallQueue(ADMIN);
    expect(read.kind === "queue" && read.view.neverBookedUnavailable).toBe(
      true,
    );
  });

  it("answers `forbidden`, not an empty list, when the calendar refuses the session", async () => {
    refusing("FORBIDDEN");
    expect((await loadCallQueue(ADMIN)).kind).toBe("forbidden");
  });

  it("answers `unavailable` when the calendar cannot be read at all", async () => {
    refusing("INTERNAL");
    expect((await loadCallQueue(ADMIN)).kind).toBe("unavailable");
  });

  it("does not fall over when the position cannot be read — the row still shows its time", async () => {
    configurePositions({
      amend: vi.fn(),
      getStage: vi.fn(),
      getJourneySteps: vi.fn(),
      listAllowed: vi.fn(),
      recordPrecheck: vi.fn(),
      getForMatching: vi.fn(async () => ({
        ok: false,
        error: { code: "NOT_FOUND", message: "gone" },
      })),
    } as never);
    withSchedule([item()]);
    const row = await firstRow();
    expect(row?.about).toBe("Position details unavailable");
    expect(row?.parentId).toBeUndefined();
  });
});

describe("admin/call-queue — the outcome vocabulary is 03 §2.7's enum (ADR-124)", () => {
  it("labels every outcome the enum has and invents none", () => {
    expect(Object.keys(CALL_OUTCOME_LABEL).sort()).toEqual([
      "cancelled",
      "no-answer",
      "not-now",
      "not-proceeding",
      "proceeding",
    ]);
  });

  it("uses no word 04 §5.1 forbids on an admin label", () => {
    const banned = [/\bsales\b/i, /\bconsultation\b/i, /\boffer\b/i];
    for (const label of Object.values(CALL_OUTCOME_LABEL)) {
      for (const word of banned) expect(label).not.toMatch(word);
    }
  });
});

describe("admin/call-queue — S-A-19's call rows (04 §6.4)", () => {
  it("reads newest first and names how each call ended", async () => {
    const { callTimelineRows } =
      await import("../call-queue/lib/call-timeline-rows");
    const rows = callTimelineRows([
      booking({
        id: "bk-old" as BookingId,
        start: "2026-01-02T10:00:00.000Z" as ISO,
      }),
      booking({
        id: "bk-new" as BookingId,
        start: "2026-01-09T10:00:00.000Z" as ISO,
        status: "done",
        outcome: "proceeding",
      }),
    ]);
    expect(rows.map((each) => each.id)).toEqual(["bk-new", "bk-old"]);
    expect(rows[0]?.detail).toBe("Call done — Going ahead");
    expect(rows[1]?.detail).toBe("Time set");
  });

  it("says when a family booking moved a nanny's call, and when a no-answer left it waiting", async () => {
    const { callTimelineRows } =
      await import("../call-queue/lib/call-timeline-rows");
    const rows = callTimelineRows([
      booking({
        id: "bk-d" as BookingId,
        status: "rescheduled",
        displacedFrom: "2026-01-09T09:00:00.000Z" as ISO,
      }),
      booking({
        id: "bk-n" as BookingId,
        start: "2026-01-08T10:00:00.000Z" as ISO,
        status: "no-answer",
      }),
    ]);
    expect(rows[0]?.detail).toContain("moved by a family booking");
    expect(rows[1]?.detail).toBe("No answer — waiting for a new time");
  });
});
