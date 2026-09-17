// `scheduling.stub.ts` (03 §3.6) — the in-memory calendar: rules, blocks, bookings, holds and an injected
// clock, over the same pure functions the real inside will use (`lib/generate-slots.ts` ·
// `lib/next-free-slot.ts` · `lib/status-lattice.ts`). Production code inside the module it stubs, selected by
// config, never by editing an import (05 §3 rule 1).
//
// **What it honours:** I-1 (no overlap) · I-5 (one calendar) · I-7 (window from config) · I-8 (hold TTL) ·
// I-9 (status lattice) · I-10 (one active booking per subject) · I-11 (idempotent `book`) · I-12 (`due`
// computed at read) and — since REVIEW-2 §6.2 row 4 — **I-2 / I-3 / I-13, the parent-over-nanny displacement**,
// with the same pure `nextFreeSlot` the real inside hands to `book_slot()` as `p_displace_to`, so the two
// implementations 03 §11 row 2 swaps between agree about where a displaced nanny goes.
import { SCHEDULING } from "@/modules/config";
import { err, newId, nowInstant, ok } from "@/modules/platform";
import type {
  Actor,
  AvailabilityRule,
  Block,
  BlockId,
  Booking,
  BookingId,
  BookingKind,
  BookingStatus,
  CallListItem,
  HoldId,
  ISO,
  Result,
  RuleId,
  Slot,
  SlotId,
} from "@/modules/shared-types";
import { ACTIVE_STATUSES } from "@/modules/shared-types";
import type {
  BookInput,
  BookOutcome,
  HeldFor,
  Scheduling,
  SchedulingErrorDetails,
  ScheduleFilter,
  SchedulingReason,
  SchedulingStubSeed,
} from "./types";
import { canMoveStatus } from "./lib/status-lattice";
import { generateSlots } from "./lib/generate-slots";
import { nextFreeSlot } from "./lib/next-free-slot";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

type Hold = {
  readonly id: HoldId;
  readonly slotId: SlotId;
  readonly actor: Actor;
  /** 03 §3.2's `hold` amendment (see `types.ts`): a held row carries its subject and kind, like every row. */
  readonly kind: BookInput["kind"];
  readonly subjectId: string;
  readonly expiresAt: ISO;
};

type Snapshot = {
  readonly rules: ReadonlyArray<AvailabilityRule>;
  readonly blocks: ReadonlyArray<Block>;
  readonly bookings: ReadonlyArray<Booking>;
  readonly holds: ReadonlyArray<Hold>;
  readonly replays: Readonly<Record<string, BookingId>>;
};

type Holder = { current: Snapshot };

const notFound = () =>
  err<SchedulingErrorDetails>("NOT_FOUND", "No such booking", {
    reason: "INVALID_STATUS_MOVE",
  });

const fail = (reason: SchedulingReason, message: string) =>
  err<SchedulingErrorDetails>("CONFLICT", message, { reason });

const invalid = (reason: SchedulingReason, message: string) =>
  err<SchedulingErrorDetails>("VALIDATION", message, { reason });

const isActive = (booking: Booking): boolean =>
  (ACTIVE_STATUSES as ReadonlyArray<BookingStatus>).includes(booking.status);

const priorityOf = (kind: BookingKind) =>
  kind === "nanny-commission" ? ("nanny" as const) : ("parent" as const);

const startOf = (slotId: SlotId): ISO => slotId.slice("default:".length) as ISO;

const sameSubject = (left: Booking["subject"], right: Booking["subject"]) =>
  left.kind === right.kind && JSON.stringify(left) === JSON.stringify(right);

const withinBlock = (blocks: ReadonlyArray<Block>, start: ISO) =>
  blocks.some((block) => start >= block.start && start < block.end);

const occupant = (snapshot: Snapshot, start: ISO): Booking | undefined =>
  snapshot.bookings.find(
    (booking) => booking.start === start && isActive(booking),
  );

