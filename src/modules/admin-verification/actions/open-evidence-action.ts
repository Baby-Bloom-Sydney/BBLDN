"use server";
// The reveal (07 §4.32; ADR-159): one submission's objects as short-lived signed URLs plus that section's
// declared fields — each call is one `vetting.evidence-viewed`, emitted inside `verification.openEvidence`.
import { err, toActionResult } from "@/modules/platform";
import { verification } from "@/modules/verification";
import type { ActionDetails, OpenEvidenceAction } from "../types";
import { refuseAdminAction } from "../lib/refuse-admin-action";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const openEvidenceAction: OpenEvidenceAction = async (_previous, formData) => {
  const submissionId = formData.get("submissionId");
  if (typeof submissionId !== "string" || !UUID.test(submissionId))
    return toActionResult(
      err<ActionDetails>("VALIDATION", "That check is not available", {
        reason: "invalid-input",
        field: "submissionId",
      }),
    );
  return refuseAdminAction(
    "openEvidence",
    await verification.openEvidence(submissionId as never),
  );
};
