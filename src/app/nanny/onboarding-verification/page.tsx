// S-N-03…S-N-08 `/nanny/onboarding-verification` — the verification wizard (04 §6.3). Thin by rule (05 §7 rule 5):
// three reads, one component; the actions are props; `?step=` may name an open step, never skip one (`03.21`:
// the wizard reopens at the first incomplete step). The S-N-04 area picker is `onboarding-nanny`'s combobox,
// passed as a slot because 01 §2.3 gives `verification` no arrow to that module. Everything settled → S-N-09.
import { notFound, redirect } from "next/navigation";
import { DistrictCombobox, loadNannyProfile } from "@/modules/onboarding-nanny";
import {
  VerificationWizard,
  WIZARD_STEPS,
  firstIncompleteStep,
  loadBiometricNotice,
  loadVerificationStatus,
  processVerificationAction,
  recordBiometricConsentAction,
  saveVerificationContactAction,
  submitDbsAction,
  submitIdentityAction,
  submitRightToWorkAction,
  wizardOptions,
} from "@/modules/verification";

export const dynamic = "force-dynamic";

const OPEN = new Set(["not_started", "rejected", "failed", "expired"]);

export default async function OnboardingVerificationPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const [profile, state, notice] = await Promise.all([
    loadNannyProfile(),
    loadVerificationStatus(),
    loadBiometricNotice(),
  ]);
  if (profile === null) notFound();
  const computed = firstIncompleteStep(state);
  if (computed === "status") redirect("/nanny/verification");
  const requested = Number.parseInt(String(searchParams.step ?? ""), 10);
  const requestedStep = WIZARD_STEPS[requested];
  const requestedOpen =
    requestedStep !== undefined &&
    requestedStep.section !== null &&
    OPEN.has(
      state?.sections.find((s) => s.section === requestedStep.section)
        ?.status ?? "not_started",
    );
  const initialStep = requestedOpen ? requested : computed;
  return (
    <VerificationWizard
      initialStep={initialStep}
      state={state}
      prefill={{
        firstName: profile.firstName,
        lastName: profile.lastName,
        ...(profile.mobile === undefined ? {} : { mobile: profile.mobile }),
        ...(profile.district === undefined
          ? {}
          : { district: profile.district }),
        ...(profile.area === undefined ? {} : { area: profile.area }),
        ...(profile.dateOfBirth === undefined
          ? {}
          : { dateOfBirth: profile.dateOfBirth }),
      }}
      notice={notice}
      actions={{
        contact: saveVerificationContactAction,
        identity: submitIdentityAction,
        dbs: submitDbsAction,
        rightToWork: submitRightToWorkAction,
        process: processVerificationAction,
        biometricConsent: recordBiometricConsentAction,
      }}
      options={wizardOptions()}
      locationField={
        <DistrictCombobox
          areasApi="/api/areas"
          defaultValue={
            profile.area !== undefined && profile.district !== undefined
              ? { name: profile.area, district: profile.district }
              : null
          }
        />
      }
      hrefs={{
        hub: "/nanny",
        status: "/nanny/verification",
        notice: "/nanny/verify",
      }}
    />
  );
}
