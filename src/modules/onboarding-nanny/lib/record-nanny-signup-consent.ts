// AGR-02, professional registration (04 §4.1 row 7 "AGR-02 consent (E&W text, T-3.3)"; 07 §2 row F): one tick,
// two documents — `professional-tos` and `privacy-policy` — recorded as two `consent_records` rows through
// `platform/consent` (02 §4.1: "called by `onboarding-*`"), each against the document's current version. The
// checkpoint text is the tick's own wording so the evidence reads as she saw it.
import { consent, ok } from "@/modules/platform";
import type { LegalDocumentId } from "@/modules/platform";
import type { Result, UserId } from "@/modules/shared-types";

const AGREEMENT_ID = "AGR-02" as const;
const CHECKPOINT_ID = "agr02_terms_acceptance";
const CHECKPOINT_TEXT =
  "I have read and agree to the professional terms and the privacy policy.";
const DOCUMENTS: ReadonlyArray<LegalDocumentId> = ["professional-tos", "privacy-policy"];

export async function recordNannySignupConsent(userId: UserId): Promise<Result<void>> {
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
      party: "nanny",
      agreementId: AGREEMENT_ID,
      checkpointId: CHECKPOINT_ID,
      checkpointText: CHECKPOINT_TEXT,
      context: {},
      purpose,
      document: { id: document.id, version: document.version },
      consentGiven: true,
    });
    if (!recorded.ok) return recorded;
  }
  return ok(undefined);
}
