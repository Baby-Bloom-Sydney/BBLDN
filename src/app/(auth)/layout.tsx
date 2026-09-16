// The `(auth)` group (01 §4d): signed-out screens S-X-05 … S-X-09. Thin by rule (05 §7 rule 5): brand and legal
// links from config, the chrome from the connector. `noindex` for the group (05 §8.3); `no-referrer` so an
// `?invite=` token never leaves in a Referer header.
import type { Metadata } from "next";
import { BRAND, URLS } from "@/modules/config";
import { AuthShell } from "@/modules/onboarding-parent";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthShell
      brandName={BRAND.name}
      homeHref="/"
      clientTermsHref={URLS.paths.legal.clientTerms}
      privacyHref={URLS.paths.legal.privacy}
    >
      {children}
    </AuthShell>
  );
}
