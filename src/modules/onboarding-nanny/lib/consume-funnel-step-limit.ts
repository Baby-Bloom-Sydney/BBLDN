// 07 §8 row 2 — `/apply` funnel steps: 10 / min per IP + UA hash (`SECURITY.rateLimits.funnelStep`, ADR-140:
// declared with a consumer). Every anonymous step spends one before any write, so a burst costs one limiter
// round trip, not a lead row. **Fails closed on a limiter outage** (ADR-134: the funnel writes personal data,
// so it is not on the fail-open list). Returns a boolean; the caller supplies the one generic line.
import { SECURITY } from "@/modules/config";
import { log, rateLimiter } from "@/modules/platform";
import { callerIpUaKey } from "./caller-ip-ua-key";

export async function consumeFunnelStepLimit(surface: string): Promise<boolean> {
  const consumed = await rateLimiter.consume(
    `funnel:${await callerIpUaKey()}`,
    SECURITY.rateLimits.funnelStep,
  );
  if (consumed.ok) return true;
  if (consumed.error.code === "RATE_LIMITED") {
    log.warn("funnel step over the limit; nothing written", {
      module: "onboarding-nanny",
      action: "funnelStep",
      surface,
    });
    return false;
  }
  log.error("funnel step: the limiter did not answer; refusing", {
    module: "onboarding-nanny",
    action: "funnelStep",
    alert: "ALERT_PROVIDER_DOWN",
    provider: "supabase",
    surface,
    reason: consumed.error.details?.reason ?? null,
  });
  return false;
}
