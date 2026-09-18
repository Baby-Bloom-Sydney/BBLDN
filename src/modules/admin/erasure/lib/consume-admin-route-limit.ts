// 07 §8 row 14 for this panel's two roads. A local copy rather than an import of `verification`'s: `admin` may not
// reach into another module's `lib/` (01 §2.3, the boundary lint), and the alternative — promoting a four-line
// helper to a connector method on a module `admin` does not otherwise need — would be a worse trade than the
// duplication. Both read the same declared policy, which is the thing that must not drift.
import { SECURITY } from "@/modules/config";
import { err, ok, rateLimiter } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import type { ErasureActionDetails } from "../types";

export async function consumeAdminRouteLimit(
  adminId: string,
): Promise<Result<void, ErasureActionDetails>> {
  const consumed = await rateLimiter.consume(
    `admin-routes:${adminId}`,
    SECURITY.rateLimits.adminRoutes,
  );
  if (consumed.ok) return ok(undefined);
  return err<ErasureActionDetails>(
    consumed.error.code === "RATE_LIMITED" ? "RATE_LIMITED" : "INTERNAL",
    "That could not be recorded just now. Try again in a moment.",
    { reason: "store-failed" },
  );
}
