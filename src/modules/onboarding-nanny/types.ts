// 01 §2.3 + 03 §9.3 — the nanny apply funnel (04 §4.1 rows 1–7; S-X-15…S-X-19), the invite-path account form
// (S-X-07), the ten-step profile completion (S-N-18, `03.17` / `03.18`), the hub's three states (S-N-11 /
// S-N-22) and apply-from-portal (S-N-19; ADR-017, ADR-058, ADR-147). S-N-02 books the commission call through
// `call-layer.openNannyCall` — **never** `scheduling` (03 §3.6 R3).
//
// Types only; every value lives in its own one-export file (L1). The two stores are ports (ADR-127): the account
// side is `0021`'s three definers (ADR-152), the lead side is `nanny_leads` at service scope (07 §5.1 rule 5).
import type { ClientResult } from "@/modules/platform";
import type { TemplateId } from "@/modules/comms";
import type {
  E164,
  Email,
  EnumValue,
  ISODate,
  LeadId,
  NannyId,
  Result,
  UserId,
} from "@/modules/shared-types";

/** 03 §9.3 nanny-onboarding row — the `path` prop of `nanny.applied` (ADR-017 / 058). Values verbatim. */
export type NannyApplyPath = "apply" | "apply-from-portal";

/** 03 §8.2 row 4: the welcome template this module owns. */
export type NannyWelcomeTemplate = Extract<TemplateId, "welcome-nanny">;

// ── The funnel's vocabulary (04 §4.1 rows 2–6; 02 §4.7 row 1) ──

/** 02 §3 `lead_rtw_status` — the residency question's answer (T-0.8); the evidence is `2b`'s. */
export type NannyRtwStatus = EnumValue<"lead_rtw_status">;

/** 02 §3 `nanny_lead_status`. */
export type NannyLeadStatus = EnumValue<"nanny_lead_status">;

/** 02 §3 `verification_level` — the five `05.22` names. */
export type NannyVerificationLevel = EnumValue<"verification_level">;

/** The age bands the experience question offers; the under-3 bands are the signal 04 §4.1 row 5 captures and never shows. */
export type NannyAgeGroup = "babies" | "toddlers" | "preschool" | "school-age";

/** The role types N3 offers (04 §6.1 S-X-17). */
export type NannyRoleType =
  | "full-time"
  | "part-time"
  | "before-after-school"
  | "nanny-share"
  | "occasional";

/** 02 §4.2 row 3 `nannies.availability` — day → blocks, one shape shared with `position_schedule`. */
export type NannyDayBlock = "morning" | "midday" | "afternoon" | "evening";
export type NannyWeekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";
export type NannyAvailability = Readonly<
  Partial<Record<NannyWeekday, ReadonlyArray<NannyDayBlock>>>
>;

/** N3's rate band (04 §6.1 S-X-17), in pence — `LOCALE.currency` renders it. */
export type NannyRateBand = {
  readonly minPence: number;
  readonly maxPence: number;
};

/** `MATCHING.qualificationLadder` keys (ADR-149). */
export type NannyQualificationKey = string;

// ── N1 — the application (04 §4.1 rows 2–5; S-X-15) ──

/** The validated N1 submission (01 §4a: validated once, at the boundary). `mobile` is E.164 with the config prefix (ADR-102). */
export type NannyApplicationInput = {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: Email;
  readonly mobile: E164;
  readonly district: string;
  readonly area: string;
  readonly rtwStatus: NannyRtwStatus;
  readonly hasEnhancedDbs: boolean;
  readonly yearsExperience: number;
  readonly ageGroups: ReadonlyArray<NannyAgeGroup>;
};

/** N3 (S-X-17) — photo is S-N-17's (ADR-148). */
export type NannyPortfolioInput = {
  readonly roleTypes: ReadonlyArray<NannyRoleType>;
  readonly availability: NannyAvailability;
  readonly rateBand: NannyRateBand;
};

/** N4 (S-X-18) — the bio she wrote (ADR-148: no AI call day one). */
export type NannyBioInput = {
  readonly bio: string;
};

