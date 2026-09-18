// The queue's gate (ADR-159): every admin road on the connector re-checks the role itself — `auth.requireRole`
// re-reads `user_roles` and refuses an admin session that never passed a second factor (07 §5.4 rows 1–2). The
// action already gated; this is the connector's own check, the way `requireOwnNanny` is for the wizard. One
// refusal line for every way it fails (07 §4).
//
// The `UserId` → `AdminId` re-labelling happens here once, named, for the same reason `admin-on-behalf` keeps
// its own (`adminIdFromUserId`): 01 §2.3 gives this module no arrow to that one, and the brands do not overlap
// by design. It is not a validation step — the session was just proved to be an MFA-verified admin.
import { auth } from "@/modules/auth";
import { err, ok } from "@/modules/platform";
import type { AdminId, Result } from "@/modules/shared-types";
import type { AdminSession, VerificationErrorDetails } from "../types";

export async function requireAdmin(): Promise<
  Result<AdminSession, VerificationErrorDetails>
> {
  const session = await auth.requireRole("admin");
  if (!session.ok)
    return err(
      session.error.code === "UNAUTHENTICATED"
        ? "UNAUTHENTICATED"
        : "FORBIDDEN",
      "You do not have access to this.",
      { reason: "not-permitted" },
    );
  return ok({
    adminId: session.value.userId as string as AdminId,
    userId: session.value.userId,
  });
}
