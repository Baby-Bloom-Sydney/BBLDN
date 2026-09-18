// The self-service erasure road (07 §6.1's last paragraph: "`/parent/settings` and `/nanny/settings` 'Delete my
// account' call the job"). Authority is the session's and nothing else: the subject is `getCurrentUserId()`, so
// there is no id on this road for a caller to supply and therefore none to check (ADR-145's rule, satisfied by
// construction rather than by a guard).
//
// Order: session → budget → work, the same order the three admin roads take (REVIEW-3 security M-4). The limiter
// is consumed before the first read, so a call that is going to be refused does not first buy an unmetered
// service-scope query.
//
// **The sign-out is not tidiness.** `erase_account()` bans the `auth.users` row for ever (07 §6.1 step 5), so the
// session in the browser is a cookie for an account that no longer admits anyone. Leaving it in place would show
// her a signed-in shell of a product she has just left.
import { err, privacy } from "@/modules/platform";
import type { ErasureOutcome } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import type { AuthErrorDetails } from "../types";
import { auth } from "./default-auth";
import { consumeAccountErasureLimit } from "./consume-account-erasure-limit";

export async function deleteMyAccount(): Promise<
  Result<ErasureOutcome, AuthErrorDetails>
> {
  const subject = await auth.getCurrentUserId();
  if (!subject.ok) return subject as Result<never, AuthErrorDetails>;
  if (subject.value === null)
    return err<AuthErrorDetails>("UNAUTHENTICATED", "Please sign in again.", {
      reason: "scope",
    });

  const limited = await consumeAccountErasureLimit(subject.value);
  if (!limited.ok) return limited;

  const erased = await privacy.eraseOwnAccount({
    subjectUserId: subject.value,
  });
  if (!erased.ok)
    return err<AuthErrorDetails>(
      erased.error.code === "CONFLICT" ? "CONFLICT" : "INTERNAL",
      "We could not complete that just now. Please try again shortly.",
      { reason: "scope" },
    );

  if (erased.value.outcome === "erased") await auth.signOut();
  return { ok: true, value: erased.value };
}
