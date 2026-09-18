// 03 §4.3 — the `verification` contract: nanny verification only (parent verification removed, ADR-071).
// `verification` decides levels and statuses; `vetting-providers` extracts and checks (03 §4.1). The wizard
// (S-N-03…S-N-10; 04 §6.3) and its inside are L-008 `2b`'s (ADR-153 · ADR-154 · ADR-155); the level rule, the
// silent hold, the admin decision and the sweeps are `2c`'s and are named here as such.
import type { ClientResult } from "@/modules/platform";
import type {
  CheckResult,
  CheckStatus,
  ConsentRecordId,
  E164,
  EnumValue,
  Evidence,
  EvidenceType,
  Instant,
  ISODate,
  RejectReason,
  Result,
  SubmissionId,
  UserId,
} from "@/modules/shared-types";
import type { StorageRef } from "@/modules/auth";
import type { CheckedBy } from "@/modules/vetting-providers";

/** 02 §3 `verification_level` — the five levels of `05.22`, in order. */
export type VerificationLevel = EnumValue<"verification_level">;
/** 02 §3 `section_status` — the state of one section of the wizard. */
export type SectionStatus = EnumValue<"section_status">;

/** The three evidence sections — the admin queue's tabs (03 §4.3). */
export type VerificationSection = "identity" | "dbs" | "right-to-work";
/** The wizard's four sections: the three above plus contact (S-N-04; 02 §4.3 "Contact"). */
export type WizardSection = VerificationSection | "contact";

/** 02 §3 `identity_evidence_type` — the UK id types S-N-05 offers (`VETTING.identityEvidence`). */
export type IdentityEvidenceKind = EnumValue<"identity_evidence_type">;
/** 02 §3 `rtw_evidence_type` — S-N-07's three kinds (ADR-153; `VETTING.rightToWorkEvidence`). */
export type RightToWorkEvidenceKind = EnumValue<"rtw_evidence_type">;
/** 02 §8: the four section names of the `verification-documents` prefix. */
export type EvidenceObjectSection =
  | "identity-document"
  | "identity-selfie"
  | "dbs-certificate"
  | "rtw-document";

export type SectionState = {
  readonly section: WizardSection;
  readonly status: SectionStatus;
  readonly evidenceType?: EvidenceType;
  readonly submissionId?: SubmissionId;
  /** identity only — 07 §8 row 11's cap reads it */
  readonly attempts?: number;
  readonly rejectionReason?: string;
  /** 04 §8 owns the copy the key names */
  readonly guidanceKey?: string;
  readonly statusAt?: Instant;
};

export type VerificationState = {
  readonly nannyId: UserId;
  readonly level: VerificationLevel;
  /** I-V5: barred ⇒ suspended; the wizard is closed */
  readonly suspended: boolean;
  /** contact · identity · dbs · right-to-work, always all four (I-V1: `not_started` before the first write) */
  readonly sections: ReadonlyArray<SectionState>;
};

/** 07 §5.3 rule 4 — the upload envelope reasons. */
export type UploadReason =
  | "not_authenticated"
  | "permission_denied"
  | "missing_field"
  | "invalid_type"
  | "file_too_large"
  | "storage_failure";

export type VerificationReason =
  | UploadReason
  | "unsupported-evidence"
  | "provider-unavailable"
  | "already-submitted"
  | "section-not-open"
  | "not-permitted"
  /** I-V3: identity needs the caller's own `biometric-notice` consent row */
  | "consent-required"
  /** the notice has no current document to consent to (kickoff §6: nothing real before `10.01`) */
  | "notice-unavailable"
  | "too-many-attempts"
  | "store-failed"
  | "verification-not-configured"
  /** `2c`'s roads (the admin decision, the level) */
  | "not-built";

export type VerificationErrorDetails = {
  readonly reason: VerificationReason;
  readonly field?: string;
};

/** A file as an action received it: the bytes, and what the browser *claimed* — never trusted (07 §4.16). */
export type UploadedFile = {
  readonly bytes: Uint8Array;
  readonly contentType?: string;
  readonly fileName?: string;
};

export type ContactInput = {
  readonly mobile: E164;
  readonly district: string;
  readonly area: string;
};

export type IdentityInput = {
  readonly idType: IdentityEvidenceKind;
  readonly document: UploadedFile;
  readonly selfie: UploadedFile;
  readonly surname: string;
  readonly givenNames: string;
  readonly dateOfBirth: ISODate;
  /** the AGR-04 row recorded before any upload (07 §2.6) */
  readonly consentRecordId: ConsentRecordId;
};

