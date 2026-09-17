// 07 §8 row 2 — the identity-layer limit on S-X-05 / S-X-06 parent signup.
//
// **Why it exists.** `signUpParentAction` ran `auth.signUp` → `recordSignupConsent` → `parentProfileStore.create`
// → `sendParentWelcome` with no ceiling: an anonymous `"use server"` POST that writes an account, consent rows,
// a profile row and an outbound email, unbounded. REVIEW-2 found `SECURITY.rateLimits.signupPerEmail` declared in
// config with zero call sites. Row 2 asks for 3 a day per email hash; that is the half keyed on something this
// action holds (the `+ IP` half of row 2 belongs to the edge layer in front of the function).
//
// **Fails closed on a limiter outage** (ADR-134: money and auth surfaces refuse). Fail-open here would restore
// exactly the unbounded account creation the limit exists to stop, and every account created is a valid actor for
// the surfaces behind the sign-in wall.
//
// **The refusal is the form's one generic line**, never a different one: a throttle that spoke differently from
// an outage — or from a duplicate address — would be the account-enumeration oracle ADR-132 forbids, back through
// the side door. That is why this returns a boolean and the caller supplies the sentence.
import { SECURITY } from "@/modules/config";
import { log, rateLimiter } from "@/modules/platform";
import type { Email } from "@/modules/shared-types";
import { emailRateKey } from "./email-rate-key";

export async function consumeSignupLimit(email: Email): Promise<boolean> {
  const consumed = await rateLimiter.consume(
    `signup:${await emailRateKey(email)}`,
    SECURITY.rateLimits.signupPerEmail,
  );
  if (consumed.ok) return true;
  if (consumed.error.code === "RATE_LIMITED") {
    // The key is never logged (07 §8) — it is derived from an address.
    log.warn("signup over the limit; no account created", {
      module: "onboarding-parent",
      action: "signUpParent",
      surface: "S-X-06",
    });
    return false;
  }
  log.error("signup: the limiter did not answer; refusing to create", {
    module: "onboarding-parent",
    action: "signUpParent",
    alert: "ALERT_PROVIDER_DOWN",
    provider: "supabase",
    surface: "S-X-06",
    reason: consumed.error.details?.reason ?? null,
  });
  return false;
}
