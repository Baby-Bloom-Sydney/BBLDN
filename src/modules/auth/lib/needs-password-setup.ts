// 01 §4d step 3 (ADR-042) — is this signed-in account one that has never set a password? Anonymous is `false`:
// the question only has meaning once someone is signed in.
import { fromThrown, ok } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import type { AppDatabase, AuthDriver } from "../types";

export const needsPasswordSetupWith =
  (driver: AuthDriver<AppDatabase>) => async (): Promise<Result<boolean>> => {
    try {
      const user = await driver.currentUser();
      return ok(user !== null && !user.hasPassword);
    } catch (thrown) {
      return fromThrown(thrown, {
        module: "auth",
        action: "needsPasswordSetup",
      });
    }
  };
