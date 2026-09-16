// 03 §4.2 — the vetting-providers contract (swappable; T-3.1, ADR-026). The evidence, submission, status and
// extraction types live in `shared-types/vetting.ts`; this file names the provider interfaces, the registry
// and the store port.
//
// **ADR-117 Tier A.** This module handles criminal-record checks and identity documents. This unit built the
// connector and the types only — no evidence is read, no storage path is opened and no provider is called.
// The insides get inline review in a later unit (see the module README).
import type {
  CheckResult,
  Evidence,
  EvidenceType,
  ExtractedFields,
  Expiry,
  ManualDecision,
  ProviderId,
  Result,
  Submission,
  SubmissionId,
} from "@/modules/shared-types";

/** 03 §4.2's `details.reason` set, plus the "not installed yet" reason this unit's fail-closed store uses. */
export type VettingReason =
  | "unsupported-evidence"
  | "provider-unavailable"
  | "document-unreadable"
  | "mismatch"
  | "expired"
  | "vetting-store-not-configured";

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

/**
 * The `vetting_submissions` port (02; 03 §4.4 "`submit` → `needs-admin` stored in `vetting_submissions`").
 * It is **not implemented by this unit** — Tier A. The default refuses, so nothing can half-record a check.
 */
export type VettingSubmissionStore = {
  /** Mints the `SubmissionId`: only the store knows what a durable id is (01 §4a rule 4). */
  upsert(
    submission: Omit<Submission, "submissionId">,
  ): Promise<Result<Submission, VettingErrorDetails>>;
  findByEvidence(
    evidenceId: Evidence["id"],
  ): Promise<Result<Submission | null, VettingErrorDetails>>;
  read(
    submissionId: SubmissionId,
  ): Promise<Result<Submission | null, VettingErrorDetails>>;
  recordDecision(
    input: ManualDecision,
  ): Promise<Result<CheckResult, VettingErrorDetails>>;
};

export type VettingStoreRegistry = {
  get(): VettingSubmissionStore;
  set(next: VettingSubmissionStore): void;
};
