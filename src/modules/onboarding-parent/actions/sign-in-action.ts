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
  const signedIn = await auth.signIn({
    email: parsed.data.email as Email,
    password: parsed.data.password,
  });
  if (!signedIn.ok) return toActionResult(REFUSED);
  const destination =
    safeNextPath(parsed.data.next) ?? roleDashboardPath(signedIn.value.role);
  return toActionResult(ok({ destination }));
};
