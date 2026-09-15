// The closed purpose list (02 §4.1 `legal_documents` day-one slugs + `vaccination-status`, ADR-103 / 07 §2.7(a)).
// The boundary check `recordConsent` runs against this tuple; add-only.
import type { ConsentPurpose } from "../types";

export const CONSENT_PURPOSES = Object.freeze([
  "client-tos",
  "professional-tos",
  "privacy-policy",
  "biometric-notice",
  "code-of-conduct",
  "cookie-policy",
  "disclaimer",
  "parent-app-consent",
  "nanny-attestation",
  "media-consent",
  "agr14_nanny_child_add",
  "vaccination-status",
] as const satisfies ReadonlyArray<ConsentPurpose>);
