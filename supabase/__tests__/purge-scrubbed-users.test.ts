// `int.purge-scrubbed-users` — 07 §6.1 step 6's second half against the applied set (L-009 `3g`).
//
// The job's whole value is that it **refuses**. Almost every run, for almost every subject, the right answer is
// "not yet" — money and consent both run six years — so the cases that matter are the refusals, and each one is
// driven against a real fixture rather than described:
//
//   · a subject who was never erased;
//   · a subject whose `auth.users` row is present but not actually scrubbed;
//   · a subject a **money** row still holds, with the date it runs out;
//   · a subject a **consent** row still holds, anchored on the scrub rather than the row (the two differ, and a
//     job that used one anchor for both would be wrong for one and would look right);
//   · a subject a **safeguarding author** row still holds — `3f`'s Q-3, now `restrict` on both keys.
//
// Then the two that make it a job rather than a guard: a clear subject **is** purged, and a second run answers
// `already-purged` and changes nothing.
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";

const WINDOWS = {
  money: { months: 72, from: "last-activity" },
  consent: { months: 72, from: "scrub" },
  safeguarding: { months: 12, from: "scrub" },
};

let db: Client;
let seq = 0;

type Answer = { outcome: string; reason?: string; until?: string };

async function subject(options: {
  erased?: boolean;
  scrubbed?: boolean;
  scrubbedAt?: string;
}): Promise<string> {
  seq += 1;
  const id = `000000e${seq.toString(16)}-0000-4000-8000-000000000001`;
  const scrubbed = options.scrubbed ?? true;
  await db.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                             email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                             banned_until, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
             $2, $3, now(), '{}'::jsonb, '{}'::jsonb, $4, now(), now())`,
    [
      id,
      scrubbed ? `deleted+${id}@invalid` : `live-${seq}@example.test`,
      scrubbed ? null : "x",
      scrubbed ? "infinity" : null,
    ],
  );
  await db.query(
    `insert into public.user_roles (user_id, role) values ($1, 'parent')`,
    [id],
  );
  if (options.erased ?? true) {
    await db.query(
      `insert into public.account_erasure_requests
         (subject_user_id, road, state, completed_at)
       values ($1, 'self-service', 'completed', $2)`,
      [id, options.scrubbedAt ?? "2026-01-01T00:00:00Z"],
    );
  }
  return id;
}

async function purge(id: string, windows: unknown = WINDOWS): Promise<Answer> {
  const { rows } = await db.query<{ answer: Answer }>(
    `select public.purge_scrubbed_user($1, $2::jsonb) as answer`,
    [id, JSON.stringify(windows)],
  );
  return rows[0].answer;
}

async function stillThere(id: string): Promise<boolean> {
  const { rows } = await db.query(`select 1 from auth.users where id = $1`, [
    id,
  ]);
  return rows.length > 0;
}

beforeAll(async () => {
  db = await connect();
  await db.query("begin");
});

afterAll(async () => {
  await db?.query("rollback");
  await db?.end();
});

describe("int.purge — the refusals, which are almost every run", () => {
  it("★ refuses a subject who was never erased, and leaves the row", async () => {
    await db.query("savepoint s");
    const id = await subject({ erased: false });

    expect(await purge(id)).toMatchObject({
      outcome: "refused",
      reason: "not-erased",
    });
    expect(await stillThere(id)).toBe(true);

    await db.query("rollback to savepoint s");
  });

  it("★ refuses a subject whose row was never actually scrubbed", async () => {
    await db.query("savepoint s");
    const id = await subject({ scrubbed: false });

    expect(await purge(id)).toMatchObject({
      outcome: "refused",
      reason: "not-scrubbed",
    });
    expect(await stillThere(id)).toBe(true);

    await db.query("rollback to savepoint s");
  });

  it("★ refuses while a MONEY row is inside its window, and says when it runs out", async () => {
    await db.query("savepoint s");
    const id = await subject({});
    await db.query(
      `insert into public.payment_events
         (parent_user_id, provider, provider_event_id, event_type, payload, received_at)
       values ($1, 'stripe-uk', $2, 'invoice.paid', '{}'::jsonb, now())`,
      [id, `evt_${id}`],
    );

    const answer = await purge(id);

    expect(answer).toMatchObject({
      outcome: "refused",
      reason: "retained-money",
    });
    expect(answer.until).toBeTruthy();
    expect(await stillThere(id)).toBe(true);

    await db.query("rollback to savepoint s");
  });

  it("★ refuses while a CONSENT row is inside its window — anchored on the SCRUB, not the row", async () => {
    await db.query("savepoint s");
    // The row is ancient; the scrub is recent. Anchored on the row this would pass; anchored on the scrub it
    // must refuse, and the scrub is what 07 §6.2 row 11 says in its own words.
    const id = await subject({ scrubbedAt: "2026-01-01T00:00:00Z" });
    const { rows } = await db.query<{ version: number; content_hash: string }>(
      `select version, content_hash from public.legal_documents
        where document_id = 'client-tos' order by version desc limit 1`,
    );
    await db.query(
      `insert into public.consent_records
         (user_id, party, agreement_id, checkpoint_id, checkpoint_text, purpose,
          document_id, document_version, document_content_hash, consent_given, created_at)
       values ($1, 'parent', 'AGR-01', 'x', 'y', 'client-tos', 'client-tos', $2, $3, true,
               '2000-01-01T00:00:00Z')`,
      [id, rows[0].version, rows[0].content_hash],
    );

    expect(await purge(id)).toMatchObject({
      outcome: "refused",
      reason: "retained-consent",
    });

    await db.query("rollback to savepoint s");
  });

  it("★ refuses while the subject is the AUTHOR of a safeguarding decision (3f Q-3)", async () => {
    await db.query("savepoint s");
    const admin = await subject({});
    const { rows: nanny } = await db.query<{ id: string }>(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                               email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
               'purge-nanny@example.test', 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
       returning id`,
    );
    await db.query(
      `insert into public.user_roles (user_id, role) values ($1, 'nanny')`,
      [nanny[0].id],
    );
    await db.query(`insert into public.nannies (user_id) values ($1)`, [
      nanny[0].id,
    ]);
    const { rows: n } = await db.query<{ id: string }>(
      `select id from public.nannies where user_id = $1`,
      [nanny[0].id],
    );
    await db.query(
      `insert into public.verifications (nanny_id, dbs_update_service_checked_by)
       values ($1, $2)`,
      [n[0].id, admin],
    );

    expect(await purge(admin)).toMatchObject({
      outcome: "refused",
      reason: "retained-safeguarding",
    });
    expect(await stillThere(admin)).toBe(true);

    await db.query("rollback to savepoint s");
  });
});

