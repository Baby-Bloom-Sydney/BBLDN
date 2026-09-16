// A person who has just authenticated but has no `user_roles` row (02 §4.1) is a **provisioning** anomaly, not a
// mistyped password — a signup whose role write failed, or an account the schema never finished. The caller still
// gets the same generic refusal (telling them apart would enumerate accounts, 07 §4); the difference is recorded
// where an operator can find the pattern.
import { log } from "@/modules/platform";
import type { Uuid } from "@/modules/shared-types";
import { unauthenticated } from "./unauthenticated";

export function noRoleRow(action: string, userId: string) {
  log.warn("authenticated account has no role row", {
    module: "auth",
    action,
    userId: userId as Uuid,
  });
  return unauthenticated();
}
