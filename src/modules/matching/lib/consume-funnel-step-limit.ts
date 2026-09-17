// 07 §8 row 2 — the identity-layer limit on S-X-03's progressive save (`saveParentLead`).
//
// **Why it exists.** `saveParentLeadAction` is an anonymous `"use server"` export that turns one unauthenticated
// call into a `parent_leads` row of a stranger's answers, and it shipped with no ceiling of any kind: a loop
// writes unbounded PII rows into the table the whole funnel reads. REVIEW-2 recorded it as M-5;
// `SECURITY.rateLimits.funnelStep` was declared in config with zero call sites, which is worse than an absent
// control because the file read as protection in force (ADR-142 (2)).
//
// **Fails closed on a limiter outage.** `SECURITY.failOpenOnLimiterOutage` carries `publicRead` alone (ADR-134 /
// ADR-140) and this is a write: continuing here would restore exactly the unbounded row creation the limit
// exists to stop. The refusal is the limiter's — this function only decides what the wizard is told.
//
// **The wizard keeps going.** 04 §6.1 has the save fail closed into memory and retry at the end, and the parent
// never sees the reason, so the caller returns `RATE_LIMITED` through `ClientResult` like any other refusal.
import { SECURITY } from "@/modules/config";
import { log, rateLimiter } from "@/modules/platform";

export async function consumeFunnelStepLimit(key: string): Promise<boolean> {
  const consumed = await rateLimiter.consume(
    key,
    SECURITY.rateLimits.funnelStep,
  );
  if (consumed.ok) return true;
  if (consumed.error.code === "RATE_LIMITED") {
    // The key is never logged (07 §8): it is derived from an address and a user agent.
    log.warn("lead save over the limit; nothing written", {
      module: "matching",
      action: "saveParentLead",
      surface: "S-X-03",
    });
    return false;
  }
  log.error("lead save: the limiter did not answer; refusing to write", {
    module: "matching",
    action: "saveParentLead",
    alert: "ALERT_PROVIDER_DOWN",
    provider: "supabase",
    surface: "S-X-03",
    reason: consumed.error.details?.reason ?? null,
  });
  return false;
}