export type DbsInput = {
  readonly certificate: UploadedFile;
  readonly certificateNumber: string;
  readonly issueDate: ISODate;
  /** `05.29` — consent to the Update Service status check (kickoff §4.3 default) */
  readonly updateServiceConsent: boolean;
};

export type RightToWorkInput =
  | { readonly kind: "british_irish_passport"; readonly document: UploadedFile }
  | {
      readonly kind: "share_code";
      readonly shareCode: string;
      readonly dateOfBirth: ISODate;
    }
  | { readonly kind: "immigration_document"; readonly document: UploadedFile };

export type AdminDecision = {
  readonly submissionId: SubmissionId;
  readonly decision: "verified" | "rejected";
  readonly reason?: RejectReason;
};

/** What `applyCheckResult` hands the store — the `apply_vetting_check_result()` arguments (ADR-154 (5)). */
export type ApplyCheckResultInput = {
  readonly submissionId: SubmissionId;
  readonly status: CheckStatus;
  readonly checkedBy: CheckedBy;
  readonly extracted?: CheckResult["extracted"];
};

/**
 * The port behind the inside (ADR-154): `0022`'s three session-scope definers and the `verification_status`
 * view read, plus the service-scope provider-side write. Boot installs the adapter; the memory store is the
 * double over `vetting-providers`' memory world.
 */
export type VerificationStore = {
  /** the nanny's own read (`verification_status`); `null` before her first write (I-V1) */
  getStatus(
    nannyId: UserId,
  ): Promise<Result<VerificationState | null, VerificationErrorDetails>>;
  saveContact(): Promise<Result<void, VerificationErrorDetails>>;
  claimProcessing(): Promise<
    Result<ReadonlyArray<VerificationSection>, VerificationErrorDetails>
  >;
  applyCheckResult(
    input: ApplyCheckResultInput,
  ): Promise<
    Result<
      { readonly section: VerificationSection; readonly status: SectionStatus },
      VerificationErrorDetails
    >
  >;
};

/**
 * S-N-04's contact values reach `user_profiles` through `update_nanny_profile(p_contact)` (`0021`, R-7), which
 * `onboarding-nanny` owns and 01 §2.3 keeps out of this module's reach — so boot injects the writer (the `1i`
 * shape for a cross-arrow the table forbids).
 */
export type ContactWriter = (contact: ContactInput) => Promise<Result<unknown>>;

export type VerificationDeps = {
  readonly store: VerificationStore;
  readonly contactWriter: ContactWriter;
};

/** The connector `onboarding-nanny` and `admin-verification` hold (01 §2.3). */
export type Verification = {
  getStatus(
    nannyId: UserId,
  ): Promise<Result<VerificationState, VerificationErrorDetails>>;
  /** S-N-04 — no provider (03 §4.3) */
  submitContact(
    nannyId: UserId,
    input: ContactInput,
  ): Promise<Result<SectionState, VerificationErrorDetails>>;
  /** S-N-05 — `identity-document` + `selfie` (03 §4.3), behind the consent gate (07 §2.6) */
  submitIdentity(
    nannyId: UserId,
    input: IdentityInput,
  ): Promise<Result<SectionState, VerificationErrorDetails>>;
  /** S-N-06 — `dbs-certificate` [+ Update Service consent] */
  submitDbs(
    nannyId: UserId,
    input: DbsInput,
  ): Promise<Result<SectionState, VerificationErrorDetails>>;
  /** S-N-07 — one of three types (ADR-153) */
  submitRightToWork(
    nannyId: UserId,
    input: RightToWorkInput,
  ): Promise<Result<SectionState, VerificationErrorDetails>>;
  /** the generic road the four above share; an assembled `Evidence` */
  submitSection(
    evidence: Evidence,
  ): Promise<Result<SectionState, VerificationErrorDetails>>;
  /** S-N-08 — the atomic claim, then `check` per submission, then `applyCheckResult` (03 §4.3) */
  process(
    nannyId: UserId,
  ): Promise<Result<VerificationState, VerificationErrorDetails>>;
  applyCheckResult(
    result: CheckResult,
  ): Promise<Result<VerificationState, VerificationErrorDetails>>;
  /** `2c`'s — refuses `not-built` until the admin road lands */
  override(
    nannyId: UserId,
    decision: AdminDecision,
  ): Promise<Result<VerificationState, VerificationErrorDetails>>;
};

