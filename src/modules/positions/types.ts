// positions — the module's type surface (01 §2.5). `positions` is the aggregate root of the stage model
// (03 §2.1): it owns `advance` · `amend` · the read models, and the slices (`connections` · `placements` ·
// `call-layer`) register their handlers with it at boot. The stage-model vocabulary itself lives in
// `shared-types/stage-model.ts` (03 §2.5) — the slice-registration types included (ADR-119) — and is re-exported
// by `index.ts`; this file adds only what the `positions` connector needs.
import type {
  AmendInput,
  Actor,
  CloseReason,
  Email,
  EndReason,
  EntityRef,
  EnumValue,
  Instant,
  JourneyStep,
  LeadId,
  NannyId,
  ParentId,
  PositionId,
  PositionStage,
  Result,
  StageRead,
  StateAfter,
  TransitionHandler,
  TransitionId,
  UnitOfWork,
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
 * `1e`. The connector's methods answer a plain `Result`, not `StageResult`: the inside **forwards** the failures
 * of the store port, of `platform.withUnitOfWork` (its own `unit-of-work-*` reasons) and of the slices it
 * dispatches into, unchanged. Closing the union on the connector would mean either re-wrapping another module's
 * error or naming its reasons in this module's type — the same reading `matching` recorded for its own surface
 * (`MatchingResult`). `StageErrorDetails` stays the closed union of the reasons **`positions` itself** raises,
 * and is what the fail-closed and slice tests assert against.
 */

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
  /**
   * `1e` — what `scoring.topN` needs, spelled structurally (`PositionMatchDetail`). Without it §7.4's sentence
   * ("reads the position through `positions.getForMatching` … runs `topN`") cannot be executed at all: `matching`
   * has no other road to a position row. Connector extension, recorded for ratification.
   */
  readonly detail: PositionMatchDetail;
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
  readonly amend: (input: AmendInput) => Promise<Result<StateAfter>>;
  readonly getStage: (entity: EntityRef) => Promise<Result<StageRead>>;
  readonly getJourneySteps: (
    parentId: ParentId,
  ) => Promise<Result<ReadonlyArray<JourneyStep>>>;
  /** admin levers + user buttons (03 §2.5). */
  readonly listAllowed: (
    entity: EntityRef,
    actor: Actor,
  ) => Promise<ReadonlyArray<TransitionId>>;
  readonly getForMatching: (
    positionId: PositionId,
  ) => Promise<Result<PositionForMatching>>;
  readonly recordPrecheck: (
    positionId: PositionId,
    record: PrecheckRecord,
  ) => Promise<Result<void>>;
};

// ── The inside (Phase 1 `1e`) — the P rows, the store port and the payloads ──

/** 02 §4.2 `nanny_positions.source`. */
export type PositionSource = EnumValue<"position_source">;

/**
 * The scoring-relevant detail `matching.autofire` needs to call `scoring.topN` (03 §7.4 — it reads the position
 * through `positions.getForMatching` and runs the engine itself).
 *
 * **Spelled structurally, not imported.** `positions` may never import `scoring` (01 §2.3; fix: A-1 / R2), so
 * this is a local declaration whose shape equals `scoring`'s `PositionInput`; `matching`, which may import both,
 * passes it straight through. The same device `connections` used for `TransitionHandler` before ADR-119.
 * Connector extension — recorded in the L-007 `1e` PROGRESS entry for ratification (03 §12 item 36 owes it).
 */
