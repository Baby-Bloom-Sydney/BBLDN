"use client";

import { useState } from "react";
import { PolicyModal } from "@/components/legal/PolicyModal";
import type { LegalDocumentId } from "@/modules/platform";

/**
 * "View policy", beside a `ConsentCheckbox` — opens the document that box is about.
 *
 * **Why it is not a link any more (L-009 `3m`).** This mapped a *document id* onto a *page route*: a two-entry
 * table with `` `/legal/${slug}` `` underneath it as a guess. There are eleven seeded documents (`0026`) and
 * seven public `/legal/*` pages, and the guess is right for only four of the eleven ids — driven against
 * `next dev` on the applied stack, `client-tos`, `professional-tos`, `cookie-policy`, `media-consent` and
 * `agr14_nanny_child_add` all answered **404**. The two clickwrap documents that have no page and never will
 * (`media-consent`, `agr14_nanny_child_add`) were a "View policy" link to nothing, beside a tick box — a
 * consent nobody could claim was informed. The cause was the mapping, not a missing row: all eleven rows are
 * seeded and both of those read back at `anon` privilege.
 *
 * **And the two entries the map did name pointed at the wrong documents.** `parent-app-consent` was sent to
 * `/legal/client-terms` (`client-tos`) and `nanny-attestation` to `/legal/professional-terms`
 * (`professional-tos`) — neighbouring documents, not the same one. `parent-app-consent` is its own seeded
 * document ("Parent Consent for a Child's Record"), and it is the one `purposeForAgreement` writes into the
 * consent record. So the surface showed one document and recorded another, and every assertion passed because
 * both rows exist and both say draft.
 *
 * So the fix is to stop deriving a route from a document id at all. `PolicyModal` reads the row **by its own
 * id**: it works for all eleven, has no second domain to keep in step, cannot 404, and shows the document the
 * consent record will name. Where a document genuinely has a public page, that page is linked by its own
 * literal path (`URLS.paths.legal.*`), never assembled from an id.
 *
 * The earlier note here still holds: this must not become a Server Component that inlines `body_md`, which is
 * what leaked `createAdminClient` into client chunks and produced the V2.1 white screen. The body arrives
 * through the `getPolicyMarkdown` server action inside the modal.
 */
export function PolicyContent({ slug }: { readonly slug: LegalDocumentId }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-violet-600 underline hover:text-violet-700"
      >
        View policy
      </button>
      <PolicyModal slug={slug} open={open} onOpenChange={setOpen} />
    </>
  );
}
