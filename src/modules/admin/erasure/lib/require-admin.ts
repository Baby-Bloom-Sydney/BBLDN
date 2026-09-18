// 07 §5.4 rows 1–2: the role AND `aal2`, re-checked in the action rather than trusted from the middleware.
// `src/app/admin/layout.tsx` carries no guard of its own (measured), so an admin road that leaned on the layout
// would be gated by the edge and by nothing else.
//
// Every failure collapses to one reason, `not-permitted`: which of "no session", "wrong role" and "no second
// factor" it was is a fact about our gate and is for the log, not for the screen.
import { auth } from "@/modules/auth";
import { err } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import type { ErasureActionDetails } from "../types";

export async function requireAdmin(): Promise<
  Result<string, ErasureActionDetails>
> {
  const session = await auth.requireRole("admin");
  if (!session.ok)
    return err<ErasureActionDetails>(
      session.error.code === "UNAUTHENTICATED"
        ? "UNAUTHENTICATED"
        : "FORBIDDEN",
      "That is not available.",
      { reason: "not-permitted" },
    );
  return { ok: true, value: session.value.userId };
}
