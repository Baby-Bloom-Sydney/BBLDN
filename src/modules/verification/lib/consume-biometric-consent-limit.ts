// 07 §8 row 11's numbers, in a bucket of their own — S-N-10's standalone biometric-notice consent.
//
// `recordBiometricConsentAction` writes an AGR-04 consent record (02 §4.1 `biometric_consent_records`), and
// REVIEW-3 M-1 found it with no limiter: a `"use server"` export that appends a legal record per call. Its own
// key rather than the section's, and the reason is the wizard: the notice is the gate in front of S-N-05, so
// spending the identity section's five-a-day on opening the notice would close the step the notice exists for.
//
// Keyed on the session's user id — the caller is known. Fails closed: `verificationSubmissions` is not on
// `SECURITY.failOpenOnLimiterOutage` (ADR-134).
import { SECURITY } from "@/modules/config";
import { err, log, ok, rateLimiter } from "@/modules/platform";
import type { Result, UserId } from "@/modules/shared-types";
import type { VerificationErrorDetails } from "../types";

export async function consumeBiometricConsentLimit(
  nannyId: UserId,
): Promise<Result<void, VerificationErrorDetails>> {
  const consumed = await rateLimiter.consume(
    `biometric-consent:${nannyId}`,
    SECURITY.rateLimits.verificationSubmissions,
  );
  if (consumed.ok) return ok(undefined);
  if (consumed.error.code === "RATE_LIMITED") {
    log.warn("biometric consent over the limit; nothing recorded", {
      module: "verification",
      action: "recordBiometricConsent",
      surface: "S-N-10",
    });
    return err(
      "RATE_LIMITED",
      "You've sent this a few times today. Try again tomorrow.",
      { reason: "too-many-attempts" },
    );
  }
  log.error("biometric consent: the limiter did not answer; refusing", {
    module: "verification",
    action: "recordBiometricConsent",
    alert: "ALERT_PROVIDER_DOWN",
    provider: "supabase",
    surface: "S-N-10",
  });
  return err(
    "INTERNAL",
    "We couldn't save that just now. Try again in a moment.",
    { reason: "store-failed" },
  );
}
