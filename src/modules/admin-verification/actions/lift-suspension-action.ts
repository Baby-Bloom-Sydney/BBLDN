"use server";
// ★ ADR-168 (b) — the admin road that lifts a bar, and the only one.
//
// Thin by rule, like its three siblings: the boundary parses the form, `verification.liftSuspension` does
// everything else — the role + MFA gate (`auth.requireRole('admin')`, `aal2`, 07 §5.4 rows 1–2), the
// `adminRoutes` budget, the subject read from the SUBMISSION, the definer's own decider validation, the audit
// row and the comms. The nanny is never named here: a form field cannot carry an identity on this module
// (ADR-145's pattern; ADR-159), and a lift is precisely the act where that matters most.
import { z } from "zod";
import { err, toActionResult } from "@/modules/platform";
import { verification } from "@/modules/verification";
import type { ActionDetails, LiftSuspensionAction } from "../types";
import { refuseAdminAction } from "../lib/refuse-admin-action";

/** The reason is the admin's own words, bounded so a form cannot post an essay into an audit column. */
const MAX_REASON = 500;

const schema = z.object({
  submissionId: z.string().uuid(),
  reason: z.string().trim().min(1).max(MAX_REASON),
});

export const liftSuspensionAction: LiftSuspensionAction = async (
  _previous,
  formData,
) => {
  const parsed = schema.safeParse({
    submissionId: formData.get("submissionId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success)
    return toActionResult(
      err<ActionDetails>("VALIDATION", "Say why, and try again.", {
        reason: "invalid-input",
        field: String(parsed.error.issues[0]?.path[0] ?? "reason"),
      }),
    );
  return refuseAdminAction(
    "liftSuspension",
    await verification.liftSuspension({
      submissionId: parsed.data.submissionId as never,
      reason: parsed.data.reason,
    }),
  );
};
