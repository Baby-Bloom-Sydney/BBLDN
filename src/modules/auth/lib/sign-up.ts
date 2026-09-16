// 03 §1.4 `signUp`. Two security invariants live here (07 §5.4 row 3; 07 §10.1 `auth`): the role is written from
// a **server** value into `user_roles` — never read back from `raw_user_meta_data` — and it can only ever be a
// customer role, so no path a visitor can reach produces an `admin`. A failed role write is INTERNAL, not a
// half-made account that would sign in with no role at all.
import { fromThrown, log, ok } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import type {
  AppDatabase,
  AuthDriver,
  GateSession,
  SignUpInput,
} from "../types";
import { asLogUuid } from "./as-log-uuid";
import { forbidden } from "./forbidden";
import { noRoleRow } from "./no-role-row";
import { passwordPolicyError } from "./password-policy-error";
import { toSession } from "./to-session";

export const signUpWith =
  (driver: AuthDriver<AppDatabase>) =>
  async (input: SignUpInput): Promise<Result<GateSession>> => {
    if (input.role !== "parent" && input.role !== "nanny")
      return forbidden("scope");
    const policy = passwordPolicyError(input.password);
    if (policy !== null) return policy;
    try {
      const user = await driver.signUpWithPassword(input);
      // The other named service-role use (module README); logged for the same audit reason as `grantRole`
      // (07 §9.2(f) — a role write is exactly the event anomaly detection wants to see).
      await driver.writeRole(user.id, input.role);
      log.info("role written at signup", {
        module: "auth",
        action: "signUp",
        userId: asLogUuid(user.id),
        grantedRole: input.role,
      });
      const session = toSession(user, input.role);
      return session === null ? noRoleRow("signUp", user.id) : ok(session);
    } catch (thrown) {
      return fromThrown(thrown, { module: "auth", action: "signUp" });
    }
  };
