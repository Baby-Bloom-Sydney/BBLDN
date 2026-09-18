// 03 §4.2 — the vetting-providers contract (swappable; T-3.1, ADR-026). The evidence, submission, status and
// extraction types live in `shared-types/vetting.ts`; this file names the provider interfaces, the registry
// and the store port behind `stub-manual` (03 §4.4; ADR-154).
import type {
  CheckResult,
  CheckStatus,
  EnumValue,
  Evidence,
  EvidenceId,
  EvidenceType,
  ExtractedFields,
  Expiry,
  Instant,
  ManualDecision,
  NannyId,
  ProviderId,
  Result,
  Submission,
  SubmissionId,
  UserId,
} from "@/modules/shared-types";

/** 03 §4.2's `details.reason` set, plus the two "not installed" reasons the fail-closed defaults use. */
export type VettingReason =
  | "unsupported-evidence"
  | "provider-unavailable"
  | "document-unreadable"
  | "mismatch"
  | "expired"
  | "vetting-store-not-configured"
  /** the admin decision road is `2c`'s (ADR-154): the boot adapter refuses it by name */
  | "decision-not-built";

export type VettingErrorDetails = {
  readonly reason: VettingReason;
  readonly provider?: ProviderId;
};

/** 03 §4.2 — a provider *checks* evidence a nanny supplies; it never decides a level. */
export type VettingProvider = {
  readonly id: ProviderId;
  supports(evidenceType: EvidenceType): boolean;
  submit(evidence: Evidence): Promise<Result<Submission, VettingErrorDetails>>;
  check(
    submissionId: SubmissionId,
  ): Promise<Result<CheckResult, VettingErrorDetails>>;
  extract(
    evidence: Evidence,
  ): Promise<Result<ExtractedFields, VettingErrorDetails>>;
  expiry(
    submissionId: SubmissionId,
  ): Promise<Result<Expiry, VettingErrorDetails>>;
};

/** The admin-confirm provider (S-A-16): a human records the decision the provider cannot. */
export type ManualDecisionProvider = VettingProvider & {
  record(
    input: ManualDecision,
  ): Promise<Result<CheckResult, VettingErrorDetails>>;
};

export type ProviderSummary = {
  readonly id: ProviderId;
  readonly supports: ReadonlyArray<EvidenceType>;
  readonly manual: boolean;
};

/** 02 §3 `verification_section` — the ledger's section column. */
export type LedgerSection = EnumValue<"verification_section">;
/** 02 §3 `checked_by`. */
export type CheckedBy = EnumValue<"checked_by">;

/** What `submit` hands the ledger (ADR-154 (2)): the evidence itself, so one write can fill both tables. */
export type VettingSubmissionInput = {
  readonly evidence: Evidence;
  readonly provider: ProviderId;
  readonly status: CheckStatus;
  readonly providerRef?: string;
};

/**
 * The ledger's own view of a submission — 03 §4.2's `Submission` plus the columns the queue lists on (2c).
 *
 * ★ ADR-169 — `nannyId` is a **`NannyId`**, the `nannies.id` party row, and not the session's `auth.users.id`.
 * `vetting_submissions.nanny_id` is `references public.nannies (id)` (`0008:156`) and
 * `submit_verification_evidence` writes it as `select n.id from public.nannies n where n.user_id = auth.uid()`
 * (`0023:865`): the column was always right and the label was wrong, which is why REVIEW-4 C-3 read as an empty
 * queue rather than as an error. Verification is a fact about the nanny's PROFILE, which is where `nanny_public`,
 * the matching index and ADR-166's reasoning already live — so this is the id space, and the brand says so.
 */
export type VettingLedgerEntry = Submission & {
  readonly nannyId: NannyId;
  readonly section: LedgerSection;
  readonly evidenceType: EvidenceType;
  readonly submittedAt: Instant;
  readonly checkedAt?: Instant;
  /** the admin's note on the decision (`raw_response.note`; ADR-157 (2)) */
  readonly note?: string;
};

export type VettingLedgerFilter = {
  /** ADR-169: the party row, as the column is — `.eq("nanny_id", …)` goes straight at `nannies.id`. */
  readonly nannyId?: NannyId;
  readonly section?: LedgerSection;
  readonly status?: CheckStatus["kind"];
};

/**
 * The `vetting_submissions` port (02 §4.3 row 2; 03 §4.4 "`submit` → `needs-admin` stored in `vetting_submissions`").
 * `upsert` is `submit_verification_evidence()` at session scope; the reads run at service scope, named in the
 * README (07 §5.1 rule 5); `recordDecision` is the admin road `2c` builds.
 */
