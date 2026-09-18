"use server";
// S-N-04 — location + UK mobile (04 §4.1 row 9; `05.09`). Session and role re-checked here (01 §4d); the values
// reach `user_profiles` through the injected writer and the section is stamped (ADR-154 (3)).
import { auth } from "@/modules/auth";
import { err, toActionResult } from "@/modules/platform";
import type { ContactAction, VerificationActionDetails } from "../types";
import { consumeVerificationSubmitLimit } from "../lib/consume-verification-submit-limit";
import { contactSchema } from "../lib/contact-schema";
import { verification } from "../lib/default-verification";
import { parseForm } from "../lib/parse-form";
import { refuseVerification } from "../lib/refuse-verification";

const FIELDS = ["mobile", "district", "area"] as const;

export const saveVerificationContactAction: ContactAction = async (
  _previous,
  formData,
) => {
  const session = await auth.requireRole("nanny");
  if (!session.ok)
    return toActionResult(
      err<VerificationActionDetails>(session.error.code, session.error.message),
    );
  const parsed = parseForm(contactSchema, formData, FIELDS);
  if (!parsed.ok) return toActionResult(parsed);
  // 07 §8 row 11, contact bucket — after the parse (a malformed form spends nothing) and before the write.
  const limit = await consumeVerificationSubmitLimit(
    session.value.userId,
    "contact",
  );
  if (!limit.ok)
    return toActionResult(refuseVerification("saveVerificationContact", limit));
  const submitted = await verification.submitContact(
    session.value.userId,
    parsed.value,
  );
  return toActionResult(
    refuseVerification("saveVerificationContact", submitted),
  );
};
