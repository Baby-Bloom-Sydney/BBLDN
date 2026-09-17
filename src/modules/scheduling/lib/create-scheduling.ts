// The real `scheduling` inside (03 §3; ADR-074; Phase 1 `1f`) — one live admin calendar over 02 §4.4's four
// tables, reached through `auth`'s data port and `book_slot()`. It replaces the in-memory stub as the boot
// binding; the stub stays as the test double and as the swap test's second implementation (03 §11 row 2).
//
// What is real here and was not before: slots computed from stored rules and blocks minus active bookings,
// **displacement through `book_slot()` as one RPC** (I-2 / I-3 / I-13; ADR-127), the status lattice (I-9), the
// hold and its expiry (I-8), the admin's rules and blocks, and **block-flags-never-cancels** (I-4 / ADR-077).
//
// What is not, both pinned as failing tests rather than faked (see `scheduling-admin-writes.ts` and the unit's
// PROGRESS entry): `unblock`, which no write available to this module can honestly do, and the `parentId` on a
// position subject read back after an admin-on-behalf booking, which `bookings` does not store.
import { nowInstant } from "@/modules/platform";
import type { ISO } from "@/modules/shared-types";
import type { Scheduling, SchedulingDeps } from "../types";
import { schedulingAdminWrites } from "./scheduling-admin-writes";
import { schedulingBookingWrites } from "./scheduling-booking-writes";
import { schedulingCalendarReads } from "./scheduling-calendar-reads";
import { schedulingReads } from "./scheduling-reads";

export function createScheduling(deps: SchedulingDeps): Scheduling {
  const context = {
    auth: deps.auth,
    reads: schedulingReads(deps.auth),
    clock: deps.clock ?? (() => nowInstant() as ISO),
  };
  const calendar = schedulingCalendarReads(context);
  const bookings = schedulingBookingWrites(context, calendar);
  const admin = schedulingAdminWrites(context, calendar);

  return Object.freeze({
    getAvailableSlots: (query) => calendar.getAvailableSlots(query),
    hold: (slotId, actor, held) => bookings.hold(slotId, actor, held),
    release: (holdId) => bookings.release(holdId),
    book: (input) => bookings.book(input),
    reschedule: (bookingId, slotId) => bookings.reschedule(bookingId, slotId),
    cancel: (bookingId, _actor, reason) => bookings.cancel(bookingId, reason),
    markDone: (bookingId, outcome, actor) =>
      bookings.markDone(bookingId, outcome, actor),
    markNoAnswer: (bookingId, nextAttemptAt) =>
      bookings.markNoAnswer(bookingId, nextAttemptAt),
    getBooking: (bookingId) => calendar.getBooking(bookingId),
    listForSubject: (subject) => calendar.listForSubject(subject),
    setAvailabilityRule: (rule) => admin.setAvailabilityRule(rule),
    removeAvailabilityRule: (ruleId) => admin.removeAvailabilityRule(ruleId),
    block: (range, reason) => admin.block(range, reason),
    unblock: (blockId) => admin.unblock(blockId),
    // 03 §3.2 marks `listSchedule` an admin read and §3.4 promises `FORBIDDEN` to anyone else — the queue is
    // every family's call times, so the session is checked here too, not only by the route above.
    listSchedule: async (range, _actor, filter) => {
      const gate = await admin.asAdmin();
      return gate.ok ? calendar.listSchedule(range, filter) : gate;
    },
    expireHolds: (now) => bookings.expireHolds(now),
  });
}
