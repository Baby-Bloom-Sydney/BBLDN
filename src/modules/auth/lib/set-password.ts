// 03 §1.4 `setPassword` (ADR-042) — the set / reset half of S-X-09. A session is required: this is the
// authenticated path (the recovery link has already signed the person in), so an anonymous call is refused rather
// than treated as a password reset by email address.
import { fromThrown, ok } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import type { AppDatabase, AuthDriver, GateSession } from "../types";
import { passwordPolicyError } from "./password-policy-error";
import { unauthenticated } from "./unauthenticated";

export const setPasswordWith =
  (
    driver: AuthDriver<AppDatabase>,
    getSession: () => Promise<Result<GateSession | null>>,
  ) =>
  async (newPassword: string): Promise<Result<void>> => {
    const policy = passwordPolicyError(newPassword);
    if (policy !== null) return policy;
    const session = await getSession();
    if (!session.ok) return session;
    if (session.value === null) return unauthenticated();
    try {
      await driver.updatePassword(newPassword);
      return ok(undefined);
    } catch (thrown) {
      return fromThrown(thrown, { module: "auth", action: "setPassword" });
    }
  };
