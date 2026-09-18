// 07 §8 row 20 consumed for the self-service erasure road. **Fails closed** (ADR-134): a limiter outage refuses
// the erasure rather than leaving the one irreversible action in the product unbounded. Refusing costs the person
// a retry; failing open costs a script an unlimited number of attempts at other people's accounts if a session
// is ever compromised.
import { SECURITY } from "@/modules/config";
import { err, ok, rateLimiter } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import type { AuthErrorDetails } from "../types";

export async function consumeAccountErasureLimit(
  userId: string,
): Promise<Result<void, AuthErrorDetails>> {
  const consumed = await rateLimiter.consume(
    `account-erasure:${userId}`,
    SECURITY.rateLimits.accountErasure,
  );
  if (consumed.ok) return ok(undefined);
  return err<AuthErrorDetails>(
    consumed.error.code === "RATE_LIMITED" ? "RATE_LIMITED" : "INTERNAL",
    "That could not be done just now. Try again in a moment.",
    { reason: "scope" },
  );
}
