// S-X-09's forgot half (`03.05`) and the anonymous half of ADR-042's passwordless catch, which ADR-132 collapses
// into one method: from outside they must be indistinguishable, so they are one call.
//
// **Every address gets the same answer.** Known, unknown, passwordless, an outage — all `ok`. That is not
// politeness, it is the control: 07 §4 forbids a public form that tells an attacker which addresses have accounts,
// and any answer that varied with the account's existence would do exactly that. The difference lives where the
// attacker cannot see it — in what the *account* receives.
//
// **A provider failure is logged, never surfaced.** Returning the error only for a known address would restore the
// oracle; returning it for every address would make the form useless during an outage and still leak through
// timing. So the send is best effort and the failure is an alert (06 §7.3 row 8), the same reading S5b recorded
// for the rate limiter — and, like it, it is scoped to this one file and must not be copied to a write path.
import { log, ok } from "@/modules/platform";
import type { Email, Result } from "@/modules/shared-types";
import type { AppDatabase, AuthDriver } from "../types";
import { recoveryRedirectUrl } from "./recovery-redirect-url";

export const requestPasswordResetWith =
  (driver: AuthDriver<AppDatabase>) =>
  async (email: Email): Promise<Result<void>> => {
    try {
      await driver.sendRecoveryEmail(email, recoveryRedirectUrl());
    } catch (thrown) {
      log.error("recovery email could not be sent", {
        module: "auth",
        action: "requestPasswordReset",
        alert: "ALERT_PROVIDER_DOWN",
        provider: "supabase",
        cause: thrown,
      });
    }
    return ok(undefined);
  };