function windowFor(clock: () => ISO): { readonly from: ISO; readonly to: ISO } {
  const now = Date.parse(clock());
  return {
    from: new Date(
      now + SCHEDULING.leadTimeMinutes * MINUTE_MS,
    ).toISOString() as ISO,
    to: new Date(now + SCHEDULING.horizonDays * DAY_MS).toISOString() as ISO,
  };
}

function availableSlots(
  holder: Holder,
  clock: () => ISO,
  query: { readonly kind: BookingKind; readonly from: ISO; readonly to: ISO },
): Result<ReadonlyArray<Slot>, SchedulingErrorDetails> {
  const bounds = windowFor(clock);
  const snapshot = holder.current;
  const slots = generateSlots({
    rules: snapshot.rules,
    from: (query.from > bounds.from ? query.from : bounds.from) as ISO,
    to: (query.to < bounds.to ? query.to : bounds.to) as ISO,
    slotMinutes: SCHEDULING.slotMinutes,
  });
  const wantsNannySlot = priorityOf(query.kind) === "nanny";
  return ok(
    slots
      .filter((slot) => !withinBlock(snapshot.blocks, slot.start))
      .map((slot) => {
        const taken = occupant(snapshot, slot.start);
        if (taken === undefined) return slot;
        return { ...slot, displaceable: taken.priority === "nanny" };
      })
      .filter((slot) => {
        const taken = occupant(snapshot, slot.start);
        if (taken === undefined) return true;
        // a nanny never displaces (I-2); a parent may see a displaceable slot
        return !wantsNannySlot && slot.displaceable;
      }),
  );
}

function holdSlot(
  holder: Holder,
  clock: () => ISO,
  slotId: SlotId,
  actor: Actor,
  held: HeldFor,
): Result<HoldId, SchedulingErrorDetails> {
  const start = startOf(slotId);
  if (!slotId.startsWith("default:"))
    return invalid("CALENDAR_UNKNOWN", "Unknown calendar");
  if (occupant(holder.current, start) !== undefined)
    return fail("SLOT_TAKEN", "That time has just been taken");
  // I-10 reaches a held row too (`ACTIVE_STATUSES` includes `'held'`): a second hold for a subject that
  // already has an active row is `ALREADY_BOOKED`, exactly as the partial unique index answers in Postgres.
  const subjectId =
    held.subject.kind === "nanny"
      ? held.subject.nannyId
      : held.subject.positionId;
  const busy =
    holder.current.holds.some(
      (existing) =>
        existing.subjectId === subjectId && existing.expiresAt >= clock(),
    ) ||
    holder.current.bookings.some(
      (booking) =>
        (booking.subject.kind === "nanny"
          ? booking.subject.nannyId
          : booking.subject.positionId) === subjectId &&
        (ACTIVE_STATUSES as ReadonlyArray<string>).includes(booking.status),
    );
  if (busy)
    return fail("ALREADY_BOOKED", "A time is already set for this call");
  const hold: Hold = {
    id: newId<HoldId>(),
    slotId,
    actor,
    kind: held.kind,
    subjectId,
    expiresAt: new Date(
      Date.parse(clock()) + SCHEDULING.holdTtlSeconds * 1000,
    ).toISOString() as ISO,
  };
  holder.current = {
    ...holder.current,
    holds: [...holder.current.holds, hold],
  };
  return ok(hold.id);
}

function checkHold(
  holder: Holder,
  clock: () => ISO,
  input: BookInput,
): Result<void, SchedulingErrorDetails> {
  if (input.holdId === undefined) return ok(undefined);
  const held = holder.current.holds.find((hold) => hold.id === input.holdId);
  if (held === undefined || held.expiresAt < clock())
    return fail("HOLD_EXPIRED", "That hold has expired");
  if (held.slotId !== input.slotId)
    return fail("HOLD_NOT_YOURS", "That hold is for another time");
  return ok(undefined);
}

