"use server";

import { createClient } from "@/lib/supabase/server";
import type { LegalDocumentId } from "@/modules/platform";

export type LegalPolicyDocument = {
  body_md: string | null;
  version: number;
  effective_date: string;
};

/**
 * Fetch the highest-version body for a legal document from `legal_documents`. Called by `PolicyModal` on open;
 * lives behind a `'use server'` boundary so no driver client reaches a client chunk.
 *
 * **Read at the caller's own privilege, not the service role's (L-009 `3m`; `3b`'s Q-2).** This used
 * `createAdminClient` to "bypass RLS". `0003` gives `legal_documents` an explicit `anon` SELECT policy with
 * `qual = true` and no write policy for any client role, so every caller — signed in or not — already holds
 * exactly the privilege this read needs; driven as `anon` against the applied set, all eleven seeded ids come
 * back. The service role turned an RLS decision into a key-possession decision: more privilege than the read
 * wants, and *less availability*, because the modal then stops rendering the moment that key is absent — and a
 * consent surface that cannot show the document is a consent nobody can claim was informed.
 *
 * Highest version wins: the table is append-only and ratified text lands as a new version (`0026`), so
 * "current" is `max(version)`. `null` — unknown id, no body, or a refused read — is an outage the caller
 * renders as a refusal; no body is compiled into the bundle as a fallback.
 */
export async function getPolicyMarkdown(
  slug: LegalDocumentId,
): Promise<LegalPolicyDocument | null> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("legal_documents")
      .select("body_md, version, effective_date")
      .eq("document_id", slug)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle<LegalPolicyDocument>();
    if (error || !data) return null;
    return data;
  } catch (err) {
    console.error("[getPolicyMarkdown] failed for slug=" + slug + ":", err);
    return null;
  }
}