export type VerificationRegistry = {
  get(): Verification;
  set(next: Verification): void;
};

// ── The wizard (04 §2.3 S-N-03…S-N-08; `03.21` resume) ──

export type WizardStep = {
  readonly index: number;
  readonly screen:
    | "S-N-03"
    | "S-N-04"
    | "S-N-05"
    | "S-N-06"
    | "S-N-07"
    | "S-N-08";
  readonly section: WizardSection | null;
  readonly heading: string;
};

/** where the wizard reopens: a step index, or the status page when every section is submitted and settled */
export type WizardPosition = number | "status";

// ── Actions (01 §4e) ──

export type VerificationActionDetails =
  | VerificationErrorDetails
  | { readonly reason: "invalid-input"; readonly field: string };

export type ContactAction = (
  previous: unknown,
  formData: FormData,
) => Promise<ClientResult<SectionState, VerificationActionDetails>>;
export type IdentityAction = ContactAction;
export type DbsAction = ContactAction;
export type RightToWorkAction = ContactAction;
export type ProcessAction = () => Promise<
  ClientResult<VerificationState, VerificationActionDetails>
>;
/** The scroll-gated notice's evidence (02 §4.1 `biometric_consent_records`), as the component stamped it. */
export type NoticeEvidence = {
  readonly openedAt: Instant;
  readonly scrollCompletedAt: Instant;
  readonly checkboxesEnabledAt: Instant;
  readonly timeSpentSeconds: number;
  readonly checkboxTimestamps: Readonly<Record<string, Instant>>;
};

/** S-N-10's answer: the rows are written; the record id stays server-side (security pass LOW 3). */
export type BiometricConsentOutcome = {
  readonly recorded: true;
};
export type BiometricConsentAction = (
  previous: unknown,
  formData: FormData,
) => Promise<ClientResult<BiometricConsentOutcome, VerificationActionDetails>>;

// ── Component props ──

/** 04 §6.3 S-N-10 / `10.01`: the current notice, read for the nanny; `null` = no document seeded yet. */
export type BiometricNotice = {
  readonly version: number;
  readonly body: string;
};

export type WizardOptions = {
  readonly idTypes: ReadonlyArray<{
    readonly key: IdentityEvidenceKind;
    readonly label: string;
  }>;
  readonly rtwKinds: ReadonlyArray<{
    readonly key: RightToWorkEvidenceKind;
    readonly label: string;
  }>;
  readonly dbsNumberLength: number;
  readonly shareCodeLength: number;
  readonly maxBytes: number;
  readonly acceptedMimes: ReadonlyArray<string>;
  readonly pollMs: number;
  readonly routeAfterMs: number;
  readonly stillCheckingEveryMs: number;
  readonly disclosures: {
    readonly aiProvider: string;
    readonly location: string;
  };
};

export type WizardPrefill = {
  readonly firstName: string;
  readonly lastName: string;
  readonly mobile?: string;
  readonly district?: string;
  readonly area?: string;
  readonly dateOfBirth?: string;
};

export type WizardActions = {
  readonly contact: ContactAction;
  readonly identity: IdentityAction;
  readonly dbs: DbsAction;
  readonly rightToWork: RightToWorkAction;
  readonly process: ProcessAction;
  readonly biometricConsent: BiometricConsentAction;
};

export type WizardHrefs = {
  readonly hub: string;
  readonly status: string;
  readonly notice: string;
};

export type VerificationWizardProps = {
  readonly initialStep: number;
  readonly state: VerificationState | null;
  readonly prefill: WizardPrefill;
  readonly notice: BiometricNotice | null;
  readonly actions: WizardActions;
  readonly options: WizardOptions;
  /** S-N-04's area picker, passed by the route from `onboarding-nanny` (01 §2.3 gives this module no arrow to it) */
  readonly locationField: React.ReactNode;
  readonly hrefs: WizardHrefs;
};

export type VerificationStatusPageProps = {
  readonly state: VerificationState | null;
  readonly hrefs: { readonly wizard: string; readonly hub: string };
};

export type BiometricNoticeConsentProps = {
  readonly action: BiometricConsentAction;
  readonly notice: BiometricNotice | null;
  readonly disclosures: WizardOptions["disclosures"];
  readonly hrefs: { readonly back: string; readonly next: string };
};

/** what the storage ref is, as this module carries it (`auth`'s `StorageRef`; never a URL — I-V7) */
export type EvidenceRef = StorageRef;