function bookSlot(
  holder: Holder,
  clock: () => ISO,
  input: BookInput,
): Result<BookOutcome, SchedulingErrorDetails> {
  const snapshot = holder.current;
  const replayed = snapshot.replays[input.idempotencyKey];
  if (replayed !== undefined) {
    const before = snapshot.bookings.find((booking) => booking.id === replayed);
    if (before !== undefined) return ok({ booking: before });
  }
  if (!input.slotId.startsWith("default:"))
    return invalid("CALENDAR_UNKNOWN", "Unknown calendar");
  const start = startOf(input.slotId);
  const bounds = windowFor(clock);
  if (start < bounds.from || start > bounds.to)
    return fail(
      "SLOT_OUTSIDE_WINDOW",
      "That time is outside the booking window",
    );
  if (withinBlock(snapshot.blocks, start))
    return fail("SLOT_BLOCKED", "That time is not available");
  const held = checkHold(holder, clock, input);
  if (!held.ok) return held;
  if (
    snapshot.bookings.some(
      (booking) =>
        isActive(booking) && sameSubject(booking.subject, input.subject),
    )
  )
    return fail("ALREADY_BOOKED", "There is already a call booked");
  const taken = occupant(snapshot, start);
  const displacing =
    taken !== undefined &&
    taken.priority === "nanny" &&
    priorityOf(input.kind) === "parent";
  if (taken !== undefined && !displacing)
    return fail("SLOT_TAKEN", "That time has just been taken");
  // I-13: at the cap her slot stops being displaceable at all — `availableSlots` already hides it, and a book
  // that reached here anyway is refused rather than moving her a third time today.
  if (
    displacing &&
    displacementsOn(snapshot, taken as Booking) >=
      SCHEDULING.maxDisplacementsPerNannyPerDay
  )
    return fail("NOT_DISPLACEABLE", "That time cannot be taken");
  const moved = displacing ? displace(holder, clock, taken as Booking) : null;
  const after = moved === null ? snapshot : holder.current;
  const booking = newBooking(input, start, clock());
  holder.current = {
    ...after,
    bookings: [...after.bookings, booking],
    holds: after.holds.filter((hold) => hold.id !== input.holdId),
    replays: { ...after.replays, [input.idempotencyKey]: booking.id },
  };
  return ok(moved === null ? { booking } : { booking, displaced: moved });
}

/** How many times this nanny's call has already been moved on the day it sits on (I-13). */
function displacementsOn(snapshot: Snapshot, hers: Booking): number {
  const day = hers.start.slice(0, "YYYY-MM-DD".length);
  return snapshot.bookings.filter(
    (booking) =>
      booking.priority === "nanny" &&
      sameSubject(booking.subject, hers.subject) &&
      booking.displacedFrom !== undefined &&
      booking.displacedFrom.startsWith(day),
  ).length;
}

/**
 * **I-2 / I-3 — the parent-over-nanny displacement, in the stub.**
 *
 * It used to answer `NOT_IMPLEMENTED`, which left `call-layer`'s own suite pinning test scaffolding rather than
 * a doc/code disagreement (REVIEW-2 §6.2 row 4). The real inside computes the target with `nextFreeSlot` and
 * hands it to `book_slot()` as `p_displace_to` (`displace-to.ts`, ADR-127); this does the same arithmetic with
 * the same pure function, so the two implementations 03 §11 row 2 swaps between agree about where she goes.
 *
 * I-2: she is **moved** to her next free start, `rescheduled`, carrying `displacedFrom`. I-3: if there is no
 * free start at all, her call is cancelled `displaced-no-slot` and flagged. The parent succeeds either way,
 * which is the invariant.
 */
