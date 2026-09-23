// placements — the module's type surface (01 §2.5). `placements` owns confirm / end / close (03 §2.2) as a
// **slice** of `positions`: its L-row handlers are registered with the stage model at boot and it is never called
// directly (03 §2.1). On `placement.started` (L-1b) it opens done-for-you app access through
// `payments.openDfyAccess` (ADR-093) and renders the hire summary through `hire-docs`.
import type { ENUMS } from "@/modules/shared-types";
import type {
  AdvanceInput,
  ConnectionId,
  EndReason,
  Instant,
  ISODate,
  NannyId,
  ParentId,
  PlacementId,
  PlacementState,
  PositionId,
  Result,
  StateAfter,
  TransitionHandler,
  TransitionId,
  UnitOfWork,
} from "@/modules/shared-types";

/**
 * The L-row handlers the boot file registers with the stage model (03 §2.1). `TransitionHandler` is
 * `shared-types`' (03 §2.5; ADR-119) — `placements` has no arrow to `positions` (01 §2.3) and needs none: the
 * boot file, which may import both, hands these to `positions.registerSlice`.
 */
export type PlacementsSlice = ReadonlyArray<TransitionHandler>;

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
  /**
   * `1g` — row 6 of the parent rail ("Hired — placement", 03 §2.3) and S-P-05's placement card. Keyed by the
   * parent because that is what the rail is keyed by (03 §2.5 `JourneyOwner`), and because a parent holds at
   * most one live placement (I-3).
   *
   * Connector extension, raised for ratification beside `activeForPosition`, whose signature 03 §2.6 also
   * never states.
   */
  readonly liveForParent: (
    parentId: ParentId,
  ) => Promise<PlacementsResult<PlacementRead | null>>;
};

// ── The inside (`1g`) ──

/** One placement row (02 §4.2 `nanny_placements`), as the module holds it. */
export type PlacementRecord = PlacementRead & {
  readonly parentId: ParentId;
  readonly nannyId: NannyId;
  readonly source: PlacementSource;
  readonly createdAt: Instant;
  readonly version: number;
  readonly endedAt?: Instant;
  readonly endReason?: EndReason;
  readonly endNotes?: string;
};

export type PlacementSource = (typeof ENUMS.placement_source)[number];

export type PlacementStore = {
  get(placementId: PlacementId): Promise<Result<PlacementRecord | null>>;
  /**
   * `4d` — every placement **in one state**, across every family. `placement-start-sweep` is the only caller:
   * it reads `CONFIRMED`, the state L-1b moves a row out of, which is what makes a second fire a no-op without
   * any memory of the first. One state, not a list, because 03 §1.4's `Query` offers one equality predicate
   * (ADR-131 (1)).
   */
  forState(
    state: PlacementState,
  ): Promise<Result<ReadonlyArray<PlacementRecord>>>;
  /** I-3's "≤ 1 non-ended placement per position", and the read `activeForPosition` answers. */
  forPosition(
    positionId: PositionId,
  ): Promise<Result<ReadonlyArray<PlacementRecord>>>;
  forParent(
    parentId: ParentId,
  ): Promise<Result<ReadonlyArray<PlacementRecord>>>;
  put(record: PlacementRecord, uow?: UnitOfWork): Promise<Result<void>>;
};

/**
 * How an L row fires a cascade into a row it does not own (K-21 from L-1b; P-6 and K-23 from L-2).
 *
 * `placements` has **no arrow to `positions`** (01 §2.3), so it cannot call `advance` itself. The dispatcher is
 * injected at boot, which may import both — the same inversion `registerSlice` is, and the same one
 * `connections` uses. Typed only from `shared-types`, which every module may import.
 */
export type PlacementAdvanceFn = (
  input: AdvanceInput<TransitionId>,
) => Promise<Result<StateAfter>>;

// ── The scheduled sweep (`4d`; 01 §4f) ──

/**
 * `placement-start-sweep` — 00:15 London, "`start_date <= today`" (01 §4f). It drives **L-1b**, which already
 * exists and already cascades into K-21 and `payments.openDfyAccess`; the sweep's whole job is to find the
 * placements whose first day has arrived, which is the half the stage model was never given.
 */
export type PlacementJobRun = {
  readonly handled: number;
  readonly skipped: number;
};

export type PlacementsJobs = {
  readonly runStartSweep: (
    now: Instant,
  ) => Promise<PlacementsResult<PlacementJobRun>>;
};

export type PlacementsDeps = {
  readonly store: PlacementStore;
  readonly advance: PlacementAdvanceFn;
  readonly clock?: () => Instant;
  /**
   * L-1b's `payments.openDfyAccess(familyId, placementId)` — done-for-you access switches **on** from the
   * nanny's first day (ADR-093). Injected rather than imported so `1h` can wire the real one without this
   * module changing: `placements` may import `payments` (01 §2.3), but the inside does not exist yet and a
   * module that imported a fail-closed binding would make every L-1b fail with it.
   */
  readonly openDfyAccess?: (input: {
    readonly parentId: ParentId;
    readonly placementId: PlacementId;
  }) => Promise<Result<void>>;
};
