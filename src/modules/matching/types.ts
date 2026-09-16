// matching — the module's type surface (01 §2.5). Quick match, advanced match, results and the pre-auth wizard,
// plus the `autofire` job (03 §7.4). Candidate loading lives **here**, not in `scoring`: the loader pre-filters
// (verified ≥ min, not isolated, not on hold) and `scoring` re-checks, so the rule lives in one place.
import type {
  Actor,
  Instant,
  PositionId,
  Result,
} from "@/modules/shared-types";
import type {
  AreaRef,
  LeadForm,
  QuickMatchResult,
  Ranked,
  Schedule,
} from "@/modules/scoring";

export type MatchingErrorDetails = {
  readonly reason:
    | "E_ENTITY_NOT_FOUND"
    | "E_PRECONDITION_FAILED"
    | "distance-failed"
    | "invalid-input"
    | "matching-not-configured";
  readonly which?: string;
};

/**
 * Methods return a plain `Result`, not `Result<T, MatchingErrorDetails>`: `matching` **forwards** the failures of
 * `scoring` and `positions` unchanged (03 §7.3 — a distance failure fails the whole call), so closing the union
 * here would mean either re-wrapping another module's error or listing its reasons in this module's type. The
 * reasons `matching` itself produces are `MatchingErrorDetails`; the ones it passes on stay their owner's.
 */
export type MatchingResult<T> = Result<T>;

/** What `autofire` reports back — the shape `precheck.fired` carries (03 §7.5). */
export type AutofireOutcome = {
  readonly positionId: PositionId;
  readonly candidateCount: number;
  readonly rankedCount: number;
  readonly excludedByReason: Readonly<Record<string, number>>;
  readonly providerKind: string;
  readonly firedAt: Instant;
  readonly wave: number;
};

/**
 * The connector `public-site`, `onboarding-parent` and `admin-on-behalf` call (03 §10.1 — matching's legal
 * callers). The three read methods take no candidate list: unlike `scoring`, `matching` loads its own.
 *
 * GAP — recorded in the L-005 F-a PROGRESS entry. `autofire` is spelled in 03 §7.4; the three read methods are
 * named in 03 §10.1 as the calls `matching` makes **on `scoring`**, and their `matching`-side signatures are
 * derived here (the same arguments, minus the candidates). The owning section should confirm them.
 */
export type Matching = {
  /** T-1.4 level 2 pre-check blast — called after the P-2 commit and swept by `dfy-waves` (03 §7.4). */
  readonly autofire: (
    positionId: PositionId,
    actor: Actor,
  ) => Promise<MatchingResult<AutofireOutcome>>;
  /** The public quick match widget: location × schedule only (03 §7.2). */
  readonly quickMatch: (
    availability: Schedule,
    district: AreaRef,
  ) => Promise<MatchingResult<QuickMatchResult>>;
  /** The pre-auth wizard, over an in-memory position (03 §7.2). */
  readonly preAuthMatch: (
    leadForm: LeadForm,
  ) => Promise<MatchingResult<ReadonlyArray<Ranked>>>;
  /** The authenticated results page for a live position. */
  readonly resultsFor: (
    positionId: PositionId,
    actor: Actor,
  ) => Promise<MatchingResult<ReadonlyArray<Ranked>>>;
};
