// S-N-10 `/nanny/verify` — the standalone biometric-notice consent (04 §6.3; AGR-04). Thin by rule: one read, one
// component, the action a prop; done → S-N-09.
import {
  BiometricNoticeConsent,
  loadBiometricNotice,
  recordBiometricConsentAction,
  wizardOptions,
} from "@/modules/verification";

export const dynamic = "force-dynamic";

export default async function NannyVerifyPage() {
  const notice = await loadBiometricNotice();
  return (
    <BiometricNoticeConsent
      action={recordBiometricConsentAction}
      notice={notice}
      disclosures={wizardOptions().disclosures}
      hrefs={{ back: "/nanny", next: "/nanny/verification" }}
    />
  );
}
