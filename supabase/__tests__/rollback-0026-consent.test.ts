// `int.rollback-0026` — **ADR-165 (3) for `0026`**: apply forward → twin → and assert the hole is still shut.
//
// `0026` carries a security clause and says so in its header: `consent_records.user_id` and
// `biometric_consent_records.user_id` move from `on delete cascade` to `on delete restrict`, so that a
// `delete from auth.users` whose subject holds Art 7(1) evidence is **refused** rather than silently destroying
// it (ADR-170; 07 §6.1's scrub-and-retain is the product path). ADR-165 (1) says a twin keeps such a clause and
// names it; ADR-165 (3) says the twin ships a test that proves it.
//
// **Why arm (1) and not arm (2).** ADR-165 (2)'s `RAISE EXCEPTION` gate is owed by a twin that would hand an
// access hole back to reverted code that cannot run without it. Nothing needs the cascade: no road in the
// application hard-deletes an `auth.users` row — `delete-account` scrubs (07 §6.1 step 5). So the twin drops
// what `0026` added, keeps the narrowing, and the cases below drive that refusal rather than reading it.
//
// The twin also destroys data — `document_content_hash` goes with every value in it — and that is *announced*
// in the twin's header rather than refused. The line this tree draws, and the second case asserts the first
// half of it: **a hole is refused, data loss is announced.**
import { resolve } from "node:path";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";
import { bodyOf, type StrippedTwin } from "./rollback-twin";

const TWIN_0026 = resolve(
  __dirname,
  "../rollbacks/0026_consent-draft-seed-and-binding.rollback.sql",
);

const SUBJECT = "000000f1-0000-4000-8000-000000000000";

let db: Client;
let stripped: StrippedTwin;

async function onDelete(table: string): Promise<string> {
  const { rows } = await db.query<{ action: string }>(
    `select c.confdeltype::text as action
       from pg_constraint c
       join pg_class t on t.oid = c.conrelid
       join pg_namespace n on n.oid = t.relnamespace
       join pg_attribute a on a.attrelid = t.oid and a.attnum = c.conkey[1]
      where n.nspname = 'public' and t.relname = $1 and c.contype = 'f'
        and array_length(c.conkey, 1) = 1 and a.attname = 'user_id'`,
    [table],
  );
  return rows[0]?.action ?? "none";
}

beforeAll(async () => {
  db = await connect();
  await db.query("begin");

  await db.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                             email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                             created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
             'rollback-consent@example.test', 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
    [SUBJECT],
  );
  await db.query(
    `insert into public.user_roles (user_id, role) values ($1, 'parent')`,
    [SUBJECT],
  );
  await db.query(
    `insert into public.consent_records
       (user_id, party, agreement_id, checkpoint_id, checkpoint_text, document_id, document_version,
        document_content_hash, consent_given, purpose)
     select $1, 'parent', 'AGR-01', 'agr01_terms_acceptance', 'I agree.', d.document_id, d.version,
            d.content_hash, true, 'client-tos'
       from public.legal_documents d
      where d.document_id = 'client-tos' and d.version = 1`,
    [SUBJECT],
  );

  // Forward → twin. Everything after this line is measured against the ROLLED-BACK database.
  stripped = bodyOf(TWIN_0026);
  await db.query(stripped.sql);
});

afterAll(async () => {
  await db?.query("rollback");
  await db?.end();
});

describe("int.rollback-0026 — a twin restores a feature, never a hole (ADR-165)", () => {
  it("the twin really ran: its own transaction control was stripped and nothing else", () => {
    expect(stripped.removed).toBe(2);
    expect(stripped.sql).toContain(
      "drop column if exists document_content_hash",
    );
  });

  it("the twin undid what it says it undid — the hash columns are gone", async () => {
    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n from information_schema.columns
        where table_schema = 'public'
          and (   (table_name = 'consent_records' and column_name = 'document_content_hash')
               or (table_name = 'biometric_consent_records' and column_name = 'notice_content_hash'))`,
    );
    expect(rows[0].n).toBe("0");
  });

  it("★ ADR-165 (1) — after the twin, neither subject key cascades (ADR-170 stays shut)", async () => {
    expect(await onDelete("consent_records")).toBe("r");
    expect(await onDelete("biometric_consent_records")).toBe("r");
  });

  it("★ and it still bites: deleting the subject is refused, not silently cascaded", async () => {
    await db.query("savepoint attempt");
    let message = "";
    try {
      await db.query(`delete from auth.users where id = $1`, [SUBJECT]);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    await db.query("rollback to savepoint attempt");
    expect(message).toMatch(/consent_records/);
  });

  it("the seed survives the rollback — with no documents, every consent road fails closed", async () => {
    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n from public.legal_documents where version = 1`,
    );
    expect(Number(rows[0].n)).toBe(11);
  });
});
