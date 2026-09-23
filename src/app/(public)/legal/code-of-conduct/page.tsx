// S-X-25 — code-of-conduct. The body is `legal_documents`' current version, not JSX (L-009 `3b`).
import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal/LegalDocumentPage";
import { URLS } from "@/modules/config";
import { publicPageMetadata } from "@/modules/public-site";

const PATH = URLS.paths.legal.codeOfConduct;

export const metadata: Metadata = publicPageMetadata(PATH);

export default function CodeOfConductPage() {
  return <LegalDocumentPage path={PATH} />;
}
