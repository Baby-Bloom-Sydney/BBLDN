// Every wizard write acts for the session's nanny and nobody else (07 §4; 01 §4d defence in depth — the action
// already gated the role, this is the connector's own check).
import { auth } from "@/modules/auth";
import { err, ok } from "@/modules/platform";
import type { Result, UserId } from "@/modules/shared-types";
import type { VerificationErrorDetails } from "../types";

export async function requireOwnNanny(
  nannyId: UserId,
): Promise<Result<void, VerificationErrorDetails>> {
  const session = await auth.requireRole("nanny");
  if (!session.ok)
    return err("UNAUTHENTICATED", "Sign in to continue.", {
      reason: "not-permitted",
    });
  if (session.value.userId !== nannyId)
    return err("FORBIDDEN", "That isn't yours to change.", {
      reason: "not-permitted",
    });
  return ok(undefined);
}
