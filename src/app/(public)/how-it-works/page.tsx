// S-X-21 — heading-only stub, route kept (04 §6.1). Thin by rule (05 §7 rule 5).
import type { Metadata } from "next";
import { HowItWorksStub, publicPageMetadata } from "@/modules/public-site";

export const metadata: Metadata = publicPageMetadata("/how-it-works");

export default function HowItWorksPage() {
  return (
    <main>
      <HowItWorksStub />
    </main>
  );
}
