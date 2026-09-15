// 03 §4.2 — the vetting-providers contract types. Importer of the module: `verification` only.
import type {
  AdminId,
  ConsentRecordId,
  EvidenceId,
  SubmissionId,
  UserId,
} from "./ids";
import type { ISODate, Instant, Url } from "./scalars";

/** The three buckets of 01 §6.1 (fix: A-31); caps + MIME lists are `config/uploads.ts`. */
export type BucketKey =
  | "profile-pictures"
  | "verification-documents"
  | "development-images";

/** accepted set = config/vetting.ts `acceptedEvidence` */
export type EvidenceType =
  | "identity-document"
  | "selfie"
  | "dbs-certificate"
  | "dbs-update-service"
  | "right-to-work-passport"
  | "right-to-work-share-code"
  | "right-to-work-document";

export type DocumentRef = {
  readonly bucket: BucketKey;
  readonly path: string;
  readonly signedUrl: Url;
  readonly expiresAt: Instant;
};

export type Evidence = {
  readonly id: EvidenceId;
  readonly nannyId: UserId;
  readonly type: EvidenceType;
  readonly documents: ReadonlyArray<DocumentRef>;
  readonly declared: Readonly<Record<string, string>>;
  readonly consent: {
    readonly biometric?: ConsentRecordId;
    readonly updateService?: ConsentRecordId;
  };
  readonly submittedAt: Instant;
};

export type RejectReason =
  | "document-unreadable"
  | "mismatch"
  | "expired"
  | "adverse"
  | "unsupported-evidence";
/** Copy key for the nanny's guidance on a rejected section (04 §8 owns the copy). */
export type GuidanceKey = string;

export type CheckStatus =
  | { readonly kind: "pending" }
  | {
      readonly kind: "verified";
      readonly at: Instant;
      readonly expiresAt?: Instant;
    }
  | {
      readonly kind: "rejected";
      readonly reason: RejectReason;
      readonly guidanceKey: GuidanceKey;
    }
  | { readonly kind: "needs-admin"; readonly hint?: string };

export type ProviderId =
  | "stub-manual"
  | "admin-manual"
  | "ai-id-check"
  | "dbs-update-service"
  | "home-office-share-code"
  | (string & {});

export type Submission = {
  readonly submissionId: SubmissionId;
  readonly evidenceId: EvidenceId;
  readonly provider: ProviderId;
  readonly status: CheckStatus;
  readonly providerRef?: string;
};

export type ExtractedFields = {
  readonly surname?: string;
  readonly givenNames?: string;
  readonly dateOfBirth?: ISODate;
  readonly nationality?: string;
  readonly documentNumber?: string;
  readonly documentExpiry?: ISODate;
  readonly issuedAt?: ISODate;
  readonly disclosureLevel?: "standard" | "enhanced" | "enhanced-barred-lists";
  readonly barredListLines?: ReadonlyArray<string>;
  readonly selfieMatchConfidence?: number;
  readonly consistency: ReadonlyArray<{
    readonly field: string;
    readonly ok: boolean;
    readonly note?: string;
  }>;
  readonly raw?: Readonly<Record<string, unknown>>;
};

export type CheckResult = {
  readonly submissionId: SubmissionId;
  readonly status: CheckStatus;
  readonly checkedAt: Instant;
  readonly extracted?: ExtractedFields;
};

export type Expiry = {
  readonly expiresAt: Instant | null;
  readonly renewable: boolean;
  readonly source: "document" | "subscription" | "policy";
};

export type ManualDecision = {
  readonly submissionId: SubmissionId;
  readonly decision: "verified" | "rejected";
  readonly reason?: RejectReason;
  readonly actor: { readonly kind: "admin"; readonly id: AdminId };
  readonly note?: string;
  readonly expiresAt?: Instant;
};

export type ProviderRegistry = Readonly<Record<EvidenceType, ProviderId>>;
