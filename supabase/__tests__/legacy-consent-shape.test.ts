// `int.legacy-consent-shape` — L-009 `3g`. **The defect this unit found, kept executable.**
//
// `src/lib/legal/record-consent.ts` built its own `consent_records` row: `user_type`, `document_id`,
// `document_version`, no content hash. Every legacy clickwrap surface in the tree called it — the funnel's
// account step, the two connection informed-actions, the per-child consents, the renewal and the decline rows —
// and since `0026` the database refuses that row outright. It stayed invisible because every caller treats a
// consent failure as non-fatal and logs it, and because nothing exercised the legacy road against an applied
// stack.
//
// The three cases here are the measurement. They are written against the **shape**, not against the function,
// so they keep their meaning after the function was re-based: if someone writes a consent row by hand again,
// this is what tells them the database will not have it.
//
// The fourth case is the other half — the shape the connector writes **is** accepted — because a suite that
// only proves a refusal cannot distinguish "the guard works" from "nothing can be written at all".
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";

const SUBJECT = "000000c1-0000-4000-8000-000000000000";

let db: Client;
let current: { version: number; hash: string };

/** Run a statement expected to be refused, inside a savepoint, and return `{ code, message }`. */
async function refused(
  sql: string,
  params: readonly unknown[],
): Promise<{ code: string; message: string }> {
  await db.query("savepoint attempt");
  try {
    await db.query(sql, [...params]);
  } catch (error) {
    await db.query("rollback to savepoint attempt");
    const failure = error as { code?: string; message?: string };
    return { code: failure.code ?? "", message: failure.message ?? "" };
  }
  await db.query("rollback to savepoint attempt");
  throw new Error("the statement was accepted; it should have been refused");
}

beforeAll(async () => {
  db = await connect();
  await db.query("begin");
  await db.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                             email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                             created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
             'legacy-consent@example.test', 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
    [SUBJECT],
  );
  await db.query(
    `insert into public.user_roles (user_id, role) values ($1, 'parent')`,
    [SUBJECT],
  );
  const { rows } = await db.query<{ version: number; content_hash: string }>(
    `select version, content_hash from public.legal_documents
      where document_id = 'client-tos' order by version desc limit 1`,
  );
  current = { version: rows[0].version, hash: rows[0].content_hash };
});

afterAll(async () => {
  await db?.query("rollback");
  await db?.end();
});

describe("int.legacy-consent-shape — the row the Sydney writer built is unwritable", () => {
  it("★ a row naming a document and a version but no content hash is refused", async () => {
    const failure = await refused(
      `insert into public.consent_records
         (user_id, party, agreement_id, checkpoint_id, checkpoint_text, purpose,
          document_id, document_version, consent_given)
       values ($1, 'parent', 'AGR-01', 'agr01_terms_acceptance', 'I agree', 'client-tos',
               'client-tos', $2, true)`,
      [SUBJECT, current.version],
    );

    expect(failure.message).toContain("document_content_hash");
  });

  it("there is no `user_type` column for it to have written to, either", async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'consent_records'
          and column_name in ('user_type', 'party')`,
    );

    expect(rows.map((row) => row.column_name)).toEqual(["party"]);
  });

  it("★ a row naming a hash that version never had is refused by the key, not by a code path", async () => {
    const failure = await refused(
      `insert into public.consent_records
         (user_id, party, agreement_id, checkpoint_id, checkpoint_text, purpose,
          document_id, document_version, document_content_hash, consent_given)
       values ($1, 'parent', 'AGR-01', 'agr01_terms_acceptance', 'I agree', 'client-tos',
               'client-tos', $2, 'not-the-hash-of-those-words', true)`,
      [SUBJECT, current.version],
    );

    expect(failure.code).toBe("23503");
  });
});

describe("int.legacy-consent-shape — the shape the connector writes is accepted", () => {
  it("★ the whole triple lands, so the guard is a guard rather than a wall", async () => {
    await db.query(
      `insert into public.consent_records
         (user_id, party, agreement_id, checkpoint_id, checkpoint_text, purpose,
          document_id, document_version, document_content_hash, consent_given)
       values ($1, 'parent', 'AGR-01', 'agr01_terms_acceptance', 'I agree', 'client-tos',
               'client-tos', $2, $3, true)`,
      [SUBJECT, current.version, current.hash],
    );

    const { rows } = await db.query<{ count: string }>(
      `select count(*)::text as count from public.consent_records where user_id = $1`,
      [SUBJECT],
    );
    expect(rows[0].count).toBe("1");
  });

  it("★ the bundled per-child pair writes under `AGR-15` / `AGR-16`, scoped to the child", async () => {
    // FATE `10.16`. The agreement ids are London's (`3g`); the Sydney labels `PARENT-APP-CONSENT` /
    // `NANNY-ATTESTATION` are not `AGR-nn` and 02 §4.1 says an agreement id is. The database has never held a
    // consent row, so there is no history under the old labels — which is why the rename costs nothing today.
    const child = "000000c2-0000-4000-8000-000000000000";
    const { rows: document } = await db.query<{
      version: number;
      content_hash: string;
    }>(
      `select version, content_hash from public.legal_documents
        where document_id = 'parent-app-consent' order by version desc limit 1`,
    );

    await db.query(
      `insert into public.consent_records
         (user_id, party, agreement_id, checkpoint_id, checkpoint_text, purpose,
          document_id, document_version, document_content_hash, consent_given, related_entity_id)
       values ($1, 'parent', 'AGR-15', 'bundled_child_consent', 'I agree', 'parent-app-consent',
               'parent-app-consent', $2, $3, true, $4)`,
      [SUBJECT, document[0].version, document[0].content_hash, child],
    );

    const { rows } = await db.query<{ related_entity_id: string }>(
      `select related_entity_id from public.consent_records
        where user_id = $1 and agreement_id = 'AGR-15'`,
      [SUBJECT],
    );
    expect(rows[0].related_entity_id).toBe(child);
  });
});
