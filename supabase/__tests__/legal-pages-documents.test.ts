// `int.legal-pages` — the claim the seven `/legal/*` pages now rest on (L-009 `3b`, kickoff §6 rule 1).
//
// The unit suite proves the pages carry no body of their own and that a draft-marked body raises the banner.
// Neither of those is worth anything if the rows the pages point at are not there, so this one asks the applied
// database, for every segment in `LEGAL_PAGE_DOCUMENTS`:
//
//   1. **there is a current version** — `max(version)`, with a body; a page whose read answers nothing renders
//      "not published", which is honest but is not a legal page;
//   2. **it says it is a draft** — `DRAFT_MARKING`, the same string `0026` writes and `LegalDocument` looks
//      for. This is L-009 kickoff §3's control, asserted at the far end of the chain: seed → row → page;
//   3. **it is not a Sydney document** — the jurisdiction, statute, regulator id, entity and domain of the
//      platform these pages were copied from appear nowhere in the words a visitor will now read. The unit
//      suite makes the same assertion over the page *sources*; this one makes it over the *content*, and the
//      two together are what "no page serves a Sydney body" actually means;
//   4. **it opens with a heading** — the page takes its `<h1>` from the body's leading `# `, so a body without
//      one would publish under the register's fallback title instead of its own.
//
// When `3a`'s solicitor text lands as version 2, case 2 is the one that changes — deliberately: it must be
// edited by whoever ratifies the text, which is the moment to re-read what this suite claims.
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";
import { DRAFT_MARKING } from "@/lib/legal/draft-marking";
import { LEGAL_PAGE_DOCUMENTS } from "@/lib/legal/legal-page-documents";
import { parseMarkdownBlocks } from "@/lib/legal/parse-markdown-blocks";

/** Same list as `src/components/legal/LegalDocument.test.tsx`, applied to the words rather than the source. */
const SYDNEY_MARKERS = [
  "Sydney",
  "NSW",
  "New South Wales",
  "Privacy Act 1988",
  "Australian Privacy Principles",
  "ABN",
  "babybloomsydney",
  ".com.au",
] as const;

const PAGES = Object.entries(LEGAL_PAGE_DOCUMENTS).map(([segment, id]) => ({
  segment,
  id: id as string,
}));

let db: Client;

beforeAll(async () => {
  db = await connect();
});

afterAll(async () => {
  await db?.end();
});

async function currentBody(id: string): Promise<string | null> {
  const { rows } = await db.query<{ body_md: string | null }>(
    `select body_md
       from public.legal_documents
      where document_id = $1
      order by version desc
      limit 1`,
    [id],
  );
  return rows[0]?.body_md ?? null;
}

describe("int.legal-pages — every page has a document to render (L-009 `3b`)", () => {
  it("has seven pages to check", () => {
    expect(PAGES.length).toBe(7);
  });

  it.each(PAGES)(
    "/legal/$segment → $id has a current version",
    async (page) => {
      expect(await currentBody(page.id)).toBeTypeOf("string");
    },
  );

  it.each(PAGES)(
    "/legal/$segment → $id says it is a draft (kickoff §3)",
    async (page) => {
      expect(await currentBody(page.id)).toContain(DRAFT_MARKING);
    },
  );

  it.each(PAGES)(
    "/legal/$segment → $id is not a Sydney document",
    async (page) => {
      const body = (await currentBody(page.id)) ?? "";
      for (const marker of SYDNEY_MARKERS) expect(body).not.toContain(marker);
    },
  );

  it.each(PAGES)("/legal/$segment → $id titles itself", async (page) => {
    const blocks = parseMarkdownBlocks((await currentBody(page.id)) ?? "");
    expect(blocks[0]).toMatchObject({ kind: "heading", level: 1 });
  });
});
