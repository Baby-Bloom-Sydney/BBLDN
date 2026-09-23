// call-layer — the module's type surface (01 §2.5). The connector of 03 §2.7, copied from the contract without
// renaming: the call semantics for all three call types (`matchmaking` · `onboarding` · `nanny-commission`).
//
// Subject rule (03 §2.2; 02 R-1): there is no `calls` table and no `CallId`. A matchmaking / onboarding call is
// the **position's call mirror**, keyed by `positionId`; a nanny-commission call **is** the booking row, keyed by
// `bookingId`.
//
// `1d` adds the inside's ports and the S-P-01 / S-P-02 / S-P-03 view types. One connector extension is recorded
// rather than hidden: `findOpenCall(parentId)` — 03 §2.7 has no "which call is mine" read, and the call page
// cannot be reached without one (raised for ratification in the L-007 `1d` entry, amend-first).
import type {
  Actor,
  Booking,
  BookingId,
  CallOutcome,
  CallState,
  CallType,
  CancelReason,
  Email,
  HoldId,
  ISO,
  ISODate,
  JourneyStep,
  PositionId,
  Result,
  Slot,
  SlotId,
  StateAfter,
  UnitOfWork,
  UserId,
} from "@/modules/shared-types";
import type { ClientResult } from "@/modules/platform";
import type { TransitionHandler } from "@/modules/positions";
import type { Scheduling } from "@/modules/scheduling";
import type { Comms } from "@/modules/comms";

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

/** The call page's read (connector extension, see the file header): the open call of one parent, or none. */
export type OpenCall = CallStateRead & {
  readonly positionId: PositionId;
  /** trigger (c) / path E — the nanny the call is about (04 §3.3) */
  readonly aboutNanny?: string;
  /** a no-answer cleared the last slot (C-5); the page says "we'll try again" (04 §6.2 S-P-01) */
  readonly afterNoAnswer: boolean;
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
    | "SLOT_OUTSIDE_WINDOW"
    | "SLOT_BLOCKED"
    | "HOLD_EXPIRED"
    | "HOLD_NOT_YOURS"
    | "ALREADY_BOOKED"
    | "NOT_IMPLEMENTED"
    | "SCHEDULING_NOT_CONFIGURED"
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
  /**
   * Connector extension (`1g`): every call that is not `done`, for the admin queue's awaiting-slot half.
   * 03 §3.6 names `call-layer` as the source of those calls but 03 §2.7 gives `CallLayer` no method that
   * enumerates them — raised for ratification with `findOpenCall`, amend-first.
   */
  readonly listOpenCalls: () => Promise<
    CallLayerResult<ReadonlyArray<OpenCallSummary>>
  >;
  /** Connector extension (file header): the one open matchmaking / onboarding call of a parent, or `null`. */
  readonly findOpenCall: (
    parentId: UserId,
  ) => Promise<CallLayerResult<OpenCall | null>>;
  /**
   * Connector extension (`2g`), the nanny's half of `findOpenCall` and raised for ratification the same way.
   * S-N-02 must answer "have I already picked a time?" before it renders anything, and 03 §2.7's `getCallState`
   * cannot: a `nanny-call` ref is keyed by `bookingId`, which is the very thing the page does not know. It is
   * `scheduling.listForSubject({ kind: 'nanny' })` narrowed to the one **active** row I-10 allows, so a
   * `done` / `no-answer` / `cancelled` row reads as `null` and she books afresh (R5).
   */
  readonly findNannyBooking: (
    nannyId: UserId,
  ) => Promise<CallLayerResult<Booking | null>>;
};

/** The C-row handlers this module registers with the stage model at boot (03 §2.1). */
export type CallLayerSlice = ReadonlyArray<TransitionHandler>;

// ── The inside's ports (1d) ──

/** A position's call mirror (02 R-1; 0006 `call_state` · `call_type` · `call_requested_at` · `call_booking_id`). */
export type CallMirror = {
  readonly positionId: PositionId;
  readonly parentId: UserId;
  readonly type: Exclude<CallType, "nanny-commission">;
  readonly state: CallState;
  readonly bookingId: BookingId | null;
  readonly requestedAt: ISO;
  readonly outcome?: CallOutcome;
  /** the parent, resolved for comms — 03 §8.1 "the caller passes fully resolved data" */
  readonly recipient: { readonly email: Email; readonly name?: string };
  readonly aboutNanny?: string;
  readonly noAnswerCount: number;
  /** bumped on every write; the `StateAfter.version` a C row answers */
  readonly version: number;
};