describe("int.purge — ADR-179 at run time", () => {
  it("★ raises when a class has no window, rather than assuming one", async () => {
    await db.query("savepoint s");
    const id = await subject({});

    await expect(
      purge(id, { money: { months: 72, from: "last-activity" } }),
    ).rejects.toThrow(/no retention window supplied for class consent/);

    await db.query("rollback to savepoint s");
  });
});

describe("int.purge — when it does run", () => {
  it("★ hard-deletes a clear subject and keeps the ledger row, subject nulled and purged_at stamped", async () => {
    await db.query("savepoint s");
    const id = await subject({});

    expect(await purge(id)).toMatchObject({ outcome: "purged" });
    expect(await stillThere(id)).toBe(false);

    const { rows } = await db.query<{
      subject_user_id: string | null;
      purged_at: string | null;
      state: string;
    }>(
      `select subject_user_id, purged_at, state from public.account_erasure_requests
        where purged_at is not null and road = 'self-service'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].subject_user_id).toBeNull();
    expect(rows[0].state).toBe("completed");

    await db.query("rollback to savepoint s");
  });

  it("★ is idempotent: a second run answers already-purged and changes nothing", async () => {
    await db.query("savepoint s");
    const id = await subject({});
    expect(await purge(id)).toMatchObject({ outcome: "purged" });

    const { rows: before } = await db.query(
      `select count(*)::int as n from public.account_erasure_requests where purged_at is not null`,
    );
    expect(await purge(id)).toMatchObject({ outcome: "already-purged" });
    const { rows: after } = await db.query(
      `select count(*)::int as n from public.account_erasure_requests where purged_at is not null`,
    );

    expect(after[0].n).toBe(before[0].n);

    await db.query("rollback to savepoint s");
  });

  it("the candidate list only offers a scrub older than the grace period", async () => {
    await db.query("savepoint s");
    const old = await subject({ scrubbedAt: "2026-01-01T00:00:00Z" });
    await subject({ scrubbedAt: new Date().toISOString() });

    // Narrowed to this suite's own subjects: the integration database is shared, so a bare length assertion
    // would be about the whole database rather than about the read.
    const { rows } = await db.query<{ subject_user_id: string }>(
      `select subject_user_id from public.subjects_ready_to_purge(now() - interval '30 days', 1000)
        where subject_user_id::text like '000000e%'`,
    );

    expect(rows.map((r) => r.subject_user_id)).toEqual([old]);

    await db.query("rollback to savepoint s");
  });
});

describe("int.purge — who may run it", () => {
  it("★ the delete is executable by the retention identity alone", async () => {
    const { rows } = await db.query<{
      retention: boolean;
      service: boolean;
      authenticated: boolean;
    }>(
      `select has_function_privilege('bbldn_retention', $1, 'execute') as retention,
              has_function_privilege('service_role', $1, 'execute') as service,
              has_function_privilege('authenticated', $1, 'execute') as authenticated`,
      ["public.purge_auth_user(uuid)"],
    );

    expect(rows[0]).toEqual({
      retention: true,
      service: false,
      authenticated: false,
    });
  });

  it("★ the job runs as `bbldn_retention`, or the ledger's own guard would refuse its one update", async () => {
    const { rows } = await db.query<{ owner: string }>(
      `select r.rolname as owner from pg_proc p
         join pg_roles r on r.oid = p.proowner
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'purge_scrubbed_user'`,
    );

    expect(rows[0].owner).toBe("bbldn_retention");
  });

  it("the retention identity was not left holding `create` on the schema", async () => {
    const { rows } = await db.query<{ held: boolean }>(
      `select has_schema_privilege('bbldn_retention', 'public', 'create') as held`,
    );

    expect(rows[0].held).toBe(false);
  });
});
