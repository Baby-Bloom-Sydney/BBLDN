// AGR-01, client registration (04 §6.1 S-X-06 "consents"; 07 §2 row F): one tick, two documents — `client-tos` and
// `privacy-policy` — recorded as two `consent_records` rows through `platform/consent` (02 §4.1: "called by
// `onboarding-*`"), each against the document's current version (`getPolicy`). The checkpoint text is the tick's
// own wording; the row keeps it verbatim so the evidence reads as the parent saw it.
import { consent } from "@/modules/platform";
import { ok } from "@/modules/platform";
import type { LegalDocumentId } from "@/modules/platform";
import type { Result, UserId } from "@/modules/shared-types";

const AGREEMENT_ID = "AGR-01" as const;
const CHECKPOINT_ID = "agr01_terms_acceptance";
const CHECKPOINT_TEXT =
  "I have read and agree to the client terms and the privacy policy.";
const DOCUMENTS: ReadonlyArray<LegalDocumentId> = [
  "client-tos",
  "privacy-policy",
];

export async function recordSignupConsent(
  userId: UserId,
): Promise<Result<void>> {
  for (const purpose of DOCUMENTS) {
    const policy = await consent.getPolicy(purpose);
    if (!policy.ok) return policy;
    const document = policy.value.currentDocument;
    if (document === undefined)
      return {
        ok: false,
        error: {
          code: "INTERNAL",
          message: "We couldn't record your agreement.",
          details: { reason: "document-required", purpose },
        },
      };
    const recorded = await consent.recordConsent({
      userId,
      party: "parent",
      agreementId: AGREEMENT_ID,
      checkpointId: CHECKPOINT_ID,
      checkpointText: CHECKPOINT_TEXT,
      context: {},
      purpose,
      // Ruling 5.1 — the whole triple, so the row names the exact words she was shown.
      document: {
        id: document.id,
        version: document.version,
        contentHash: document.contentHash,
      },
      consentGiven: true,
    });
    if (!recorded.ok) return recorded;
  }
  return ok(undefined);
}
