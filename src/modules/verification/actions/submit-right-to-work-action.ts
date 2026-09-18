"use server";
// S-N-07 — one of three kinds (04 §4.1 row 12; ADR-153): the discriminated schema decides which fields matter.
import { auth } from "@/modules/auth";
import { err, toActionResult } from "@/modules/platform";
import type {
  RightToWorkAction,
  RightToWorkInput,
  VerificationActionDetails,
} from "../types";
import { verification } from "../lib/default-verification";
import { parseForm } from "../lib/parse-form";
import { refuseVerification } from "../lib/refuse-verification";
import { rightToWorkSchema } from "../lib/right-to-work-schema";
import { toUploadedFile } from "../lib/to-uploaded-file";

const FIELDS = ["kind", "document", "shareCode", "dateOfBirth"] as const;

export const submitRightToWorkAction: RightToWorkAction = async (
  _previous,
  formData,
) => {
  const session = await auth.requireRole("nanny");
  if (!session.ok)
    return toActionResult(
      err<VerificationActionDetails>(session.error.code, session.error.message),
    );
  const parsed = parseForm(rightToWorkSchema, formData, FIELDS);
  if (!parsed.ok) return toActionResult(parsed);
  const value = parsed.value;
  const input: RightToWorkInput =
    value.kind === "share_code"
      ? {
          kind: value.kind,
          shareCode: value.shareCode,
          dateOfBirth: value.dateOfBirth as never,
        }
      : { kind: value.kind, document: await toUploadedFile(value.document) };
  const submitted = await verification.submitRightToWork(
    session.value.userId,
    input,
  );
  return toActionResult(refuseVerification("submitRightToWork", submitted));
};
