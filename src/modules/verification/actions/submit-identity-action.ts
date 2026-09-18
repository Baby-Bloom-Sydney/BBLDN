"use server";
// S-N-05 — the consent gate, then the document + selfie (04 §4.1 row 10; 07 §2.6). The tick records the AGR-04
// rows first — the same recorder as S-N-10 — and only then does anything reach Storage; a missing notice
// document refuses before any byte is read (kickoff §6).
import { auth } from "@/modules/auth";
import { err, nowInstant, toActionResult } from "@/modules/platform";
import type { IdentityAction, VerificationActionDetails } from "../types";
import { verification } from "../lib/default-verification";
import { identitySchema } from "../lib/identity-schema";
import { noticeEvidenceSchema } from "../lib/notice-evidence-schema";
import { parseForm } from "../lib/parse-form";
import { recordBiometricNoticeConsent } from "../lib/record-biometric-notice-consent";
import { refuseVerification } from "../lib/refuse-verification";
import { toUploadedFile } from "../lib/to-uploaded-file";

const FIELDS = [
  "idType",
  "document",
  "selfie",
  "surname",
  "givenNames",
  "dateOfBirth",
  "consent",
] as const;
const NOTICE_FIELDS = [
  "noticeOpenedAt",
  "noticeScrollCompletedAt",
  "checkboxesEnabledAt",
  "consent",
] as const;

export const submitIdentityAction: IdentityAction = async (
  _previous,
  formData,
) => {
  const session = await auth.requireRole("nanny");
  if (!session.ok)
    return toActionResult(
      err<VerificationActionDetails>(session.error.code, session.error.message),
    );
  const parsed = parseForm(identitySchema, formData, FIELDS);
  if (!parsed.ok) return toActionResult(parsed);
  const notice = parseForm(noticeEvidenceSchema, formData, NOTICE_FIELDS);
  if (!notice.ok) return toActionResult(notice);
  const tickedAt = nowInstant();
  const consented = await recordBiometricNoticeConsent(session.value.userId, {
    openedAt: notice.value.noticeOpenedAt as never,
    scrollCompletedAt: notice.value.noticeScrollCompletedAt as never,
    checkboxesEnabledAt: notice.value.checkboxesEnabledAt as never,
    timeSpentSeconds: Math.max(
      0,
      Math.round(
        (Date.parse(tickedAt) - Date.parse(notice.value.noticeOpenedAt)) / 1000,
      ),
    ),
    checkboxTimestamps: { agr04_biometric_consent: tickedAt },
  });
  if (!consented.ok)
    return toActionResult(refuseVerification("submitIdentity", consented));
  const submitted = await verification.submitIdentity(session.value.userId, {
    idType: parsed.value.idType,
    document: await toUploadedFile(parsed.value.document),
    selfie: await toUploadedFile(parsed.value.selfie),
    surname: parsed.value.surname,
    givenNames: parsed.value.givenNames,
    dateOfBirth: parsed.value.dateOfBirth as never,
    consentRecordId: consented.value,
  });
  return toActionResult(refuseVerification("submitIdentity", submitted));
};
