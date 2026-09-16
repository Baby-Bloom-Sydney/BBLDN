// admin-on-behalf — the module's type surface (01 §2.5). The admin levers of T-5.2 rows 3–8: the same transition
// an ordinary mover fires, with `actor.kind = 'admin'` and `onBehalfOf` recorded on the event (P-1, ADR-001).
// It imports the modules it moves (01 §2.2's reading of the two top-down edges; R2), never the reverse.
import type {
  Actor,
  Booking,
  CallOutcome,
  CancelReason,
  HoldId,
  PositionId,
  Result,
  SlotId,
  StateAfter,
  TransitionId,
  UserId,
} from "@/modules/shared-types";
import type { AdvanceInput } from "@/modules/positions";
import type { CallRef, CallResult } from "@/modules/call-layer";
import type { AutofireOutcome } from "@/modules/matching";

export type AdminOnBehalfErrorDetails = {
  readonly reason:
    | "E_ACTOR_FORBIDDEN"
    | "E_ON_BEHALF_OF_REQUIRED"
    | "E_ENTITY_NOT_FOUND"
    | "E_PRECONDITION_FAILED"
    | "admin-on-behalf-not-configured";
  /** Why the gate refused: `session` (nobody signed in) · `role` · `mfa` (07 §5.4 row 2) · `scope`. */
  readonly which?: string;
};

/**
 * 03 §2.5 `Actor.onBehalfOf` — the party the admin is acting for. Required on every lever here (07 §5.4 row 6:
 * "every admin-on-behalf write emits `actor admin` + `onBehalfOf`"), which is why it is named as its own type
 * rather than read out of the optional field at each call site.
 */
export type OnBehalfOf = NonNullable<
  Extract<Actor, { readonly kind: "admin" }>["onBehalfOf"]
>;

/**
 * The only actor a lever ever runs with: an admin **derived from the session** (`auth.requireRole('admin')`,
 * which also requires `mfaVerified` — 07 §5.4 rows 1–2), carrying an `onBehalfOf` that is present rather than
 * optional. A caller cannot hand one in: the gate builds it, from the session, on every call. The `Actor` a
 * caller supplies is read for its `onBehalfOf` and for nothing else — never for authority (FIX-1, REVIEW-1 C-1).
 */
export type GatedAdminActor = Extract<Actor, { readonly kind: "admin" }> & {
  readonly onBehalfOf: OnBehalfOf;
};

/**
 * Methods return a plain `Result`: every lever **forwards** the result of the module that owns the move
 * (`positions.advance`, `callLayer.*`, `matching.autofire`) unchanged, which is what makes an on-behalf move the
 * same move (P-1, ADR-001). `AdminOnBehalfErrorDetails` is what this module itself produces — chiefly the refusal.
 */
export type AdminOnBehalfResult<T> = Result<T>;

/**
 * 03 §10.1 row `admin-on-behalf` — `advance` (any A row) · `listAllowed` · the four call levers · `book` on
 * behalf · `autofire`.
 *
 * Every method still takes an `Actor` explicitly, but **only as the carrier of `onBehalfOf`** — the party the
 * admin acts for, which only the caller knows. Authority is not in it: `configureAdminOnBehalf` wraps whatever
 * inside it is handed in the gate, so every method below first passes `auth.requireRole('admin')` (which
 * enforces `mfaVerified`, 07 §5.4 rows 1–2) and then runs with a `GatedAdminActor` built from the session.
 * The role check therefore has exactly one home and this connector stays testable.
 */
export type AdminOnBehalf = {
  /** Any row of 03 §2.4 that lists A as a mover, fired as the admin on behalf of a party. */
  readonly advance: (
    input: AdvanceInput<TransitionId>,
  ) => Promise<AdminOnBehalfResult<StateAfter>>;
  /** The levers to render for this entity and this admin (03 §2.5). */
  readonly listAllowed: (
    input: AdvanceInput<TransitionId>["entity"],
    actor: Actor,
  ) => Promise<ReadonlyArray<TransitionId>>;
  readonly chooseSlot: (
    positionId: PositionId,
    slotId: SlotId,
    holdId: HoldId | undefined,
    actor: Actor,
    idempotencyKey: string,
  ) => Promise<AdminOnBehalfResult<StateAfter>>;
  readonly moveSlot: (
    ref: CallRef,
    slotId: SlotId,
    actor: Actor,
  ) => Promise<AdminOnBehalfResult<CallResult>>;
  readonly clearSlot: (
    positionId: PositionId,
    actor: Actor,
    reason: CancelReason,
  ) => Promise<AdminOnBehalfResult<StateAfter>>;
  readonly recordOutcome: (
    ref: CallRef,
    outcome: CallOutcome,
    notes: string | undefined,
    actor: Actor,
  ) => Promise<AdminOnBehalfResult<CallResult>>;
  /** The nanny-commission call, booked by the admin for a nanny (03 §2.7 `openNannyCall`). */
  readonly bookNannyCall: (input: {
    readonly nannyId: UserId;
    readonly slotId: SlotId;
    readonly holdId?: HoldId;
    readonly actor: Actor;
    readonly idempotencyKey: string;
  }) => Promise<AdminOnBehalfResult<Booking>>;
  /** An on-behalf P-2, and the admin-only re-fire (03 §7.4; fix: rereview-2). */
  readonly autofire: (
    positionId: PositionId,
    actor: Actor,
  ) => Promise<AdminOnBehalfResult<AutofireOutcome>>;
};
