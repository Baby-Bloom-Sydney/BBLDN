// `int.rollback-0029` — **ADR-165 (3) for `0029`**: apply forward → twin → and assert what the twin promised.
//
// `0029` adds no grant, no referential action and no table, so there is no security clause for ADR-165 (2) to be
// about, and the twin says so in its header rather than leaving it as an absence. What it *does* promise is two
// things, and both are asserted here rather than read:
//
//   1. **What it removes** — the read and its index, and nothing else. A twin that took a neighbouring index with
//      it would be a silent performance regression on a table nobody would think to look at.
//   2. **What it must not touch** — the carry rows. They are ordinary `consent_records` rows on an append-only
//      table, and they are the only evidence that the annual check ever ran (ADR-174). A twin that tidied them
//      away would destroy exactly the fact the ADR wrote them down for.
import { resolve } from "node:path";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";
import { bodyOf, type StrippedTwin } from "./rollback-twin";

const TWIN = resolve(__dirname, "../rollbacks/0029_renewal-sweep.rollback.sql");

const SUBJECT = "000000d9-0000-4000-8000-000000000001";

let db: Client;
let stripped: StrippedTwin;

async function exists(kind: "function" | "index"): Promise<boolean> {
  const sql =
    kind === "function"
      ? `select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'consent_subjects_due_for_renewal'`
      : `select 1 from pg_indexes where schemaname = 'public'
          and indexname = 'consent_records_purpose_subject_recent_idx'`;
  const { rows } = await db.query(sql);
  return rows.length > 0;
}

beforeAll(async () => {
  db = await connect();
  stripped = bodyOf(TWIN);
  await db.query("begin");

  await db.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                             email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                             created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
             'rollback-renewal@example.test', 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
    [SUBJECT],
  );
  await db.query(
    `insert into public.user_roles (user_id, role) values ($1, 'parent')`,
    [SUBJECT],
  );
  // A carry row, exactly as the sweep writes it.
  const { rows } = await db.query<{ version: number; content_hash: string }>(
    `select version, content_hash from public.legal_documents
      where document_id = 'client-tos' order by version desc limit 1`,
  );
  await db.query(
    `insert into public.consent_records
       (user_id, party, agreement_id, checkpoint_id, checkpoint_text, purpose,
        document_id, document_version, document_content_hash, consent_given)
     values ($1, 'parent', 'AGR-01', 'annual_renewal_carry_forward',
             'Annual review: carried forward.', 'client-tos', 'client-tos', $2, $3, true)`,
    [SUBJECT, rows[0].version, rows[0].content_hash],
  );
});

afterAll(async () => {
  await db?.query("rollback");
  await db?.end();
});

describe("int.rollback-0029 — the twin", () => {
  it("owns exactly one transaction, so stripping it is unambiguous", () => {
    expect(stripped.removed).toBe(2);
  });

  it("★ applies cleanly on a database 0029 applied to", async () => {
    expect(await exists("function")).toBe(true);
    expect(await exists("index")).toBe(true);

    await db.query(stripped.sql);

    expect(await exists("function")).toBe(false);
    expect(await exists("index")).toBe(false);
  });

  it("★ leaves the carry rows alone — they are the evidence that the check ran (ADR-174)", async () => {
    const { rows } = await db.query<{ checkpoint_id: string }>(
      `select checkpoint_id from public.consent_records where user_id = $1`,
      [SUBJECT],
    );

    expect(rows.map((row) => row.checkpoint_id)).toEqual([
      "annual_renewal_carry_forward",
    ]);
  });

  it("★ removes no index it did not create", async () => {
    const { rows } = await db.query<{ indexname: string }>(
      `select indexname from pg_indexes
        where schemaname = 'public' and tablename = 'consent_records'
        order by indexname`,
    );

    expect(rows.map((row) => row.indexname)).toContain(
      "consent_records_user_purpose_idx",
    );
  });

  it("★ the consent tables' own guards are untouched — an append-only row is still append-only", async () => {
    let refused = false;
    await db.query("savepoint attempt");
    try {
      await db.query(
        `update public.consent_records set checkpoint_text = 'edited' where user_id = $1`,
        [SUBJECT],
      );
    } catch {
      refused = true;
    }
    await db.query("rollback to savepoint attempt");

    expect(refused).toBe(true);
  });
});
