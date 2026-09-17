// admin/call-queue — S-A-03's list and S-A-04's drawer (04 §6.4).
//
// This panel owns no data (01 §2.5): it reads `scheduling.listSchedule` for the rows, decorates each with the
// `positions` connector (03 §3.6: "`scheduling` returns ids, `admin` decorates") and writes **only** through
// `admin-on-behalf`'s gated levers (FIX-1 / REVIEW-1 C-1).
//
// The F-c gap this file recorded — that no section states a panel's read signature — is closed by building it:
// the shapes below are derived from 04 §6.4's S-A-03 / S-A-04 rows and 03 §3.2's `CallListItem`, cited per field.
import type { ClientResult } from "@/modules/platform";
import type {
  AttentionFlag,
  Booking,
  BookingId,
  CallOutcome,
  CallState,
  CallType,
  ISO,
  PositionId,
  Priority,
  SlotId,
  UserId,
} from "@/modules/shared-types";

export type { AdminPanel, AdminPanelName } from "../types";

/** Where a call sits for the admin. `awaiting-slot` is its own group (04 §5.2 step 4), not a `due` value. */
export type CallQueueGroupName =
  | "due"
  | "overdue"
  | "upcoming"
  | "awaiting-slot"
  | "done";

/**
 * One row of S-A-03. Everything a row shows is either the booking's own (03 §3.2) or decorated from another
 * module's connector — never read from a table by this module (fix: A-11 / A-24).
 */
export type CallQueueRow = {
  readonly bookingId: BookingId;
  readonly subject:
    | { readonly kind: "position"; readonly positionId: PositionId }
    | { readonly kind: "nanny"; readonly nannyId: UserId };
  readonly type: CallType;
  readonly priority: Priority;
  /** 03 §2.7's derivation, applied to a position call as well as a nanny one — see `call-state-of.ts`. */
  readonly state: CallState;
  readonly startsAt: ISO;
  /** "Friday 9 January, 10:00am London time" — the wording the parent's own page uses (04 §6.2 S-P-02). */
  readonly when: string;
  readonly group: CallQueueGroupName;
  readonly flags: ReadonlyArray<AttentionFlag>;
  readonly outcome?: CallOutcome;
  /** the position's district and stage, or the nanny's id — what the connectors can answer today */
  readonly about: string;
  /** present on a position call, so the drawer can reach the on-behalf levers (they are keyed on the party) */
  readonly parentId?: UserId;
};

export type CallQueueGroup = {
  readonly name: CallQueueGroupName;
  readonly heading: string;
  readonly rows: ReadonlyArray<CallQueueRow>;
};

/**
 * A call the family has **never booked a time for** (03 §3.6: "awaiting-slot calls come from `call-layer`").
 * It is deliberately not a `CallQueueRow`: a row is a booking decorated, and this call has no booking to
 * decorate — no `bookingId`, no start, no flags. `1f` shipped S-A-03 with this half missing and said so on the
 * screen, because the mirror had no table to enumerate; `0018` gave it one.
 *
 * What the admin does with it is the whole point of the group: these are the families BabyBloom rings anyway
 * (03 §2.2 — "`awaiting-slot` = the parent left the call page without picking … BabyBloom calls anyway").
 */
export type AwaitingCallRow = {
  readonly positionId: PositionId;
  readonly parentId: UserId;
  readonly type: Exclude<CallType, "nanny-commission">;
  readonly requestedAt: ISO;
  /** "Friday 9 January, 10:00am London time" — when the call was asked for, in the one timezone (ADR-074). */
  readonly requestedWhen: string;
  /** R5: a call back on the list after a no-answer, and how many times (03 §2.4 C-5). */
  readonly noAnswerCount: number;
  /** the position's district and stage — what the connectors can answer today, same as a booked row */
  readonly about: string;
  /** trigger (c) / path E: the nanny this call is about (04 §3.3) */
  readonly aboutNanny?: string;
};

/**
 * What S-A-03 renders. `awaiting` is the half 03 §3.6 puts on `call-layer` and `1f` could not build: the queue
 * "merges both lists", and now it does. A call that has a booking is a `CallQueueRow` in its `due` group; a
 * call that has never had one is an `AwaitingCallRow` and shows under "Waiting for a time" beside the
 * no-answer retries, which is where the admin looks for the families still owed a ring.
 */
export type CallQueueView = {
  readonly groups: ReadonlyArray<CallQueueGroup>;
  readonly total: number;
  readonly awaiting: ReadonlyArray<AwaitingCallRow>;
};

export type CallQueueRead =
  | { readonly kind: "queue"; readonly view: CallQueueView }
  | { readonly kind: "forbidden" }
  | { readonly kind: "unavailable" };

/** What the drawer (S-A-04) shows for one call, on top of its row. */
export type CallItemView = {
  readonly row: CallQueueRow;
  readonly booking: Booking;
  /** the outcomes the admin may record from here (03 §2.7's enum) */
  readonly outcomes: ReadonlyArray<CallOutcome>;
};

/**
 * Who the on-behalf lever is for. Both arms carry the **party**, because `admin-on-behalf`'s gate requires
 * `onBehalfOf` on every lever (07 §5.4 row 6) and refuses `VALIDATION` without it. The admin's own identity is
 * never in here: the gate takes that from the session (FIX-1).
 */
export type CallPartyRef =
  | {
      readonly kind: "position";
      readonly positionId: PositionId;
      readonly parentId: UserId;
    }
  | {
      readonly kind: "nanny";
      readonly bookingId: BookingId;
      readonly nannyId: UserId;
    };

export type RecordCallOutcomeAction = (input: {
  readonly ref: CallPartyRef;
  readonly outcome: CallOutcome;
  readonly notes?: string;
}) => Promise<ClientResult<void>>;

export type MoveCallSlotAction = (input: {
  readonly ref: CallPartyRef;
  readonly slotId: SlotId;
}) => Promise<ClientResult<void>>;

export type ClearCallSlotAction = (input: {
  readonly positionId: PositionId;
  readonly parentId: UserId;
}) => Promise<ClientResult<void>>;

export type BookCallSlotAction = (input: {
  readonly positionId: PositionId;
  readonly parentId: UserId;
  readonly slotId: SlotId;
}) => Promise<ClientResult<void>>;

export type CallQueueActions = {
  readonly recordOutcome: RecordCallOutcomeAction;
  readonly move: MoveCallSlotAction;
  readonly clear: ClearCallSlotAction;
  readonly book: BookCallSlotAction;
};