export type PositionMatchDetail = {
  readonly area: { readonly area: string; readonly district: string };
  readonly schedule: {
    readonly type: "Fixed" | "Flexible";
    readonly blocks: ReadonlyArray<{
      readonly day: 0 | 1 | 2 | 3 | 4 | 5 | 6;
      readonly part: "morning" | "midday" | "afternoon" | "evening";
    }>;
  } | null;
  readonly requirements: {
    readonly childAgeMonths: ReadonlyArray<{
      readonly min: number;
      readonly max: number;
    }>;
    readonly capacity: number;
    readonly specialNeeds: boolean;
    readonly licence: boolean;
    readonly car: boolean;
    readonly vaccination: boolean;
    readonly nonSmoker: boolean;
    readonly pets: boolean;
    readonly nannyAge?: { readonly min?: number; readonly max?: number };
    readonly languages?: ReadonlyArray<string>;
    readonly roleType: string;
    readonly supportNeeds?: ReadonlyArray<string>;
  };
  readonly startDate?: Instant;
  readonly minExperienceYears?: number;
  readonly minQualificationRung?: number;
};

/** Who the P-2 cascade into C-a names as the call's recipient (03 §8.1 — the caller passes resolved data). */
export type PositionRecipient = {
  readonly email: Email;
  readonly name?: string;
};

/** One `nanny_positions` row as this module's inside holds it (02 §4.2; the call mirror stays `call-layer`'s). */
export type PositionRecord = {
  readonly positionId: PositionId;
  readonly parentId: ParentId;
  readonly source: PositionSource;
  readonly stage: PositionStage;
  readonly detail: PositionMatchDetail;
  readonly recipient: PositionRecipient;
  readonly leadId?: LeadId;
  readonly createdAt: Instant;
  readonly activatedAt?: Instant;
  readonly endReason?: EndReason;
  readonly closeReason?: CloseReason;
  readonly filledByNannyId?: NannyId;
  readonly precheck: PrecheckRecord | null;
  readonly version: number;
};

/**
 * The one port the inside writes through. The memory implementation ships here; the one over `nanny_positions`
 * lands with the marketplace migration set — recorded in the `1e` PROGRESS entry.
 */
export type PositionStore = {
  get(positionId: PositionId): Promise<Result<PositionRecord | null>>;
  /** I-1 — the one live position (`DRAFT` / `OPEN` / `CONNECTING` / `ACTIVE`) a parent may hold. */
  liveForParent(parentId: ParentId): Promise<Result<PositionRecord | null>>;
  listForParent(
    parentId: ParentId,
  ): Promise<Result<ReadonlyArray<PositionRecord>>>;
  /** `uow` is the caller's when a transition is running; the two writes outside one (`amend`,
   * `recordPrecheck`) open their own. */
  put(record: PositionRecord, uow?: UnitOfWork): Promise<Result<void>>;
};

/** P-1 / P-2 (03 §2.4). The caller resolves the lead and the parent; `positions` reads neither table. */
export type PositionOpenPayload = {
  readonly parentId: ParentId;
  readonly source: PositionSource;
  readonly detail: PositionMatchDetail;
  readonly recipient: PositionRecipient;
  /** P-2 precondition "parent has mobile" — the resolved value, never a lookup here. */
  readonly mobile: string;
  readonly leadId?: LeadId;
};

/** P-5 (03 §2.4) — the cascade of K-20 names the nanny who filled the position. */
export type PositionActivatePayload = { readonly filledByNannyId: NannyId };

/** P-6 (03 §2.4). */
export type PositionEndPayload = { readonly endReason: EndReason };

/** P-7 (03 §2.4). */
export type PositionClosePayload = { readonly closeReason: CloseReason };

/** What `registerSlice` receives for the `position` entity (03 §2.5). */
export type PositionsSlice = ReadonlyArray<TransitionHandler>;

/**
 * Row 3 of the parent rail is `call-layer`'s words (04 §7.1; `callRailLine`), and `positions` may never import
 * `call-layer` (01 §2.3; fix: A-2 / R2). So the row arrives as a **port**, wired at boot beside the slice: the
 * read model composes rows 1, 2 and 9 itself and asks this for row 3.
 */
export type JourneyRowSource = {
  readonly callRow: (
    positionId: PositionId,
  ) => Promise<Result<JourneyStep | null>>;
};
