// S-X-25 — cookies. The body is `legal_documents`' current version, not JSX (L-009 `3b`).
//
// The one legal page with something under the document: ADR-175 (a)'s preference screen (`3g`), which the
// banner links to by the `#preferences` anchor kept below. It is a control, not policy text, so it stays in the
// page while the words above it come from the row.
import type { Metadata } from "next";
import { CookiePreferencesSection } from "@/components/legal/CookiePreferencesSection";
import { LegalDocumentPage } from "@/components/legal/LegalDocumentPage";
import { URLS } from "@/modules/config";
import { publicPageMetadata } from "@/modules/public-site";

const PATH = URLS.paths.legal.cookies;

export const metadata: Metadata = publicPageMetadata(PATH);

export default function CookiePolicyPage() {
  return (
    <>
      <LegalDocumentPage path={PATH} />
      <section id="preferences" className="mt-10 scroll-mt-24">
        <h2 className="mb-1 text-base font-semibold text-slate-900">
          Manage your cookie preferences
        </h2>
        <p className="mb-4 text-xs text-slate-500">
          Use the toggles below to control which categories of cookies are
          active. Essential cookies cannot be turned off — the site does not
          work without them. Changes take effect immediately.
        </p>
        <CookiePreferencesSection />
      </section>
    </>
  );
}
