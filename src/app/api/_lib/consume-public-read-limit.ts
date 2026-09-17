// 07 §8 row 1 — the identity-layer limit on the two unauthenticated read surfaces (`/api/areas`, the quick-match
// API). `SECURITY.rateLimits.publicRead` is the policy; the key is the hashed caller address.
//
// Returns the limiter's refusal `Result` to hand straight to `toResponse`: `RATE_LIMITED` becomes 429 with
// `Retry-After` already on it (01 §4c rule 5; `envelopeOf`). `null` means "carry on".
//
// **This file no longer decides anything about a limiter outage** (ADR-140, REVIEW-2 M-2). It did — fail-open was
// hard-coded here and acquired by importing it, under a header asking callers not to copy it, which is a comment
// and not a gate. ADR-134's words are that fail-open is "a named allow-list in `config/security.ts`, not a
// property a route claims for itself", so the decision now lives in `SECURITY.failOpenOnLimiterOutage` and is
// taken on the `platform/rate-limit` consume path: `publicRead` is the only name on that list, so these two reads
// continue when the store cannot answer and the limiter raises `ALERT_PROVIDER_DOWN` itself. All this function
// still does is turn the answer into what a route hands to `toResponse`.
//
// The allow-list carries `publicRead` on ADR-134's own reason and nothing else: these reads are unauthenticated,
// change nothing and leak nothing, so one database blip must not close the public front door. The old "the edge
// layer is still in place" argument is struck — `vercel.json` carries no firewall rule, so there is no second
// control behind this one (B-44 is the Vercel Firewall rule BAI opens before the first ad).
import { SECURITY } from "@/modules/config";
import { log, rateLimiter } from "@/modules/platform";
import type { RateLimitDetails } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import { ipKeyOf } from "./ip-key";

export async function consumePublicReadLimit(
  request: Request,
  requestId: string,
  surface: string,
): Promise<Result<never, RateLimitDetails> | null> {
  const key = await ipKeyOf(request);
  const result = await rateLimiter.consume(key, SECURITY.rateLimits.publicRead);
  if (result.ok) return null;

  // Not a limit, and the allow-list did not open the door: the limiter refused for a reason of its own — today
  // only `assertSharedStore`'s boot-misconfiguration refusal, which is a deliberate fail-closed control carrying
  // its own `ALERT_ENV_INVALID` and not the outage ADR-134 names. A refusal is passed on, never swallowed. The
  // key is never logged (07 §8): it is derived from an address, and the reason alone is what the runbook acts on.
  if (result.error.code !== "RATE_LIMITED")
    log.error("rate limit: the limiter refused; the read does not proceed", {
      requestId,
      action: "rate-limit",
      module: "platform",
      surface,
      errorCode: result.error.code,
    });
  return result as Result<never, RateLimitDetails>;
}
