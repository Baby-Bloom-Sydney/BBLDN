// `int.rollback-0027` — **ADR-165 (3) for `0027`**: apply forward → twin → and assert the hole is still shut.
//
// `0027` carries three security clauses and its header names them: the four person keys come off `cascade`, the
// two guard functions stay attached with `supabase_admin` outside their exemption, and the three `nanny_id`
// columns stay nullable because the first clause is what makes them so. ADR-165 (1) says a twin keeps such a
// clause and names it; ADR-165 (3) says the twin ships a test that proves it rather than a comment claiming it.
//
// **Why arm (1) and not arm (2)** (ADR-177's shape). ADR-165 (2)'s `RAISE EXCEPTION` is owed by a twin that
// would hand a hole back to reverted code that genuinely cannot run without it. Nothing needs these cascades:
// no road in the application deletes a `nannies` row except the erasure path, and that path wants `set null`.
// So the twin completes, keeps the narrowing, and **announces** the one thing it destroys — every
// `subject_pseudonym` already written. A hole is refused; data loss is announced.
import { resolve } from "node:path";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";
import { bodyOf, type StrippedTwin } from "./rollback-twin";

const TWIN_0027 = resolve(
  __dirname,
  "../rollbacks/0027_safeguarding-survives-erasure.rollback.sql",
);

const USER = "000000f7-0000-4000-8000-000000000001";
const NANNY = "000000f7-0000-4000-8000-000000000002";
const VERIFICATION = "000000f7-0000-4000-8000-000000000003";
const ADMIN = "000000f7-0000-4000-8000-000000000004";
const LIFT = "000000f7-0000-4000-8000-000000000005";

let db: Client;
let stripped: StrippedTwin;

async function onDelete(table: string, column: string): Promise<string> {
  const { rows } = await db.query<{ action: string }>(
    `select c.confdeltype::text as action
       from pg_constraint c
       join pg_class t on t.oid = c.conrelid
       join pg_namespace n on n.oid = t.relnamespace
       join pg_attribute a on a.attrelid = t.oid and a.attnum = c.conkey[1]
      where n.nspname = 'public' and t.relname = $1 and c.contype = 'f'
        and array_length(c.conkey, 1) = 1 and a.attname = $2`,
    [table, column],
  );
  return rows[0]?.action ?? "none";
}

beforeAll(async () => {
  db = await connect();
  await db.query("begin");

  for (const [id, email] of [
    [USER, "rollback-safeguarding@example.test"],
    [ADMIN, "rollback-safeguarding-admin@example.test"],
  ]) {
    await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                               email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
               $2, 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
      [id, email],
    );
  }
  await db.query(
    `insert into public.user_roles (user_id, role) values ($1, 'nanny'), ($2, 'admin')`,
    [USER, ADMIN],
  );
  await db.query(`insert into public.nannies (id, user_id) values ($1, $2)`, [
    NANNY,
    USER,
  ]);
  await db.query(
    `insert into public.verifications (id, nanny_id, level, dbs_status, dbs_outcome, suspended_at, dbs_checked_by)
     values ($1, $2, 'L0_SIGNED_UP', 'rejected', 'barred', now(), 'admin')`,
    [VERIFICATION, NANNY],
  );
  await db.query(
    `insert into public.nanny_suspension_lifts
       (id, nanny_id, reason, decided_by, previous_dbs_outcome, suspended_since)
     values ($1, $2, 'evidence corrected', $3, 'barred', now())`,
    [LIFT, NANNY, ADMIN],
  );

  // Forward → twin. Everything after this line is measured against the ROLLED-BACK database.
  stripped = bodyOf(TWIN_0027);
  await db.query(stripped.sql);
});

afterAll(async () => {
  await db?.query("rollback");
  await db?.end();
});

describe("int.rollback-0027 — a twin restores a feature, never a hole (ADR-165)", () => {
  it("the twin really ran: its own transaction control was stripped and nothing else", () => {
    expect(stripped.removed).toBe(2);
    expect(stripped.sql).toContain("drop column if exists subject_pseudonym");
  });

  it("the twin undid what it says it undid — the pseudonym column and its writer are gone", async () => {
    const columns = await db.query<{ n: string }>(
      `select count(*)::text as n from information_schema.columns
        where table_schema = 'public' and column_name = 'subject_pseudonym'`,
    );
    expect(columns.rows[0].n).toBe("0");
    const fn = await db.query<{ n: string }>(
      `select count(*)::text as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'pseudonymise_safeguarding_subject'`,
    );
    expect(fn.rows[0].n).toBe("0");
  });

  it("★ clause 1 — after the twin, not one of the four person keys cascades", async () => {
    expect(await onDelete("verifications", "nanny_id")).toBe("n");
    expect(await onDelete("vetting_submissions", "nanny_id")).toBe("n");
    expect(await onDelete("nanny_suspension_lifts", "nanny_id")).toBe("n");
    expect(await onDelete("vetting_submissions", "verification_id")).toBe("r");
  });

  it("★ and it still bites: the emergency delete leaves the safeguarding rows standing", async () => {
    await db.query("savepoint attempt");
    await db.query(`delete from auth.users where id = $1`, [USER]);
    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n from public.nanny_suspension_lifts where id = $1`,
      [LIFT],
    );
    expect(rows[0].n).toBe("1");
    const verification = await db.query<{ dbs_outcome: string }>(
      `select dbs_outcome from public.verifications where id = $1`,
      [VERIFICATION],
    );
    expect(verification.rows[0].dbs_outcome).toBe("barred");
    await db.query("rollback to savepoint attempt");
  });

  it("★ clause 2 — the guards survive the twin and still refuse an edit", async () => {
    await db.query("savepoint guard");
    let message = "";
    try {
      await db.query(
        `update public.nanny_suspension_lifts set reason = 'rewritten' where id = $1`,
        [LIFT],
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    await db.query("rollback to savepoint guard");
    expect(message).toMatch(/ADR-170/);
  });

  it("★ and the twin's detach carve-out is the narrowest one that works: nulling the subject AND rewriting the reason is still refused", async () => {
    // The twin lets the foreign key's own `set null` through the append-only guard, or a `nannies` row would be
    // undeletable. This is the case that proves the gap is only that wide — an UPDATE doing the detach *and*
    // something else is the shape an attacker would use, and it does not pass.
    await db.query("savepoint carve_out");
    let message = "";
    try {
      await db.query(
        `update public.nanny_suspension_lifts set nanny_id = null, reason = 'nothing to see here' where id = $1`,
        [LIFT],
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    await db.query("rollback to savepoint carve_out");
    expect(message).toMatch(/ADR-170/);
  });

  it("★ clause 2, the narrow half — the exemption is still bbldn_retention alone", async () => {
    const { rows } = await db.query<{ src: string }>(
      `select prosrc as src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'is_safeguarding_retention_job'`,
    );
    expect(rows[0].src).not.toContain("supabase_admin");
  });

  it("★ the announced loss is real, and the twin is the only thing that causes it", async () => {
    // After the twin a nanny deletion still leaves the decision — which is clause 1 doing its work — but there
    // is no longer anywhere to record WHOSE decision it was. That is the sentence the twin's header carries,
    // asserted rather than trusted, because "recovery is roll-forward" only means something if the loss is real.
    await db.query("savepoint loss");
    await db.query(`delete from public.nannies where id = $1`, [NANNY]);
    const { rows } = await db.query<{ nanny_id: string | null }>(
      `select nanny_id from public.nanny_suspension_lifts where id = $1`,
      [LIFT],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].nanny_id).toBeNull();
    await db.query("rollback to savepoint loss");
  });
});
