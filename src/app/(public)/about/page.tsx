// S-X-20 — About (04 §6.1). Thin by rule (05 §7 rule 5).
import type { Metadata } from "next";
import { AboutContent, publicPageMetadata } from "@/modules/public-site";

export const metadata: Metadata = publicPageMetadata("/about");

export default function AboutPage() {
  return (
    <main>
      <AboutContent />
    </main>
  );
}
