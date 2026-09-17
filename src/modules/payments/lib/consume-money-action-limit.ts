// The identity-layer limit on the two money actions a signed-in parent can fire (07 §8; `security-reviewer`,
// `1h` MEDIUM-1). Both create a session at the purchase provider, so a parent in a loop is unbounded provider
// cost; 07 §8 row 13's "no rate limit" is scoped to provider-retried, signature-verified paths and does not
// reach these.
//
// **It fails CLOSED, and that is ADR-134, not a preference.** When the shared store cannot answer, only
// unauthenticated public *reads* carry on — "every authenticated, mutating, money or admin route refuses". So
// this policy is deliberately **not** on `SECURITY.failOpenOnLimiterOutage` (ADR-134 / ADR-140), whose point is the
// opposite choice; the refusal is logged with its own alert so an outage is visible rather than silent.
//
// The key is the family id — who is charged — never an address: these actions are behind the session gate, so
// the caller is known and an IP would only blur two parents behind one router.
import { SECURITY } from "@/modules/config";
import { log, rateLimiter } from "@/modules/platform";
import type { FamilyId } from "@/modules/shared-types";
import type { PaymentsErrorDetails } from "../types";
import { fail } from "./fail";
import type { AppError } from "@/modules/shared-types";

export async function consumeMoneyActionLimit(
  familyId: FamilyId,
  action: string,
): Promise<{
  readonly ok: false;
  readonly error: AppError<PaymentsErrorDetails>;
} | null> {
  const allowed = await rateLimiter.consume(
    familyId,
    SECURITY.rateLimits.purchaseActions,
  );
  if (allowed.ok) return null;
  if (allowed.error.code !== "RATE_LIMITED")
    log.error(
      "rate limit: the shared store did not answer; the money action refuses",
      {
        module: "payments",
        action,
        alert: "ALERT_PROVIDER_DOWN",
        provider: "supabase",
        reason: allowed.error.details?.reason ?? null,
      },
    );
  // One message either way: a parent who is going too fast and a parent caught by an outage both need the same
  // one thing, and telling them apart would tell an attacker which it was.
  return fail("E_PROVIDER", "Too many attempts just now — try again shortly");
}
