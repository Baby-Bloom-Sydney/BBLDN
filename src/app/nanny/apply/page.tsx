// S-N-19 `/nanny/apply` — apply-from-portal (04 §4.2 b4; ADR-147): the `/apply` funnel reused in `portal` mode
// for an isolated nanny. A nanny who is not isolated has nothing to apply for here and goes to the hub. Thin by
// rule (05 §7 rule 5); the gate already requires the nanny role (01 §4d) and the action re-checks it.
import { redirect } from "next/navigation";
import { LOCALE, MATCHING, SECURITY, URLS } from "@/modules/config";
import {
  NannyApplyFunnel,
  applyFromPortalAction,
  loadNannyProfile,
  saveNannyApplicationAction,
  saveNannyBioAction,
  saveNannyPortfolioAction,
  signUpNannyAction,
} from "@/modules/onboarding-nanny";

export const dynamic = "force-dynamic";

export default async function NannyApplyPage() {
  const profile = await loadNannyProfile();
  if (profile === null || !profile.isIsolated) redirect("/nanny");
  return (
    <NannyApplyFunnel
      mode="portal"
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
      prefill={{
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: profile.email,
        ...(profile.mobile === undefined ? {} : { mobile: profile.mobile }),
      }}
    />
  );
}
