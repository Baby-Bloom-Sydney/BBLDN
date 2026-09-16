// 03 §1.4 `getCurrentUserId` — the id without the role lookup; `null` for anonymous.
import { fromThrown, ok } from "@/modules/platform";
import type { Result, UserId } from "@/modules/shared-types";
import type { AppDatabase, AuthDriver } from "../types";

export const getCurrentUserIdWith =
  (driver: AuthDriver<AppDatabase>) =>
  async (): Promise<Result<UserId | null>> => {
    try {
      const user = await driver.currentUser();
      return ok(user === null ? null : (user.id as UserId));
    } catch (thrown) {
      return fromThrown(thrown, { module: "auth", action: "getCurrentUserId" });
    }
  };
