// 03 §3 — the scheduling contract (ADR-074). The data types (`Slot` · `Booking` · `AvailabilityRule` ·
// `Block` · `CallListItem` · `ScheduleConfig` …) live in `shared-types/scheduling.ts` so `call-layer` can pass
// one through; this file names the connector itself, its error reasons and its ports.
//
// Importers are `call-layer`, `admin` and `admin-on-behalf` only (03 §3.2 / §3.6; R3). `onboarding-nanny` and
// `public-site` never import this module — S-N-02 books through `call-layer.openNannyCall`.
import type { Auth } from "@/modules/auth";
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
  CallOutcome,
  HoldId,
  ISO,
  Result,
  Database,
  RuleId,
  Slot,
  SlotId,
  Subject,
  Uuid,
} from "@/modules/shared-types";

type AppTables = Database["public"]["Tables"];

/** 03 §3.4 — every `details.reason` the connector may return. */
export type SchedulingReason =
  | "SLOT_TAKEN"
  | "SLOT_OUTSIDE_WINDOW"
  | "SLOT_BLOCKED"
  | "HOLD_EXPIRED"
  | "HOLD_NOT_YOURS"
  | "ALREADY_BOOKED"
  | "NOT_DISPLACEABLE"
  | "NO_FREE_SLOT"
  | "INVALID_STATUS_MOVE"
  | "RULE_OVERLAP"
  | "CALENDAR_UNKNOWN"
  | "PROVIDER_ERROR"
  /**
   * 03 §3.4 names `NOT_FOUND` as the **code** for an unknown id but lists no reason beside it, and 03 §1 rule 4
   * says a contract's failures close over a reason union. The reason mirrors the code rather than borrowing
   * `CALENDAR_UNKNOWN`, which would tell a caller the calendar is gone when one booking simply is not there.
   */
  | "NOT_FOUND"
  /** 03 §3.4: "`FORBIDDEN` when a non-admin calls an admin method" — the same code-without-a-reason gap. */
  | "FORBIDDEN"
  /** the parts of the inside this unit has not built — never a silent success (01 §4a rule 2) */
  | "NOT_IMPLEMENTED"
  | "SCHEDULING_NOT_CONFIGURED";

export type SchedulingErrorDetails = {
  readonly reason: SchedulingReason;
  readonly provider?: string;
};

export type BookInput = {
  readonly slotId: SlotId;
  readonly holdId?: HoldId;
  readonly kind: BookingKind;
  readonly actor: Actor;
  readonly subject: Subject;
  readonly idempotencyKey: string;
};

/** A parent booking over a nanny's slot returns the nanny's moved row as `displaced` (03 §3.3 I-2). */
export type BookOutcome = {
  readonly booking: Booking;
  readonly displaced?: Booking;
};

export type ScheduleFilter = {
  readonly kind?: BookingKind;
  readonly status?: BookingStatus;
};

export type DoneOutcome = Exclude<CallOutcome, "no-answer" | "cancelled">;

/**
 * ★ **Amendment owed to 03 §3.2, made here because the contract contradicts its own invariant** (1f; recorded
 * in the L-007 PROGRESS entry). §3.2 writes `hold(slotId, actor)`, with no subject and no kind. But §3.2's own
 * `ACTIVE_STATUSES` includes `'held'`, and §3.3 **I-10** says "one active booking per subject (partial unique on
 * `(subject_type, subject_id)` where status active)" — so a held row *has* a subject, by the contract's own
 * words. 02 §4.4 row 4 agrees in the strongest terms available: `subject_type`, `subject_id` and `kind` are all
 * NOT NULL on `bookings`, and `book_slot()` refuses a hold whose subject or kind does not match the booking it
 * is being spent on (`HOLD_NOT_YOURS`). A two-argument `hold` can therefore write no row at all: it is the
 * defective side, and the invariant wins.
 *
 * So the hold says what it is for. `call-layer` is the only caller that holds (R3; the admin and the nanny form
 * book without one), and it already knows both fields.
 */
