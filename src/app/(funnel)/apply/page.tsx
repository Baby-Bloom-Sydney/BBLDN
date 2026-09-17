// S-X-15…S-X-19 `/apply` — the nanny apply funnel (04 §4.1 rows 1–7; §6.1). Thin by rule (05 §7 rule 5): the
// five actions and the config values are props; the orchestrator holds the answers in the browser until the
// page that writes them.
import { LOCALE, MATCHING, SECURITY, URLS } from "@/modules/config";
import {
  NannyApplyFunnel,
  applyFromPortalAction,
  saveNannyApplicationAction,
  saveNannyBioAction,
  saveNannyPortfolioAction,
  signUpNannyAction,
} from "@/modules/onboarding-nanny";

export const dynamic = "force-dynamic";

export default function ApplyPage() {
  return (
    <NannyApplyFunnel
      mode="apply"
      actions={{
        application: saveNannyApplicationAction,
        portfolio: saveNannyPortfolioAction,
        bio: saveNannyBioAction,
        signup: signUpNannyAction,
        applyFromPortal: applyFromPortalAction,
      }}
      options={{
        qualifications: MATCHING.qualificationLadder,
        minPasswordLength: SECURITY.password.minLength,
        currency: LOCALE.currency,
        areasApi: "/api/areas",
      }}
      signInHref="/login"
      professionalTermsHref={URLS.paths.legal.professionalTerms}
      privacyHref={URLS.paths.legal.privacy}
    />
  );
}
