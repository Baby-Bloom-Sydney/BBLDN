// The booking writes of 03 §3.2, against 02 §4.4 row 4.
//
// **One of them is an RPC and the rest are not, and that is the design.** `book` must move another user's row
// and insert its own **atomically** (I-1 / I-2 / I-3 under two partial uniques), so it is `book_slot()` — one
// RPC, one transaction, ADR-127. Every other write here touches one row, so a single `update` already *is* the
// transaction it needs; wrapping one in a unit of work would be a claim about atomicity, not a guarantee.
//
// `0009` gives `bookings` no client write policy at all, so these run at **service scope** with the caller's
// authority already established above (07 §5.4 row 1) — this module is the one writer (02 §4.4 row 4's comment).
import { ok } from "@/modules/platform";
import type {
  Actor,
  Booking,
  BookingId,
  BookingStatus,
  CancelReason,
  HoldId,
  ISO,
  Result,
  SlotId,
  Uuid,
} from "@/modules/shared-types";
import type {
  BookInput,
  BookOutcome,
  BookSlotResult,
  CalendarReads,
  DoneOutcome,
  HeldFor,
  SchedulingContext,
  SchedulingErrorDetails,
} from "../types";
import { actorColumns } from "./actor-columns";
import { bookSlotResultOf } from "./book-slot-result-of";
import { bookingFromRow } from "./booking-from-row";
import { bookSlotArgs } from "./book-slot-args";
import { canMoveStatus } from "./status-lattice";
import { displaceTo } from "./displace-to";
import { patchBooking } from "./patch-booking";
import { schedulingEvents } from "./scheduling-events";
import { resolveCalendar } from "./resolve-calendar";
import { schedulingFailure } from "./scheduling-failure";
import { slotStart } from "./slot-start";
import { subjectColumns } from "./subject-columns";

const MINUTE_MS = 60_000;