/**
 * The mirror store — the one port the inside writes through. The memory implementation ships here; the one
 * over `nanny_positions` lands with `positions`' inside (1e) and the RPC opener (P1-WIRE), as recorded.
 */
export type CallMirrorStore = {
  get(positionId: PositionId): Promise<Result<CallMirror | null>>;
  findOpenForParent(parentId: UserId): Promise<Result<CallMirror | null>>;
  put(mirror: CallMirror, uow?: UnitOfWork): Promise<Result<void>>;
  /**
   * `1g` — every call that is not `done`. 03 §3.6 says the awaiting-slot half of the admin queue "comes from
   * `call-layer`", and until the mirror had a table there was nothing to enumerate: `1f` shipped S-A-03 with
   * that half missing and said so on the screen. This is the read behind `CallLayer.listOpenCalls`.
   */
  listOpen(): Promise<Result<ReadonlyArray<OpenCallSummary>>>;
};

/**
 * One row of 03 §3.6's "awaiting-slot calls come from `call-layer`". Ids and facts only — `admin` decorates
 * (03 §3.6: "`scheduling` returns ids, `admin` decorates"), and the same rule holds for this list.
 */
export type OpenCallSummary = {
  readonly positionId: PositionId;
  readonly parentId: UserId;
  readonly type: Exclude<CallType, "nanny-commission">;
  readonly state: CallState;
  readonly bookingId: BookingId | null;
  readonly requestedAt: ISO;
  readonly noAnswerCount: number;
  readonly aboutNanny?: string;
};

export type CallLayerDeps = {
  readonly store: CallMirrorStore;
  readonly scheduling: Scheduling;
  readonly comms: Comms;
  readonly clock?: () => ISO;
  /**
   * Where `admin-commission-booking` goes (04 §4.4 c3; `08.18`). It is an address rather than a user id
   * because the admin mailbox is `SENDERS.admin`, which comes from env through `config/server` — boot hands it
   * in (L4: no literal here, and this module never reads env). Absent = the notice is logged, never invented.
   */
  readonly adminEmail?: string;
};

// ── Payloads the C rows carry (03 §2.4 "Preconditions / Side effects") ──

export type CallRequestPayload = {
  readonly parentId: UserId;
  readonly type: CallMirror["type"];
  readonly recipient: CallMirror["recipient"];
  readonly aboutNanny?: string;
};

export type CallSlotPayload = { readonly bookingId: BookingId | null };

export type CallDonePayload = {
  readonly outcome: Exclude<CallOutcome, "no-answer">;
  readonly notes?: string;
};

// ── S-P-01 / S-P-02 / S-P-03 view types ──

export type CallPageVariant =
  "matchmaking" | "after-connect" | "onboarding" | "after-no-answer";

export type CallPageView = {
  readonly positionId: PositionId;
  readonly state: CallState;
  readonly variant: CallPageVariant;
  readonly aboutNanny?: string;
  /** the chosen time while `slot-chosen` */
  readonly chosen?: { readonly start: ISO; readonly end: ISO };
};

/** A slot's London wall-clock words (04 §6.2 S-P-02 accessible name; 04 §7.1 row 3 line). */
export type LondonSlotWords = {
  readonly weekday: string;
  readonly date: string;
  readonly time: string;
  /** "Tue 16 Sep, 2:00pm London time" */
  readonly short: string;
  /** "Tuesday 16 September, 2:00pm London time" */
  readonly full: string;
};

export type SlotOption = {
  readonly id: SlotId;
  readonly start: ISO;
  readonly end: ISO;
  readonly time: string;
  /** the option's accessible name: full date + time + "London time" (fix: a11y-3) */
  readonly name: string;
};

export type SlotDay = {
  readonly isoDate: ISODate;
  /** the `legend` — the full date */
  readonly legend: string;
  readonly slots: ReadonlyArray<SlotOption>;
};

/**
 * S-P-02's tap. The position travels with the slot because 03 §3.2's amended `hold` carries the subject (I-10:
 * a held row is an active row, so it has one) — the picker already knows which position it is picking for.
 */
export type HoldSlotAction = (
  slotId: SlotId,
  positionId: PositionId,
) => Promise<ClientResult<{ readonly holdId: HoldId }>>;

