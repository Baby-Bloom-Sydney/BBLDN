// 03 §1.4 `getSession` — from the request; `null` for anonymous, never throws. A provider failure is INTERNAL,
// not a silent `null`: "no session" and "we could not tell" must not look the same to the gate.
import { fromThrown, ok } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import type { AppDatabase, AuthDriver, GateSession } from "../types";
import { toSession } from "./to-session";

export const getSessionWith =
  (driver: AuthDriver<AppDatabase>) =>
  async (): Promise<Result<GateSession | null>> => {
    try {
      const user = await driver.currentUser();
      if (user === null) return ok(null);
      return ok(toSession(user, await driver.roleOf(user.id)));
    } catch (thrown) {
      return fromThrown(thrown, { module: "auth", action: "getSession" });
    }
  };
