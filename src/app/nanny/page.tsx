// S-N-11 `/nanny` — the hub in its three states, S-N-22 being the isolated one (04 §6.3; ADR-147). Thin by rule
// (05 §7 rule 5): one read, one component. A nanny session with no party row is sent to the profile completion
// (S-N-18) — the one screen that makes sense for an account the funnel never finished.
import { redirect } from "next/navigation";
import { NannyHub, loadNannyHub } from "@/modules/onboarding-nanny";

export const dynamic = "force-dynamic";

export default async function NannyHubPage() {
  const view = await loadNannyHub();
  if (view === null) redirect("/nanny/register");
  return (
    <NannyHub
      view={view}
      profileHref="/nanny/register"
      verificationHref="/nanny/onboarding-verification"
      settingsHref="/nanny/settings"
      childrenHref="/nanny/children"
    />
  );
}