export function schedulingBookingWrites(
  context: SchedulingContext,
  calendarReads: CalendarReads,
) {
  const { auth, reads, clock } = context;
  const service = { scope: "service" as const };

  /** I-9 read once, so the lattice and not a driver error is what refuses an illegal move. */
  const moveTo = async (
    bookingId: BookingId,
    to: BookingStatus,
    patch: Readonly<Record<string, unknown>>,
  ): Promise<Result<Booking, SchedulingErrorDetails>> => {
    const row = await reads.booking(bookingId as string as Uuid);
    if (!row.ok) return schedulingFailure(row.error);
    if (row.value === null) return schedulingFailure(undefined, "NOT_FOUND");
    if (!canMoveStatus(row.value.status, to))
      return schedulingFailure(undefined, "INVALID_STATUS_MOVE");
    const written = await patchBooking(auth, `moveTo:${to}`, bookingId, {
      ...patch,
      status: to,
    });
    return written.ok ? ok(bookingFromRow(written.value)) : written;
  };

  const hold = async (
    slotId: SlotId,
    actor: Actor,
    held: HeldFor,
  ): Promise<Result<HoldId, SchedulingErrorDetails>> => {
    const calendar = await resolveCalendar(reads);
    if (!calendar.ok) return calendar;
    const start = slotStart(slotId);
    if (!start.ok) return start;
    const at = Date.parse(start.value);
    const written = await auth.data.run(
      {
        name: "scheduling.hold",
        exec: (q) =>
          q.from("bookings").insert({
            calendar_id: calendar.value.id,
            kind: held.kind,
            ...actorColumns(actor),
            ...subjectColumns(held.subject),
            start_at: start.value,
            end_at: new Date(
              at + calendar.value.slotMinutes * MINUTE_MS,
            ).toISOString(),
            status: "held",
            priority: held.kind === "nanny-commission" ? 1 : 2,
            hold_expires_at: new Date(
              Date.parse(clock()) + calendar.value.holdTtlSeconds * 1000,
            ).toISOString(),
          }),
      },
      service,
    );
    if (!written.ok) return schedulingFailure(written.error);
    const holdRow = bookingFromRow(written.value);
    schedulingEvents.held(actor, holdRow); // 03 §3.6
    return ok(holdRow.id as string as HoldId);
  };

  const book = async (
    input: BookInput,
  ): Promise<Result<BookOutcome, SchedulingErrorDetails>> => {
    const calendar = await resolveCalendar(reads);
    if (!calendar.ok) return calendar;
    const start = slotStart(input.slotId);
    if (!start.ok) return start;
    // I-2 / I-3: where the displaced nanny goes is computed **before** the RPC, by 03 §3.6's pure
    // `nextFreeSlot`, and handed in as `p_displace_to`. The transaction itself stays one RPC (ADR-127); if the
    // target is taken by the time the lock is held, `book_slot()` falls back to I-3 rather than failing the
    // parent (its own `unique_violation` branch).
    const target = await displaceTo(calendarReads, input.kind, start.value);
    if (!target.ok) return target;
    const answer = await auth.data.run(
      {
        name: "scheduling.book",
        exec: (q) =>
          q.rpc(
            "book_slot",
            bookSlotArgs({
              input,
              calendarId: calendar.value.id,
              start: start.value,
              displaceTo: target.value,
            }),
          ),
      },
      service,
    );
    if (!answer.ok) return schedulingFailure(answer.error);
    // ★ REVIEW-2: `book_slot` is typed `Returns: Json`, so the answer may be null, a scalar or an array. This
    // used to be a bare `as unknown as BookSlotResult`, and the next line's `bookingFromRow(result.booking)`
    // then threw a TypeError out of a function that promises a `Result` — a 500 that skipped the whole coded
    // error registry, on the path that books a family's introduction call.
    const result = bookSlotResultOf(answer.value);
    // `schedulingFailure` already owns this module's reason mapping and defaults to `PROVIDER_ERROR` — "a
    // failure this module cannot name is not one it may translate" (its own header). An unreadable answer is
    // exactly that, so it goes through the same door as every other provider fault.
    if (result === null) return schedulingFailure(undefined);
    const booking = bookingFromRow(result.booking);
    const displaced =
      result.displaced === null ? undefined : bookingFromRow(result.displaced);
    // 03 §3.6 / §3.5 seq 3. `book_slot()` answers with the row it moved, and which of the two events this is
    // depends on what happened to her: I-2 moved her (the row is `rescheduled` at a new time) or I-3 could not
    // and cancelled it. Without one of these a displaced nanny is never told, which is half of I-2.
    if (displaced !== undefined) {
      const from = booking.start;
      if (displaced.status === "cancelled")
        schedulingEvents.displacementFailed(
          input.actor,
          displaced,
          booking.id,
          from,
        );
      else schedulingEvents.displaced(input.actor, displaced, booking.id, from);
    }
    return ok(
      Object.freeze({
        booking,
        ...(displaced === undefined ? {} : { displaced }),
      }),
    );
  };

  const reschedule = async (
    bookingId: BookingId,
    slotId: SlotId,
  ): Promise<Result<Booking, SchedulingErrorDetails>> => {
    const calendar = await resolveCalendar(reads);
    if (!calendar.ok) return calendar;
    const start = slotStart(slotId);
    if (!start.ok) return start;
    const row = await reads.booking(bookingId as string as Uuid);
    if (!row.ok) return schedulingFailure(row.error);
    if (row.value === null) return schedulingFailure(undefined, "NOT_FOUND");
    return moveTo(bookingId, "rescheduled", {
      start_at: start.value,
      end_at: new Date(
        Date.parse(start.value) + calendar.value.slotMinutes * MINUTE_MS,
      ).toISOString(),
      rescheduled_from_at: row.value.start_at,
      rescheduled_at: clock(),
      hold_expires_at: null,
    });
  };

  /** 01 §4f's five-minute pass. I-8: a run-out hold stops occupying its slot — cancelled, never deleted. */
  const expireHolds = async (
    now: ISO,
  ): Promise<Result<{ readonly expired: number }, SchedulingErrorDetails>> => {
    const calendar = await resolveCalendar(reads);
    if (!calendar.ok) return calendar;
    const rows = await reads.bookings(calendar.value.id);
    if (!rows.ok) return schedulingFailure(rows.error);
    const stale = rows.value.filter(
      (row) =>
        row.status === "held" &&
        row.hold_expires_at !== null &&
        row.hold_expires_at <= now,
    );
    for (const row of stale) {
      const written = await patchBooking(
        auth,
        "expireHolds",
        row.id as BookingId,
        { status: "cancelled", cancel_reason: "other", hold_expires_at: null },
      );
      if (!written.ok) return written;
    }
    return ok({ expired: stale.length });
  };

  return Object.freeze({
    hold,
    /** A released hold is a cancelled row, not a deleted one: `0009` gives the module no delete. */
    release: async (
      holdId: HoldId,
    ): Promise<Result<void, SchedulingErrorDetails>> => {
      const moved = await moveTo(holdId as string as BookingId, "cancelled", {
        cancel_reason: "other",
        hold_expires_at: null,
      });
      return moved.ok ? ok(undefined) : moved;
    },
    book,
    reschedule,
    cancel: (bookingId: BookingId, reason: CancelReason) =>
      moveTo(bookingId, "cancelled", {
        cancel_reason: reason,
        hold_expires_at: null,
      }),
    markDone: (bookingId: BookingId, outcome: DoneOutcome, actor: Actor) =>
      moveTo(bookingId, "done", {
        call_outcome: outcome,
        done_by: actorColumns(actor).booked_by_user_id,
        done_at: clock(),
        hold_expires_at: null,
      }),
    markNoAnswer: (bookingId: BookingId, nextAttemptAt: ISO | null) =>
      moveTo(bookingId, "no-answer", {
        call_outcome: "no-answer",
        next_attempt_at: nextAttemptAt,
        hold_expires_at: null,
      }),
    expireHolds,
  });
}