function displace(
  holder: Holder,
  clock: () => ISO,
  hers: Booking,
): Booking | null {
  const snapshot = holder.current;
  const horizon = new Date(
    Date.parse(hers.start) + SCHEDULING.horizonDays * DAY_MS,
  ).toISOString() as ISO;
  const free = generateSlots({
    rules: snapshot.rules,
    from: hers.start,
    to: horizon,
    slotMinutes: SCHEDULING.slotMinutes,
  }).filter(
    (slot) =>
      slot.start !== hers.start &&
      !withinBlock(snapshot.blocks, slot.start) &&
      occupant(snapshot, slot.start) === undefined,
  );
  const target = nextFreeSlot(free, hers.start, new Set<string>());
  const after: Booking =
    target === null
      ? {
          ...hers,
          status: "cancelled",
          cancelReason: "displaced-no-slot",
          displacedFrom: hers.start,
          version: hers.version + 1,
        }
      : {
          ...hers,
          status: "rescheduled",
          start: target.start,
          end: new Date(
            Date.parse(target.start) + SCHEDULING.slotMinutes * MINUTE_MS,
          ).toISOString() as ISO,
          displacedFrom: hers.start,
          version: hers.version + 1,
        };
  holder.current = {
    ...snapshot,
    bookings: snapshot.bookings.map((booking) =>
      booking.id === hers.id ? after : booking,
    ),
  };
  return after;
}

function newBooking(input: BookInput, start: ISO, at: ISO): Booking {
  return {
    id: newId<BookingId>(),
    calendarId: "default",
    kind: input.kind,
    priority: priorityOf(input.kind),
    status: "booked",
    subject: input.subject,
    start,
    end: new Date(
      Date.parse(start) + SCHEDULING.slotMinutes * MINUTE_MS,
    ).toISOString() as ISO,
    bookedBy: input.actor,
    bookedAt: at,
    version: 1,
  };
}

function moveStatus(
  holder: Holder,
  bookingId: BookingId,
  to: BookingStatus,
  patch: Partial<Booking>,
): Result<Booking, SchedulingErrorDetails> {
  const before = holder.current.bookings.find(
    (booking) => booking.id === bookingId,
  );
  if (before === undefined) return notFound();
  if (!canMoveStatus(before.status, to))
    return fail("INVALID_STATUS_MOVE", "That booking cannot move there");
  const after: Booking = {
    ...before,
    ...patch,
    status: to,
    version: before.version + 1,
  };
  holder.current = {
    ...holder.current,
    bookings: holder.current.bookings.map((booking) =>
      booking.id === bookingId ? after : booking,
    ),
  };
  return ok(after);
}

function dueOf(booking: Booking, now: ISO): CallListItem["due"] {
  const grace = SCHEDULING.overdueGraceMinutes * MINUTE_MS;
  if (now < booking.start) return "upcoming";
  if (now < booking.end) return "due";
  return Date.parse(now) > Date.parse(booking.end) + grace ? "overdue" : "past";
}

function saveRule(
  holder: Holder,
  rule: Omit<AvailabilityRule, "id"> & { readonly id?: RuleId },
): Result<AvailabilityRule, SchedulingErrorDetails> {
  const saved: AvailabilityRule = { ...rule, id: rule.id ?? newId<RuleId>() };
  holder.current = {
    ...holder.current,
    rules: [
      ...holder.current.rules.filter((each) => each.id !== saved.id),
      saved,
    ],
  };
  return ok(saved);
}

/** I-4: a block never auto-cancels — the affected bookings come back flagged for the admin to handle. */
function addBlock(
  holder: Holder,
  range: { readonly start: ISO; readonly end: ISO },
  reason: string,
  actor: Actor,
): Result<
  { readonly block: Block; readonly affected: ReadonlyArray<Booking> },
  SchedulingErrorDetails
> {
  const block: Block = {
    id: newId<BlockId>(),
    start: range.start,
    end: range.end,
    reason,
    createdBy: actor.id as Block["createdBy"],
  };
  holder.current = {
    ...holder.current,
    blocks: [...holder.current.blocks, block],
  };
  return ok({
    block,
    affected: holder.current.bookings.filter(
      (booking) => isActive(booking) && withinBlock([block], booking.start),
    ),
  });
}

