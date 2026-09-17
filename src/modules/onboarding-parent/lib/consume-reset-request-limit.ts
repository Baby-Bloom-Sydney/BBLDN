// 07 §8 row 3 — the identity-layer limit on S-X-09's public reset request.
//
// **Why it exists.** Until AUTH-2 the action was inert: it validated the address and refused, so nobody could
// make it send anything. Wired to a real send it becomes two things worth stopping — a way to fill one person's
// inbox with recovery links, and a way to spend the project's whole outbound email quota and take the reset flow
// down for everyone. Supabase's own limits are project- and IP-scoped and outside this app's sight; this is the
// per-address control 07 §8 row 3 asks for. (The `+ip` half of that row's key belongs to the edge layer in front
// of the function; a limit taken here has the address and not the request.)
//
// **The answer never changes with the verdict.** A throttled request must look exactly like a sent one, or the
// throttle is the account-enumeration oracle ADR-132 forbids, back through the side door.
//
// **A limiter outage refuses, it does not send.** This is deliberately the opposite of
// `api/_lib/consume-public-read-limit.ts`, which lets an unauthenticated *read* through when the store cannot
// answer. That file says in as many words that an auth surface must not copy it, and this is why: if the limiter
// can be knocked over, fail-open would hand back the very thing it exists to stop: sends with no ceiling. The refusal is the same
// generic line for every address, so it reveals nothing — it is an outage, not an answer about an account.
import { SECURITY } from "@/modules/config";
import { log, rateLimiter } from "@/modules/platform";
import type { Email } from "@/modules/shared-types";
import type { ResetRequestVerdict } from "../types";
import { emailRateKey } from "./email-rate-key";

export async function consumeResetRequestLimit(
  email: Email,
): Promise<ResetRequestVerdict> {
  const consumed = await rateLimiter.consume(
    await emailRateKey(email),
    SECURITY.rateLimits.authPerEmail,
  );
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
