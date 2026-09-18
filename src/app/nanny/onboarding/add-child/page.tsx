// S-N-01 `/nanny/onboarding/add-child` (04 §2.3; `03.19` Rejig) — the contributions pitch after account
// creation, and again from the hub. Thin by rule (05 §7 rule 5): one component, every href a prop.
//
// The Sydney page this replaces bounced on a bonus-programme kill switch and read the under-3 signal to pick
// its wording. Both are gone: there is no bonus in London (ADR-099) and the flag no longer bounces
// (04 §6.3 S-N-01). The active / passive variant the document still names is **not built** — the signal lives
// on `nanny_leads.lead_signals` and `nannyAccountStore.get()` does not answer it — so the page renders the
// active wording for everyone; recorded in the `2g` PROGRESS entry for the planner.
import type { Metadata } from "next";
import { NannyAddChildPitch } from "@/modules/app";

export const metadata: Metadata = {
  title: "Add a family you work for",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function NannyAddChildPage() {
  return (
    <NannyAddChildPitch
      commissionHref="/nanny/commission"
      skipHref="/nanny/onboarding-verification"
      skipLabel="Skip for now — verify my details"
    />
  );
}
