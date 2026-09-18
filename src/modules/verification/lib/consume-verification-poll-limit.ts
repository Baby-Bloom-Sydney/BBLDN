// `SECURITY.rateLimits.verificationPolls` — S-N-08's poll (07 §8 has no row; the row is owed, REVIEW-3 R-3).
//
// `processVerificationAction` claims the section, runs the check and applies the outcome, so it is a write and
// REVIEW-3 M-1 found it unbounded. It is also the one action a screen calls on a timer (`ProcessingStep`, every
// `VETTING.wizard.pollMs`), which is why it does not take row 11's five-a-day: that budget would refuse the
// wizard on its first minute. `verificationPolls` is sized above the honest rate and below a runaway loop.
//
// Keyed on the session's user id. Fails closed (not on `SECURITY.failOpenOnLimiterOutage`, ADR-134).
import { SECURITY } from "@/modules/config";
import { err, log, ok, rateLimiter } from "@/modules/platform";
import type { Result, UserId } from "@/modules/shared-types";
import type { VerificationErrorDetails } from "../types";

export async function consumeVerificationPollLimit(
  nannyId: UserId,
): Promise<Result<void, VerificationErrorDetails>> {
  const consumed = await rateLimiter.consume(
    `verification-poll:${nannyId}`,
    SECURITY.rateLimits.verificationPolls,
  );
  if (consumed.ok) return ok(undefined);
  if (consumed.error.code === "RATE_LIMITED") {
    log.warn("verification poll over the limit; nothing claimed", {
      module: "verification",
      action: "processVerification",
      surface: "S-N-08",
    });
    return err(
      "RATE_LIMITED",
      "We're still checking. Give it a moment and refresh.",
      { reason: "too-many-attempts" },
    );
  }
  log.error("verification poll: the limiter did not answer; refusing", {
    module: "verification",
    action: "processVerification",
    alert: "ALERT_PROVIDER_DOWN",
    provider: "supabase",
    surface: "S-N-08",
  });
  return err(
    "INTERNAL",
    "We couldn't save that just now. Try again in a moment.",
    { reason: "store-failed" },
  );
}
