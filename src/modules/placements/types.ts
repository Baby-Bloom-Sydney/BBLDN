// placements — the module's type surface (01 §2.5). `placements` owns confirm / end / close (03 §2.2) as a
// **slice** of `positions`: its L-row handlers are registered with the stage model at boot and it is never called
// directly (03 §2.1). On `placement.started` (L-1b) it opens done-for-you app access through
// `payments.openDfyAccess` (ADR-093) and renders the hire summary through `hire-docs`.
import type {
  AdvanceInput,
  ConnectionId,
  Instant,
  ISODate,
  PlacementId,
  PlacementState,
  PositionId,
  Result,
  StateAfter,
  TransitionId,
  UnitOfWork,
} from "@/modules/shared-types";

/**
 * Structurally the `TransitionHandler` of 03 §2.5 — declared here rather than imported.
 *
 * GAP — recorded in the L-005 F-a PROGRESS entry, same one `connections/types.ts` records: 03 §2.5 puts
 * `TransitionHandler` / `registerSlice` in `shared-types/stage-model.ts`, they are not there yet, and 01 §2.3
 * gives `placements` no arrow to `positions`. The boot file, which may import both, does the registering.
 */
export type StageTransitionHandler = {
  readonly id: TransitionId;
  readonly run: (
    input: AdvanceInput<TransitionId>,
    uow: UnitOfWork,
  ) => Promise<Result<StateAfter>>;
};

/** The L-row handlers the boot file registers with the stage model (03 §2.1). */
export type PlacementsSlice = ReadonlyArray<StageTransitionHandler>;

export type PlacementsErrorDetails = {
  readonly reason:
    | "E_ENTITY_NOT_FOUND"
    | "E_PRECONDITION_FAILED"
    | "E_TRANSITION_NOT_ALLOWED"
    | "placements-not-configured";
  readonly which?: string;
};

export type PlacementsResult<T> = Result<T, PlacementsErrorDetails>;

/**
 * The facts a placement carries — hours, rate, start date (03 §2.4 K-20 / L-1); they move by `amend()`, never by
 * a transition (03 §2.2).
 */
export type PlacementRead = {
  readonly placementId: PlacementId;
  readonly positionId: PositionId;
  readonly connectionId: ConnectionId;
  readonly state: PlacementState;
  readonly weeklyHours: number;
  readonly hourlyRatePence: number;
  readonly startDate: ISODate;
  readonly startedAt?: Instant;
};

/**
 * The read `positions` calls to hold invariant I-3 (03 §2.6 — "placement CONFIRMED / ACTIVE ⇒ position ACTIVE,
 * exactly one connection CONFIRMED / ACTIVE").
 *
 * GAP — recorded in the L-005 F-a PROGRESS entry. 03 names the invariant and 01 §2.3 gives `positions` the arrow
 * to `placements`, but no section states this method's name or signature.
 */
export type PlacementsReads = {
  readonly activeForPosition: (
    positionId: PositionId,
  ) => Promise<PlacementsResult<PlacementRead | null>>;
};
