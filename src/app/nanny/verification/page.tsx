// S-N-09 `/nanny/verification` — resume / retry / status (04 §6.3). Thin by rule: one read, one component.
import {
  VerificationStatusPage,
  loadVerificationStatus,
} from "@/modules/verification";

export const dynamic = "force-dynamic";

export default async function NannyVerificationPage() {
  const state = await loadVerificationStatus();
  return (
    <VerificationStatusPage
      state={state}
      hrefs={{ wizard: "/nanny/onboarding-verification", hub: "/nanny" }}
    />
  );
}
