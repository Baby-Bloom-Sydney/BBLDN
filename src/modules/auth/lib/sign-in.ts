// 03 §1.4 `signIn`. Every provider failure collapses to one `UNAUTHENTICATED` with one message: telling a caller
// apart "no such account" from "wrong password" enumerates accounts (07 §4), and the provider's own text must not
// cross the connector (03 §1 rule 4). The *cause* is kept — hidden from the caller, not thrown away, or an outage
// during sign-in is indistinguishable from a room full of people mistyping their passwords.
import { log, ok } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import type {
  AppDatabase,
  AuthDriver,
  GateSession,
  SignInInput,
} from "../types";
import { noRoleRow } from "./no-role-row";
import { toSession } from "./to-session";
import { unauthenticated } from "./unauthenticated";

export const signInWith =
  (driver: AuthDriver<AppDatabase>) =>
  async (input: SignInInput): Promise<Result<GateSession>> => {
    try {
      const user = await driver.signInWithPassword(input);
      const session = toSession(user, await driver.roleOf(user.id));
      return session === null ? noRoleRow("signIn", user.id) : ok(session);
    } catch (thrown) {
      log.warn("sign-in failed", {
        module: "auth",
        action: "signIn",
        cause: thrown,
      });
      return unauthenticated(thrown);
    }
  };
