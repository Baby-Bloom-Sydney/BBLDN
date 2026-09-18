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

/** The ledger's own view of a submission — 03 §4.2's `Submission` plus the columns the queue lists on (2c). */
export type VettingLedgerEntry = Submission & {
  readonly nannyId: UserId;
  readonly section: LedgerSection;
  readonly evidenceType: EvidenceType;
  readonly submittedAt: Instant;
  readonly checkedAt?: Instant;
};

export type VettingLedgerFilter = {
  readonly nannyId?: UserId;
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
};

/** The double's `verifications` row: the level `2c` will write, the four sections, the suspension flag. */
export type MemoryVerificationRow = {
  readonly level: EnumValue<"verification_level">;
  readonly suspended: boolean;
  readonly contact: LedgerSectionStatus;
  readonly identity: MemorySectionRow;
  readonly dbs: MemorySectionRow;
  readonly rightToWork: MemorySectionRow;
};

export type MemoryVettingStore = VettingSubmissionStore & {
  /** every ledger row, oldest first */
  rows(): ReadonlyArray<VettingLedgerEntry>;
  /** the double's `verifications` row for a nanny, or `undefined` before her first write (I-V1) */
  sectionsOf(nannyId: UserId): MemoryVerificationRow | undefined;
  /** the writes `verification`'s memory store makes through the same world (contact, claim, apply) */
  patchSections(
    nannyId: UserId,
    patch: (row: MemoryVerificationRow) => MemoryVerificationRow,
  ): MemoryVerificationRow;
  /** the provider-side write (`apply_vetting_check_result`), shared with `verification`'s memory store */
  applyResult(
    submissionId: SubmissionId,
    status: CheckStatus,
  ): Result<
    { readonly section: LedgerSection; readonly status: LedgerSectionStatus },
    VettingErrorDetails
  >;
};
