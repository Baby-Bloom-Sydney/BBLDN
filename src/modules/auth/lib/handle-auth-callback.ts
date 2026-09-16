// 03 §1.4 `handleAuthCallback` (ADR-042) — exchange the code for a session. 02 C-8 also re-syncs
// `user_profiles.email` here; that table arrives with migration `0002` (S5), so the re-sync lands with it.
import { ok } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import type { AppDatabase, AuthDriver, GateSession } from "../types";
import { toSession } from "./to-session";
import { unauthenticated } from "./unauthenticated";

export const handleAuthCallbackWith =
  (driver: AuthDriver<AppDatabase>) =>
  async (code: string): Promise<Result<GateSession>> => {
    try {
      const user = await driver.exchangeCodeForSession(code);
      const session = toSession(user, await driver.roleOf(user.id));
      return session === null ? unauthenticated() : ok(session);
    } catch {
      return unauthenticated();
    }
  };
