// The current version of one legal document, read for a `/legal/*` page (L-009 `3b`).
//
// **Why the anon client and not the admin one.** `src/lib/actions/legal/get-policy.ts` does a near-identical
// read for `PolicyModal` and does it with `createAdminClient` — the service role. That is wrong for a page an
// unauthenticated visitor loads: `0003` gave `legal_documents` an explicit `anon` SELECT policy (and no write
// policy for any client role), so the published text is readable at exactly the privilege a visitor already
// has, and a public page that only renders with the service-role key would also stop rendering the moment that
// key is absent. Least privilege here is also the more available choice. The modal's own read is not this
// unit's file and is left alone; consolidating the two is recorded in L-009 PROGRESS.
//
// **Highest version wins, and `null` is an outage, not a body.** The table is append-only and ratified text
// lands as a *new* version (`0026`'s own comment), so "current" is `max(version)`. When there is no row, no
// body, or the read errors, this answers `null` and the page says so — it never falls back to text compiled
// into the bundle, because that fallback is precisely how Sydney's policy survived into a London build.
import { createClient } from "@/lib/supabase/server";
import type { LegalDocumentId } from "@/modules/platform";

export type LegalDocumentBody = {
  readonly id: LegalDocumentId;
  readonly version: number;
  /** `legal_documents.effective_date`, ISO `YYYY-MM-DD`. */
  readonly effectiveDate: string;
  readonly bodyMd: string;
};

type Row = {
  readonly body_md: string | null;
  readonly version: number;
  readonly effective_date: string;
};

export async function fetchLegalDocument(
  id: LegalDocumentId,
): Promise<LegalDocumentBody | null> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("legal_documents")
      .select("body_md, version, effective_date")
      .eq("document_id", id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle<Row>();
    if (error !== null || data === null || data.body_md === null) return null;
    return {
      id,
      version: data.version,
      effectiveDate: data.effective_date,
      bodyMd: data.body_md,
    };
  } catch {
    return null;
  }
}
