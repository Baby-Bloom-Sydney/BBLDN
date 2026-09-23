// The whole of a `/legal/*` route (L-009 `3b`) — the fetch, then `LegalDocument`.
//
// Every page under `src/app/(public)/legal/` is now three lines over this component: its register metadata and
// its path. That is the point of the unit. The bodies used to be 600–1,250 lines of JSX each, one copy per
// page, so "the policy changed" meant a code change, a review and a deploy — and the words a user had accepted
// lived in a git history rather than in the row her consent record names. Now the row is the document, the page
// is a view of it, and `3a`'s solicitor text lands as version 2 with no page touched.
//
// **An unmapped path is a refusal, not a crash and not a guess.** `LEGAL_PAGE_DOCUMENTS` answers `undefined`
// for a route nobody has pointed at a document; that renders the same "not published" page a failed read does.
//
// The page hands in its `URLS.paths.legal.*` path — the same value its `publicPageMetadata` call uses, so the
// title a visitor sees, the canonical URL and the document read can never name three different pages.
import { LegalDocument } from "./LegalDocument";
import { fetchLegalDocument } from "@/lib/legal/fetch-legal-document";
import { LEGAL_PAGE_DOCUMENTS } from "@/lib/legal/legal-page-documents";
import { PUBLIC_ROUTES } from "@/modules/public-site";

const LEGAL_PREFIX = "/legal/";

/** Only ever seen if the register loses a row; the register is the title's one source (04 §2.1). */
const UNTITLED = "Legal";

export async function LegalDocumentPage({ path }: { readonly path: string }) {
  const segment = path.startsWith(LEGAL_PREFIX)
    ? path.slice(LEGAL_PREFIX.length)
    : "";
  const id = LEGAL_PAGE_DOCUMENTS[segment];
  const document = id === undefined ? null : await fetchLegalDocument(id);
  const title =
    PUBLIC_ROUTES.find((route) => route.path === path)?.title ?? UNTITLED;
  return <LegalDocument document={document} fallbackTitle={title} />;
}
