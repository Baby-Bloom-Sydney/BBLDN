// The admin drawer's half of kickoff debt 2 (04 §7.1 `{nanny}`). `1f` recorded it: a nanny-commission row read
// `Nanny commission call · nanny <uuid>`, because `admin` may not read a table (fix: A-11 / A-24) and no
// connector answered a person by id. `2d` gave `connections` that method — one `nanny_public` read, injected —
// and `admin` already imports `connections` (01 §2.3), so nothing new crosses a boundary.
//
// Written RED: the row carried the raw id.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  configureScheduling,
  createSchedulingStub,
} from "@/modules/scheduling";
import { configurePositions } from "@/modules/positions";
import { configureCallLayer, stubCallLayer } from "@/modules/call-layer";
import { configureConnections, stubConnections } from "@/modules/connections";
import { ok } from "@/modules/platform";
import type {
  Actor,
  AdminId,
  AvailabilityRule,
  Booking,
  BookingId,
  ISO,
  RuleId,
  UserId,
} from "@/modules/shared-types";
import { loadCallQueue } from "../call-queue/lib/load-call-queue";

const ADMIN: Actor = { kind: "admin", id: "admin-1" as AdminId };
const NANNY = "22222222-2222-4222-8222-222222222222" as UserId;
const NOW = "2026-01-08T08:00:00.000Z";

const rules: ReadonlyArray<AvailabilityRule> = [0, 1, 2, 3, 4].map(
  (weekday) => ({
    id: `rule-${String(weekday)}` as RuleId,
    weekday: weekday as AvailabilityRule["weekday"],
    startLocal: "09:00",
    endLocal: "11:00",
  }),
);

const nannyBooking: Booking = {
  id: "bk-n" as BookingId,
  calendarId: "default",
  kind: "nanny-commission",
  priority: "nanny",
  status: "booked",
  subject: { kind: "nanny", nannyId: NANNY },
  start: "2026-01-09T10:00:00.000Z" as ISO,
  end: "2026-01-09T10:30:00.000Z" as ISO,
  bookedBy: { kind: "user", id: NANNY, role: "nanny" },
  bookedAt: NOW as ISO,
  version: 1,
} as Booking;

function withStack(namesByNanny: Readonly<Record<string, string>>) {
  configureScheduling({
    ...createSchedulingStub({ clock: () => NOW as ISO, rules }),
    listSchedule: async () =>
      ok([{ booking: nannyBooking, due: "upcoming", flags: [] }]),
  } as never);
  configureCallLayer({
    ...stubCallLayer({}),
    listOpenCalls: async () => ok([]),
  });
  configurePositions({ getForMatching: async () => ok(null) } as never);
  configureConnections(stubConnections({ namesByNanny }));
}

describe("S-A-03 / S-A-04 — the nanny-commission row names her (kickoff debt 2)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });
  afterEach(() => vi.useRealTimers());

  const firstRow = async () => {
    const read = await loadCallQueue(ADMIN);
    if (read.kind !== "queue") return null;
    return read.view.groups.flatMap((group) => group.rows)[0] ?? null;
  };

  it("reads her name, not her id", async () => {
    withStack({ [NANNY as string]: "Priya" });

    const row = await firstRow();

    expect(row?.about).toContain("Priya");
    expect(row?.about).not.toContain(NANNY as string);
  });

  it("falls back to the id's short form when the view has no row for her — never a bare uuid", async () => {
    withStack({});

    const row = await firstRow();

    expect(row?.about).toContain("Nanny commission call");
    expect(row?.about).not.toContain(NANNY as string);
  });
});