function scheduleList(
  holder: Holder,
  now: ISO,
  range: { readonly from: ISO; readonly to: ISO },
  filter?: ScheduleFilter,
): Result<ReadonlyArray<CallListItem>, SchedulingErrorDetails> {
  return ok(
    holder.current.bookings
      .filter(
        (booking) => booking.start >= range.from && booking.start <= range.to,
      )
      .filter(
        (booking) => filter?.kind === undefined || booking.kind === filter.kind,
      )
      .filter(
        (booking) =>
          filter?.status === undefined || booking.status === filter.status,
      )
      .map((booking) => ({ booking, due: dueOf(booking, now), flags: [] })),
  );
}

function expireHolds(
  holder: Holder,
  now: ISO,
): Result<{ readonly expired: number }, SchedulingErrorDetails> {
  const live = holder.current.holds.filter((hold) => hold.expiresAt >= now);
  const expired = holder.current.holds.length - live.length;
  holder.current = { ...holder.current, holds: live };
  return ok({ expired });
}

function dropHold(
  holder: Holder,
  holdId: HoldId,
): Result<void, SchedulingErrorDetails> {
  holder.current = {
    ...holder.current,
    holds: holder.current.holds.filter((hold) => hold.id !== holdId),
  };
  return ok(undefined);
}

function dropRule(
  holder: Holder,
  ruleId: RuleId,
): Result<void, SchedulingErrorDetails> {
  holder.current = {
    ...holder.current,
    rules: holder.current.rules.filter((rule) => rule.id !== ruleId),
  };
  return ok(undefined);
}

function dropBlock(
  holder: Holder,
  blockId: BlockId,
): Result<void, SchedulingErrorDetails> {
  holder.current = {
    ...holder.current,
    blocks: holder.current.blocks.filter((block) => block.id !== blockId),
  };
  return ok(undefined);
}

function readBooking(
  holder: Holder,
  bookingId: BookingId,
): Result<Booking, SchedulingErrorDetails> {
  const booking = holder.current.bookings.find((each) => each.id === bookingId);
  return booking === undefined ? notFound() : ok(booking);
}

export function createSchedulingStub(
  seed: SchedulingStubSeed = {},
): Scheduling {
  const clock = seed.clock ?? nowInstant;
  const holder: Holder = {
    current: {
      rules: seed.rules ?? [],
      blocks: seed.blocks ?? [],
      bookings: seed.bookings ?? [],
      holds: [],
      replays: {},
    },
  };
  const startedAt = (bookingId: BookingId) =>
    holder.current.bookings.find((booking) => booking.id === bookingId)?.start;

  return Object.freeze({
    getAvailableSlots: async (query) => availableSlots(holder, clock, query),
    hold: async (slotId, actor, held) =>
      holdSlot(holder, clock, slotId, actor, held),
    release: async (holdId) => dropHold(holder, holdId),
    book: async (input) => bookSlot(holder, clock, input),
    reschedule: async (bookingId, slotId) =>
      moveStatus(holder, bookingId, "rescheduled", {
        start: startOf(slotId),
        rescheduledFrom: startedAt(bookingId),
      }),
    cancel: async (bookingId, _actor, reason) =>
      moveStatus(holder, bookingId, "cancelled", { cancelReason: reason }),
    markDone: async (bookingId, outcome) =>
      moveStatus(holder, bookingId, "done", { outcome }),
    markNoAnswer: async (bookingId, nextAttemptAt) =>
      moveStatus(holder, bookingId, "no-answer", {
        ...(nextAttemptAt === null ? {} : { nextAttemptAt }),
      }),
    getBooking: async (bookingId) => readBooking(holder, bookingId),
    listForSubject: async (subject) =>
      ok(
        holder.current.bookings.filter((booking) =>
          sameSubject(booking.subject, subject),
        ),
      ),
    setAvailabilityRule: async (rule) => saveRule(holder, rule),
    removeAvailabilityRule: async (ruleId) => dropRule(holder, ruleId),
    block: async (range, reason, actor) =>
      addBlock(holder, range, reason, actor),
    unblock: async (blockId) => dropBlock(holder, blockId),
    listSchedule: async (range, _actor, filter) =>
      scheduleList(holder, clock(), range, filter),
    expireHolds: async (now) => expireHolds(holder, now),
  });
}
