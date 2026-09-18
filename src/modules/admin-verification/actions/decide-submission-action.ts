"use server";
// S-A-16 "verify / reject with reason" (04 §5.2 row 16; 05 AC-A-17; ADR-159). Thin by rule: the boundary parses
// the form, `verification.decide` does everything else — the role + MFA gate, the limiter, the provider's
// `record()`, the sync, the events, the comms. The nanny is never named here: the subject is the submission's.
import type { DecideSubmissionAction } from "../types";
import { verification } from "@/modules/verification";
import { err, toActionResult } from "@/modules/platform";
import type { ActionDetails } from "../types";
import { parseDecisionForm } from "../lib/parse-decision-form";
import { refuseAdminAction } from "../lib/refuse-admin-action";

export const decideSubmissionAction: DecideSubmissionAction = async (
  _previous,
  formData,
) => {
  const parsed = parseDecisionForm(formData);
  if (!parsed.ok)
    return toActionResult(
      err<ActionDetails>("VALIDATION", "Check the decision and try again.", {
        reason: "invalid-input",
        field: parsed.field,
      }),
    );
  return refuseAdminAction("decide", await verification.decide(parsed.value));
};
