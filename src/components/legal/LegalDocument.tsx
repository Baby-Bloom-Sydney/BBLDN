// One `/legal/*` page's body, rendered from `legal_documents` (L-009 `3b`).
//
// Presentational by design: it is handed a document and never reads one, so the page owns the fetch and this
// file can be driven in a unit test with a body string — including the two states that matter and that a
// hand-written page could not have: a draft, and nothing at all.
//
// **The banner is not decoration.** L-009's kickoff §3 forbids any unit from shipping a legal document as if it
// were final, and every v1 body `0026` seeded says so in its own second line. A bold line three paragraphs into
// a wall of prose is not a reader being told; a banner above the title is. It is driven off the body's own
// words (`DRAFT_MARKING`), so it cannot be left up after ratified text lands, and cannot be taken down while
// draft text is still being served.
//
// **`null` renders a refusal, never a fallback.** No row, no body, or a failed read shows the visitor that the
// document is not published and gives them somewhere to go. The alternative — text compiled into the page as a
// backstop — is exactly how Sydney's NSW policy was still being served from a London build.
import Link from "next/link";
import { MarkdownBody } from "./MarkdownBody";
import { DRAFT_MARKING } from "@/lib/legal/draft-marking";
import { parseMarkdownBlocks } from "@/lib/legal/parse-markdown-blocks";
import type { LegalDocumentBody } from "@/lib/legal/fetch-legal-document";

export function LegalDocument({
  document,
  fallbackTitle,
}: {
  readonly document: LegalDocumentBody | null;
  /** Shown as the `<h1>` when the body has no leading `# ` heading, and on the unavailable page. */
  readonly fallbackTitle: string;
}) {
  if (document === null) {
    return (
      <article>
        <h1 className="text-2xl font-bold text-slate-900">{fallbackTitle}</h1>
        <p className="mt-4 text-sm text-slate-600">
          This document has not been published yet. Nothing is being shown in
          its place.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          <Link href="/contact" className="text-violet-600 hover:underline">
            Contact us
          </Link>{" "}
          if you need it.
        </p>
      </article>
    );
  }

  const blocks = parseMarkdownBlocks(document.bodyMd);
  const lead = blocks[0];
  const hasOwnTitle =
    lead !== undefined && lead.kind === "heading" && lead.level === 1;
  const title = hasOwnTitle ? lead.text : fallbackTitle;
  const body = hasOwnTitle ? blocks.slice(1) : blocks;
  const isDraft = document.bodyMd.includes(DRAFT_MARKING);

  return (
    <article>
      {isDraft && (
        <p
          role="note"
          className="mb-6 rounded-md border-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900"
        >
          {DRAFT_MARKING}. This text has not been reviewed by a solicitor and
          must not be relied on.
        </p>
      )}
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">
          Version {document.version} | Effective {document.effectiveDate}
        </p>
      </header>
      <MarkdownBody blocks={body} />
    </article>
  );
}
