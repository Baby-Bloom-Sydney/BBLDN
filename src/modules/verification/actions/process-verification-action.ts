"use server";
// S-N-08 — the poll (04 §4.1 row 13): claim, check, apply, and answer the state the screen routes on.
import { auth } from "@/modules/auth";
import { err, toActionResult } from "@/modules/platform";
import type { ProcessAction, VerificationActionDetails } from "../types";
import { verification } from "../lib/default-verification";
import { refuseVerification } from "../lib/refuse-verification";

export const processVerificationAction: ProcessAction = async () => {
  const session = await auth.requireRole("nanny");
  if (!session.ok)
    return toActionResult(
      err<VerificationActionDetails>(session.error.code, session.error.message),
    );
  const processed = await verification.process(session.value.userId);
  return toActionResult(refuseVerification("processVerification", processed));
};
