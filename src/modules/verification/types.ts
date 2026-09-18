// 03 §4.3 — the `verification` contract: nanny verification only (parent verification removed, ADR-071).
// `verification` decides levels and statuses; `vetting-providers` extracts and checks (03 §4.1). The wizard
// (S-N-03…S-N-10; 04 §6.3) and its inside are L-008 `2b`'s (ADR-153 · ADR-154 · ADR-155); the level rule, the
// silent hold, the admin decision and the sweeps are `2c`'s and are named here as such.
import type { ClientResult } from "@/modules/platform";
import type {
  AdminId,
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
  Url,
  UserId,
} from "@/modules/shared-types";
import type { StorageRef } from "@/modules/auth";
import type { CheckedBy, LedgerSection } from "@/modules/vetting-providers";

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
  /** 03 §4.3's `override` arm — reachable only when a non-manual provider is bound, and none is (03 §4.4) */
  | "not-built"
  /** ADR-159: a rejection without a reason (04 §5.3; 05 AC-A-17) */
  | "reason-required";

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
  readonly store: VerificationStore & VerificationDecisionStore;
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
  /**
   * 03 §4.3's road for a provider that is NOT a `ManualDecisionProvider`. None is bound (03 §4.4: `stub-manual`
   * answers every type), so it stays refused by name; `decide` below is the road the queue takes.
   */
  override(
    nannyId: UserId,
    decision: AdminDecision,
  ): Promise<Result<VerificationState, VerificationErrorDetails>>;

  // ── The queue's road (ADR-159): every method re-checks `auth.requireRole('admin')` itself ──

  listQueue(
    query: QueueQuery,
  ): Promise<Result<ReadonlyArray<QueueEntry>, VerificationErrorDetails>>;
  readQueueRecord(
    submissionId: SubmissionId,
  ): Promise<Result<QueueRecord, VerificationErrorDetails>>;
  /** signed URLs (1 h) + `vetting.evidence-viewed` per open (07 §4.32) */
  openEvidence(
    submissionId: SubmissionId,
  ): Promise<Result<EvidenceOpen, VerificationErrorDetails>>;
  /** `getProvider(type).record()` → `record_vetting_decision()`; the subject is the submission's nanny */
  decide(
    input: DecisionInput,
  ): Promise<Result<DecisionOutcome, VerificationErrorDetails>>;
  /** the level-4 action (04 §4.1 row 15) */
  recordUpdateServiceCheck(
    input: UpdateServiceInput,
  ): Promise<Result<LevelSync, VerificationErrorDetails>>;
  adminOverview(): Promise<Result<AdminOverview, VerificationErrorDetails>>;

  // ── The named jobs (ADR-161; 03 §4.3) — run at service scope by the cron shells ──

  sweepStaleProcessing(
    now: Instant,
  ): Promise<Result<SweepResult, VerificationErrorDetails>>;
  sweepReminders(
    now: Instant,
  ): Promise<Result<SweepResult, VerificationErrorDetails>>;
  sweepExpiry(now: Instant): Promise<Result<SweepResult, VerificationErrorDetails>>;
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

// ── The level, the decision and the queue (`2c`; ADR-157 · ADR-158 · ADR-159 · ADR-161) ──

export type DbsOutcome = EnumValue<"dbs_outcome">;
export type UpdateServiceResult = EnumValue<"update_service_result">;

/** The facts 02 §4.3's derivation reads — the memory double's input and the SQL sync's, pinned equal by test. */
export type LevelFacts = {
  readonly sections: Readonly<Record<VerificationSection, SectionStatus>>;
  readonly dbsOutcome: DbsOutcome;
  readonly crossCheckPassed: boolean;
  /** an admin recorded an Update Service check with result `no_change` (the B-19 default) */
  readonly updateServiceConfirmed: boolean;
};

/** What `sync_nanny_verification_state()` answers (ADR-157 (1)). */
export type LevelSync = {
  readonly fromLevel: VerificationLevel;
  readonly toLevel: VerificationLevel;
  readonly suspended: boolean;
  /** held connections released at L4 (ADR-158 arm 2) */
  readonly released: number;
};

/** 03 §4.3: the queue "lists sections in `needs-admin` or stale `pending`". */
export type QueueFilter = "needs-admin" | "stale-pending";

export type QueueQuery = {
  readonly tab: VerificationSection;
  readonly filter: QueueFilter;
};

/** One ledger row as the queue lists it — ids and states, no name: the admin panel decorates (03 §3.6). */
export type QueueEntry = {
  readonly submissionId: SubmissionId;
  readonly nannyId: UserId;
  readonly section: VerificationSection;
  readonly evidenceType: EvidenceType;
  readonly status: CheckStatus["kind"];
  readonly submittedAt: Instant;
  readonly checkedAt?: Instant;
};

/** The declared (S4) fields the admin sees only inside a reveal (07 §4.32) — the nanny typed them. */
export type DeclaredFields = {
  readonly surname?: string;
  readonly givenNames?: string;
  readonly dateOfBirth?: ISODate;
  readonly idType?: IdentityEvidenceKind;
  readonly certificateNumber?: string;
  readonly issueDate?: ISODate;
  readonly rtwKind?: RightToWorkEvidenceKind;
  readonly shareCode?: string;
};

