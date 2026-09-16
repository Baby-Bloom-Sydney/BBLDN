// 03 §1.4 `grantRole` — "grant = admin actor only, logged". The actor is the authority: a user or a system job
// asking for a role change is refused with `scope` (07 §5.4 row 3 — `user_roles.role` has no client policy).
import { fromThrown, log, ok } from "@/modules/platform";
import type { Actor, Result, UserId } from "@/modules/shared-types";
import type { AppDatabase, AuthDriver, Role } from "../types";
import { asLogUuid } from "./as-log-uuid";
import { forbidden } from "./forbidden";

export const grantRoleWith =
  (driver: AuthDriver<AppDatabase>) =>
  async (userId: UserId, role: Role, actor: Actor): Promise<Result<void>> => {
    if (actor.kind !== "admin") return forbidden("scope");
    try {
      await driver.writeRole(userId, role);
      log.info("role granted", {
        module: "auth",
        action: "grantRole",
        userId: asLogUuid(userId),
        grantedRole: role,
        adminId: actor.id,
      });
      return ok(undefined);
    } catch (thrown) {
      return fromThrown(thrown, { module: "auth", action: "grantRole" });
    }
  };
