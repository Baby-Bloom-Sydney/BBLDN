// 07 §8 row 3 — the identity-layer limit on S-X-08's sign-in.
//
// **Why it exists.** `signInAction` called `auth.signIn` straight after the zod parse, so password guessing
// against a known address had no ceiling in this application at all. Supabase Auth's own limits are project- and
// IP-scoped and outside this app's sight; row 3's "5 / 15 min per email hash" is the per-address control, and it
// is the half the app owns. REVIEW-2 found it missing: `SECURITY.rateLimits.authPerEmail` existed with one call
// site (the reset request) and none here.
//
// **ADR-134 is only meaningful if a limiter runs.** "Auth routes fail closed on a limiter outage" says nothing
// about a route with no limiter, which is why this is a control gap rather than a policy one. On an outage this
// refuses, exactly as `consume-reset-request-limit.ts` does and for the same reason: fail-open on an auth
// surface hands back the very guessing-with-no-ceiling the limit exists to stop.
//
// **The refusal is the sign-in form's own single refusal**, never a different one, so a throttle cannot become
// the account-enumeration oracle ADR-132 forbids: the caller cannot tell "too many attempts against this
// address" from "wrong password" from "no such account".
import { SECURITY } from "@/modules/config";
import { log, rateLimiter } from "@/modules/platform";
import type { Email } from "@/modules/shared-types";
import { emailRateKey } from "./email-rate-key";

export async function consumeSignInLimit(email: Email): Promise<boolean> {
  const consumed = await rateLimiter.consume(
    await emailRateKey(email),
    SECURITY.rateLimits.authPerEmail,
  );
  if (consumed.ok) return true;
  if (consumed.error.code === "RATE_LIMITED") {
    // The key is never logged (07 §8) — it is derived from an address; the count is what 06 §7 acts on.
    log.warn("sign-in over the limit; the attempt is refused", {
      module: "onboarding-parent",
      action: "signIn",
      surface: "S-X-08",
    });
    return false;
  }
  log.error("sign-in: the limiter did not answer; refusing the attempt", {
    module: "onboarding-parent",
    action: "signIn",
    alert: "ALERT_PROVIDER_DOWN",
    provider: "supabase",
    surface: "S-X-08",
    reason: consumed.error.details?.reason ?? null,
  });
  return false;
}
