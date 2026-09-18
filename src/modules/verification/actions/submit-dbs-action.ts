"use server";
// S-N-06 — the DBS certificate, its number and issue date, and the Update Service consent (04 §4.1 row 11;
// kickoff §4.3 default).
import { auth } from "@/modules/auth";
import { err, toActionResult } from "@/modules/platform";
import type { DbsAction, VerificationActionDetails } from "../types";
import { dbsSchema } from "../lib/dbs-schema";
import { verification } from "../lib/default-verification";
import { parseForm } from "../lib/parse-form";
import { refuseVerification } from "../lib/refuse-verification";
import { toUploadedFile } from "../lib/to-uploaded-file";

const FIELDS = [
  "certificate",
  "certificateNumber",
  "issueDate",
  "updateServiceConsent",
] as const;

export const submitDbsAction: DbsAction = async (_previous, formData) => {
  const session = await auth.requireRole("nanny");
  if (!session.ok)
    return toActionResult(
      err<VerificationActionDetails>(session.error.code, session.error.message),
    );
  const parsed = parseForm(dbsSchema, formData, FIELDS);
  if (!parsed.ok) return toActionResult(parsed);
  const submitted = await verification.submitDbs(session.value.userId, {
    certificate: await toUploadedFile(parsed.value.certificate),
    certificateNumber: parsed.value.certificateNumber,
    issueDate: parsed.value.issueDate as never,
    updateServiceConsent: true,
  });
  return toActionResult(refuseVerification("submitDbs", submitted));
};