/** The base-table facts an admin's read carries beyond the view (`readAdminRecord`, session scope under RLS). */
export type AdminRecord = {
  readonly nannyId: UserId;
  readonly level: VerificationLevel;
  readonly suspended: boolean;
  readonly declared: DeclaredFields;
  readonly documents: ReadonlyArray<{
    readonly section: EvidenceObjectSection;
    readonly ref: EvidenceRef;
  }>;
  readonly dbsOutcome: DbsOutcome;
  readonly crossCheckPassed: boolean;
  readonly updateService: {
    readonly consentAt?: Instant;
    readonly lastCheckedAt?: Instant;
    readonly lastResult?: UpdateServiceResult;
    readonly subscribed?: boolean;
  };
};

/** S-A-16's open row: the ledger entry, the nanny's section states and the admin-only record. */
export type QueueRecord = {
  readonly entry: QueueEntry;
  readonly state: VerificationState;
  readonly record: AdminRecord;
  readonly note?: string;
};

/** A reveal (07 §4.32): short-lived signed URLs, one event per open. */
export type EvidenceOpen = {
  readonly documents: ReadonlyArray<{
    readonly section: EvidenceObjectSection;
    readonly url: Url;
    readonly expiresAt: Instant;
  }>;
  readonly declared: DeclaredFields;
};

export type DecisionInput = {
  readonly submissionId: SubmissionId;
  readonly decision: "verified" | "rejected";
  readonly reason?: RejectReason;
  readonly note?: string;
  readonly expiresAt?: Instant;
};

export type DecisionOutcome = {
  readonly nannyId: UserId;
  readonly section: VerificationSection;
  readonly status: SectionStatus;
  readonly sync: LevelSync;
};

export type UpdateServiceInput = {
  readonly nannyId: UserId;
  readonly result: UpdateServiceResult;
  readonly subscribed: boolean;
};

/** 04 §6.4 S-A-16's counters (05 AC-A-17). */
export type AdminOverview = {
  readonly pending: number;
  readonly verifiedToday: number;
  readonly rejectedToday: number;
  readonly fullyVerified: number;
};

/** A verified section with a known expiry — what `vetting-expiry` walks (03 §4.3). */
export type SectionExpiry = {
  readonly nannyId: UserId;
  readonly section: VerificationSection;
  readonly submissionId: SubmissionId;
  readonly expiresAt: Instant;
};

/** A nanny still below the pool with a section open — what the reminder funnel walks (`08.11`; ADR-161). */
export type RemindableNanny = {
  readonly nannyId: UserId;
  readonly level: VerificationLevel;
  readonly lastChangeAt: Instant;
};

export type SweepResult = {
  readonly handled: number;
  readonly skipped: number;
};

/** What `requireAdmin` answers (ADR-159): the session's admin, as the brand and as the user id the audit writes. */
export type AdminSession = {
  readonly adminId: AdminId;
  readonly userId: UserId;
};

/** `VETTING.requiredChecksByLevel` as sections per level — the sync's `p_required` (ADR-157 (1)). */
export type RequiredSectionsByLevel = Readonly<
  Record<VerificationLevel, ReadonlyArray<LedgerSection>>
>;

/** The decision-side port (ADR-157) — the `0023` definers at service scope, plus the admin's reads. */
export type VerificationDecisionStore = {
  /** the base-table facts an admin may read (02 §4.3 "admin all"); `null` before her first write */
  readAdminRecord(
    nannyId: UserId,
  ): Promise<Result<AdminRecord | null, VerificationErrorDetails>>;
  /** `sync_nanny_verification_state()` — idempotent; the memory double derives with `deriveLevel` */
  syncLevel(nannyId: UserId): Promise<Result<LevelSync, VerificationErrorDetails>>;
  /** `record_update_service_check()` — the level-4 action; `checkedBy` is the session's admin */
  recordUpdateServiceCheck(
    input: UpdateServiceInput & { readonly checkedBy: UserId },
  ): Promise<Result<LevelSync, VerificationErrorDetails>>;
  /** `expire_verification_section()` */
  expireSection(
    submissionId: SubmissionId,
  ): Promise<Result<LevelSync, VerificationErrorDetails>>;
  /** `sweep_stale_verification_processing()` — answers the count moved to review; the SQL judges by its own clock */
  sweepStale(
    staleMinutes: number,
    now: Instant,
  ): Promise<Result<number, VerificationErrorDetails>>;
  listExpiries(): Promise<
    Result<ReadonlyArray<SectionExpiry>, VerificationErrorDetails>
  >;
  listRemindable(
    belowLevel: VerificationLevel,
  ): Promise<Result<ReadonlyArray<RemindableNanny>, VerificationErrorDetails>>;
  countByLevel(): Promise<
    Result<Readonly<Record<VerificationLevel, number>>, VerificationErrorDetails>
  >;
};
