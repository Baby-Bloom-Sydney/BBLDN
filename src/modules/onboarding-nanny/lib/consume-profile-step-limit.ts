// 07 §8 row 16 — S-N-18's per-user ceiling (`SECURITY.rateLimits.profileSteps`, 30 / min, 300 / day): every
// step is one authenticated write through `update_nanny_profile()`, and ADR-134's default is that a mutating
// surface refuses under a defined limit rather than running unbounded. Keyed on the session's user id — the
// caller is known, so the address hash is the wrong key. Fails closed on a limiter outage.
import { SECURITY } from "@/modules/config";
import { log, rateLimiter } from "@/modules/platform";
import type { UserId } from "@/modules/shared-types";

export async function consumeProfileStepLimit(
  userId: UserId,
): Promise<boolean> {
  const consumed = await rateLimiter.consume(
    `profile-step:${userId}`,
    SECURITY.rateLimits.profileSteps,
  );
  if (consumed.ok) return true;
  if (consumed.error.code === "RATE_LIMITED") {
    log.warn("profile step over the limit; nothing written", {
      module: "onboarding-nanny",
      action: "saveNannyProfileStep",
      surface: "S-N-18",
    });
    return false;
  }
  log.error("profile step: the limiter did not answer; refusing", {
    module: "onboarding-nanny",
    action: "saveNannyProfileStep",
    alert: "ALERT_PROVIDER_DOWN",
    provider: "supabase",
    surface: "S-N-18",
    reason: consumed.error.details?.reason ?? null,
  });
  return false;
}
