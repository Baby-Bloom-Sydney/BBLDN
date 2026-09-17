// 03 §3.2 — the scheduling contract types (ADR-074). Importers of the module: call-layer · admin ·
// admin-on-behalf only; these types are shared so `call-layer` can pass a Slot / Booking through.
import type { Actor } from "./actor";
import type { ENUMS } from "./enums";
import type {
  AdminId,
  BlockId,
  BookingId,
  PositionId,
  RuleId,
  UserId,
} from "./ids";
import type { ISO, ISODate } from "./scalars";
import type { CallOutcome, CallType } from "./stage-model";

export type CalendarId = "default";
/** calendarId:startISO — deterministic, never stored. */
export type SlotId = `${CalendarId}:${string}`;
export type BookingKind = CallType;
export type Priority = "parent" | "nanny";
export type BookingStatus = (typeof ENUMS.booking_status)[number];
/** These occupy a slot (03 §3.2; the partial-unique predicate of 02 §4.4 — AC-X-31 / 32). */
export const ACTIVE_STATUSES = Object.freeze([
  "held",
  "booked",
  "rescheduled",
] as const);
export type ActiveStatus = (typeof ACTIVE_STATUSES)[number];
export type CancelReason = (typeof ENUMS.booking_cancel_reason)[number];
export type AttentionFlag = "blocked-over" | "displaced";

export type Subject =
  | {
      readonly kind: "position";
      readonly positionId: PositionId;
      readonly parentId: UserId;
    }
  | { readonly kind: "nanny"; readonly nannyId: UserId };

export type Slot = {
  readonly id: SlotId;
  readonly calendarId: CalendarId;
  readonly start: ISO;
  readonly end: ISO;
  /** a nanny booking; shown to parents only */
  readonly displaceable: boolean;
};

export type Booking = {
  readonly id: BookingId;
  readonly calendarId: CalendarId;
  readonly kind: BookingKind;
  readonly priority: Priority;
  readonly status: BookingStatus;
  readonly subject: Subject;
  readonly start: ISO;
  readonly end: ISO;
  /**
   * **ADR-143 — an absent booker is a contract state, not an empty id.** `null` means the booker's account has
   * been deleted: `0009` declares `booked_by_user_id … on delete set null`, so 07 §6's account-deletion path
   * leaves a real booking behind with nobody on it. The row's `booked_by_role` still says what kind of party
   * booked, and a reader that renders the booker renders by that role ("a former team member" / "the family")
   * rather than minting an id for nobody. A `system` row is never null — it is a named job.
   */
  readonly bookedBy: Actor | null;
  readonly bookedAt: ISO;
  readonly version: number;
  readonly rescheduledFrom?: ISO;
  readonly displacedFrom?: ISO;
  readonly outcome?: CallOutcome;
  readonly nextAttemptAt?: ISO;
  readonly cancelReason?: CancelReason;
};

export type CallListItem = {
  readonly booking: Booking;
  readonly due: "upcoming" | "due" | "overdue" | "past";
  readonly flags: ReadonlyArray<AttentionFlag>;
};

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type LocalTime = `${number}:${number}`;

export type AvailabilityRule = {
  readonly id: RuleId;
  readonly weekday: Weekday;
  readonly startLocal: LocalTime;
  readonly endLocal: LocalTime;
  readonly effectiveFrom?: ISODate;
  readonly effectiveTo?: ISODate;
};

export type Block = {
  readonly id: BlockId;
  readonly start: ISO;
  readonly end: ISO;
  readonly reason: string;
  readonly createdBy: AdminId;
};

/** `config/scheduling.ts` (03 §12 item 8; ADR-076); the timezone is `LOCALE.timezone`. */
export type ScheduleConfig = {
  readonly slotMinutes: number;
  readonly horizonDays: number;
  readonly leadTimeMinutes: number;
  readonly holdTtlSeconds: number;
  readonly reminderOffsetsMinutes: ReadonlyArray<number>;
  readonly overdueGraceMinutes: number;
  readonly maxDisplacementsPerNannyPerDay: number;
  readonly timezone: string;
};
