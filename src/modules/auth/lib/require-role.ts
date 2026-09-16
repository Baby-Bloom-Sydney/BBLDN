// 03 §1.4 `requireRole` — `UNAUTHENTICATED` · `FORBIDDEN { reason }`. `admin` additionally needs `mfaVerified`
// (Supabase `aal2`), so an admin session that never passed a second factor is refused here and not only by the
// middleware (07 §5.4 rows 1–2: re-checked in every admin action, not only at the edge).
import type { Result } from "@/modules/shared-types";
import type { AuthErrorDetails, GateSession, Role, Session } from "../types";
import { forbidden } from "./forbidden";
import { unauthenticated } from "./unauthenticated";

export const requireRoleWith =
  (getSession: () => Promise<Result<GateSession | null>>) =>
  async (
    role: Role | ReadonlyArray<Role>,
  ): Promise<Result<Session, AuthErrorDetails>> => {
    const allowed: ReadonlyArray<Role> = Array.isArray(role) ? role : [role];
    const result = await getSession();
    // `getSession`'s failure is an `INTERNAL` carrying `{ module, action }`, not an `AuthErrorDetails` — casting
    // the whole result through would promise callers a `details.reason` that is `undefined` at runtime. The code,
    // message and cause are what matter; the mistyped `details` is dropped (it is optional on `AppError`).
    if (!result.ok)
      return {
        ok: false,
        error: {
          code: result.error.code,
          message: result.error.message,
          ...(result.error.cause === undefined
            ? {}
            : { cause: result.error.cause }),
        },
      };
    const session = result.value;
    if (session === null) return unauthenticated();
    if (!allowed.includes(session.role)) return forbidden("role");
    if (session.role === "admin" && !session.mfaVerified)
      return forbidden("mfa");
    return { ok: true, value: session };
  };
