// S-X-24 `/childcare-professionals` — the nanny entry page (04 §6.1). Thin by rule (05 §7 rule 5): the copy is
// the connector's, the brand is config's (L4), the one exit is `/apply` (S-X-15).
import type { Metadata } from "next";
import { BRAND } from "@/modules/config";
import { NannyEntryContent } from "@/modules/onboarding-nanny";

export const metadata: Metadata = {
  title: "Work with London families",
  description:
    "Experienced nannies, introduced to London families who take early years seriously. Apply once; we do the finding.",
  alternates: { canonical: "/childcare-professionals" },
};

export default function ChildcareProfessionalsPage() {
  return <NannyEntryContent applyHref="/apply" brandName={BRAND.name} />;
}
