// **07 §8 row 7** — the invite / token lookup limit: 10 a minute, 60 a day, keyed by IP, with **5 failed
// lookups an hour buying a one-hour block**. Both halves are `SECURITY`'s numbers, never literals (L4).
//
// ★ This is the enumeration defence, and it is the whole of it. A child invite has **no expiry column** and
// **no rotation** (02 §4.6): a pending token is live until it is claimed or revoked, which may be weeks. 32^8 ≈
// 1.1 × 10^12 is only infeasible to walk if walking it is *rate-limited*; unlimited, a script gets a child's
// first name and a family member's first name per hit, which is 07 §3 class H data on children.
//
// **It fails closed, and that is a deliberate departure from the neighbouring public reads.** ADR-134 says
// unauthenticated read-only public routes fail open on a limiter outage, with the fail-open routes named in an
// allow-list in `config/security.ts` — "not a property a route claims for itself". **That allow-list does not
// exist yet** (recorded in the L-007 `1i` entry), so nothing is on it and the default is refusal. That is also
// the right answer here on the merits: for `/api/areas` the cost of failing open is a slow public read served
// unthrottled; here it is the enumeration budget on children's records going to infinity for the duration of
// the blip. When ADR-134's list is written, this route should be argued **off** it.
//
// The block is the second counter's own window: a `perHour` policy of 5 on the *miss* key resets after an
// hour, which is exactly `inviteLookupBlock.blockMinutes`. One mechanism, not two.
import { SECURITY } from "@/modules/config";
import { log, rateLimiter } from "@/modules/platform";

export type InviteLookupVerdict = "ok" | "limited";

/** 07 §8 row 7's failed-lookup lockout, expressed as a policy over `SECURITY`'s own numbers. */
const MISS_POLICY = Object.freeze({
  key: "ip" as const,
  perHour: SECURITY.inviteLookupBlock.failedPerHour,
  note: "5 failed / h -> 1 h block (row 7)",
});

async function consume(
  key: string,
  policy: Parameters<typeof rateLimiter.consume>[1],
  surface: string,
): Promise<InviteLookupVerdict> {
  const result = await rateLimiter.consume(key, policy);
  if (result.ok) return "ok";
  if (result.error.code === "RATE_LIMITED") return "limited";
  // The limiter itself could not answer. Refuse — see the header. The key is never logged (07 §8): it is
  // derived from an address, and the reason alone is what the runbook acts on.
  log.error("rate limit: the shared store did not answer; the lookup refuses", {
    module: "app",
    action: "child-linking.inviteLookup",
    alert: "ALERT_PROVIDER_DOWN",
    provider: "supabase",
    surface,
    reason: result.error.details?.reason ?? null,
  });
  return "limited";
}

export const consumeInviteLookupLimit = Object.freeze({
  /** Before the lookup: the ordinary rate. */
  before: (key: string) =>
    consume(key, SECURITY.rateLimits.inviteLookup, "invite-lookup"),
  /** After a **miss**: the failed-lookup counter whose window is the block. */
  afterMiss: (key: string) => consume(key, MISS_POLICY, "invite-lookup-miss"),
});
