"use server";
// The one server action behind S-X-09's "set your password" variant (ADR-042; 01 §4e — a signed-in person
// submitting a form is an action, not a route). Validation happens once, at this boundary (01 §4a); the policy
// itself lives in `auth.setPassword` so the rule cannot differ between callers.
import { z } from "zod";
import { err, toActionResult } from "@/modules/platform";
import type { SetPasswordAction } from "../types";
import { auth } from "../lib/default-auth";

const FIELD = "password";
const schema = z.object({ [FIELD]: z.string() });

export const setPasswordAction: SetPasswordAction = async (
  _previous: unknown,
  formData: FormData,
) => {
  const parsed = schema.safeParse({ [FIELD]: formData.get(FIELD) });
  if (!parsed.success)
    return toActionResult(
      err("VALIDATION", "Please enter a password.", {
        reason: "missing-field",
      }),
    );
  return toActionResult(await auth.setPassword(parsed.data[FIELD]));
};
