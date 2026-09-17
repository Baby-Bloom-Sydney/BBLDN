// 07 §8 row 1 — the identity-layer limit on the two unauthenticated read surfaces (`/api/areas`, the quick-match
// API). `SECURITY.rateLimits.publicRead` is the policy; the key is the hashed caller address.
//
// Returns the limiter's refusal `Result` to hand straight to `toResponse`: `RATE_LIMITED` becomes 429 with
// `Retry-After`
// already on it (01 §4c rule 5; `envelopeOf`). `null` means "carry on".
//
// **A limiter outage lets the request through, loudly.** 07 §8 is two layers, and the edge layer (Vercel
// Firewall, keyed by IP, before a function runs) is the one that never depends on our database. If the identity
// layer cannot answer — `rate_limit_buckets` unreachable — refusing here would turn one database blip into an
// outage of the public front door, while the standing control is still in place. So the failure is logged with
// its own alert and the read proceeds. This is the one place that choice is made, and it is made **only** for
// these unauthenticated *reads*: a write, a booking or an auth surface must not adopt it by copying this file.
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
  if (result.error.code === "RATE_LIMITED")
    return result as Result<never, RateLimitDetails>;

  // Not a limit — the limiter itself could not answer. The key is never logged (07 §8): it is derived from an
  // address, and the reason alone is what the runbook acts on.
  log.error("rate limit: the shared store did not answer; the read proceeds", {
    requestId,
    action: "rate-limit",
    module: "platform",
    alert: "ALERT_PROVIDER_DOWN",
    provider: "supabase",
    surface,
    reason: result.error.details?.reason ?? null,
  });
  return null;
}
