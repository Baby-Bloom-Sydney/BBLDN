// 07 §7 rule 6 / §4 — the password policy is a config value (`SECURITY.password.minLength`), checked at every
// boundary that sets one. `null` = acceptable. The message names the rule, never the value the user typed.
import { SECURITY } from "@/modules/config";
import { err } from "@/modules/platform";
import type { AppError } from "@/modules/shared-types";

export function passwordPolicyError(
  password: string,
): { readonly ok: false; readonly error: AppError } | null {
  if (password.length >= SECURITY.password.minLength) return null;
  return err(
    "VALIDATION",
    `Your password needs to be at least ${SECURITY.password.minLength} characters.`,
    { reason: "password-too-short" },
  );
}