// ── The lead store (02 §4.7 row 1; service scope — 07 §5.1 rule 5) ──

/** 02 §4.7 `nanny_leads.source` — `apply` from `/apply`, `portal` from S-N-19 (T-1.9); anything else is a campaign key. */
export type NannyLeadSource = "apply" | "portal" | (string & {});

/** The lead as this module reads it back — what N3 / N4 / N5 and S-N-19 need, nothing service-only. */
export type NannyLead = {
  readonly id: LeadId;
  readonly email: Email;
  readonly firstName: string;
  readonly lastName: string;
  readonly mobile: E164 | null;
  readonly district: string | null;
  readonly area: string | null;
  readonly rtwStatus: NannyRtwStatus;
  readonly hasEnhancedDbs: boolean | null;
  readonly yearsExperience: number | null;
  readonly ageGroups: ReadonlyArray<NannyAgeGroup>;
  readonly roleTypes: ReadonlyArray<NannyRoleType>;
  readonly availability: NannyAvailability | null;
  readonly rateBand: NannyRateBand | null;
  readonly bio: string | null;
  readonly status: NannyLeadStatus;
  readonly source: string | null;
};

/** What N1's capture answers (04 §4.1 row 5): a new row, the unconverted row overwritten, or "sign in instead". */
export type NannyLeadCaptureOutcome = {
  readonly leadId: LeadId;
  readonly state: "created" | "updated" | "has-account";
};

/** The N3 / N4 patches, plus the funnel position `admin/leads` reads. */
export type NannyLeadPatch = Partial<
  NannyPortfolioInput & NannyBioInput & { readonly funnelStep: string }
>;

/** `details.reason` of an `INTERNAL` from either store. */
export type NannyStoreErrorDetails = {
  readonly reason:
    | "nanny-store-not-configured"
    | "store-write-failed"
    | "store-read-failed"
    | "no-nanny-row";
};

export type NannyStoreResult<T> = Result<T, NannyStoreErrorDetails>;

export type NannyLeadStore = {
  /** Upsert by email (02 §4.7 "an unconverted lead is overwritten in place; an existing account ⇒ sign in instead"). */
  capture(
    input: NannyApplicationInput & { readonly source: NannyLeadSource },
  ): Promise<NannyStoreResult<NannyLeadCaptureOutcome>>;
  get(leadId: LeadId): Promise<NannyStoreResult<NannyLead | null>>;
  patch(leadId: LeadId, patch: NannyLeadPatch): Promise<NannyStoreResult<void>>;
};

// ── The account store (`0021`'s definers — ADR-152; session scope) ──

/** The twelve `nannies` columns a nanny writes about herself (ADR-152 (2)'s static list). */
export type NannyProfilePatch = Partial<{
  readonly bio: string;
  readonly yearsExperience: number;
  readonly qualification: NannyQualificationKey;
  readonly certificates: ReadonlyArray<string>;
  readonly languages: ReadonlyArray<string>;
  readonly hasCar: boolean;
  readonly hasDrivingLicence: boolean;
  readonly isNonSmoker: boolean;
  readonly comfortableWithPets: boolean;
  readonly hourlyRateMinPence: number;
  readonly availability: NannyAvailability;
  readonly availableFrom: ISODate;
}>;

/** The `user_profiles` half (R-7: contact and location live there). */
export type NannyContactPatch = Partial<{
  readonly mobile: E164;
  readonly district: string;
  readonly area: string;
  readonly dateOfBirth: ISODate;
}>;

/** `create_nanny_account()`'s arguments. `isolated` is explicit — the column defaults `true` (ADR-147). */
export type NannyAccountInput = {
  readonly firstName: string;
  readonly lastName: string;
  readonly isolated: boolean;
  readonly mobile?: E164;
  readonly district?: string;
  readonly area?: string;
  readonly leadId?: LeadId;
  readonly profile?: NannyProfilePatch;
};

