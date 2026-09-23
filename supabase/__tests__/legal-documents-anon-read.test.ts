// `int.legal-documents-anon-read` (L-009 `3m`) — the service role is not needed to read a legal document.
//
// `get-policy.ts` read `legal_documents` with `createAdminClient` "to bypass RLS". There is nothing to bypass:
// `0003` gives the table an explicit `anon` SELECT policy with `qual = true`, and `0026` seeds all eleven
// day-one documents. This runs `getPolicyMarkdown`'s exact statement as `anon`, for every one of the eleven
// ids, against the applied set — which is the only way to know the claim rather than believe it, and the
// declared-versus-used check the grant deserves.
//
// It is driven the other way in the same file: with the `anon` policy dropped inside a savepoint, the same
// reads return nothing. So a pass here is the policy working, not the suite reading as `postgres`.
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";
import { asRole } from "./rls-fixtures";

/** 02 §4.1's day-one slugs, all eleven (`0026`). */
const DOCUMENT_IDS = [
  "client-tos",
  "professional-tos",
  "privacy-policy",
  "biometric-notice",
  "code-of-conduct",
  "cookie-policy",
  "disclaimer",
  "parent-app-consent",
  "nanny-attestation",
  "media-consent",
  "agr14_nanny_child_add",
] as const;

/** Exactly what `getPolicyMarkdown` sends: newest version of one document. */
const CURRENT_VERSION_READ = `
  select body_md, version, effective_date
  from public.legal_documents
  where document_id = $1
  order by version desc
  limit 1`;

let db: Client;

beforeAll(async () => {
  db = await connect();
  await db.query("begin");
});

afterAll(async () => {
  await db?.query("rollback");
  await db?.end();
});

type Row = { body_md: string | null; version: number; effective_date: Date };

describe("int.legal-documents-anon-read — every seeded document reads at visitor privilege", () => {
  it.each(DOCUMENT_IDS)("%s comes back as anon, with a body", async (id) => {
    const rows = await asRole<Row>(db, null, CURRENT_VERSION_READ, [id]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.body_md ?? "").not.toBe("");
  });

  it("an unseeded id is nothing, not an error — the caller renders a refusal", async () => {
    const rows = await asRole<Row>(db, null, CURRENT_VERSION_READ, [
      "no-such-document",
    ]);
    expect(rows).toEqual([]);
  });

  // **Local stack only, and the reason is a lock, not tidiness** (security pass, LOW). `drop policy` takes
  // `ACCESS EXCLUSIVE` on `legal_documents`, which conflicts with a plain `SELECT`. The rollback releases it
  // immediately and no failure path can leave the policy dropped — a savepoint rollback in `finally`, an outer
  // transaction that is only ever rolled back, and a killed connection aborting its own work. But for the
  // eleven reads in between, any other session touching the table blocks; `db-client.ts` says this same suite
  // can be pointed at `bb-ldn-preview` with `SUPABASE_DB_URL`, and stalling a shared environment to prove a
  // local point is not a trade worth making. Where it does not run, the eleven cases above still run.
  const localOnly = process.env.SUPABASE_DB_URL === undefined ? it : it.skip;

  localOnly(
    "without the anon policy the same reads return nothing (the gate measures the policy)",
    async () => {
      await db.query("savepoint no_anon_policy");
      try {
        await db.query(
          "drop policy legal_documents_anon_select on public.legal_documents",
        );
        for (const id of DOCUMENT_IDS) {
          const rows = await asRole<Row>(db, null, CURRENT_VERSION_READ, [id]);
          expect(rows).toEqual([]);
        }
      } finally {
        await db.query("rollback to savepoint no_anon_policy");
      }
    },
  );
});
