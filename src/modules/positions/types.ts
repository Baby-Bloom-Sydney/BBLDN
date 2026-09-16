// positions — the module's type surface (01 §2.5). `positions` is the aggregate root of the stage model
// (03 §2.1): it owns `advance` · `amend` · the read models, and the slices (`connections` · `placements` ·
// `call-layer`) register their handlers with it at boot. The stage-model vocabulary itself lives in
// `shared-types/stage-model.ts` (03 §2.5) — the slice-registration types included (ADR-119) — and is re-exported
// by `index.ts`; this file adds only what the `positions` connector needs.
import type {
  AmendInput,
  Actor,
  EntityRef,
  Instant,
  JourneyStep,
  NannyId,
  ParentId,
  PositionId,
  PositionStage,
  Result,
  StageRead,
  StateAfter,
  TransitionId,
} from "@/modules/shared-types";

// `TransitionHandler` · `SliceRegistration` · `RegisterSlice` are `shared-types`' (03 §2.5; ADR-119) and are
// re-exported by `index.ts` beside the rest of the stage-model vocabulary.

/** 03 §2.5 errors, as the closed `details.reason` union 03 §1 rule 4 asks for. */
export type StageErrorDetails = {
  readonly reason:
    | "E_ENTITY_NOT_FOUND"
    | "E_TRANSITION_UNKNOWN"
    | "E_TRANSITION_NOT_ALLOWED"
    | "E_ACTOR_FORBIDDEN"
    | "E_PRECONDITION_FAILED"
    | "E_PAYLOAD_INVALID"
    | "E_STALE_STATE"
    | "E_INVARIANT_VIOLATION"
    | "E_SLICE_NOT_REGISTERED"
    | "positions-not-configured";
  readonly transition?: TransitionId;
  readonly entity?: EntityRef["kind"];
  readonly which?: string;
};

export type StageResult<T> = Result<T, StageErrorDetails>;

/**
 * What `matching.autofire` reads before it loads candidates (03 §7.4; `positions.getForMatching`).
 *
 * GAP — recorded in the L-005 F-a PROGRESS entry. 03 §12 item 36 still owes this method's shape to 01 §2.4 and
 * to `02`'s writers column. These are the fields §7.4 / §7.5 name **by name**; the position detail the engine
 * needs (area, schedule, requirements) is assembled by `matching`, because `positions` may not import `scoring`
 * (fix: A-1 / R2) and so cannot spell `PositionInput` here.
 */
export type PositionForMatching = {
  readonly positionId: PositionId;
  readonly parentId: ParentId;
  readonly stage: PositionStage;
  readonly district: string;
  /** Nannies already in a live connection with this family — read through the `connections` connector (03 §7.5). */
  readonly activeConnectionNannyIds: ReadonlyArray<NannyId>;
};

/** The lever `matching.autofire` writes back after the pre-check blast (03 §7.4). */
export type PrecheckRecord = {
  readonly firedAt: Instant;
  readonly expiresAt: Instant;
  readonly wave: number;
};

/**
 * The stage-model connector (03 §2.5), plus the two `positions` methods `matching` calls (03 §7.4).
 * `advance` and `registerSlice` are **not** on it: they are module-level functions, because `advance` dispatches
 * into the slice registry rather than into whatever the boot code configured.
 */
export type PositionsReads = {
  readonly amend: (input: AmendInput) => Promise<StageResult<StateAfter>>;
  readonly getStage: (entity: EntityRef) => Promise<StageResult<StageRead>>;
  readonly getJourneySteps: (
    parentId: ParentId,
  ) => Promise<StageResult<ReadonlyArray<JourneyStep>>>;
  /** admin levers + user buttons (03 §2.5). */
  readonly listAllowed: (
    entity: EntityRef,
    actor: Actor,
  ) => Promise<ReadonlyArray<TransitionId>>;
  readonly getForMatching: (
    positionId: PositionId,
  ) => Promise<StageResult<PositionForMatching>>;
  readonly recordPrecheck: (
    positionId: PositionId,
    record: PrecheckRecord,
  ) => Promise<StageResult<void>>;
};
