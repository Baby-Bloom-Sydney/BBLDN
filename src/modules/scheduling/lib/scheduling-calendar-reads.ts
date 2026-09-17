// The read half of the db inside: the slot list a parent or a nanny is shown (03 §3.1) and the three reads the
// admin queue and `call-layer` make (`listSchedule` · `listForSubject` · `getBooking`).
//
// I-12 is honoured by construction: nothing here writes, and `due` is computed from `now` at every read
// (`call-list-item.ts`), so no sweep ever needs to change a status (ADR-070).
import { log, ok } from "@/modules/platform";
import { SCHEDULING } from "@/modules/config";
import { ACTIVE_STATUSES } from "@/modules/shared-types";
import type {
  Booking,
  BookingId,
  BookingKind,
  CallListItem,
  ISO,
  Result,
  Slot,
  Subject,
  UserId,
  Uuid,
} from "@/modules/shared-types";
import type {
  AvailabilityBlockRow,
  BookingRow,
  OccupiedSlot,
  ScheduleFilter,
  SchedulingContext,
  SchedulingErrorDetails,
} from "../types";
import { availableSlots } from "./available-slots";
import { bookingFromRow } from "./booking-from-row";
import { callListItem } from "./call-list-item";
import { resolveCalendar } from "./resolve-calendar";
import { ruleFromRow } from "./rule-from-row";
import { schedulingFailure } from "./scheduling-failure";

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const ACTIVE = new Set<string>(ACTIVE_STATUSES);

const rangeOf = (row: AvailabilityBlockRow) => ({
  start: row.start_at as ISO,
  end: row.end_at as ISO,
});

const occupancy = (
  rows: ReadonlyArray<BookingRow>,
): ReadonlyMap<string, OccupiedSlot> =>
  new Map(
    rows
      .filter((row) => ACTIVE.has(row.status))
      .map((row) => [
        new Date(row.start_at).toISOString(),
        Object.freeze({
          nanny: row.priority === 1,
          displacementsToday: row.displacement_count,
        }),
      ]),
  );

