// 03 §1.4 `signOut`.
import { fromThrown, ok } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import type { AppDatabase, AuthDriver } from "../types";

export const signOutWith =
  (driver: AuthDriver<AppDatabase>) => async (): Promise<Result<void>> => {
    try {
      await driver.signOut();
      return ok(undefined);
    } catch (thrown) {
      return fromThrown(thrown, { module: "auth", action: "signOut" });
    }
  };
