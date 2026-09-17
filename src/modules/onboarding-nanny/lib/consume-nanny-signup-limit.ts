// 07 §8 row 2 — the identity-layer limit on nanny signup (S-X-19 / S-X-07): 3 / day per email hash **and**
// 5 / h per IP, both spent ahead of every write, so a throttled request creates no account, no consent row,
// no party row and sends no mail. Fails closed on a limiter outage (ADR-134). The refusal is the form's one
// generic line, never a different one (ADR-132's oracle argument applies to a throttle as much as a duplicate).
import { SECURITY } from "@/modules/config";
import { log, rateLimiter } from "@/modules/platform";
import type { Email } from "@/modules/shared-types";
import { callerIpKey } from "./caller-ip-key";
import { emailRateKey } from "./email-rate-key";

export async function consumeNannySignupLimit(email: Email, surface: string): Promise<boolean> {
  const results = [
    await rateLimiter.consume(`signup:${await emailRateKey(email)}`, SECURITY.rateLimits.signupPerEmail),
    await rateLimiter.consume(`signup-ip:${await callerIpKey()}`, SECURITY.rateLimits.signupPerIp),
  ];
  const consumed = results.find((result) => !result.ok) ?? results[0];
  if (consumed.ok) return true;
  if (consumed.error.code === "RATE_LIMITED") {
    log.warn("nanny signup over the limit; no account created", {
      module: "onboarding-nanny",
      action: "signUpNanny",
      surface,
    });
    return false;
  }
  log.error("nanny signup: the limiter did not answer; refusing to create", {
    module: "onboarding-nanny",
    action: "signUpNanny",
    alert: "ALERT_PROVIDER_DOWN",
    provider: "supabase",
    surface,
    reason: consumed.error.details?.reason ?? null,
  });
  return false;
}
