"use server";
// S-N-10 `/nanny/verify` — the standalone biometric-notice consent (04 §6.3; AGR-04). The same recorder as
// S-N-05's tick; this surface exists for the dev / legal link entry.
import { auth } from "@/modules/auth";
import { err, nowInstant, ok, toActionResult } from "@/modules/platform";
import type {
  BiometricConsentAction,
  VerificationActionDetails,
} from "../types";
import { noticeEvidenceSchema } from "../lib/notice-evidence-schema";
import { parseForm } from "../lib/parse-form";
import { recordBiometricNoticeConsent } from "../lib/record-biometric-notice-consent";
import { refuseVerification } from "../lib/refuse-verification";

const FIELDS = [
  "noticeOpenedAt",
  "noticeScrollCompletedAt",
  "checkboxesEnabledAt",
  "consent",
] as const;

export const recordBiometricConsentAction: BiometricConsentAction = async (
  _previous,
  formData,
) => {
  const session = await auth.requireRole("nanny");
  if (!session.ok)
    return toActionResult(
      err<VerificationActionDetails>(session.error.code, session.error.message),
    );
  const parsed = parseForm(noticeEvidenceSchema, formData, FIELDS);
  if (!parsed.ok) return toActionResult(parsed);
  const tickedAt = nowInstant();
  const recorded = await recordBiometricNoticeConsent(session.value.userId, {
    openedAt: parsed.value.noticeOpenedAt as never,
    scrollCompletedAt: parsed.value.noticeScrollCompletedAt as never,
    checkboxesEnabledAt: parsed.value.checkboxesEnabledAt as never,
    timeSpentSeconds: Math.max(
      0,
      Math.round(
        (Date.parse(tickedAt) - Date.parse(parsed.value.noticeOpenedAt)) / 1000,
      ),
    ),
    checkboxTimestamps: { agr04_biometric_consent: tickedAt },
  });
  if (!recorded.ok)
    return toActionResult(
      refuseVerification("recordBiometricConsent", recorded),
    );
  return toActionResult(ok({ recorded: true as const }));
};
