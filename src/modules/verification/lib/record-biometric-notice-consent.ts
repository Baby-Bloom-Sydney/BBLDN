// AGR-04 (07 §2.6; 02 §4.1 `biometric_consent_records` + a `consent_records` row with purpose `biometric-notice`):
// the one mechanism behind both surfaces — S-N-05's tick and the standalone S-N-10 page (stocktake 05 Q6
// resolved: one recorder, two entries). The scroll-gated evidence travels from the notice component; the two
// disclosures are config (`VETTING.biometricNotice`). Without a current notice document there is nothing to
// consent to, and the answer says so (kickoff §6: nothing real before `10.01`).
import { VETTING } from "@/modules/config";
import { consent, err, ok } from "@/modules/platform";
import type { ConsentRecordId, Result, UserId } from "@/modules/shared-types";
import type { NoticeEvidence, VerificationErrorDetails } from "../types";

const AGREEMENT_ID = "AGR-04" as const;
const CHECKPOINT_ID = "agr04_biometric_consent";
const CHECKPOINT_TEXT =
  "I have read the notice and I consent to my identity document and selfie being used to confirm who I am.";

export async function recordBiometricNoticeConsent(
  userId: UserId,
  evidence: NoticeEvidence,
): Promise<Result<ConsentRecordId, VerificationErrorDetails>> {
  const policy = await consent.getPolicy("biometric-notice");
  if (!policy.ok || policy.value.currentDocument === undefined)
    return err("VALIDATION", "The notice isn't available yet.", {
      reason: "notice-unavailable",
    });
  const document = policy.value.currentDocument;
  const biometric = await consent.recordBiometricConsent({
    userId,
    noticeVersion: document.version,
    // Ruling 5.1 — Art 9(2)(a) consent binds to the notice she actually scrolled, not to a version number.
    noticeContentHash: document.contentHash,
    noticeOpenedAt: evidence.openedAt,
    noticeScrollCompletedAt: evidence.scrollCompletedAt,
    checkboxesEnabledAt: evidence.checkboxesEnabledAt,
    noticeTimeSpentSeconds: evidence.timeSpentSeconds,
    checkboxTimestamps: evidence.checkboxTimestamps,
    aiProviderDisclosed: VETTING.biometricNotice.aiProviderDisclosed,
    processingLocationDisclosed:
      VETTING.biometricNotice.processingLocationDisclosed,
  });
  if (!biometric.ok)
    return err("INTERNAL", "We couldn't record your consent.", {
      reason: "store-failed",
    });
  const recorded = await consent.recordConsent({
    userId,
    party: "nanny",
    agreementId: AGREEMENT_ID,
    checkpointId: CHECKPOINT_ID,
    checkpointText: CHECKPOINT_TEXT,
    context: {},
    purpose: "biometric-notice",
    document: {
      id: document.id,
      version: document.version,
      contentHash: document.contentHash,
    },
    consentGiven: true,
  });
  if (!recorded.ok)
    return err("INTERNAL", "We couldn't record your consent.", {
      reason: "store-failed",
    });
  return ok(recorded.value.id);
}
