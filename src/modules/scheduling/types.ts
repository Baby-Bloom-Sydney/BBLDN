// 03 §3 — the scheduling contract (ADR-074). The data types (`Slot` · `Booking` · `AvailabilityRule` ·
// `Block` · `CallListItem` · `ScheduleConfig` …) live in `shared-types/scheduling.ts` so `call-layer` can pass
// one through; this file names the connector itself, its error reasons and its ports.
//
// Importers are `call-layer`, `admin` and `admin-on-behalf` only (03 §3.2 / §3.6; R3). `onboarding-nanny` and
// `public-site` never import this module — S-N-02 books through `call-layer.openNannyCall`.
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
  RuleId,
  Slot,
  SlotId,
  Subject,
} from "@/modules/shared-types";

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

/** 03 §3.2 verbatim. Every read returns a `Result` too (R4; fix: A-12). */
export type Scheduling = {
  getAvailableSlots(q: {
    readonly kind: BookingKind;
    readonly from: ISO;
    readonly to: ISO;
  }): Promise<Result<ReadonlyArray<Slot>, SchedulingErrorDetails>>;
  hold(
    slotId: SlotId,
    actor: Actor,
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
