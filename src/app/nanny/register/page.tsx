// S-N-18 `/nanny/register` — the ten-step profile completion (04 §6.3; `03.17` / `03.18`). Thin by rule (05 §7
// rule 5): the profile is prefilled from the nanny's own rows, the action is a prop, `?step=` picks up where
// she left off. Done → S-N-17. A session with no party row is refused by the action, not guessed at here.
import { notFound } from "next/navigation";
import { LOCALE, MATCHING, SECURITY } from "@/modules/config";
import {
  NannyProfileStepper,
  loadNannyProfile,
  saveNannyProfileStepAction,
} from "@/modules/onboarding-nanny";

export const dynamic = "force-dynamic";

export default async function NannyRegisterPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const profile = await loadNannyProfile();
  if (profile === null) notFound();
  const step = Number.parseInt(String(searchParams.step ?? "0"), 10);
  return (
    <NannyProfileStepper
      action={saveNannyProfileStepAction}
      profile={profile}
      step={Number.isFinite(step) ? step : 0}
      options={{
        qualifications: MATCHING.qualificationLadder,
        minPasswordLength: SECURITY.password.minLength,
        currency: LOCALE.currency,
        areasApi: "/api/areas",
      }}
      doneHref="/nanny/profile"
    />
  );
}
