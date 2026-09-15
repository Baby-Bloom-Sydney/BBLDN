// platform/consent — the consent connector's types (02 R-4; 01 §2.4 / §7 "consent home"; 07 §2.6 / §2.7(a) /
// §2.9). Rows mirror 02 §4.1 `consent_records` · `biometric_consent_records` · `cookie_consent_records`.
// Callers: `onboarding-*`, `verification`, `app/child-linking`, the `public-site` cookie route; the events `meta`
// sink reads `hasMarketing`. The inside behind `ConsentStore` is S5 / Phase 3; `memoryConsentStore` is the stub.
import type {
  ConsentRecordId,
  EnumValue,
  Instant,
  Result,
  UnitOfWork,
  UserId,
  Uuid,
  VisitorId,
} from "@/modules/shared-types";
import type { Log } from "../log/types";

/** 02 §4.1 `legal_documents` day-one slugs (Phase 3 seeds the bodies; the ids are the contract). */
export type LegalDocumentId =
  | "client-tos"
  | "professional-tos"
  | "privacy-policy"
  | "biometric-notice"
  | "code-of-conduct"
  | "cookie-policy"
  | "disclaimer"
  | "parent-app-consent"
  | "nanny-attestation"
  | "media-consent"
  | "agr14_nanny_child_add";

/**
 * What a `consent_records` row is *for*: a legal document accepted, or the one non-document purpose the
 * foundations name — `vaccination-status` (ADR-103; 07 §2.7(a): its own purpose, a distinct explicit tick).
 * Values: `CONSENT_PURPOSES`.
 */
export type ConsentPurpose = LegalDocumentId | "vaccination-status";

/** `AGR-nn` (02 §4.1 `agreement_id`). */
export type AgreementId = `AGR-${string}`;

/** The two customer roles of `user_role` (02 §3) — an admin never consents on a party's behalf. */
export type ConsentParty = Exclude<EnumValue<"user_role">, "admin">;

/** Stored on the row (02 §4.1: `ip_address` · `user_agent` · `session_id`) — never logged (01 §4b). */
export type ConsentContext = {
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly sessionId?: string;
};

export type DocumentVersion = {
  readonly id: LegalDocumentId;
  readonly version: number;
};

type ConsentInputBase = {
  readonly userId: UserId;
  readonly party: ConsentParty;
  readonly agreementId: AgreementId;
  readonly checkpointId: string;
  readonly checkpointText: string;
  readonly context: ConsentContext;
  /** the child for per-child consents (02 `related_entity_id`) */
  readonly relatedEntityId?: Uuid;
};

/** A document purpose carries the document accepted; `vaccination-status` (ADR-103) carries none. */
export type ConsentPurposeInput =
  | { readonly purpose: LegalDocumentId; readonly document: DocumentVersion }
  | { readonly purpose: "vaccination-status"; readonly document?: never };

export type RecordConsentInput = ConsentInputBase &
  ConsentPurposeInput & {
    /** a decline is a new row with `false` (02 §4.1 "a decline is a new row") */
    readonly consentGiven: boolean;
  };

/** 07 §2.8: an *informed action* (parent-app, nanny-attestation) — a fairness record, always `consentGiven: true`; document nullable (02 §4.1). */
export type InformedActionInput = ConsentInputBase & {
  readonly purpose: LegalDocumentId;
  readonly document?: DocumentVersion;
};

export type ConsentRecord = ConsentInputBase & {
  readonly id: ConsentRecordId;
  readonly purpose: ConsentPurpose;
  readonly document?: DocumentVersion;
  readonly consentGiven: boolean;
  readonly createdAt: Instant;
};

/** 02 §4.1 `biometric_consent_records` (AGR-04; nanny only — ADR-071). */
export type BiometricConsentInput = {
  readonly userId: UserId;
  readonly noticeVersion: number;
  readonly noticeOpenedAt: Instant;
  readonly noticeScrollCompletedAt: Instant;
  readonly checkboxesEnabledAt: Instant;
  readonly noticeTimeSpentSeconds: number;
  readonly checkboxTimestamps: Readonly<Record<string, Instant>>;
  /** both from `config`, no DDL defaults (L4) */
  readonly aiProviderDisclosed: string;
  readonly processingLocationDisclosed: string;
};

export type BiometricConsentRecord = BiometricConsentInput & {
  readonly id: ConsentRecordId;
  readonly createdAt: Instant;
};

export type CookieChoice = EnumValue<"cookie_choice">;

/** 02 §4.1 `cookie_consent_records`; `marketingEnabled` gates the pixel + CAPI (ADR-055). */
export type CookieConsentInput = {
  readonly visitorId: VisitorId;
  readonly userId?: UserId;
  readonly choice: CookieChoice;
  readonly analyticsEnabled: boolean;
  readonly marketingEnabled: boolean;
  readonly context: ConsentContext;
};

