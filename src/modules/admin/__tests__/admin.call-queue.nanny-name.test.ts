// The admin drawer's half of kickoff debt 2 (04 §7.1 `{nanny}`). `1f` recorded it: a nanny-commission row read
// `Nanny commission call · nanny <uuid>`, because `admin` may not read a table (fix: A-11 / A-24) and no
// connector answered a person by id.
//
// ★ **It is NOT the parent surfaces' read.** The other two `{nanny}` surfaces go through
// `connections.nannyNameOf` over `nanny_public`; this row cannot. 03 §3.2's subject for a `nanny-commission`
// booking is `{ kind: 'nanny', nannyId: UserId }` — her **`auth.users` id** — while `nanny_public` is keyed on
// `nannies.id` and deliberately carries **no `user_id`** (07 §5.2; the ADR-103 review's M1, pinned in `int.rls`).
// A lookup by user id against that view would match nothing, silently, on every row: a fallback that always
// fires and looks like a working feature. The view also excludes exactly the nannies an admin surface is about.
// So this row uses `admin-verification.nannyNameOf` — `user_profiles`, keyed on the user id, session scope with
// RLS as the second gate — which already existed for precisely this question.
//
// Written RED: the row carried the raw id.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  configureScheduling,
  createSchedulingStub,
} from "@/modules/scheduling";
import { configurePositions } from "@/modules/positions";
import { configureCallLayer, stubCallLayer } from "@/modules/call-layer";
import { configureAuth, stubAuth } from "@/modules/auth";
import { ok } from "@/modules/platform";
import type {
  Actor,
  AdminId,
  AvailabilityRule,
  Booking,
  BookingId,
  Email,
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

const ADMIN_ID = "11111111-1111-4111-8111-111111111111" as UserId;

function withStack(profiles: ReadonlyArray<Record<string, unknown>>) {
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
  configureAuth(
    stubAuth({
      users: [
        {
          id: ADMIN_ID,
          email: "reviewer@example.test" as Email,
          role: "admin",
          mfaVerified: true,
        },
      ],
      signedInUserId: ADMIN_ID,
      tables: { user_profiles: profiles },
    }),
  );
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
    withStack([{ user_id: NANNY, first_name: "Priya", last_name: "Okafor" }]);

    const row = await firstRow();

    expect(row?.about).toContain("Priya");
    expect(row?.about).not.toContain(NANNY as string);
  });

  it("falls back to the id's short form when there is no profile row — never a bare uuid", async () => {
    withStack([]);

    const row = await firstRow();

    expect(row?.about).toContain("Nanny commission call");
    expect(row?.about).not.toContain(NANNY as string);
  });
});
