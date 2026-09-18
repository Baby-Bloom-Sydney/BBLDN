// `int.rollback-0030` — **ADR-165 (3) for `0030`**: apply forward → twin → and assert the clauses are still shut.
//
// `0030`'s twin keeps three things and its header names them; ADR-165 (3) says the twin ships a test that proves
// it rather than a comment claiming it. The first is the one that matters: the twin must **not** re-arm
// `on delete set null` on the two safeguarding-author keys, because that hands back a road that silently removes
// who approved a DBS check — a hole, in ADR-165 (2)'s sense, and it costs the reverted code nothing to keep shut
// since nothing before `0030` hard-deletes an `auth.users` row.
//
// Arm (1) and not arm (2) (ADR-177's shape): the twin completes and announces its cost — after it no purge can
// run and a scrubbed row is kept for ever, which is storage limitation drifting rather than a right denied.
import { resolve } from "node:path";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";
import { bodyOf, type StrippedTwin } from "./rollback-twin";

const TWIN = resolve(
  __dirname,
  "../rollbacks/0030_purge-scrubbed-users.rollback.sql",
);

let db: Client;
let stripped: StrippedTwin;

async function onDelete(table: string, constraint: string): Promise<string> {
  const { rows } = await db.query<{ action: string }>(
    `select c.confdeltype::text as action
       from pg_constraint c join pg_class t on t.oid = c.conrelid
      where t.relname = $1 and c.conname = $2`,
    [table, constraint],
  );
  return rows[0]?.action ?? "none";
}

async function functionExists(name: string): Promise<boolean> {
  const { rows } = await db.query(
    `select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = $1`,
    [name],
  );
  return rows.length > 0;
}

beforeAll(async () => {
  db = await connect();
  stripped = bodyOf(TWIN);
  await db.query("begin");
});

afterAll(async () => {
  await db?.query("rollback");
  await db?.end();
});

describe("int.rollback-0030 — the twin", () => {
  it("owns exactly one transaction, so stripping it is unambiguous", () => {
    expect(stripped.removed).toBe(2);
  });

  it("★ applies cleanly and removes the four functions it created", async () => {
    expect(await functionExists("purge_scrubbed_user")).toBe(true);

    await db.query(stripped.sql);

    for (const name of [
      "purge_scrubbed_user",
      "purge_auth_user",
      "auth_user_purge_state",
      "subjects_ready_to_purge",
    ])
      expect(await functionExists(name), name).toBe(false);
  });

  it("★ KEEPS the safeguarding-author keys at RESTRICT — re-arming set null would be the hole", async () => {
    expect(
      await onDelete(
        "vetting_submissions",
        "vetting_submissions_decided_by_fkey",
      ),
    ).toBe("r");
    expect(
      await onDelete(
        "verifications",
        "verifications_dbs_update_service_checked_by_fkey",
      ),
    ).toBe("r");
  });

  it("★ keeps `purged_at` and its values — it records that a hard delete happened", async () => {
    const { rows } = await db.query(
      `select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'account_erasure_requests'
          and column_name = 'purged_at'`,
    );

    expect(rows).toHaveLength(1);
  });

  it("leaves the erasure job itself alone — this twin removes housekeeping, never the right", async () => {
    expect(await functionExists("erase_account")).toBe(true);
    expect(await functionExists("scrub_auth_user")).toBe(true);
  });

  it("★ behaviour, not catalogue: a consent row still refuses an auth.users delete after the twin", async () => {
    // `0026`'s `restrict` on the consent subject is not `0030`'s and the twin must not have disturbed it.
    const subject = "000000ea-0000-4000-8000-000000000009";
    await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                               email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
               'rollback-purge@example.test', 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
      [subject],
    );
    await db.query(
      `insert into public.user_roles (user_id, role) values ($1, 'parent')`,
      [subject],
    );
    const { rows: doc } = await db.query<{
      version: number;
      content_hash: string;
    }>(
      `select version, content_hash from public.legal_documents
        where document_id = 'client-tos' order by version desc limit 1`,
    );
    await db.query(
      `insert into public.consent_records
         (user_id, party, agreement_id, checkpoint_id, checkpoint_text, purpose,
          document_id, document_version, document_content_hash, consent_given)
       values ($1, 'parent', 'AGR-01', 'x', 'y', 'client-tos', 'client-tos', $2, $3, true)`,
      [subject, doc[0].version, doc[0].content_hash],
    );

    let refused = false;
    await db.query("savepoint attempt");
    try {
      await db.query(`delete from auth.users where id = $1`, [subject]);
    } catch {
      refused = true;
    }
    await db.query("rollback to savepoint attempt");

    expect(refused).toBe(true);
  });
});
