// 07 §8 row 6 (`SECURITY.rateLimits.bookingHolds`, 10 / hour per user) — the calendar writes behind S-P-02 and
// S-N-02.
//
// **The policy was declared and had no consumer** (`limiter-call-sites.allow.json`: "scheduling's booking
// writes reach no Phase 1 caller surface … wire the policy with the first booking action"). That entry had
// outlived its reason — `1d` shipped `holdSlotAction` and `chooseSlotAction` — and `2g` adds a third, so the
// three are wired here and the entry is removed. A hold and a booking are the same door: a loop on either
// walks the calendar, and I-1 / I-10 bound how many rows survive, not how many attempts are made.
//
// Keyed on the session's user id — the caller is known, so an address hash or an IP would be the wrong key.
// Fails **closed** on a limiter outage: `bookingHolds` is not in `failOpenOnLimiterOutage`, and this is an
// authenticated mutating surface, which ADR-134 says refuses rather than running unbounded.
import { SECURITY } from "@/modules/config";
import { log, rateLimiter } from "@/modules/platform";
import type { UserId } from "@/modules/shared-types";

export async function consumeBookingLimit(
  userId: UserId,
  action: string,
): Promise<boolean> {
  const consumed = await rateLimiter.consume(
    `booking:${userId}`,
    SECURITY.rateLimits.bookingHolds,
  );
  if (consumed.ok) return true;
  if (consumed.error.code === "RATE_LIMITED") {
    log.warn("calendar write over the limit; nothing booked", {
      module: "call-layer",
      action,
    });
    return false;
  }
  log.error("calendar write: the limiter did not answer; refusing", {
    module: "call-layer",
    action,
    alert: "ALERT_PROVIDER_DOWN",
    provider: "supabase",
    reason: consumed.error.details?.reason ?? null,
  });
  return false;
}
