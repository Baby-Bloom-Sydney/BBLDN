// S-N-02 `/nanny/commission` (04 §2.3; `03.37` NEW) — the commission explainer and the book-a-call section.
// Thin by rule (05 §7 rule 5): one read, one component, every href and action a prop.
//
// A nanny with no party row is sent to the profile completion, the same answer S-N-11 gives her; an isolated
// nanny is sent to her hub, where S-N-22 offers her the one thing she can act on (ADR-147: she applies first).
import type { Metadata } from "next";
import { BRAND } from "@/modules/config";
import { redirect } from "next/navigation";
import {
  bookNannyCallAction,
  listNannySlotsAction,
} from "@/modules/call-layer";
import {
  NannyCommissionPage,
  loadCommissionPage,
} from "@/modules/onboarding-nanny";

export const metadata: Metadata = {
  title: "How commission works",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ACTIONS = Object.freeze({
  subject: "nanny" as const,
  choose: bookNannyCallAction,
  list: listNannySlotsAction,
});

export default async function NannyCommissionRoute() {
  const load = await loadCommissionPage();
  if (load.kind === "no-nanny") redirect("/nanny/register");
  if (load.kind === "isolated") redirect("/nanny");
  return (
    <NannyCommissionPage
      view={load.view}
      actions={ACTIONS}
      hubHref="/nanny"
      addChildHref="/nanny/onboarding/add-child"
      brandName={BRAND.name}
    />
  );
}
