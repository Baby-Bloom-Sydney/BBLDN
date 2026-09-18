// S-N-01 `/nanny/onboarding/add-child` (04 §2.3; `03.19` Rejig) — the contributions pitch after account
// creation, and again from the hub. Thin by rule (05 §7 rule 5): one read, one component, every href a prop.
//
// The Sydney page this replaces bounced on a bonus-programme kill switch and read the under-3 signal to pick its
// wording. The bounce is gone for good (there is no bonus in London — ADR-099; 04 §6.3 S-N-01), and `2d` gave the
// **variant** back (kickoff debt 14): the signal N1 captured and never shows her now reaches this route on her
// own row, and the copy follows it. A read that answers nothing leaves the active wording standing, which is the
// default for every account created before the funnel captured the signal.
import type { Metadata } from "next";
import { BRAND } from "@/modules/config";
import { NannyAddChildPitch } from "@/modules/app";
import { loadNannyProfile } from "@/modules/onboarding-nanny";

export const metadata: Metadata = {
  title: "Add a family you work for",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function NannyAddChildPage() {
  const profile = await loadNannyProfile();
  return (
    <NannyAddChildPitch
      commissionHref="/nanny/commission"
      skipHref="/nanny/onboarding-verification"
      skipLabel="Skip for now — verify my details"
      brandName={BRAND.name}
      {...(profile?.worksWithUnderThrees === undefined
        ? {}
        : { worksWithUnderThrees: profile.worksWithUnderThrees })}
    />
  );
}
