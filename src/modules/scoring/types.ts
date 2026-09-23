// scoring — the module's type surface (01 §2.5). The connector of 03 §7.2, copied from the contract without
// renaming. Values live in index.ts. `scoring` is pure: no stage move, no message, no row (03 §7.1).
import type { MATCHING } from "@/modules/config";
import type {
  Instant,
  NannyId,
  PositionId,
  Result,
} from "@/modules/shared-types";

/** Resolved by `areas` (03 §6) before it reaches the engine. */
export type AreaRef = { readonly area: string; readonly district: string };

/**
 * GAP — recorded in the L-005 F-a PROGRESS entry. 03 §7.2 names `RoleType` inside `Requirements`, but no
 * foundation section, 02 enum or `config` key states its values (02 §3 has no `role_type`). Left open rather
 * than narrowed here: choosing the set would be inventing a business rule this unit may not invent.
 */
export type RoleType = string;

/** The labels of `MATCHING.ageRangeToMonths` (03 §7.3 — `preAuthMatch` maps a lead form through it). */
export type AgeLabel = keyof typeof MATCHING.ageRangeToMonths;

/** 03 §7.2 `MatchingConfig` — the shape `config/matching.ts` already publishes, never a second copy. */
export type MatchingConfig = typeof MATCHING;

export type Requirements = {
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
  readonly roleType: RoleType;
  readonly supportNeeds?: ReadonlyArray<string>;
};

export type ScheduleBlock = {
  readonly day: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  readonly part: "morning" | "midday" | "afternoon" | "evening";
};

/** `null` = full marks (03 §7.2). */
export type Schedule = {
  readonly type: "Fixed" | "Flexible";
  readonly blocks: ReadonlyArray<ScheduleBlock>;
} | null;

export type PositionInput = {
  readonly id?: PositionId;
  readonly area: AreaRef;
  readonly schedule: Schedule;
  readonly requirements: Requirements;
  readonly startDate?: Instant;
  readonly minExperienceYears?: number;
  readonly minQualificationRung?: number;
};

/** A snapshot; the loader is the caller's (03 §7.2 — candidate loading is `matching`'s). */
export type Candidate = {
  readonly nannyId: NannyId;
  readonly area: AreaRef;
  readonly availability: ReadonlyArray<ScheduleBlock>;
  readonly experienceYears: number;
  readonly qualificationRung: number;
  readonly certifications: ReadonlyArray<string>;
  readonly hasCar: boolean;
  readonly attributes: Partial<Record<keyof Requirements, boolean | number>>;
  readonly languages: ReadonlyArray<string>;
  readonly availableFrom?: Instant;
  readonly age?: number;
  readonly verificationLevel: number;
  readonly isolated: boolean;
  readonly silentHold: boolean;
  readonly activeConnectionWithFamily: boolean;
};

export type LeadForm = {
  readonly area: AreaRef;
  readonly children: ReadonlyArray<{ readonly ageLabel: AgeLabel }>;
  readonly schedule: Schedule;
  readonly requirements: Partial<Requirements>;
};

export type Layers = {
  readonly base: number;
  readonly penalty: number;
  readonly bonus: number;
};

export type Ranked = {
  readonly nannyId: NannyId;
  readonly score: number;
  readonly layers: Layers;
  readonly distanceKm: number | null;
  readonly scheduleOverlapPct: number | null;
  readonly unmet: ReadonlyArray<keyof Requirements>;
  readonly bonuses: ReadonlyArray<string>;
};

/** Applied before any layer; `quickMatch` applies the first three (03 §7.2). */
export type ExclusionReason =
  | "ISOLATED"
  | "VERIFICATION_LEVEL"
  | "SILENT_HOLD"
  | "ACTIVE_CONNECTION_WITH_FAMILY";

export type Excluded = {
  readonly nannyId: NannyId;
  readonly reason: ExclusionReason;
};

export type QuickMatchResult = {
  readonly total: number;
  readonly top: ReadonlyArray<Ranked>;
};

export type ScoreErrorDetails = {
  readonly reason:
    | "distance-failed"
    | "invalid-input"
    | "scoring-not-configured";
  readonly layer?: "base" | "penalty" | "bonus";
  readonly nannyId?: NannyId;
};

export type ScoreResult<T> = Result<T, ScoreErrorDetails>;

/** 03 §7.2 `scoring/distance` — the swappable. */
export type DistanceProvider = {
  readonly kind: "haversine" | "transport-reach" | "stub";
  /** `null` = unknown → bracket "unknown". */
  readonly distanceKm: (
    a: AreaRef,
    b: AreaRef,
  ) => Promise<ScoreResult<number | null>>;
  readonly distanceKmBatch?: (
    from: AreaRef,
    to: ReadonlyArray<AreaRef>,
  ) => Promise<ScoreResult<ReadonlyArray<number | null>>>;
};

/** The engine's surface. `matching` is its only caller (03 §7.2). */
export type Scoring = {
  readonly scorePosition: (
    position: PositionInput,
    candidates: ReadonlyArray<Candidate>,
  ) => Promise<
    ScoreResult<{
      readonly ranked: ReadonlyArray<Ranked>;
      readonly excluded: ReadonlyArray<Excluded>;
    }>
  >;
  /** pre-auth; location × schedule only. */
  readonly quickMatch: (
    availability: Schedule,
    district: AreaRef,
    candidates: ReadonlyArray<Candidate>,
  ) => Promise<ScoreResult<QuickMatchResult>>;
  /** the full engine over an in-memory position. */
  readonly preAuthMatch: (
    leadForm: LeadForm,
    candidates: ReadonlyArray<Candidate>,
  ) => Promise<ScoreResult<ReadonlyArray<Ranked>>>;
  /** the pre-check list; `n` = `config.matching.precheckN`. */
  readonly topN: (
    position: PositionInput,
    candidates: ReadonlyArray<Candidate>,
    n: number,
  ) => Promise<ScoreResult<ReadonlyArray<Ranked>>>;
};

/** 03 §7.2 `createScoring(deps)` — the injection point. */
export type ScoringDeps = {
  readonly distance: DistanceProvider;
  readonly config: MatchingConfig;
};
