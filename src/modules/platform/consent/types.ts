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
 * What a `consent_records` row is *for*: a legal document accepted, or one of the non-document purposes
 * 07 §2.7(a) names — `vaccination-status` (ADR-103: its own purpose, a distinct explicit tick), `marketing`
 * and `cookie`. **Derived from the `consent_purpose` enum register** (ADR-131 (2); `0017` gave the table the
 * column), so the union here and the database's labels cannot drift: `enum-ordinals.test.ts` judges the
 * register against the applied schema, and `tsc` judges this against the register.
 */
export type ConsentPurpose = EnumValue<"consent_purpose">;

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

/**
 * What a signature is bound to (**ruling 5.1**, L-009 `3c`). The version says *which row*; the content hash says
 * *which words*. Both travel, always, because either alone fails the requirement: a version is a pointer that a
 * later edit could re-point, and a hash alone cannot be ordered, cited to a user, or keyed on for re-acceptance.
 * `0026` makes the pair a single composite foreign key to `legal_documents (document_id, version, content_hash)`,
 * so the database refuses a signature naming words that version never had — the type here is the same claim,
 * made where a caller can see it.
 */
export type DocumentVersion = {
  readonly id: LegalDocumentId;
  readonly version: number;
  /** `legal_documents.content_hash` of the version accepted — the exact words, not a pointer at them. */
  readonly contentHash: string;
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
  /** ruling 5.1 — Art 9(2)(a) consent that cannot be shown to attach to the notice she scrolled is not explicit. */
  readonly noticeContentHash: string;
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

/**
 * What a visitor currently has on record, narrowed to what a surface may be told (L-009 `3g`, FATE `10.22`).
 *
 * Deliberately **not** `CookieConsentRecord`: that carries `visitorId`, `userId` and the `ConsentContext`'s IP,
 * user agent and session — none of which a cookie-preference screen needs, and the visitor id in particular is
 * HttpOnly precisely so a response never hands it back (`3e`). A route given only these five fields cannot echo
 * an identifier by forgetting not to.
 *
 * An expired record answers `null`, never a stale choice: 07 §6.2 row 12 re-prompts after the window, and a
 * screen showing a lapsed answer as current would be showing consent that no longer exists.
 */
export type CookieConsentState = {
  readonly choice: CookieChoice;
  readonly analyticsEnabled: boolean;
  readonly marketingEnabled: boolean;
  readonly recordedAt: Instant;
  readonly expiresAt: Instant;
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

/**
 * **Ruling 5.2** (L-009 `3c`): annual renewal re-asks only for the purposes whose *document* changed since the
 * user's last signature; the unchanged ones are carried forward, and the carry is itself recorded.
 *
 * Why not re-ask for everything: a consent request a user has no reason to act on is the one that teaches her to
 * click through consent requests, and Art 7(1) already holds the earlier signature — it does not expire because
 * a year passed, it expires because the words changed. Re-asking for unchanged words would also destroy the one
 * fact the trail is for: it would overwrite "she accepted THESE words on THAT day" with a later date for the
 * same words. What the year buys is the *check*, not a new signature.
 *
 * Why the carry is recorded rather than inferred: without a row, "no new consent this year" and "we never ran
 * the renewal" look identical a year later, which is precisely the question an accountability request asks.
 */
export type RenewalItem = {
  readonly purpose: LegalDocumentId;
  /** what the document says now */
  readonly current: CurrentDocument;
  /** what she last accepted, absent when she never has */
  readonly signed?: DocumentVersion;
};

export type RenewalPlan = {
  /** the purposes to put back in front of her, because the words are not the ones she accepted */
  readonly reAsk: ReadonlyArray<RenewalItem>;
  /** the purposes whose words are unchanged: carried forward, each to be recorded as a carry */
  readonly carryForward: ReadonlyArray<RenewalItem>;
  /** a document purpose with no current version at all — the seed is missing, which is an outage, not a renewal */
  readonly unavailable: ReadonlyArray<LegalDocumentId>;
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
  /**
   * FATE `10.22` — what this subject chose, or `null` if she has not chosen or her record has lapsed. The
   * banner and the preference screen read this rather than the browser's mirror of it, so what she is shown is
   * the row, not a cookie that could disagree with it.
   */
  currentCookieChoice(
    subject: ConsentSubject,
  ): Promise<Result<CookieConsentState | null>>;
  /** latest row for `(userId, purpose)` says `consentGiven: true` */
  hasConsent(userId: UserId, purpose: ConsentPurpose): Promise<Result<boolean>>;
  /**
   * Ruling 5.2 — what this user's annual renewal must actually ask. Pure read: it writes nothing, so the caller
   * decides what to do with a plan it cannot show her right now.
   */
  dueForRenewal(
    userId: UserId,
    purposes?: ReadonlyArray<LegalDocumentId>,
  ): Promise<Result<RenewalPlan, ConsentErrorDetails>>;
  /**
   * FATE `10.19` / `07.72` / `08.34` — the `audit-consent-expiry` cron's inside. Audits the *documents*: a
   * day-one purpose with no current version at all, and a re-acceptance deadline that has gone by.
   */
  auditExpiry(
    now: Instant,
    purposes?: ReadonlyArray<LegalDocumentId>,
  ): Promise<Result<{ readonly handled: number; readonly skipped: number }>>;
  /**
   * FATE `10.18` — the **per-user** half `3c` left unbuilt, because it needed a store read that did not exist.
   * One pass per renewable purpose over the subjects whose newest row predates `CONSENT.renewalCheckMonths`:
   * a purpose whose words have not moved is **carried forward and the carry is recorded** (ADR-174), and one
   * whose hash has moved — or that she declined last time — is counted as owed a re-ask and nothing is written,
   * because a row saying we asked her would be false until a surface actually has.
   */
  sweepRenewals(now: Instant): Promise<Result<RenewalSweepSummary>>;
};

/**
 * What one sweep run did. `carried` and `reAsk` are deliberately separate numbers rather than one "handled":
 * a carry is work **completed** and a re-ask is work **outstanding**, and the second is the one an operator has
 * to act on — a re-ask count that stays high for a week is a document whose new words nobody is putting in
 * front of anybody.
 */
export type RenewalSweepSummary = {
  /** subjects examined across all renewable purposes (a person due for two purposes counts twice) */
  readonly checked: number;
  /** carry-forward rows written (ADR-174: the evidence that the check ran) */
  readonly carried: number;
  /** subject × purpose pairs whose words moved, or that were declined last time — owed a re-ask */
  readonly reAsk: number;
  /** subject × purpose pairs skipped because the document has no current version at all (an outage) */
  readonly unavailable: number;
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
  /**
   * FATE `10.18` (L-009 `3g`) — the subjects whose newest row for `purpose` is older than `before`, i.e. who is
   * due the **annual check**. It answers only that cheap half; whether each is re-asked or carried forward is
   * decided per person on the content hash by `dueForRenewal`, because ADR-173's binding rule lives in one
   * place. `0029`'s `consent_subjects_due_for_renewal` is the read; the stub does the same thing in memory.
   */
  subjectsDueForRenewal(input: {
    readonly purpose: LegalDocumentId;
    readonly before: Instant;
    readonly limit: number;
  }): Promise<Result<ReadonlyArray<UserId>>>;
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
