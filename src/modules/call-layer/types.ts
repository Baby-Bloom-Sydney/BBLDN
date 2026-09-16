// call-layer — the module's type surface (01 §2.5). The connector of 03 §2.7, copied from the contract without
// renaming: the call semantics for all three call types (`matchmaking` · `onboarding` · `nanny-commission`).
//
// Subject rule (03 §2.2; 02 R-1): there is no `calls` table and no `CallId`. A matchmaking / onboarding call is
// the **position's call mirror**, keyed by `positionId`; a nanny-commission call **is** the booking row, keyed by
// `bookingId`.
import type {
  Actor,
  Booking,
  CallOutcome,
  CallState,
  CallType,
  CancelReason,
  HoldId,
  ISO,
  BookingId,
  PositionId,
  Result,
  Slot,
  SlotId,
  StateAfter,
  UserId,
} from "@/modules/shared-types";
import type { TransitionHandler } from "@/modules/positions";

/** 03 §2.7 — no `CallId` (fix: A-4 / R1). */
export type CallRef =
  | { readonly kind: "call"; readonly positionId: PositionId }
  | { readonly kind: "nanny-call"; readonly bookingId: BookingId };

/** Tagged, never `StateAfter | Booking` (fix: A-29). */
export type CallResult =
  | { readonly kind: "call"; readonly state: StateAfter }
  | { readonly kind: "nanny-call"; readonly booking: Booking };

export type CallStateRead = {
  readonly state: CallState;
  readonly type: CallType;
  readonly booking?: Booking;
  readonly outcome?: CallOutcome;
};

/** 03 §2.5 errors plus 03 §3.4's scheduling reasons, as a closed union (03 §1 rule 4). */
export type CallErrorDetails = {
  readonly reason:
    | "E_ENTITY_NOT_FOUND"
    | "E_TRANSITION_NOT_ALLOWED"
    | "E_ACTOR_FORBIDDEN"
    | "E_PRECONDITION_FAILED"
    | "E_STALE_STATE"
    | "BOOKING_NOT_FOR_SUBJECT"
    | "SLOT_TAKEN"
    | "call-layer-not-configured";
  readonly which?: string;
};

export type CallLayerResult<T> = Result<T, CallErrorDetails>;

/** 03 §2.7 `CallLayer`. */
export type CallLayer = {
  /** Pass-through for S-P-02 / S-N-02 — no other module imports `scheduling` (fix: A-10 / R3). */
  readonly listSlots: (
    kind: CallType,
    range: { readonly from: ISO; readonly to: ISO },
  ) => Promise<CallLayerResult<ReadonlyArray<Slot>>>;
  /** `scheduling.book` → `advance(C-1)`. */
  readonly chooseSlot: (
    positionId: PositionId,
    slotId: SlotId,
    holdId: HoldId | undefined,
    actor: Actor,
    idempotencyKey: string,
  ) => Promise<CallLayerResult<StateAfter>>;
  /** `scheduling.reschedule` → `advance(C-2)` for position calls. */
  readonly moveSlot: (
    ref: CallRef,
    slotId: SlotId,
    actor: Actor,
  ) => Promise<CallLayerResult<CallResult>>;
  /** `scheduling.cancel` → `advance(C-2, bookingId: null)`. */
  readonly clearSlot: (
    positionId: PositionId,
    actor: Actor,
    reason: CancelReason,
  ) => Promise<CallLayerResult<StateAfter>>;
  /** = old C-e; the only S-N-02 write (R1). */
  readonly openNannyCall: (input: {
    readonly nannyId: UserId;
    readonly slotId: SlotId;
    readonly holdId?: HoldId;
    readonly actor: Actor;
    readonly idempotencyKey: string;
  }) => Promise<CallLayerResult<Booking>>;
  /** `advance(C-3 | C-5 for no-answer)` · `markDone` / `markNoAnswer` on a nanny call. */
  readonly recordOutcome: (
    ref: CallRef,
    outcome: CallOutcome,
    notes: string | undefined,
    actor: Actor,
  ) => Promise<CallLayerResult<CallResult>>;
  readonly getCallState: (
    ref: CallRef,
  ) => Promise<CallLayerResult<CallStateRead>>;
};

/** The C-row handlers this module registers with the stage model at boot (03 §2.1). */
export type CallLayerSlice = ReadonlyArray<TransitionHandler>;
