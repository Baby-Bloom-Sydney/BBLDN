// matching — the module's type surface (01 §2.5). Quick match, advanced match, results and the pre-auth wizard,
// plus the `autofire` task (03 §7.4). Candidate loading lives **here**, not in `scoring`: the loader pre-filters
// (verified ≥ min, not isolated, not on hold) and `scoring` re-checks, so the rule lives in one place.
//
// Phase 1 `1b` added the surfaces the 04 §3 journey needs on top of the 03 §10.1 methods: the marketplace-safe
// nanny read over `nanny_public` (07 §5.2 — the only road from a visitor to a nanny), the advanced-wizard lead
// (02 §4.7 `parent_leads`, owner `matching`), and the one Connect entry point of ADR-126. Each is a **connector
// extension** recorded in the L-007 `1b` PROGRESS entry for ratification (amend-first, as S4 did for
// `needsPasswordSetup`).
import type { Session } from "@/modules/auth";
import type {
  Actor,
  EnumValue,
  Instant,
  LeadId,
  NannyId,
  PositionId,
  Result,
} from "@/modules/shared-types";
import type {
  AreaRef,
  LeadForm,
  QuickMatchResult,
  Ranked,
  Schedule,
  ScheduleBlock,
} from "@/modules/scoring";

export type MatchingErrorDetails = {
  readonly reason:
    | "E_ENTITY_NOT_FOUND"
    | "E_PRECONDITION_FAILED"
    | "distance-failed"
    | "invalid-input"
    | "matching-not-configured"
    | "not-built";
  readonly which?: string;
};

/**
 * Methods return a plain `Result`, not `Result<T, MatchingErrorDetails>`: `matching` **forwards** the failures of
 * `scoring` and `positions` unchanged (03 §7.3 — a distance failure fails the whole call), so closing the union
 * here would mean either re-wrapping another module's error or naming its reasons in this module's type. The
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
  /** 03 §7.4's blast — how many of the ranked nannies were sent `precheck-nanny`. `0` when no port is wired. */
  readonly notified: number;
};

/**
 * 03 §7.4's blast, as a **port**.
 *
 * §7.4 says autofire "notifies each nanny (`precheck-nanny` batch via `comms.sendMany`)", and 01 §2.3 gives
 * `matching` no arrow to `comms` — its allowed imports are `positions` · `scoring` · `areas` · `platform`,
 * enforced by `lint:boundaries`. So the send is **handed in at boot**, the same inversion `connections` uses for
 * its `AdvanceFn` and `registerSlice` uses in the other direction; the shape is declared structurally here
 * because a `comms` type may not be imported either.
 *
 * Under ADR-136 what crosses this seam is **ids**: the caller names the nannies and `comms` resolves each
 * address inside its own send. `1e` pinned this blast `it.fails` because no module could obtain a nanny's
 * address; that reason is gone, and the port is what carries the fix without widening 01 §2.3.
 */
export type PrecheckBlast = (input: {
  readonly positionId: PositionId;
  readonly nannyIds: ReadonlyArray<NannyId>;
  readonly wave: number;
}) => Promise<Result<{ readonly notified: number }>>;

// ── The marketplace-safe nanny (07 §5.2 `nanny_public`; 02 §4.2 read models) ──

/** 02 §3 `verification_level` — the view admits `L3_PROVISIONALLY_VERIFIED` and above only. */
export type VerificationLevel = EnumValue<"verification_level">;

/**
 * One row of `nanny_public`, shaped for a screen: first name only, the area as an `AreaRef` (rendered through
 * `formatAreaLabel`, 03 §6.3 rule 6), the photo already signed by the read model (07 §5.3 rule 1 — never by a
 * component), availability as `scoring` blocks. No rate (the amount never appears pre-call — 04 §8, D2), no
 * `is_vaccinated` (ADR-103), no surname, no pointer.
 */