export type ChooseSlotAction = (input: {
  readonly positionId: PositionId;
  readonly slotId: SlotId;
  readonly holdId?: HoldId;
}) => Promise<ClientResult<{ readonly start: ISO; readonly end: ISO }>>;

export type ListSlotsAction = () => Promise<
  ClientResult<ReadonlyArray<SlotDay>>
>;

/**
 * S-N-02's write (`2g`; 03 §2.7 `openNannyCall`). It takes no subject: 03 §3.2's subject for a
 * `nanny-commission` booking **is** the nanny, so the action reads her from the session and a caller has
 * nothing to supply but the slot. `holdId` exists for symmetry with `book`'s signature and is never sent by
 * the form — 03 §3.2 puts the nanny's form among the callers that never hold.
 */
export type BookNannyCallAction = (input: {
  readonly slotId: SlotId;
  readonly holdId?: HoldId;
}) => Promise<ClientResult<{ readonly start: ISO; readonly end: ISO }>>;

/**
 * Who the picker is picking for, and therefore what it may call (`2g` — S-P-02 is reused on S-N-02 rather
 * than forked; 04 §6.2 "component, reused on S-N-02 / S-N-13 / S-N-14 / S-A-04").
 *
 * The union is the difference between the two surfaces, and both halves of it are the contract's:
 *   - a **position** call carries its `positionId` to every call, because the parent's actions check it
 *     against her own open call, and it **holds** on tap (04 §3.1 step 9 "tap = 5-minute hold");
 *   - a **nanny** call carries nothing and does **not** hold — 03 §3.2 names the nanny's form among the
 *     callers that book without holding.
 *
 * Making `hold` optional on one flat object would have said "this surface might hold", which is not what
 * either surface does; a tagged union says which one this is and the component cannot call the wrong road.
 */
export type SlotActions =
  | {
      readonly subject: "position";
      readonly positionId: PositionId;
      readonly hold: HoldSlotAction;
      readonly choose: ChooseSlotAction;
      readonly list: ListSlotsAction;
    }
  | {
      readonly subject: "nanny";
      readonly choose: BookNannyCallAction;
      readonly list: ListSlotsAction;
    };

/** The words that differ between the two surfaces. Every one has a parent-voiced default (04 §8). */
export type SlotPickerCopy = {
  readonly heading?: string;
  /** shown when the calendar is empty, and again when the read failed */
  readonly noSlotsLine?: string;
  readonly loadFailedLine?: string;
  readonly backLabel?: string;
};

export type SlotPickerProps = {
  /** `null` = the first load failed; the picker shows the error + retry (04 §6.2 S-P-02 L·E·E) */
  readonly days: ReadonlyArray<SlotDay> | null;
  /** the time already chosen (`slot-chosen`): shown with "Change time", the days folded away */
  readonly chosen?: { readonly start: ISO; readonly end: ISO };
  readonly actions: SlotActions;
  readonly dashboardHref: string;
  readonly copy?: SlotPickerCopy;
};

export type CallPageProps = {
  readonly view: CallPageView;
  readonly days: ReadonlyArray<SlotDay> | null;
  readonly actions: Extract<SlotActions, { readonly subject: "position" }>;
  readonly dashboardHref: string;
};

/** What the S-P-01 route gets back from `loadCallPage` (one read, one decision — the route file stays thin). */
export type CallPageLoad =
  | { readonly kind: "signed-out" }
  | { readonly kind: "no-call" }
  | { readonly kind: "failed" }
  | {
      readonly kind: "page";
      readonly view: CallPageView;
      readonly days: ReadonlyArray<SlotDay> | null;
    };

/** What the S-P-03 route gets back from `loadParentJourney`. */
export type ParentJourneyLoad =
  | { readonly kind: "signed-out" }
  | { readonly kind: "failed" }
  | { readonly kind: "steps"; readonly steps: ReadonlyArray<JourneyStep> };

export type CallRailLineInput = {
  readonly state: CallState;
  readonly slotStart?: ISO;
  readonly afterNoAnswer?: boolean;
};

export type ParentJourneyRailProps = {
  readonly steps: ReadonlyArray<JourneyStep>;
  /** the read failed — the labels still show, with the error line (04 §6.2 S-P-03 L·E·E) */
  readonly failed?: boolean;
};
