// `/apply` (S-X-15…S-X-19) — the nanny funnel's frame (04 §6.1). Not indexed: the entry page S-X-24 is the
// crawlable surface; the funnel is a form. Brand from config (L4).
import type { Metadata } from "next";
import { BRAND } from "@/modules/config";

export const metadata: Metadata = {
  title: `Apply to ${BRAND.name}`,
  description: "About ten minutes: where you are in London, your experience, and the work you're looking for.",
  robots: { index: false, follow: false },
};

export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-2xl px-4 lg:px-6">{children}</main>
    </div>
  );
}