export type PublicNanny = {
  readonly nannyId: NannyId;
  readonly firstName: string;
  readonly area: AreaRef;
  readonly photoUrl: string | null;
  readonly bio: string | null;
  readonly yearsExperience: number | null;
  readonly qualification: string | null;
  readonly certificates: ReadonlyArray<string>;
  readonly languages: ReadonlyArray<string>;
  readonly hasCar: boolean;
  readonly hasDrivingLicence: boolean;
  readonly isNonSmoker: boolean | null;
  readonly comfortableWithPets: boolean | null;
  readonly availability: ReadonlyArray<ScheduleBlock>;
  readonly availableFrom: Instant | null;
  readonly verificationLevel: VerificationLevel;
};

/** A ranked result joined to what a card shows (S-X-02 / S-X-04 / S-P-06). */
export type MatchCard = {
  readonly nanny: PublicNanny;
  readonly ranked: Ranked;
};

// ── The quick match (S-X-01 → S-X-02; 04 §3.1 steps 1–2) ──

export type QuickMatchDay = ScheduleBlock["day"];
export type QuickMatchPart = ScheduleBlock["part"];

/** What S-X-02 receives from the front door's query (parsed by `public-site`; the district decides the area). */
export type QuickMatchInput = {
  readonly days: ReadonlyArray<QuickMatchDay>;
  readonly parts: ReadonlyArray<QuickMatchPart>;
  readonly district: string;
};

/** S-X-02's states (04 §6.1): matches · no-match (a stop state) · error; loading is the route's. */
export type QuickMatchPage =
  | {
      readonly kind: "matches";
      readonly area: AreaRef;
      readonly total: number;
      readonly cards: ReadonlyArray<MatchCard>;
    }
  | { readonly kind: "no-match"; readonly area: AreaRef | null }
  | { readonly kind: "error" };

// ── The advanced wizard (S-X-03; 02 §4.7 `parent_leads`) ──

export type WizardChild = {
  readonly ageLabel: string;
};

/**
 * The advanced wizard's answers (04 §3.1 step 3: children, ages, area + district, hours, days, length, focus …),
 * the `form_data` shape `parent_leads` stores and S-P-04 shares (02 §4.7). Every field optional: the wizard
 * saves progressively (04 §6.1 S-X-03 "progressive save"), so a partial record is the normal case.
 */
export type WizardAnswers = {
  readonly children?: ReadonlyArray<WizardChild>;
  readonly area?: AreaRef;
  readonly days?: ReadonlyArray<QuickMatchDay>;
  readonly parts?: ReadonlyArray<QuickMatchPart>;
  readonly scheduleType?: "Fixed" | "Flexible";
  readonly hoursPerWeek?: string;
  readonly placementLength?: string;
  readonly startWhen?: string;
  readonly focus?: string;
  readonly support?: string;
  readonly minExperienceYears?: number;
  readonly drivingLicence?: boolean;
  readonly car?: boolean;
  readonly nonSmoker?: boolean;
  readonly petsAtHome?: boolean;
  readonly languages?: ReadonlyArray<string>;
  /** T-1.8d: the nanny a guest Connect remembered on the way in (04 §3.2 path D). */
  readonly connectNannyId?: string;
};

/** The saved lead (02 §4.7): client-minted id, the answers, the resolved area, the funnel source. */
export type ParentLead = {
  readonly id: LeadId;
  readonly answers: WizardAnswers;
  readonly area: AreaRef | null;
  readonly source: string | null;
  readonly completed: boolean;
  /**
   * **ADR-145 (2)** — `converted_at is not null`: this lead has already become somebody's position. A `leadId`
   * travels in wizard URLs and in form state, so holding one is not evidence that the answers belong to the
   * holder; `onboarding-parent` refuses to convert a claimed lead a second time. 02 §4.7's
   * `parent_leads_converted_together_check` is why one column answers for all three.
   */
  readonly claimed: boolean;
  /**
   * **ADR-146 (2)** — `parent_leads.email` (`0020`), the contact captured when the lead is held from a
   * signup-form drop (S-X-05 / S-X-06; 04 §3.1 step 5, ADR-041). **`null` is the common case**: the advanced
   * wizard is pre-auth and anonymous, so a wizard-only lead has no address at all. It is what ADR-145 (2)'s
   * second half compares against — `onboarding-parent` converts a lead that carries one only to a signup at
   * the same address, case-insensitively — and it is stored folded and trimmed by its one writer.
   */
  readonly email: string | null;
};

