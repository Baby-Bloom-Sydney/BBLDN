// S-N-17 `/nanny/profile` — her own profile (04 §6.3; `03.22` Rejig). Thin by rule (05 §7 rule 5): one read, one
// component, every href a prop. The Sydney screen this replaces read the Sydney check columns on `verifications` through a
// service-role client in the page and offered a second editor for fields S-N-18 already owns; both are gone.
//
// A session with no nanny row goes to S-N-18, the one screen that makes sense for an account the funnel never
// finished — the same answer the hub gives.
import { redirect } from "next/navigation";
import {
  NannyMyProfile,
  loadNannyProfilePage,
} from "@/modules/onboarding-nanny";

export const dynamic = "force-dynamic";

export default async function NannyProfilePage() {
  const view = await loadNannyProfilePage();
  if (view === null) redirect("/nanny/register");
  return (
    <NannyMyProfile
      view={view}
      editHref="/nanny/register"
      verificationHref="/nanny/verification"
      hubHref="/nanny"
      settingsHref="/nanny/settings"
    />
  );
}