export type VettingSubmissionStore = {
  /** Mints the `SubmissionId` (01 §4a rule 4); a known evidence id answers the existing submission unchanged. */
  upsert(
    input: VettingSubmissionInput,
  ): Promise<Result<Submission, VettingErrorDetails>>;
  findByEvidence(
    evidenceId: EvidenceId,
  ): Promise<Result<Submission | null, VettingErrorDetails>>;
  read(
    submissionId: SubmissionId,
  ): Promise<Result<VettingLedgerEntry | null, VettingErrorDetails>>;
  list(
    filter: VettingLedgerFilter,
  ): Promise<Result<ReadonlyArray<VettingLedgerEntry>, VettingErrorDetails>>;
  recordDecision(
    input: ManualDecision,
  ): Promise<Result<CheckResult, VettingErrorDetails>>;
};

export type VettingStoreRegistry = {
  get(): VettingSubmissionStore;
  set(next: VettingSubmissionStore): void;
};

// ── The memory double's observable world (05 §3 rule 2) ──

/** 02 §3 `section_status`. */
export type LedgerSectionStatus = EnumValue<"section_status">;

/** What the double keeps per section, mirroring the columns `0022`'s definers write. */
export type MemorySectionRow = {
  readonly status: LedgerSectionStatus;
  readonly attempts: number;
  readonly evidenceType?: EvidenceType;
  readonly rejectionReason?: string;
  readonly guidanceKey?: string;
  readonly statusAt?: Instant;
  /** the latest decided submission (`_provider_ref`) and its expiry (`_expires_at`) — what `vetting-expiry` walks (2c) */
  readonly submissionId?: SubmissionId;
  readonly expiresAt?: Instant;
};

/**
 * The double's `verifications` row: the level (written by `verification`'s memory store through `deriveLevel`,
 * ADR-157), the four sections, the suspension flag, and — since `2c` — the decision-side facts `0023` keeps
 * beside the sections, plus the declared fields and object paths an admin's read carries.
 */
export type MemoryVerificationRow = {
  readonly level: EnumValue<"verification_level">;
  readonly suspended: boolean;
  readonly contact: LedgerSectionStatus;
  readonly identity: MemorySectionRow;
  readonly dbs: MemorySectionRow;
  readonly rightToWork: MemorySectionRow;
  readonly dbsOutcome?: EnumValue<"dbs_outcome">;
  readonly crossCheckPassed?: boolean;
  readonly updateService?: {
    readonly result?: EnumValue<"update_service_result">;
    readonly subscribed?: boolean;
    readonly checkedBy?: UserId;
    readonly checkedAt?: Instant;
    readonly consentAt?: Instant;
  };
  /** the nanny's typed fields, as the evidence declared them (S4 — an admin reads them inside a reveal) */
  readonly declared?: Readonly<Record<string, string>>;
  /** object paths by 02 §8 section name, never a URL (I-V7) */
  readonly documents?: ReadonlyArray<{
    readonly section: string;
    readonly path: string;
  }>;
  /** ADR-158 arm 2 in the memory world: how many of her connections are held; released at L4 */
  readonly heldConnections?: number;
};

export type MemoryVettingStore = VettingSubmissionStore & {
  /** every ledger row, oldest first */
  rows(): ReadonlyArray<VettingLedgerEntry>;
  /** the double's `verifications` row for a nanny, or `undefined` before her first write (I-V1) */
  sectionsOf(nannyId: NannyId): MemoryVerificationRow | undefined;
  /** every nanny with a row — what the sweeps walk (2c) */
  nannyIds(): ReadonlyArray<NannyId>;
  /** the writes `verification`'s memory store makes through the same world (contact, claim, apply) */
  patchSections(
    nannyId: NannyId,
    patch: (row: MemoryVerificationRow) => MemoryVerificationRow,
  ): MemoryVerificationRow;
  /**
   * ★ ADR-169 — the double's copy of the one resolution `submit_verification_evidence` does inside itself
   * (`0023:864-868`). Exposed so a test can cross the seam deliberately instead of by accident: the two id
   * spaces are different values here, not one opaque string, which is the defect REVIEW-4 C-3 measured.
   */
  partyIdOf(userId: UserId): NannyId;
  userIdOf(nannyId: NannyId): UserId;
  /** the provider-side write (`apply_vetting_check_result`), shared with `verification`'s memory store */
  applyResult(
    submissionId: SubmissionId,
    status: CheckStatus,
  ): Result<
    { readonly section: LedgerSection; readonly status: LedgerSectionStatus },
    VettingErrorDetails
  >;
};
