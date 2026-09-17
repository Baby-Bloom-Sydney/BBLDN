"use server";
// S-X-08 — sign in (01 §4e). One refusal for every failure, so the form cannot tell "no such account" from "wrong
// password" (07 §4, account enumeration); the real cause stays in `auth`'s log. The destination is the gate's
// `next=` when it is a safe path, else the role's own dashboard (01 §4d). The **anonymous** passwordless catch
// (04 §6.1 S-X-08: a known email with no password → S-X-09 with one reassuring line) needs a connector method
// `auth` does not have — recorded in the L-007 `1c` entry and pinned as a failing test; the signed-in half (the
// gate's step 3) already works, so a passwordless account that signs in through a link lands on set-password.
import { z } from "zod";
import { auth, roleDashboardPath } from "@/modules/auth";
import { err, ok, toActionResult } from "@/modules/platform";
import type { Email } from "@/modules/shared-types";
import type { SignInAction, SignInErrorDetails } from "../types";
import { consumeSignInLimit } from "../lib/consume-sign-in-limit";
import { safeNextPath } from "../lib/safe-next-path";

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

const REFUSED = err<SignInErrorDetails>(
  "UNAUTHENTICATED",
  "That email and password don't match. If you've never set a password, or have forgotten it, we can email you a link to set one.",
  { reason: "refused" },
);

export const signInAction: SignInAction = async (
  _previous: unknown,
  formData: FormData,
) => {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success)
    return toActionResult(
      err<SignInErrorDetails>(
        "VALIDATION",
        "Please enter your email and password.",
        { reason: "invalid-input" },
      ),
    );
  // 07 §8 row 3 (REVIEW-2, security HIGH-2). Taken **ahead of** the credential check, so a spent burst refuses
  // the right password too — a limit taken after the check would still hand the attacker the answer. The verdict
  // never changes the sentence: `REFUSED` is the one refusal this form has, so a throttle cannot become the
  // account-enumeration oracle ADR-132 forbids. A limiter outage refuses as well (ADR-134: auth fails closed).
  if (!(await consumeSignInLimit(parsed.data.email as Email)))
    return toActionResult(REFUSED);
  const signedIn = await auth.signIn({
    email: parsed.data.email as Email,
    password: parsed.data.password,
  });
  if (!signedIn.ok) return toActionResult(REFUSED);
  const destination =
    safeNextPath(parsed.data.next) ?? roleDashboardPath(signedIn.value.role);
  return toActionResult(ok({ destination }));
};