export type HeldFor = {
  readonly kind: BookingKind;
  readonly subject: Subject;
};

/** 03 §3.2, with the `hold` amendment above. Every read returns a `Result` too (R4; fix: A-12). */
export type Scheduling = {
  getAvailableSlots(q: {
    readonly kind: BookingKind;
    readonly from: ISO;
    readonly to: ISO;
  }): Promise<Result<ReadonlyArray<Slot>, SchedulingErrorDetails>>;
  hold(
    slotId: SlotId,
    actor: Actor,
    held: HeldFor,
  ): Promise<Result<HoldId, SchedulingErrorDetails>>;
  release(
    holdId: HoldId,
    actor: Actor,
  ): Promise<Result<void, SchedulingErrorDetails>>;
  book(input: BookInput): Promise<Result<BookOutcome, SchedulingErrorDetails>>;
  reschedule(
    bookingId: BookingId,
    slotId: SlotId,
    actor: Actor,
  ): Promise<Result<Booking, SchedulingErrorDetails>>;
  cancel(
    bookingId: BookingId,
    actor: Actor,
    reason: Booking["cancelReason"] & string,
  ): Promise<Result<Booking, SchedulingErrorDetails>>;
  markDone(
    bookingId: BookingId,
    outcome: DoneOutcome,
    actor: Actor,
  ): Promise<Result<Booking, SchedulingErrorDetails>>;
  markNoAnswer(
    bookingId: BookingId,
    nextAttemptAt: ISO | null,
    actor: Actor,
  ): Promise<Result<Booking, SchedulingErrorDetails>>;
  getBooking(
    bookingId: BookingId,
    actor: Actor,
  ): Promise<Result<Booking, SchedulingErrorDetails>>;
  listForSubject(
    subject: Subject,
  ): Promise<Result<ReadonlyArray<Booking>, SchedulingErrorDetails>>;
  setAvailabilityRule(
    rule: Omit<AvailabilityRule, "id"> & { readonly id?: RuleId },
    actor: Actor,
  ): Promise<Result<AvailabilityRule, SchedulingErrorDetails>>;
  removeAvailabilityRule(
    ruleId: RuleId,
    actor: Actor,
  ): Promise<Result<void, SchedulingErrorDetails>>;
  block(
    range: { readonly start: ISO; readonly end: ISO },
    reason: string,
    actor: Actor,
  ): Promise<
    Result<
      { readonly block: Block; readonly affected: ReadonlyArray<Booking> },
      SchedulingErrorDetails
    >
  >;
  unblock(
    blockId: BlockId,
    actor: Actor,
  ): Promise<Result<void, SchedulingErrorDetails>>;
  listSchedule(
    range: { readonly from: ISO; readonly to: ISO },
    actor: Actor,
    filter?: ScheduleFilter,
  ): Promise<Result<ReadonlyArray<CallListItem>, SchedulingErrorDetails>>;
  expireHolds(
    now: ISO,
  ): Promise<Result<{ readonly expired: number }, SchedulingErrorDetails>>;
};

export type IsoClock = () => ISO;

/** What the in-memory stub is seeded with (03 §3.6 fixtures). */
export type SchedulingStubSeed = {
  readonly clock?: IsoClock;
  readonly rules?: ReadonlyArray<AvailabilityRule>;
  readonly blocks?: ReadonlyArray<Block>;
  readonly bookings?: ReadonlyArray<Booking>;
};

export type SchedulingRegistry = {
  get(): Scheduling;
  set(next: Scheduling): void;
};

// ---------------------------------------------------------------------------
// The db-backed inside (1f) — 02 §4.4's four tables, reached through `auth`'s data port at service scope.
// The row aliases live here rather than in each mapper so `database.types.ts` is named once and a regenerated
// column reaches every mapper as a type error rather than as a silent `undefined`.
// ---------------------------------------------------------------------------

