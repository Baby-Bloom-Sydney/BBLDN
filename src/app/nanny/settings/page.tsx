// S-N-21 `/nanny/settings` (04 §6.3; `03.24` Rejig — **the commission pay section is dropped**, N-2). Thin by
// rule (05 §7 rule 5): one read, one component, every href and every option a prop.
//
// The Sydney screen this replaces read `user_profiles`, `nannies`, the Sydney check columns on `verifications` and `child_client`
// through a service-role client **in the page**, and wrote contact details through a road of its own. All of
// that is gone: the reads are the module's, the verification state comes from `verification.getStatus` and
// nothing else, and the contact fields are S-N-18's own location step through `update_nanny_profile(p_contact)`.
import { redirect } from "next/navigation";
import { LOCALE, MATCHING, SECURITY } from "@/modules/config";
import {
  NannySettings,
  loadNannySettings,
  saveNannyProfileStepAction,
} from "@/modules/onboarding-nanny";

export const dynamic = "force-dynamic";

export default async function NannySettingsPage() {
  const loaded = await loadNannySettings();
  if (loaded === null) redirect("/nanny/register");
  return (
    <NannySettings
      view={loaded.view}
      profile={loaded.profile}
      action={saveNannyProfileStepAction}
      options={{
        qualifications: MATCHING.qualificationLadder,
        minPasswordLength: SECURITY.password.minLength,
        currency: LOCALE.currency,
        areasApi: "/api/areas",
      }}
      verificationHref="/nanny/verification"
      hubHref="/nanny"
      passwordHref="/forgot-password"
    />
  );
}