export type SaveLeadInput = {
  readonly id: LeadId;
  readonly answers: WizardAnswers;
  readonly source: string | null;
  /** `true` once the last question is answered — emits `wizard.completed` (03 §9.3). */
  readonly completed: boolean;
  /**
   * ADR-146 (2) — the captured contact, when there is one (S-X-05 / S-X-06's drop). Optional because the
   * wizard itself never asks for an address; blank is the same as absent, and the row's writer folds the case.
   */
  readonly email?: string | null;
};

/** S-X-04's states (04 §6.1): matches · missing lead → S-X-03 · error. */
export type PreAuthPage =
  | {
      readonly kind: "matches";
      readonly lead: ParentLead;
      readonly total: number;
      readonly cards: ReadonlyArray<MatchCard>;
    }
  | { readonly kind: "missing-lead" }
  | { readonly kind: "error" };

// ── The Connect entry point (ADR-126: `public-site → matching → positions.advance`) ──

/** 03 §9.3 `results.viewed.surface` — where the Connect was pressed. */
export type ConnectSurface = "results" | "matches" | "browse";

export type ConnectInput = {
  readonly nannyId: NannyId;
  readonly surface: ConnectSurface;
  readonly session: Session | null;
  readonly leadId: LeadId | null;
};

/**
 * What the entry point decides. Today every road is a redirect (04 §3.3 (d): a guest → S-X-03's first question
 * with the nanny remembered; a signed-in parent → S-P-07 where the in-app Connect lives — 04 §6.1 S-X-11).
 * The `positions.advance(K-1)` branch lands with `1g` (`04.12`) behind this same entry point.
 */
export type ConnectDecision = {
  readonly kind: "redirect";
  readonly to: string;
};

/**
 * The connector `public-site`, `onboarding-parent` and `admin-on-behalf` call (03 §10.1 — matching's legal
 * callers). The three read methods take no candidate list: unlike `scoring`, `matching` loads its own.
 *
 * GAP — recorded in the L-005 F-a PROGRESS entry. `autofire` is spelled in 03 §7.4; the three read methods are
 * named in 03 §10.1 as the calls `matching` makes **on `scoring`**, and their `matching`-side signatures are
 * derived here (the same arguments, minus the candidate list). The owning section should confirm them.
 */
export type Matching = {
  /** T-1.4 level 2 pre-check blast — called after the P-2 commit and swept by the waves cron (03 §7.4). */
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
  /** `1b` — every marketplace-safe nanny (browse S-X-10; the cards' display half). */
  readonly listPublicNannies: () => Promise<
    MatchingResult<ReadonlyArray<PublicNanny>>
  >;
  /** `1b` — one marketplace-safe nanny (S-X-11); `null` = not found / not visible. */
  readonly getPublicNanny: (
    nannyId: NannyId,
  ) => Promise<MatchingResult<PublicNanny | null>>;
  /** `1b` — the advanced wizard's progressive save (02 §4.7 `saveParentLead`; named service-role use). */
  readonly saveLead: (input: SaveLeadInput) => Promise<MatchingResult<void>>;
  /** `1b` — the lead S-X-04 / S-X-05 read back; `null` = unknown id. */
  readonly getLead: (
    leadId: LeadId,
  ) => Promise<MatchingResult<ParentLead | null>>;
  /** `1b` / ADR-126 — the one Connect entry point `public-site` calls. */
  readonly connect: (
    input: ConnectInput,
  ) => Promise<MatchingResult<ConnectDecision>>;
};