/** 02 §4.4 row 1. One row day one; its uuid is what `'default'` resolves to (03 §3.2 I-5). */
export type CalendarRow = AppTables["calendars"]["Row"];
/** 02 §4.4 row 2 — `weekday` is `0–6` with **Monday = 0** (ADR-118 (c)). */
export type AvailabilityRuleRow = AppTables["availability_rules"]["Row"];
/** 02 §4.4 row 3 — `kind` is `'blocked' | 'open'`; precedence blocked > open > rule. */
export type AvailabilityBlockRow = AppTables["availability_blocks"]["Row"];
/** 02 §4.4 row 4 — the call record and the only stored slot-shaped thing. */
export type BookingRow = AppTables["bookings"]["Row"];

/** What `createScheduling` is given at boot: the one road to Postgres, and a clock the tests can pin. */
export type SchedulingDeps = {
  readonly auth: Auth;
  readonly clock?: IsoClock;
};

/** `book_slot()`'s `jsonb` answer (02 §7): the row it wrote, the row it moved, and whether this was a replay. */
export type BookSlotResult = {
  readonly booking: BookingRow;
  readonly displaced: BookingRow | null;
  readonly replayed: boolean;
};

/** The reads `createScheduling` stands on (`lib/scheduling-reads.ts`); a fake of this shape is the test seam. */
export type SchedulingReads = {
  calendar(): Promise<Result<CalendarRow | null>>;
  rules(calendarId: Uuid): Promise<Result<ReadonlyArray<AvailabilityRuleRow>>>;
  blocks(
    calendarId: Uuid,
  ): Promise<Result<ReadonlyArray<AvailabilityBlockRow>>>;
  bookings(calendarId: Uuid): Promise<Result<ReadonlyArray<BookingRow>>>;
  booking(bookingId: Uuid): Promise<Result<BookingRow | null>>;
  /**
   * ADR-143 — the position subject's `parentId`, joined from `nanny_positions.parent_id`, because `bookings`
   * stores `subject_type` + `subject_id` only and the ruling adds no column. `null` means the position row is
   * gone; the caller refuses rather than inventing a parent.
   */
  positionParent(positionId: Uuid): Promise<Result<Uuid | null>>;
};

/** The one calendar, resolved: 03 §3.2's `'default'` and 02 §4.4's uuid plus the values the admin may edit. */
export type ResolvedCalendar = {
  readonly id: Uuid;
  readonly slotMinutes: number;
  readonly horizonDays: number;
  readonly leadTimeMinutes: number;
  readonly holdTtlSeconds: number;
};

/** What `availableSlots` needs (03 §3.1): the rules, both kinds of block, and who already holds a start. */
export type AvailableSlotsInput = {
  readonly rules: ReadonlyArray<AvailabilityRule>;
  readonly blocks: ReadonlyArray<{ readonly start: ISO; readonly end: ISO }>;
  readonly opens: ReadonlyArray<{ readonly start: ISO; readonly end: ISO }>;
  /** every active booking's start, with the priority on it and how often it has moved today (I-13) */
  readonly occupied: ReadonlyMap<string, OccupiedSlot>;
  readonly kind: BookingKind;
  readonly from: ISO;
  readonly to: ISO;
  readonly slotMinutes: number;
  readonly displacementCap: number;
};

export type OccupiedSlot = {
  readonly nanny: boolean;
  readonly displacementsToday: number;
};

/** The read group `displaceTo` and the admin writes both stand on (`lib/scheduling-calendar-reads.ts`). */
export type CalendarReads = ReturnType<
  typeof import("./lib/scheduling-calendar-reads").schedulingCalendarReads
>;

/** What every group of the db inside is handed: the port, the reads over it, and a pinnable clock. */
export type SchedulingContext = {
  readonly auth: Auth;
  readonly reads: SchedulingReads;
  readonly clock: IsoClock;
};
