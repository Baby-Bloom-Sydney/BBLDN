// `int.renewal-sweep-read` — `0029`'s `consent_subjects_due_for_renewal` against the applied set (FATE `10.18`;
// L-009 `3g`).
//
// The read answers one question and it is easy to answer *nearly* right: **whose newest row for this purpose
// predates the cutoff**. The three ways to get it wrong all have a case here, because each of them would still
// look like a working sweep from the outside:
//
//   · a `where created_at < cutoff` with no `distinct on` says a person is due when she has an old row *and* a
//     recent one — she would be carried forward or re-asked every single night;
//   · a read that ignores `purpose` mixes her signup consent with her per-child one;
//   · an unbounded read is fine until the day it is not, which is why the limit is capped in the body as well
//     as passed.
//
// The last two cases are the grant: this is a "list people" function, so no session role may execute it.
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";

const ALICE = "000000d0-0000-4000-8000-000000000001";
const BOB = "000000d0-0000-4000-8000-000000000002";
const CUTOFF = "2027-01-01T00:00:00Z";
const OLD = "2026-01-01T00:00:00Z";
const RECENT = "2027-06-01T00:00:00Z";

let db: Client;
/** The current triple per purpose — a consent row must name the words of **its own** document (`0026`). */
const documents = new Map<string, { version: number; hash: string }>();

async function user(id: string, email: string): Promise<void> {
  await db.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                             email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                             created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
             $2, 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
    [id, email],
  );
  await db.query(
    `insert into public.user_roles (user_id, role) values ($1, 'parent')`,
    [id],
  );
}

async function signature(
  userId: string,
  purpose: string,
  at: string,
): Promise<void> {
  await db.query(
    `insert into public.consent_records
       (user_id, party, agreement_id, checkpoint_id, checkpoint_text, purpose,
        document_id, document_version, document_content_hash, consent_given, created_at)
     values ($1, 'parent', 'AGR-01', 'agr01_terms_acceptance', 'I agree', $2::public.consent_purpose,
             $2::text, $3, $4, true, $5)`,
    [
      userId,
      purpose,
      documents.get(purpose)?.version,
      documents.get(purpose)?.hash,
      at,
    ],
  );
}

async function due(purpose = "client-tos", limit = 500): Promise<string[]> {
  const { rows } = await db.query<{ subject_user_id: string }>(
    `select subject_user_id from public.consent_subjects_due_for_renewal($1, $2, $3)`,
    [purpose, CUTOFF, limit],
  );
  return rows.map((row) => row.subject_user_id);
}

beforeAll(async () => {
  db = await connect();
  await db.query("begin");
  const { rows } = await db.query<{
    document_id: string;
    version: number;
    content_hash: string;
  }>(
    `select distinct on (document_id) document_id, version, content_hash
       from public.legal_documents order by document_id, version desc`,
  );
  for (const row of rows)
    documents.set(row.document_id, {
      version: row.version,
      hash: row.content_hash,
    });
  await user(ALICE, "renewal-alice@example.test");
  await user(BOB, "renewal-bob@example.test");
});

afterAll(async () => {
  await db?.query("rollback");
  await db?.end();
});

describe("int.renewal-sweep-read — whose newest row predates the cutoff", () => {
  it("nobody is due before anybody has signed anything", async () => {
    expect(await due()).toEqual([]);
  });

  it("★ an old signature is due", async () => {
    await db.query("savepoint s");
    await signature(ALICE, "client-tos", OLD);

    expect(await due()).toEqual([ALICE]);

    await db.query("rollback to savepoint s");
  });

  it("a recent signature is not", async () => {
    await db.query("savepoint s");
    await signature(ALICE, "client-tos", RECENT);

    expect(await due()).toEqual([]);

    await db.query("rollback to savepoint s");
  });

  it("★ an old signature PLUS a recent one is not due — the read takes the newest, not any", async () => {
    await db.query("savepoint s");
    await signature(ALICE, "client-tos", OLD);
    await signature(ALICE, "client-tos", RECENT);

    expect(await due()).toEqual([]);

    await db.query("rollback to savepoint s");
  });

  it("★ a recent row for a DIFFERENT purpose does not rescue an old one", async () => {
    await db.query("savepoint s");
    await signature(ALICE, "client-tos", OLD);
    await signature(ALICE, "privacy-policy", RECENT);

    expect(await due("client-tos")).toEqual([ALICE]);
    expect(await due("privacy-policy")).toEqual([]);

    await db.query("rollback to savepoint s");
  });

  it("returns every due subject, in a stable order", async () => {
    await db.query("savepoint s");
    await signature(ALICE, "client-tos", OLD);
    await signature(BOB, "client-tos", OLD);

    expect(await due()).toEqual([ALICE, BOB].sort());

    await db.query("rollback to savepoint s");
  });

  it("★ honours the limit, so one run's work is bounded", async () => {
    await db.query("savepoint s");
    await signature(ALICE, "client-tos", OLD);
    await signature(BOB, "client-tos", OLD);

    expect(await due("client-tos", 1)).toHaveLength(1);

    await db.query("rollback to savepoint s");
  });
});

describe("int.renewal-sweep-read — who may run it", () => {
  it("★ no session role can execute it: it is a list of people, not a person's own read", async () => {
    const { rows } = await db.query<{ anon: boolean; authenticated: boolean }>(
      `select has_function_privilege('anon', $1, 'execute') as anon,
              has_function_privilege('authenticated', $1, 'execute') as authenticated`,
      [
        "public.consent_subjects_due_for_renewal(public.consent_purpose, timestamptz, integer)",
      ],
    );

    expect(rows[0]).toEqual({ anon: false, authenticated: false });
  });

  it("the sweep's own role can", async () => {
    const { rows } = await db.query<{ allowed: boolean }>(
      `select has_function_privilege('service_role', $1, 'execute') as allowed`,
      [
        "public.consent_subjects_due_for_renewal(public.consent_purpose, timestamptz, integer)",
      ],
    );

    expect(rows[0].allowed).toBe(true);
  });

  it("it is security INVOKER — it adds no privilege of its own", async () => {
    const { rows } = await db.query<{ security_definer: boolean }>(
      `select p.prosecdef as security_definer
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'consent_subjects_due_for_renewal'`,
    );

    expect(rows[0].security_definer).toBe(false);
  });
});
