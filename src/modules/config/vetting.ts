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
    L4_FULLY_VERIFIED: Object.freeze([
      "identity-document",
      "selfie",
      "dbs-certificate",
      "right-to-work-passport",
    ]),
  } satisfies Record<VerificationLevelKey, ReadonlyArray<EvidenceType>>), // [unverified] — level effect of right-to-work is B-20
  expiryLeadDays: 30, // `vetting-expiry` warns this far ahead — [unverified]
  retryBudget: 3, // provider-unavailable → PROVIDER_ERROR after this many (03 §4.2; 03 §12 item 29)
  attemptsCap: 3, // per section per day → `review` (07 §8 row 11) — [unverified]
});
