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
  SlotActions as CallLayerSlotActions,
  SlotDay as CallLayerSlotDay,
} from "@/modules/call-layer";
import type {
  E164,
  Email,
  EnumValue,
  ISO,
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
  /** ADR-163: the user `auth.signUp` just minted — the definer runs at service scope and acts for this id */
  readonly userId: UserId;
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
    /**
     * Kickoff debt 14 — the under-3 signal N1 captured and never shows her (04 §4.1 row 5), off her own lead row.
     * S-N-01's active / passive variant is the one thing that reads it (04 §6.3). **Absent means "we do not
     * know"**, not "no": an account created before the funnel captured it, or one with no lead at all, has no
     * value here and S-N-01 falls back to the active wording.
     */
    readonly worksWithUnderThrees?: boolean;
  };

export type NannyAccountStore = {
  create(input: NannyAccountInput): Promise<
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

// ── S-N-17 / S-N-21 (`2d`) — her own profile and her settings (04 §6.3; `03.22` / `03.24`) ──

/**
 * One thing S-N-18 still wants from her, and where in the stepper it is asked. The label is the step's own
 * heading, so there is one place the words live.
 */
export type NannyProfileGap = {
  readonly stepIndex: number;
  readonly label: string;
};

/** One line of the profile summary — what a family reads about her, in her own words. */
export type NannyProfileFact = {
  readonly id: ProfileStepId;
  readonly label: string;
  readonly value: string | null;
  readonly stepIndex: number;
};

/** One verification section as S-N-17 and S-N-21 show it. `needsHer` is the only call to action. */
export type NannyVerificationRow = {
  readonly section: "identity" | "dbs" | "right-to-work";
  readonly label: string;
  readonly status: string;
  readonly statusLabel: string;
  readonly needsHer: boolean;
};

/**
 * The verification half of both screens.
 *
 * **It never names the hold** (ADR-157; the planner's ruling). Its whole input is the level `getStatus` answers
 * — read, never derived (`2c` rule 1) — and the four section statuses. Nothing here is told whether a connection
 * is held, so nothing here can say so: an L3 nanny whose connections are waiting on the level-4 check reads
 * exactly what a nanny mid-check reads.
 */
export type NannyVerificationSummary = {
  readonly level: NannyVerificationLevel;
  /** the one neutral line, from the level and the sections only */
  readonly line: string;
  /** the DBS section's status, for the badge 04 §6.3 S-N-17 asks for */
  readonly dbs: string;
  readonly rows: ReadonlyArray<NannyVerificationRow>;
  /** true when a section is hers to fix — the only thing either screen asks her to do about verification */
  readonly needsHer: boolean;
  /** I-V5: barred ⇒ suspended, and she is told (04 §4.1 row 14, VER-010). Not a hold. */
  readonly suspended: boolean;
};

export type NannyProfileView = {
  readonly firstName: string;
  /** "Clapham · SW4", or `null` until she has given one */
  readonly areaLine: string | null;
  readonly complete: boolean;
  /** the first thing still wanted, or `null` when nothing is */
  readonly nextStep: NannyProfileGap | null;
  readonly missing: ReadonlyArray<NannyProfileGap>;
  readonly facts: ReadonlyArray<NannyProfileFact>;
  /** her rate in `LOCALE.currency`, or `null` */
  readonly rateLine: string | null;
  readonly availability: NannyAvailability | null;
  readonly verification: NannyVerificationSummary;
};

/** 04 §6.3 S-N-21's tree, in its order: Profile · Account · Linked children · Contact us · Close account. */
export type NannySettingsSectionId =
  | "profile"
  | "account"
  | "children"
  | "help"
  | "close";

export type NannySettingsSection = {
  readonly id: NannySettingsSectionId;
  readonly heading: string;
  readonly line: string;
  readonly href: string;
  readonly linkLabel: string;
};

export type NannySettingsView = {
  readonly firstName: string;
  readonly email: Email;
  readonly sections: ReadonlyArray<NannySettingsSection>;
  /** prefills the contact form, which is S-N-18's own location step — no second writer (ADR-152 (2)) */
  readonly contact: {
    readonly mobile: string | null;
    readonly district: string | null;
    readonly area: string | null;
  };
  readonly contactStepIndex: number;
  readonly verificationRows: ReadonlyArray<NannyVerificationRow>;
  readonly verification: NannyVerificationSummary;
};

export type NannyMyProfileProps = {
  readonly view: NannyProfileView;
  /** `/nanny/register` — every edit link is this plus `?step=` */
  readonly editHref: string;
  readonly verificationHref: string;
  readonly hubHref: string;
  readonly settingsHref: string;
};

export type NannySettingsProps = {
  readonly view: NannySettingsView;
  /** for the contact panel's prefill — it renders S-N-18's own location step (04 §6.3 "already held are prefilled") */
  readonly profile: NannyProfile;
  readonly options: NannyFunnelOptions;
  readonly action: NannyProfileStepAction;
  readonly verificationHref: string;
  readonly hubHref: string;
  /** S-X-09 — "set your password" by email; no password field on this screen */
  readonly passwordHref: string;
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
  /** S-N-01 and S-N-02 (04 §4.4 c1) — shown to everyone but an isolated nanny (ADR-147). */
  readonly addChildHref: string;
  readonly commissionHref: string;
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

// ── S-N-02 (`2g`) — the commission explainer + the book-a-call section (`03.37`; 04 §4.4 c2 / c3) ──

/**
 * The picker's day, re-exported through this module's own vocabulary so the S-N-02 route never has to reach
 * into `call-layer`'s type barrel for a prop it is only passing through (01 §2.5). The shape is `call-layer`'s
 * and stays `call-layer`'s — this is an alias, not a second definition.
 */
export type SlotDay = CallLayerSlotDay;

/** The nanny half of `call-layer`'s picker actions: no position, no hold (03 §3.2). */
export type NannySlotActions = Extract<
  CallLayerSlotActions,
  { readonly subject: "nanny" }
>;

export type NannyCommissionView = {
  readonly firstName: string;
  /** what we will ring — prefilled from her own row (04 §4.4 c3 "mobile prefilled"); `null` if she has none */
  readonly mobile: E164 | null;
  /** `null` = the calendar could not be read; the picker says so and offers a retry (04 §6.2 L·E·E) */
  readonly days: ReadonlyArray<SlotDay> | null;
  /** the time she already picked (`slot-chosen`), or `null` */
  readonly chosen: { readonly start: ISO; readonly end: ISO } | null;
};

/**
 * What the S-N-02 route gets back. `isolated` is ADR-147's rule at the door: an invited nanny's hub offers
 * neither this page nor S-N-01 until she applies, so the page itself says the same thing rather than relying
 * on the link being hidden.
 */
export type NannyCommissionLoad =
  | { readonly kind: "no-nanny" }
  | { readonly kind: "isolated" }
  | { readonly kind: "page"; readonly view: NannyCommissionView };

export type NannyCommissionPageProps = {
  readonly view: NannyCommissionView;
  readonly actions: NannySlotActions;
  readonly hubHref: string;
  readonly addChildHref: string;
  /** `BRAND.name` — the route reads it from `config`, the component never carries it (L4). */
  readonly brandName: string;
};
