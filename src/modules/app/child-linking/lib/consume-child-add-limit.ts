// 07 §8 row 17 — S-N-01's per-nanny ceiling (`SECURITY.rateLimits.childAdds`, 10 / day).
//
// The surface it bounds is one submit that does three writes: an unclaimed `children` row, an AGR-14 consent
// record and a `nanny_to_parent` invite. The **mint** is idempotent per child (02 §4.6 — no rotation), but the
// **creation is not**, and `addFamilyChildAction` is a `"use server"` export, so the form is not the only
// caller: without this, a signed-in nanny session can fill `children` with unclaimed rows at no cost. That is
// the class of surface ADR-134 says refuses rather than running unbounded (`2g`'s security pass, HIGH-1).
//
// Keyed on the session's user id — the caller is known, so an address hash would be the wrong key. Fails
// closed: `childAdds` is not on `SECURITY.failOpenOnLimiterOutage`.
import { SECURITY } from "@/modules/config";
import { log, rateLimiter } from "@/modules/platform";
import type { UserId } from "@/modules/shared-types";

export async function consumeChildAddLimit(userId: UserId): Promise<boolean> {
  const consumed = await rateLimiter.consume(
    `child-add:${userId}`,
    SECURITY.rateLimits.childAdds,
  );
  if (consumed.ok) return true;
  if (consumed.error.code === "RATE_LIMITED") {
    log.warn("add-a-family over the limit; nothing written", {
      module: "app",
      action: "addFamilyChild",
      surface: "S-N-01",
    });
    return false;
  }
  log.error("add-a-family: the limiter did not answer; refusing", {
    module: "app",
    action: "addFamilyChild",
    alert: "ALERT_PROVIDER_DOWN",
    provider: "supabase",
    surface: "S-N-01",
    reason: consumed.error.details?.reason ?? null,
  });
  return false;
}