export function schedulingCalendarReads(context: SchedulingContext) {
  const { reads, clock } = context;

  /**
   * ADR-143 — the position subject's parent, by join from `nanny_positions.parent_id`. One read per distinct
   * position, run in parallel, never one per row: the admin queue holds several calls for the same family.
   * A position that does not answer is not a parent this module may invent; the callers below say what that
   * means for their own read.
   */
  const parentsOf = async (
    rows: ReadonlyArray<BookingRow>,
  ): Promise<Result<ReadonlyMap<string, UserId>, SchedulingErrorDetails>> => {
    const ids = [
      ...new Set(
        rows
          .filter((row) => row.subject_type === "position")
          .map((row) => row.subject_id),
      ),
    ];
    const read = await Promise.all(
      ids.map(async (id) => reads.positionParent(id as Uuid)),
    );
    const pairs: Array<readonly [string, UserId]> = [];
    for (const [at, answer] of read.entries()) {
      if (!answer.ok) return schedulingFailure(answer.error);
      const id = ids[at];
      if (answer.value !== null && id !== undefined)
        pairs.push([id, answer.value as string as UserId]);
    }
    return ok(new Map(pairs));
  };

  /**
   * A booking whose position is gone is dropped from a **list** rather than failing the whole list: 07 §6's
   * account deletion cascades `nanny_positions` away and leaves the `bookings` row behind (no FK on
   * `subject_id`), so failing would take the entire admin call queue down for one deleted family. It is never
   * dropped silently — 01 §4a rule 2 — and `getBooking` on that same row still refuses outright.
   */
  const dropped = (row: BookingRow, where: string): null => {
    log.error("scheduling: a booking's position subject no longer exists", {
      module: "scheduling",
      action: where,
      bookingId: row.id,
      positionId: row.subject_id,
    });
    return null;
  };

  const loadCalendar = async () => {
    const calendar = await resolveCalendar(reads);
    if (!calendar.ok) return calendar;
    const [rules, blocks, bookings] = await Promise.all([
      reads.rules(calendar.value.id),
      reads.blocks(calendar.value.id),
      reads.bookings(calendar.value.id),
    ]);
    if (!rules.ok) return schedulingFailure(rules.error);
    if (!blocks.ok) return schedulingFailure(blocks.error);
    if (!bookings.ok) return schedulingFailure(bookings.error);
    return ok({
      calendar: calendar.value,
      rules: rules.value,
      blocks: blocks.value,
      bookings: bookings.value,
    });
  };

  const getAvailableSlots = async (query: {
    readonly kind: BookingKind;
    readonly from: ISO;
    readonly to: ISO;
  }): Promise<Result<ReadonlyArray<Slot>, SchedulingErrorDetails>> => {
    const loaded = await loadCalendar();
    if (!loaded.ok) return loaded;
    const { calendar, rules, blocks, bookings } = loaded.value;
    // I-7: the window is the caller's range intersected with [now + lead, now + horizon].
    const now = Date.parse(clock());
    const from = Math.max(
      Date.parse(query.from),
      now + calendar.leadTimeMinutes * MINUTE_MS,
    );
    const to = Math.min(
      Date.parse(query.to),
      now + calendar.horizonDays * DAY_MS,
    );
    if (from > to) return ok(Object.freeze([]));
    return ok(
      availableSlots({
        rules: rules.map(ruleFromRow),
        blocks: blocks.filter((row) => row.kind === "blocked").map(rangeOf),
        opens: blocks.filter((row) => row.kind === "open").map(rangeOf),
        occupied: occupancy(bookings),
        kind: query.kind,
        from: new Date(from).toISOString() as ISO,
        to: new Date(to).toISOString() as ISO,
        slotMinutes: calendar.slotMinutes,
        displacementCap: SCHEDULING.maxDisplacementsPerNannyPerDay,
      }),
    );
  };

  const listSchedule = async (
    range: { readonly from: ISO; readonly to: ISO },
    filter?: ScheduleFilter,
  ): Promise<Result<ReadonlyArray<CallListItem>, SchedulingErrorDetails>> => {
    const loaded = await loadCalendar();
    if (!loaded.ok) return loaded;
    const now = clock();
    const rows = loaded.value.bookings
      .filter((row) => row.start_at >= range.from && row.start_at <= range.to)
      .filter((row) => filter?.kind === undefined || row.kind === filter.kind)
      .filter(
        (row) => filter?.status === undefined || row.status === filter.status,
      )
      .sort((left, right) => left.start_at.localeCompare(right.start_at));
    const parents = await parentsOf(rows);
    if (!parents.ok) return parents;
    const items = rows
      .map(
        (row) =>
          callListItem(row, now, parents.value.get(row.subject_id) ?? null) ??
          dropped(row, "listSchedule"),
      )
      .filter((item): item is CallListItem => item !== null);
    return ok(Object.freeze(items));
  };

  const listForSubject = async (
    subject: Subject,
  ): Promise<Result<ReadonlyArray<Booking>, SchedulingErrorDetails>> => {
    const loaded = await loadCalendar();
    if (!loaded.ok) return loaded;
    const id = subject.kind === "nanny" ? subject.nannyId : subject.positionId;
    // The caller named the subject, so a position's parent is already known here and no join is needed.
    const parentId = subject.kind === "nanny" ? null : subject.parentId;
    return ok(
      Object.freeze(
        loaded.value.bookings
          .filter(
            (row) => row.subject_type === subject.kind && row.subject_id === id,
          )
          .sort((left, right) => right.start_at.localeCompare(left.start_at))
          .map(
            (row) =>
              bookingFromRow(row, parentId) ?? dropped(row, "listForSubject"),
          )
          .filter((booking): booking is Booking => booking !== null),
      ),
    );
  };

  const getBooking = async (
    bookingId: BookingId,
  ): Promise<Result<Booking, SchedulingErrorDetails>> => {
    const row = await reads.booking(bookingId as string as Uuid);
    if (!row.ok) return schedulingFailure(row.error);
    if (row.value === null) return schedulingFailure(undefined, "NOT_FOUND");
    const parents = await parentsOf([row.value]);
    if (!parents.ok) return parents;
    const booking = bookingFromRow(
      row.value,
      parents.value.get(row.value.subject_id) ?? null,
    );
    // ADR-143: the position the booking names is gone, so its subject cannot be answered. `NOT_FOUND` is the
    // truth about the call, and inventing a parent to avoid saying so is the defect this ruling closed.
    return booking === null
      ? schedulingFailure(undefined, "NOT_FOUND")
      : ok(booking);
  };

  /** The one-row form of `parentsOf`, for the write half, which maps the row it has just written. */
  const parentFor = async (
    row: BookingRow,
  ): Promise<Result<UserId | null, SchedulingErrorDetails>> => {
    const parents = await parentsOf([row]);
    return parents.ok ? ok(parents.value.get(row.subject_id) ?? null) : parents;
  };

  return Object.freeze({
    loadCalendar,
    getAvailableSlots,
    listSchedule,
    listForSubject,
    getBooking,
    parentFor,
  });
}
