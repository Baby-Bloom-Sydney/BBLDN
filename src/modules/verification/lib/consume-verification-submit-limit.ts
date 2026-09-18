// 07 §8 row 11 — `SECURITY.rateLimits.verificationSubmissions`: 5 submissions per section per day, per user.
// Consumed before any upload so a loop cannot spend storage on refused attempts. Fails closed on a limiter
// outage (ADR-134: a mutating surface refuses rather than running unbounded).
//
// The section is a `WizardSection`, not a `VerificationSection`: 02 §4.3 counts **four** sections and row 11
// says "per section", so S-N-04's contact write sits in the same row and its own bucket. REVIEW-3 M-1 found it
// with no limiter at all — `saveVerificationContactAction` is a `"use server"` export, so the form is not the
// only caller and `user_profiles` was writable in a loop.
import { SECURITY } from "@/modules/config";
import { err, log, ok, rateLimiter } from "@/modules/platform";
import type { Result, UserId } from "@/modules/shared-types";
import type { VerificationErrorDetails, WizardSection } from "../types";

export async function consumeVerificationSubmitLimit(
  nannyId: UserId,
  section: WizardSection,
): Promise<Result<void, VerificationErrorDetails>> {
  const consumed = await rateLimiter.consume(
    `verification-submit:${section}:${nannyId}`,
    SECURITY.rateLimits.verificationSubmissions,
  );
  if (consumed.ok) return ok(undefined);
  if (consumed.error.code === "RATE_LIMITED") {
    log.warn("verification submission over the limit; nothing written", {
      module: "verification",
      action: "submitSection",
      section,
    });
    return err(
      "RATE_LIMITED",
      "You've sent this a few times today. Try again tomorrow.",
      {
        reason: "too-many-attempts",
      },
    );
  }
  log.error("verification submission: the limiter did not answer; refusing", {
    module: "verification",
    action: "submitSection",
    alert: "ALERT_PROVIDER_DOWN",
    provider: "supabase",
    section,
  });
  return err(
    "INTERNAL",
    "We couldn't save that just now. Try again in a moment.",
    {
      reason: "store-failed",
    },
  );
}
