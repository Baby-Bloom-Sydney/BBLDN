// 03 §1.4 `signIn`. Every provider failure collapses to one `UNAUTHENTICATED` with one message: telling a caller
// apart "no such account" from "wrong password" enumerates accounts (07 §4), and the provider's own text must not
// cross the connector (03 §1 rule 4).
import { ok } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import type {
  AppDatabase,
  AuthDriver,
  GateSession,
  SignInInput,
} from "../types";
import { toSession } from "./to-session";
import { unauthenticated } from "./unauthenticated";

export const signInWith =
  (driver: AuthDriver<AppDatabase>) =>
  async (input: SignInInput): Promise<Result<GateSession>> => {
    try {
      const user = await driver.signInWithPassword(input);
      const session = toSession(user, await driver.roleOf(user.id));
      return session === null ? unauthenticated() : ok(session);
    } catch {
      return unauthenticated();
    }
  };
