// 07 §8 row 14 — `SECURITY.rateLimits.adminRoutes`, keyed on the admin (600 / min: a runaway script, not an
// attacker). The first London consumer of the policy (ADR-159; the allow-list entry goes with it). Fails closed
// on a limiter outage (ADR-134: an admin write refuses rather than running unbounded).
import { SECURITY } from "@/modules/config";
import { err, ok, rateLimiter } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import type { AdminSession, VerificationErrorDetails } from "../types";

export async function consumeAdminRouteLimit(
  admin: AdminSession,
): Promise<Result<void, VerificationErrorDetails>> {
  const consumed = await rateLimiter.consume(
    `admin-routes:${admin.userId}`,
    SECURITY.rateLimits.adminRoutes,
  );
  if (consumed.ok) return ok(undefined);
  return err(
    consumed.error.code === "RATE_LIMITED" ? "RATE_LIMITED" : "INTERNAL",
    "That could not be recorded just now. Try again in a moment.",
    { reason: "store-failed" },
  );
}
