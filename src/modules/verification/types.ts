// 03 §4.3 — the `verification` contract: nanny verification only (parent verification removed, ADR-071).
// `verification` decides levels and statuses; `vetting-providers` extracts and checks (03 §4.1).
//
// **ADR-117 Tier A — this unit built the connector and the types only.** No evidence is handled, no storage
// path is opened and no provider is called from here; the wizard, the processing step, the level rules and
// the silent hold are built and reviewed inline in a later unit (see the module README).
import type {
  CheckResult,
  Evidence,
  EvidenceType,
  RejectReason,
  Result,
  SubmissionId,
  UserId,
} from "@/modules/shared-types";
import type { EnumValue } from "@/modules/shared-types";

/** 02 §3 `verification_level` — the five levels of `05.22`, in order. */
export type VerificationLevel = EnumValue<"verification_level">;
/** 02 §3 `section_status` — the state of one section of the wizard. */
export type SectionStatus = EnumValue<"section_status">;

/** The three sections the admin queue tabs on (03 §4.3 "S-A-16 shows all three tabs"). */
export type VerificationSection = "identity" | "dbs" | "right-to-work";

export type SectionState = {
  readonly section: VerificationSection;
  readonly status: SectionStatus;
  readonly evidenceType?: EvidenceType;
  readonly submissionId?: SubmissionId;
};

export type VerificationState = {
  readonly nannyId: UserId;
  readonly level: VerificationLevel;
  readonly sections: ReadonlyArray<SectionState>;
};

export type VerificationReason =
  | "unsupported-evidence"
  | "provider-unavailable"
  | "already-submitted"
  | "not-permitted"
  /** the inside is ADR-117 Tier A and is not built by this unit */
  | "verification-not-configured";

export type VerificationErrorDetails = {
  readonly reason: VerificationReason;
};

export type AdminDecision = {
  readonly submissionId: SubmissionId;
  readonly decision: "verified" | "rejected";
  readonly reason?: RejectReason;
};

/**
 * The connector `onboarding-nanny` and `admin-verification` hold (01 §2.3). Every method is typed here and
 * none is implemented by this unit: the module-level binding fails closed, so no caller can begin moving
 * evidence before the reviewed unit lands.
 */
export type Verification = {
  getStatus(
    nannyId: UserId,
  ): Promise<Result<VerificationState, VerificationErrorDetails>>;
  submitSection(
    evidence: Evidence,
  ): Promise<Result<SectionState, VerificationErrorDetails>>;
  applyCheckResult(
    result: CheckResult,
  ): Promise<Result<VerificationState, VerificationErrorDetails>>;
  override(
    nannyId: UserId,
    decision: AdminDecision,
  ): Promise<Result<VerificationState, VerificationErrorDetails>>;
};

export type VerificationRegistry = {
  get(): Verification;
  set(next: Verification): void;
};
