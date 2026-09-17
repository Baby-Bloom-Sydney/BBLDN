"use server";
// S-X-09, forgot half (`03.05`). The connector has no "send the reset / set-password email" method (03 §1.4 names
// `setPassword` and `handleAuthCallback` only — "the caller sends the email", but no method sends it), so this
// action fails closed: it validates the address and answers that the email cannot be sent yet, naming nothing
// about whether the address is known (07 §4). The documented behaviour — request → one "check your email" state
// whether or not the account exists → the link lands on S-X-09 — is pinned as a failing test until `auth` grows
// the method. Recorded in the L-007 `1c` entry; not built around.
import { z } from "zod";
import { err, log, toActionResult } from "@/modules/platform";
import type {
  PasswordResetRequestAction,
  PasswordResetRequestErrorDetails,
} from "../types";

const schema = z.object({ email: z.string().trim().toLowerCase().email() });

export const requestPasswordResetAction: PasswordResetRequestAction = async (
  _previous: unknown,
  formData: FormData,
) => {
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success)
    return toActionResult(
      err<PasswordResetRequestErrorDetails>(
        "VALIDATION",
        "Please enter the email address on your account.",
        { reason: "invalid-input" },
      ),
    );
  log.error("password reset requested but no connector method sends it", {
    module: "onboarding-parent",
    action: "requestPasswordReset",
  });
  return toActionResult(
    err<PasswordResetRequestErrorDetails>(
      "INTERNAL",
      "We can't send that email just yet.",
    ),
  );
};