/** The nanny's own rows read back (S-N-11, S-N-18, S-N-19 prefill). */
export type NannyProfile = NannyContactPatch &
  NannyProfilePatch & {
    readonly userId: UserId;
    readonly nannyId: NannyId;
    readonly firstName: string;
    readonly lastName: string;
    readonly email: Email;
    readonly isIsolated: boolean;
    readonly verificationLevel: NannyVerificationLevel;
    readonly profileVisible: boolean;
  };

export type NannyAccountStore = {
  create(
    input: NannyAccountInput,
  ): Promise<
    NannyStoreResult<{
      readonly nannyId: NannyId;
      readonly leadConverted: boolean;
    }>
  >;
  /** ADR-147 / ADR-152 (3): `true` when the flag moved, `false` when it was already clear. */
  liftIsolation(): Promise<NannyStoreResult<boolean>>;
  /** ADR-152 (2): answers the `03.18` completeness the database computed. */
  updateProfile(input: {
    readonly profile?: NannyProfilePatch;
    readonly contact?: NannyContactPatch;
  }): Promise<NannyStoreResult<{ readonly complete: boolean }>>;
  get(): Promise<NannyStoreResult<NannyProfile | null>>;
};

// ── The hub (S-N-11 · S-N-22; 04 §4.1 row 16, §4.2 b3) ──

/** `isolated` = the flag (ADR-147); `gated` = below `MATCHING.minVerificationLevel`; `open` = in the pool. */
export type NannyHubState = "isolated" | "gated" | "open";

export type NannyHubView = {
  readonly state: NannyHubState;
  readonly firstName: string;
  readonly verificationLevel: NannyVerificationLevel;
  readonly profileComplete: boolean;
  /** The one line the state shows (04 §8 anchors: S-N-22 isolated line · S-N-11 in-pool line). */
  readonly line: string;
  /** The one action the state offers, or none (open). */
  readonly action: { readonly label: string; readonly href: string } | null;
};

// ── Actions (01 §4e; the client component never imports the connector barrel — 01 §2.5) ──

/** `details` of a refusal a form can act on; every other refusal is INTERNAL with the generic line (01 §4a). */
export type NannyFunnelErrorDetails =
  | { readonly reason: "invalid-input"; readonly field: string }
  /** the lead cookie is missing or its lead is gone — the funnel restarts at N1 */
  | { readonly reason: "no-lead" }
  | { readonly reason: "refused" };

/** N1's outcome: on to N2, or "sign in instead" when the address already has an account (04 §4.1 row 5). */
export type NannyApplicationOutcome = {
  readonly next: "interstitial" | "sign-in";
};

export type NannyApplicationAction = (
  previous: unknown,
  formData: FormData,
) => Promise<ClientResult<NannyApplicationOutcome, NannyFunnelErrorDetails>>;

export type NannyPortfolioAction = (
  previous: unknown,
  formData: FormData,
) => Promise<ClientResult<void, NannyFunnelErrorDetails>>;

export type NannyBioAction = (
  previous: unknown,
  formData: FormData,
) => Promise<ClientResult<void, NannyFunnelErrorDetails>>;

/** Which road the account form serves: `/apply` N5 (the lead cookie) or S-X-07 (the invite cookie, if any). */
export type NannySignupPath = "apply" | "invite";

/** Where she goes next: S-N-01 after `/apply` (04 §4.1 row 7); the claim after an invite (04 §4.2 b2); the hub otherwise. */
export type NannySignupOutcome = {
  readonly destination: string;
};

export type NannySignupAction = (
  previous: unknown,
  formData: FormData,
) => Promise<ClientResult<NannySignupOutcome, NannyFunnelErrorDetails>>;

/** S-N-19: the portal lead is written, the flag lifts, she goes on to the verification wizard (04 §4.2 b4). */
export type ApplyFromPortalAction = (
  previous: unknown,
  formData: FormData,
) => Promise<ClientResult<NannySignupOutcome, NannyFunnelErrorDetails>>;

