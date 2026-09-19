// `int.rollback-0034` — **ADR-165 (3) for `0034`**: apply forward → twin → and assert the right is still there.
//
// `0034` is the first twin in this folder whose forward file is not a privilege clause but a **defect fix**,
// and the ADR reads the same way: a twin never puts back what the migration existed to remove. What `0034`
// removed is B-49 — every self-service erasure failing its 30-day purge, for ever — so the twin's two
// candidate statements (restore `0030`'s body; revoke the two column grants) each re-break Article 17, one
// of them while looking like a configuration mistake. It is empty in both halves.
//
// A twin that does nothing is indistinguishable from a twin nobody wrote unless something asserts the
// difference, and here the difference is behavioural rather than catalogue-shaped: **after the twin runs, a
// self-service erasure still reaches its purge.**
import { resolve } from "node:path";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";
import { bodyOf, type StrippedTwin } from "./rollback-twin";

const TWIN = resolve(
  __dirname,
  "../rollbacks/0034_purge-releases-its-own-references.rollback.sql",
);

const WINDOWS = {
  money: { months: 72, from: "last-activity" },
  consent: { months: 72, from: "scrub" },
  safeguarding: { months: 12, from: "scrub" },
};

let db: Client;
let stripped: StrippedTwin;
let seq = 0;

async function selfServiceSubject(): Promise<string> {
  seq += 1;
  const id = `00000034-0000-4000-8000-${seq.toString(16).padStart(12, "0")}`;
  await db.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                             email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                             banned_until, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
             $2, null, now(), '{}'::jsonb, '{}'::jsonb, 'infinity', now(), now())`,
    [id, `deleted+${id}@invalid`],
  );
  await db.query(
    `insert into public.account_erasure_requests
       (subject_user_id, requested_by, road, state, completed_at)
     values ($1, $1, 'self-service', 'completed', now() - interval '31 days')`,
    [id],
  );
  return id;
}

async function purge(id: string): Promise<{ outcome: string }> {
  const { rows } = await db.query<{ answer: { outcome: string } }>(
    `select public.purge_scrubbed_user($1, $2::jsonb) as answer`,
    [id, JSON.stringify(WINDOWS)],
  );
  return rows[0]!.answer;
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

describe("int.rollback-0034 — the twin restores nothing, and proves it", () => {
  it("owns exactly one transaction, so stripping it is unambiguous", () => {
    expect(stripped.removed).toBe(2);
  });

  it("★ contains no statement at all between its two halves", () => {
    const body = stripped.sql.slice(
      stripped.sql.indexOf("Both halves are intentionally empty"),
      stripped.sql.indexOf("Verify"),
    );
    expect(body).not.toMatch(
      /\b(revoke|grant|create or replace|drop|alter)\b/i,
    );
  });

  it("★ never writes the one statement that would put the defect back", () => {
    // `create or replace function public.purge_scrubbed_user` is the whole of the re-break, and unlike a
    // privilege re-issue it would look like ordinary housekeeping in a diff.
    expect(stripped.sql).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.purge_scrubbed_user/i,
    );
    expect(stripped.sql).not.toMatch(
      /revoke[^;]*\bon table public\.(cookie_consent_records|katie_prompt_edits)/i,
    );
  });

  it("★ runs, and afterwards a SELF-SERVICE erasure still reaches its purge", async () => {
    await db.query("savepoint twin");
    await db.query(stripped.sql);

    const id = await selfServiceSubject();
    expect(await purge(id)).toMatchObject({ outcome: "purged" });
    const { rows } = await db.query(`select 1 from auth.users where id = $1`, [
      id,
    ]);
    expect(rows).toHaveLength(0);

    await db.query("rollback to savepoint twin");
  });

  it("★ and the release is still in exactly one body, with its grants still column-scoped", async () => {
    await db.query("savepoint twin");
    await db.query(stripped.sql);

    const { rows } = await db.query<{ fn: string }>(
      `select n.nspname || '.' || p.proname as fn
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where p.prosrc like '%update public.%I set %I = null%'`,
    );
    expect(rows.map((r) => r.fn)).toEqual(["public.purge_scrubbed_user"]);

    const { rows: privs } = await db.query<{
      cookieCol: boolean;
      cookieTable: boolean;
      katieCol: boolean;
      katieTable: boolean;
      katieDelete: boolean;
    }>(
      `select has_column_privilege('bbldn_retention','public.cookie_consent_records','user_id','UPDATE') as "cookieCol",
              has_table_privilege('bbldn_retention','public.cookie_consent_records','UPDATE')            as "cookieTable",
              has_column_privilege('bbldn_retention','public.katie_prompt_edits','applied_by','UPDATE')  as "katieCol",
              has_table_privilege('bbldn_retention','public.katie_prompt_edits','UPDATE')                as "katieTable",
              has_table_privilege('bbldn_retention','public.katie_prompt_edits','DELETE')                as "katieDelete"`,
    );
    expect(privs[0]).toEqual({
      cookieCol: true,
      cookieTable: false,
      katieCol: true,
      katieTable: false,
      katieDelete: false,
    });

    await db.query("rollback to savepoint twin");
  });

  it("★ and the guard it deliberately never touched is still the guard", async () => {
    await db.query("savepoint twin");
    await db.query(stripped.sql);

    const { rows } = await db.query<{ prosrc: string }>(
      `select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'is_retention_job'`,
    );
    expect(rows[0]!.prosrc).toContain("'bbldn_retention', 'supabase_admin'");
    expect(rows[0]!.prosrc).not.toContain("postgres");

    await db.query("rollback to savepoint twin");
  });

  it("★ is idempotent — running it twice still changes nothing", async () => {
    await db.query("savepoint twin");
    await db.query(stripped.sql);
    await db.query(stripped.sql);

    const id = await selfServiceSubject();
    expect(await purge(id)).toMatchObject({ outcome: "purged" });

    await db.query("rollback to savepoint twin");
  });
});
