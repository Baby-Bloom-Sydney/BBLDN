// 07 §8 row 3 — the identity-layer limit on S-X-09's public reset request.
//
// **Why it exists.** Until AUTH-2 the action was inert: it validated the address and refused, so nobody could
// make it send anything. Wired to a real send it becomes two things worth stopping — a way to fill one person's
// inbox with recovery links, and a way to spend the project's whole outbound email quota and take the reset flow
// down for everyone. Supabase's own limits are project- and IP-scoped and outside this app's sight; this is the
// per-address control 07 §8 row 3 asks for — and, since ADR-140 (2), the per-IP half beside it: that half used to
// be left to "the edge layer in front of the function", and `vercel.json` carries no firewall rule, so nothing
// was taking it.
//
// **The answer never changes with the verdict.** A throttled request must look exactly like a sent one, or the
// throttle is the account-enumeration oracle ADR-132 forbids, back through the side door.
//
// **A limiter outage refuses, it does not send.** `SECURITY.failOpenOnLimiterOutage` (ADR-134 / ADR-140) carries
// `publicRead` alone — the two unauthenticated reads — and an auth surface is deliberately not on it: if the
// limiter can be knocked over, fail-open would hand back the very thing it exists to stop, sends with no ceiling.
// The refusal is the same generic line for every address, so it reveals nothing — it is an outage, not an answer
// about an account.
import { SECURITY } from "@/modules/config";
import { log, rateLimiter } from "@/modules/platform";
import type { Email } from "@/modules/shared-types";
import type { ResetRequestVerdict } from "../types";
import { callerIpKey } from "./caller-ip-key";
import { emailRateKey } from "./email-rate-key";

export async function consumeResetRequestLimit(
  email: Email,
): Promise<ResetRequestVerdict> {
  const results = [
    await rateLimiter.consume(
      await emailRateKey(email),
      SECURITY.rateLimits.authPerEmail,
    ),
    await rateLimiter.consume(
      `auth-ip:${await callerIpKey()}`,
      SECURITY.rateLimits.authPerIp,
    ),
  ];
  const consumed = results.find((result) => !result.ok) ?? results[0];
  if (consumed.ok) return "send";
  if (consumed.error.code === "RATE_LIMITED") {
    // The key is never logged (07 §8) — it is derived from an address, and the count is what 06 §7 acts on.
    log.warn("reset request over the limit; no link sent", {
      module: "onboarding-parent",
      action: "requestPasswordReset",
      surface: "S-X-09",
    });
    return "hold";
  }
  log.error("reset request: the limiter did not answer; refusing to send", {
    module: "onboarding-parent",
    action: "requestPasswordReset",
    alert: "ALERT_PROVIDER_DOWN",
    provider: "supabase",
    surface: "S-X-09",
    reason: consumed.error.details?.reason ?? null,
  });
  return "unavailable";
}
