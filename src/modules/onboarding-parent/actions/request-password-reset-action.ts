"use server";
// S-X-09, forgot half (`03.05`). One "check your email" state whether or not the address is known: `auth`'s
// `requestPasswordReset` (AUTH-2) answers the same `Result` for every address and decides on its own side which
// account actually receives a link, so this action has nothing to branch on and cannot leak what it does not
// know (07 §4; ADR-132). It validates the address, normalises it, and passes it on.
//
// The **only** refusal left is VALIDATION on an address that is not an address — a shape error the visitor can
// see for herself, which tells an attacker nothing about any account.
import { z } from "zod";
import { auth } from "@/modules/auth";
import { err, ok, toActionResult } from "@/modules/platform";
import type { Email } from "@/modules/shared-types";
import type {
  PasswordResetRequestAction,
  PasswordResetRequestErrorDetails,
} from "../types";
import { consumeResetRequestLimit } from "../lib/consume-reset-request-limit";

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
  // 07 §8 row 3, before any send (see `consume-reset-request-limit.ts`): over the limit answers ok and sends
  // nothing, so the throttle cannot be read off the response; a limiter that cannot answer refuses rather than
  // sending, which is the opposite of the public *read* surfaces and deliberately so.
  const email = parsed.data.email as Email;
  const verdict = await consumeResetRequestLimit(email);
  if (verdict === "hold") return toActionResult(ok(undefined));
  if (verdict === "unavailable")
    return toActionResult(
      err<PasswordResetRequestErrorDetails>(
        "INTERNAL",
        "We can't send that email just yet.",
      ),
    );
  const requested = await auth.requestPasswordReset(email);
  // By contract `requestPasswordReset` answers ok for every address, an outage included — so this branch is the
  // guard, not the path. It is kept because the form must never be the thing that changes if that contract does:
  // one generic line, no `details`, and nothing about the address that was typed.
  return toActionResult(
    requested.ok
      ? ok(undefined)
      : err<PasswordResetRequestErrorDetails>(
          "INTERNAL",
          "We can't send that email just yet.",
        ),
  );
};
