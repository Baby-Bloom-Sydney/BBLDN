// 03 §1.4 `handleAuthCallback` (ADR-042) — exchange the code for a session. 02 C-8 also re-syncs
// `user_profiles.email` here; that table arrives with migration `0002` (S5), so the re-sync lands with it.
// As with `signIn`: one generic refusal to the caller, the real cause kept server-side.
import { log, ok } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import type { AppDatabase, AuthDriver, GateSession } from "../types";
import { noRoleRow } from "./no-role-row";
import { toSession } from "./to-session";
import { unauthenticated } from "./unauthenticated";

export const handleAuthCallbackWith =
  (driver: AuthDriver<AppDatabase>) =>
  async (code: string): Promise<Result<GateSession>> => {
    try {
      const user = await driver.exchangeCodeForSession(code);
      const session = toSession(user, await driver.roleOf(user.id));
      return session === null
        ? noRoleRow("handleAuthCallback", user.id)
        : ok(session);
    } catch (thrown) {
      log.warn("auth callback failed", {
        module: "auth",
        action: "handleAuthCallback",
        cause: thrown,
      });
      return unauthenticated(thrown);
    }
  };