export type CookieConsentRecord = CookieConsentInput & {
  readonly id: ConsentRecordId;
  readonly expiryDate: Instant;
  readonly supersededBy?: ConsentRecordId;
  readonly createdAt: Instant;
};

/** Who `hasMarketing` is asked about (03 §9.5 `ConsentReader.hasMarketing(subject)`). */
export type ConsentSubject =
  | { readonly kind: "user"; readonly id: UserId }
  | { readonly kind: "visitor"; readonly id: VisitorId };

/** `getPolicy(purpose)`: the current document version (if any) and whether re-acceptance is pending. */
export type CurrentDocument = DocumentVersion &
  (
    | { readonly requiresReacceptance: false }
    | {
        readonly requiresReacceptance: true;
        readonly reacceptanceDeadline: Instant;
      }
  );

export type ConsentPolicy = {
  readonly purpose: ConsentPurpose;
  readonly currentDocument?: CurrentDocument;
};

/** `details.reason` of a `VALIDATION` from the connector. */
export type ConsentErrorDetails = {
  readonly reason:
    | "document-required"
    | "document-not-current"
    | "scroll-before-open"
    | "unknown-purpose";
};

/** The read half the events seam injects (03 §9.5; 07 §2.9: "the only gate"). */
export type ConsentReader = {
  hasMarketing(subject: ConsentSubject): Promise<Result<boolean>>;
};

/** 01 §2.4 / 02 R-4 — the six methods, plus `hasConsent` (07 §2.7(a) "the field is written only when that record exists"). */
export type Consent = ConsentReader & {
  recordConsent(
    input: RecordConsentInput,
    opts?: { readonly uow?: UnitOfWork },
  ): Promise<Result<ConsentRecord, ConsentErrorDetails>>;
  recordInformedAction(
    input: InformedActionInput,
    opts?: { readonly uow?: UnitOfWork },
  ): Promise<Result<ConsentRecord, ConsentErrorDetails>>;
  recordBiometricConsent(
    input: BiometricConsentInput,
    opts?: { readonly uow?: UnitOfWork },
  ): Promise<Result<BiometricConsentRecord, ConsentErrorDetails>>;
  recordCookieConsent(
    input: CookieConsentInput,
  ): Promise<Result<CookieConsentRecord>>;
  getPolicy(
    purpose: ConsentPurpose,
  ): Promise<Result<ConsentPolicy, ConsentErrorDetails>>;
  /** latest row for `(userId, purpose)` says `consentGiven: true` */
  hasConsent(userId: UserId, purpose: ConsentPurpose): Promise<Result<boolean>>;
};

/**
 * The port behind the connector (the three append-only tables + `legal_documents` reads). Implemented by the
 * boot code over `auth`'s data port (`recordCookieConsent` is a named service-role use — 07 §5.1 rule 5);
 * `memoryConsentStore` (`consent.stub.ts`) is the stub.
 */
export type ConsentStore = {
  insertConsent(
    row: ConsentRecord,
    opts?: { readonly uow?: UnitOfWork },
  ): Promise<Result<void>>;
  latestConsent(
    userId: UserId,
    purpose: ConsentPurpose,
  ): Promise<Result<ConsentRecord | null>>;
  insertBiometric(
    row: BiometricConsentRecord,
    opts?: { readonly uow?: UnitOfWork },
  ): Promise<Result<void>>;
  /** inserts the new row and sets `superseded_by` on the previous current row for the visitor (the one UPDATE) */
  insertCookie(
    row: CookieConsentRecord,
  ): Promise<Result<{ readonly supersededId?: ConsentRecordId }>>;
  currentCookie(
    subject: ConsentSubject,
  ): Promise<Result<CookieConsentRecord | null>>;
  currentDocument(id: LegalDocumentId): Promise<Result<CurrentDocument | null>>;
};

/** The stub's observable state (`consent.stub.ts`). */
export type MemoryConsentStore = ConsentStore & {
  readonly consents: ReadonlyArray<ConsentRecord>;
  readonly biometrics: ReadonlyArray<BiometricConsentRecord>;
  readonly cookies: ReadonlyArray<CookieConsentRecord>;
};

export type ConsentDeps = {
  readonly store: ConsentStore;
  readonly clock?: () => Instant;
  readonly newId?: () => ConsentRecordId;
  /** `SECURITY.retention.cookieExpiryDays` (07 §6.2 row 12) */
  readonly cookieExpiryDays: number;
  /** `consent.updated` goes through the events connector (03 §9.3 Platform group); optional so the stub wiring stays a leaf */
  readonly onCookieConsent?: (
    record: CookieConsentRecord,
  ) => Promise<Result<unknown>>;
  /** a failed `onCookieConsent` is logged `warn` (the record stands), never returned to the caller */
  readonly log?: Log;
};
