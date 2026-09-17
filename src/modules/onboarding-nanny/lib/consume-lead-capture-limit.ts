// 07 §8 row 16 — the per-address half of N1's budget (`SECURITY.rateLimits.funnelLeadPerEmail`, 10 / day per
// email hash), spent beside row 2's per-caller `funnelStep`. 04 §4.1 row 5 makes the "sign in instead" answer a
// deliberate reveal of whether an address has an account; the per-caller budget bounds a burst, this bounds a
// target list — the same address cannot be asked about more than ten times a day, whoever asks. Fails closed
// on a limiter outage (ADR-134); returns a boolean and the caller supplies the one generic line (ADR-132).
import { SECURITY } from "@/modules/config";
import { log, rateLimiter } from "@/modules/platform";
import type { Email } from "@/modules/shared-types";
import { emailRateKey } from "./email-rate-key";

export async function consumeLeadCaptureLimit(email: Email): Promise<boolean> {
  const consumed = await rateLimiter.consume(
    `lead-capture:${await emailRateKey(email)}`,
    SECURITY.rateLimits.funnelLeadPerEmail,
  );
  if (consumed.ok) return true;
  if (consumed.error.code === "RATE_LIMITED") {
    log.warn("lead capture over the per-address limit; nothing written", {
      module: "onboarding-nanny",
      action: "saveNannyApplication",
      surface: "S-X-15",
    });
    return false;
  }
  log.error("lead capture: the limiter did not answer; refusing", {
    module: "onboarding-nanny",
    action: "saveNannyApplication",
    alert: "ALERT_PROVIDER_DOWN",
    provider: "supabase",
    surface: "S-X-15",
    reason: consumed.error.details?.reason ?? null,
  });
  return false;
}