/** S-N-18: one step saved; `next` is the following step's index, `null` after the last. */
export type NannyProfileStepOutcome = {
  readonly complete: boolean;
  readonly next: number | null;
};

export type NannyProfileStepAction = (
  previous: unknown,
  formData: FormData,
) => Promise<ClientResult<NannyProfileStepOutcome, NannyFunnelErrorDetails>>;

// ── Component props ──

/** The funnel's option lists, passed from the route so no component reads config (01 §2.5). */
export type NannyFunnelOptions = {
  readonly qualifications: ReadonlyArray<{
    readonly key: NannyQualificationKey;
    readonly label: string;
  }>;
  readonly minPasswordLength: number;
  readonly currency: string;
  readonly areasApi: string;
};

/** `apply` = S-X-15…S-X-19; `portal` = S-N-19, the same steps without contact, account and add-child (ADR-147). */
export type NannyFunnelMode = "apply" | "portal";

export type NannyApplyFunnelProps = {
  readonly mode: NannyFunnelMode;
  readonly actions: {
    readonly application: NannyApplicationAction;
    readonly portfolio: NannyPortfolioAction;
    readonly bio: NannyBioAction;
    readonly signup: NannySignupAction;
    readonly applyFromPortal: ApplyFromPortalAction;
  };
  readonly options: NannyFunnelOptions;
  readonly signInHref: string;
  readonly professionalTermsHref: string;
  readonly privacyHref: string;
  /** S-N-19: what the account already holds, never asked twice (04 §6.3 "fields already held are prefilled"). */
  readonly prefill?: Partial<
    Pick<NannyApplicationInput, "firstName" | "lastName" | "email" | "mobile">
  >;
};

export type NannySignupFormProps = {
  readonly action: NannySignupAction;
  /** S-X-07: the invite cookie is present (ADR-150) — the copy names the family's app. */
  readonly hasInvite: boolean;
  readonly minPasswordLength: number;
  readonly signInHref: string;
  readonly professionalTermsHref: string;
  readonly privacyHref: string;
};

export type NannyHubProps = {
  readonly view: NannyHubView;
  readonly profileHref: string;
  readonly verificationHref: string;
  readonly settingsHref: string;
  readonly childrenHref: string;
};

export type NannyProfileStepperProps = {
  readonly action: NannyProfileStepAction;
  readonly profile: NannyProfile;
  readonly step: number;
  readonly options: NannyFunnelOptions;
  readonly doneHref: string;
};

export type NannyEntryContentProps = {
  readonly applyHref: string;
  readonly brandName: string;
};

// ── Internal vocabularies the lib files share (L1: a lib file exports one value, so its type lives here) ──

/** 04 §4.1 rows 1–7 — the funnel's pages. */
export type FunnelStepId =
  | "location"
  | "residency"
  | "credentials"
  | "experience"
  | "contact"
  | "interstitial"
  | "portfolio"
  | "review"
  | "account";

export type FunnelStep = {
  readonly id: FunnelStepId;
  readonly screen: "S-X-15" | "S-X-16" | "S-X-17" | "S-X-18" | "S-X-19";
  readonly heading: string;
};

/** S-N-18 — the ten steps of `03.17`. */
export type ProfileStepId =
  | "location"
  | "date-of-birth"
  | "experience"
  | "qualification"
  | "certificates"
  | "languages"
  | "practical"
  | "availability"
  | "rate"
  | "about-you";

export type ProfileStep = {
  readonly id: ProfileStepId;
  readonly heading: string;
  readonly fields: ReadonlyArray<string>;
};

/** What the memory account double keeps per user: the create input as given, plus what the profile road changed. */
export type MemoryNannyAccountRow = NannyAccountInput &
  Pick<NannyProfile, "userId" | "nannyId" | "email" | "profileVisible"> & {
    readonly dateOfBirth?: NannyProfile["dateOfBirth"];
    readonly verificationLevel: NannyProfile["verificationLevel"];
  };

/** The two plain stops of N1 (04 §4.1 rows 2 and 4). */
export type FunnelStopKind = "outside-london" | "no-dbs";
