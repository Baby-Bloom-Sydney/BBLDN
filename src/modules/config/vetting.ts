// 01 §3.1 — provider bindings (03 §4.4: every EvidenceType → stub-manual day one, T-3.1), the accepted evidence set
// (03 §4.2 `ACCEPTED_EVIDENCE`; 02 §3 identity_evidence_type "accepted list is config"), required checks per level
// (03 §4.3), expiry lead time for `vetting-expiry`, the retry budget and the per-section attempts cap (07 §8 row 11).
import type {
  EvidenceType,
  VerificationLevelKey,
  VettingProviderId,
} from "./types";

const ACCEPTED_EVIDENCE = Object.freeze([
  "identity-document",
  "selfie",
  "dbs-certificate",
  "dbs-update-service",
  "right-to-work-passport",
  "right-to-work-share-code",
  "right-to-work-document",
] as const satisfies ReadonlyArray<EvidenceType>);

export const VETTING = Object.freeze({
  acceptedEvidence: ACCEPTED_EVIDENCE,
  identityEvidence: Object.freeze([
    "passport",
    "uk_driving_licence",
    "evisa_share_code",
  ] as const),
  providers: Object.freeze({
    "identity-document": "stub-manual",
    selfie: "stub-manual",
    "dbs-certificate": "stub-manual",
    "dbs-update-service": "stub-manual",
    "right-to-work-passport": "stub-manual",
    "right-to-work-share-code": "stub-manual",
    "right-to-work-document": "stub-manual",
  } satisfies Record<EvidenceType, VettingProviderId>),
  requiredChecksByLevel: Object.freeze({
    L0_SIGNED_UP: Object.freeze([]),
    L1_REGISTERED: Object.freeze([]),
    L2_ID_VERIFIED: Object.freeze(["identity-document", "selfie"]),
    L3_PROVISIONALLY_VERIFIED: Object.freeze([
      "identity-document",
      "selfie",
      "dbs-certificate",
    ]),
    // ADR-153: right-to-work is a parallel section with no level effect — none of its three types is in any
    // level's list. This record IS the gate: reversing the ruling is one line here, read by `deriveLevel` (2c).
    L4_FULLY_VERIFIED: Object.freeze([
      "identity-document",
      "selfie",
      "dbs-certificate",
    ]),
  } satisfies Record<VerificationLevelKey, ReadonlyArray<EvidenceType>>),
  /** ADR-153: 02 §3 `rtw_evidence_type` ↔ the 03 §4.2 evidence type each one is submitted as. */
  rightToWorkEvidence: Object.freeze({
    british_irish_passport: "right-to-work-passport",
    share_code: "right-to-work-share-code",
    immigration_document: "right-to-work-document",
  } satisfies Record<
    "british_irish_passport" | "share_code" | "immigration_document",
    EvidenceType
  >),
  /** 02 §4.3 "`dbs_certificate_number` (config regex)": a DBS certificate number is 12 digits (DBS Update Service). [unverified] */
  dbsCertificateNumber: Object.freeze({ pattern: "^[0-9]{12}$", length: 12 }),
  /** 04 §6.3 S-N-07 "share-code field with a format hint": a Home Office share code is 9 letters and digits. [unverified] */
  shareCode: Object.freeze({ pattern: "^[A-Z0-9]{9}$", length: 9 }),
  /** S-N-08 (04 §4.1 row 13 "→ S-N-09 after 2 s"; 04 §6.3 "a polite 'still checking' line at most once a minute"). */
  processing: Object.freeze({
    pollMs: 2000,
    routeAfterMs: 2000,
    stillCheckingEveryMs: 60000,
  }),
  /**
   * 02 §4.1 `biometric_consent_records.ai_provider_disclosed` / `processing_location_disclosed` — "both from config,
   * no DDL defaults" (L4). Day one no AI processor is bound (kickoff §4.4; ADR-154): the notice says so. The day
   * `ai-id-check` is bound these two lines change with it (07 §2.6, §11 item 2).
   */
  biometricNotice: Object.freeze({
    aiProviderDisclosed: "none — a person reviews your documents",
    processingLocationDisclosed: "United Kingdom",
  }),
  expiryLeadDays: 30, // `vetting-expiry` warns this far ahead — [unverified]
  retryBudget: 3, // provider-unavailable → PROVIDER_ERROR after this many (03 §4.2; 03 §12 item 29)
  attemptsCap: 3, // identity attempts per section → `review` (07 §8 row 11) — [unverified]
});
