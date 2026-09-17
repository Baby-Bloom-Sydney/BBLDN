// The five reads of 02 §4.4 through `auth`'s data port, at **service scope** (07 §5.1 rule 5; named in
// `auth`'s README). Service scope is not a shortcut: `0009` gives `calendars`, `availability_rules` and
// `availability_blocks` an admin-only SELECT policy and `bookings` three narrow SELECT policies, while this
// module answers a parent's slot list and a nanny's booking too — the module *is* the authority, and the
// surface that reached it has already checked the caller's role.
//
// ★ Recorded gap, owed to 03 §1.4: `Query` offers `select()` (everything) and ADR-131 (1)'s `eq()` (one
// equality) and **no range predicate**. `bookings` and `availability_blocks` are both read by date range, so
// the range is applied in TypeScript after a keyed read on `calendar_id`. That is honest at launch scale — one
// calendar, a 14-day horizon, an empty table — and it is the same reading 1b recorded for `getPublicNanny`.
// A `between` / `gte` on `KeyedRead` is the amendment; it is not this unit's to make.
import type { Auth } from "@/modules/auth";
import type { Uuid } from "@/modules/shared-types";
import type { SchedulingReads } from "../types";

export function schedulingReads(auth: Auth): SchedulingReads {
  const service = { scope: "service" as const };
  return Object.freeze({
    // 02 §4.4 row 1 is one row day one (ADR-074). `select()` without a key is the honest read of a
    // single-row table; a second row is a design change, not a query this module should silently pick from.
    calendar: () =>
      auth.data.run(
        {
          name: "scheduling.readCalendar",
          exec: async (q) => (await q.from("calendars").select())[0] ?? null,
        },
        service,
      ),
    rules: (calendarId: Uuid) =>
      auth.data.run(
        {
          name: "scheduling.readRules",
          exec: (q) =>
            q.from("availability_rules").eq("calendar_id", calendarId).select(),
        },
        service,
      ),
    blocks: (calendarId: Uuid) =>
      auth.data.run(
        {
          name: "scheduling.readBlocks",
          exec: (q) =>
            q
              .from("availability_blocks")
              .eq("calendar_id", calendarId)
              .select(),
        },
        service,
      ),
    bookings: (calendarId: Uuid) =>
      auth.data.run(
        {
          name: "scheduling.readBookings",
          exec: (q) =>
            q.from("bookings").eq("calendar_id", calendarId).select(),
        },
        service,
      ),
    booking: (bookingId: Uuid) =>
      auth.data.run(
        {
          name: "scheduling.readBooking",
          exec: (q) => q.from("bookings").eq("id", bookingId).single(),
        },
        service,
      ),
  });
}
