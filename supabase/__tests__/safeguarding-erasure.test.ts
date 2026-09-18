// `int.safeguarding-erasure` — ADR-170's safeguarding half (`3e`, L-009), proven by invocation.
//
// `3c` audited all 131 foreign keys and measured four person-cascades that erased a nanny's entire vetting
// history — who approved her DBS check, what the outcome was, who lifted a bar and why — in one
// `delete from auth.users`, for **any** role, because none of the three tables carried an append-only trigger.
// It shipped the finding as four `it.fails` pins in `consent-erasure-binding.test.ts` and left the fix to its
// own unit. `0027` is that fix; those four pins are flipped in place, and this suite is the behaviour behind
// them, because a `confdeltype` that is not `c` is a claim about the catalogue and not about what happens when
// somebody actually deletes a person.
//
// What is asserted here, in the order the header of `0027` argues it:
//
//   1. **Survival on the product path.** 07 §6.1 step 3 hard-deletes the `nannies` row. Every safeguarding
//      record about her is still there afterwards, with its decision intact.
//   2. **Survival on the emergency path.** `delete from auth.users` cascades to `nannies` (`0005:33`) and used
//      to carry the whole trail with it. It no longer does.
//   3. **Pseudonymisation.** The subject is gone and the pseudonym is the same value on all three rows, which
//      is what keeps "these decisions were about one person" answerable (Art 5(2)).
//   4. **The pseudonym cannot be forgotten.** Remove the trigger that writes it and the delete REFUSES rather
//      than quietly detaching a decision — twice over, and in this order, which was measured rather than
//      assumed: the guard catches the foreign key's own `set null` first, and with every guard removed as well
//      the CHECK still does. That is what turns a job's good intentions into a control.
//   5. **Immutability, per role.** Nobody the application can become may edit or delete one of these rows —
//      `anon`, `authenticated`, `service_role`, `authenticator` and the migration role itself. The one
//      exemption is `bbldn_retention`, and `service_role` is not a member of it, which is the reason the
//      exemption is safe to have.
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";

const USER = "000000e0-0000-4000-8000-000000000001";
const NANNY = "000000e0-0000-4000-8000-000000000002";
const VERIFICATION = "000000e0-0000-4000-8000-000000000003";
const SUBMISSION = "000000e0-0000-4000-8000-000000000004";
const LIFT = "000000e0-0000-4000-8000-000000000005";
const ADMIN = "000000e0-0000-4000-8000-000000000006";

/** Roles a request, a job or an operator can arrive as. `bbldn_retention` is deliberately NOT on this list. */
const ASSUMABLE_ROLES = [
  "anon",
  "authenticated",
  "service_role",
  "authenticator",
] as const;

let db: Client;

/** Run a statement expected to be refused, inside a savepoint, and return the error message. */
async function refused(sql: string, params: readonly unknown[] = []) {
  await db.query("savepoint attempt");
  try {
    await db.query(sql, [...params]);
  } catch (error) {
    await db.query("rollback to savepoint attempt");
    return error instanceof Error ? error.message : String(error);
  }
  await db.query("rollback to savepoint attempt");
  throw new Error("the statement was accepted; it should have been refused");
}

/**
 * Run a statement as `role` and report what happened. **Three** outcomes count as "the row is safe", and the
 * distinction is the reason this helper reports rather than asserts: the guard raises; the role has no
 * privilege on the table at all; or RLS silently narrows the statement to zero rows, which raises nothing and
 * is still a complete refusal. A test that only looked for an exception would have called the third case a
 * failure, and a test that only looked at the row would not be able to say which control did the work.
 */
async function asRole(
  role: string,
  sql: string,
): Promise<{
  readonly raised: boolean;
  readonly message: string;
  readonly rowCount: number;
}> {
  await db.query("savepoint role_attempt");
  try {
    await db.query(`set local role ${role}`);
    const result = await db.query(sql);
    await db.query("reset role");
    await db.query("rollback to savepoint role_attempt");
    return {
      raised: false,
      message: "accepted",
      rowCount: result.rowCount ?? 0,
    };
  } catch (error) {
    await db.query("rollback to savepoint role_attempt");
    await db.query("reset role");
    return {
      raised: true,
      message: error instanceof Error ? error.message : String(error),
      rowCount: 0,
    };
  }
}

async function countOf(table: string, column: string, value: string) {
  const { rows } = await db.query<{ n: string }>(
    `select count(*)::text as n from public.${table} where ${column} = $1`,
    [value],
  );
  return Number(rows[0].n);
}

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

/** The fixture: a barred nanny with a decided DBS submission and a lifted bar — a full safeguarding trail. */
async function seed(): Promise<void> {
  await db.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                             email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
             $2, 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
    [USER, "safeguarding-subject@example.test"],
  );
  await db.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                             email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
             $2, 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
    [ADMIN, "safeguarding-admin@example.test"],
  );
  await db.query(
    `insert into public.user_roles (user_id, role) values ($1, 'nanny'), ($2, 'admin')`,
    [USER, ADMIN],
  );
  await db.query(`insert into public.nannies (id, user_id) values ($1, $2)`, [
    NANNY,
    USER,
  ]);
  // I-V5: a barred row is L0 and suspended (`verifications_barred_is_suspended_check`).
  await db.query(
    `insert into public.verifications (id, nanny_id, level, dbs_status, dbs_outcome, suspended_at, dbs_checked_by)
     values ($1, $2, 'L0_SIGNED_UP', 'rejected', 'barred', now(), 'admin')`,
    [VERIFICATION, NANNY],
  );
  await db.query(
    `insert into public.vetting_submissions
       (id, verification_id, nanny_id, section, evidence_type, provider_key, status, evidence_id,
        decided_by, checked_at)
     values ($1, $2, $3, 'dbs', 'dbs-certificate', 'stub-manual', 'failed', gen_random_uuid(), $4, now())`,
    [SUBMISSION, VERIFICATION, NANNY, ADMIN],
  );
  await db.query(
    `insert into public.nanny_suspension_lifts
       (id, nanny_id, reason, decided_by, previous_dbs_outcome, suspended_since)
     values ($1, $2, 'certificate belonged to another person', $3, 'barred', now())`,
    [LIFT, NANNY, ADMIN],
  );
}

beforeAll(async () => {
  db = await connect();
  await db.query("begin");
  await seed();
});

afterAll(async () => {
  await db?.query("rollback");
  await db?.end();
});

describe("int.safeguarding — the four person keys no longer cascade (ADR-170)", () => {
  it("verifications.nanny_id is `set null`, not cascade", async () => {
    expect(await onDelete("verifications", "nanny_id")).toBe("n");
  });

  it("vetting_submissions.nanny_id is `set null`, not cascade", async () => {
    expect(await onDelete("vetting_submissions", "nanny_id")).toBe("n");
  });

  it("vetting_submissions.verification_id is `restrict` — the second path to the same deletion", async () => {
    expect(await onDelete("vetting_submissions", "verification_id")).toBe("r");
  });

  it("nanny_suspension_lifts.nanny_id is `set null`, matching its own decided_by's reasoning", async () => {
    expect(await onDelete("nanny_suspension_lifts", "nanny_id")).toBe("n");
  });
});

describe("int.safeguarding — REVIEW-4 M-15, taken with the file (kickoff §2 debt 2)", () => {
  it("verifications carries a partial index on rtw_status, the same shape as its two siblings", async () => {
    const { rows } = await db.query<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef from pg_indexes
        where schemaname = 'public' and tablename = 'verifications'
          and indexname in ('verifications_identity_status_idx', 'verifications_dbs_status_idx',
                            'verifications_rtw_status_idx')
        order by indexname`,
    );
    // All three, or the cron's third statement is the only one still sequentially scanning the nanny table
    // 288 times a day — which is what the register measured with `enable_seqscan=off`.
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.indexdef).toContain("WHERE");
      expect(row.indexdef).toContain("'review'");
    }
  });
});

describe("int.safeguarding — the product path: the nannies row goes, the decisions stay (07 §6.1 step 3)", () => {
  it("★ deleting the nanny leaves all three safeguarding rows, with their decisions intact", async () => {
    await db.query("savepoint product_path");
    await db.query(`delete from public.nannies where id = $1`, [NANNY]);

    const verification = await db.query<{
      dbs_outcome: string;
      dbs_checked_by: string;
      nanny_id: string | null;
      subject_pseudonym: string | null;
    }>(
      `select dbs_outcome, dbs_checked_by, nanny_id, subject_pseudonym
         from public.verifications where id = $1`,
      [VERIFICATION],
    );
    expect(verification.rows).toHaveLength(1);
    expect(verification.rows[0].dbs_outcome).toBe("barred");
    expect(verification.rows[0].dbs_checked_by).toBe("admin");

    const submission = await db.query<{
      status: string;
      decided_by: string | null;
      subject_pseudonym: string | null;
    }>(
      `select status, decided_by, subject_pseudonym from public.vetting_submissions where id = $1`,
      [SUBMISSION],
    );
    expect(submission.rows).toHaveLength(1);
    expect(submission.rows[0].status).toBe("failed");
    expect(submission.rows[0].decided_by).toBe(ADMIN);

    const lift = await db.query<{
      reason: string;
      decided_by: string;
      previous_dbs_outcome: string;
      subject_pseudonym: string | null;
    }>(
      `select reason, decided_by, previous_dbs_outcome, subject_pseudonym
         from public.nanny_suspension_lifts where id = $1`,
      [LIFT],
    );
    expect(lift.rows).toHaveLength(1);
    expect(lift.rows[0].reason).toBe("certificate belonged to another person");
    expect(lift.rows[0].decided_by).toBe(ADMIN);
    expect(lift.rows[0].previous_dbs_outcome).toBe("barred");

    // 3 — the subject is gone and the pseudonym is ONE value across the three rows, which is what makes
    // "these decisions were about the same person" still answerable.
    expect(verification.rows[0].nanny_id).toBeNull();
    expect(verification.rows[0].subject_pseudonym).toBe(NANNY);
    expect(submission.rows[0].subject_pseudonym).toBe(NANNY);
    expect(lift.rows[0].subject_pseudonym).toBe(NANNY);

    await db.query("rollback to savepoint product_path");
  });

  it("★ the emergency path — `delete from auth.users` — keeps them too (this is the one `3c` measured)", async () => {
    await db.query("savepoint emergency_path");
    await db.query(`delete from auth.users where id = $1`, [USER]);

    expect(await countOf("verifications", "id", VERIFICATION)).toBe(1);
    expect(await countOf("vetting_submissions", "id", SUBMISSION)).toBe(1);
    expect(await countOf("nanny_suspension_lifts", "id", LIFT)).toBe(1);
    expect(await countOf("nannies", "id", NANNY)).toBe(0);

    const { rows } = await db.query<{ subject_pseudonym: string | null }>(
      `select subject_pseudonym from public.verifications where id = $1`,
      [VERIFICATION],
    );
    expect(rows[0].subject_pseudonym).toBe(NANNY);
    await db.query("rollback to savepoint emergency_path");
  });

  it("★ the pseudonym cannot be forgotten: without the trigger, the guard refuses the detach", async () => {
    await db.query("savepoint no_trigger");
    await db.query(
      `drop trigger nannies_pseudonymise_safeguarding on public.nannies`,
    );
    let message = "";
    try {
      await db.query(`delete from public.nannies where id = $1`, [NANNY]);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    await db.query("rollback to savepoint no_trigger");
    // The foreign key's own `set null` arrives at the guard as an UPDATE that moves `nanny_id`, and the guard
    // does not care who sent it. So the FIRST belt is the guard, not the CHECK — measured, not assumed.
    expect(message).toMatch(/ADR-170/);
  });

  it("★ and with the guards gone too, the CHECK is the second belt — the delete still refuses", async () => {
    await db.query("savepoint no_belts");
    await db.query(
      `drop trigger nannies_pseudonymise_safeguarding on public.nannies`,
    );
    await db.query(
      `drop trigger verifications_safeguarding_guard on public.verifications`,
    );
    await db.query(
      `drop trigger vetting_submissions_safeguarding_guard on public.vetting_submissions`,
    );
    await db.query(
      `drop trigger nanny_suspension_lifts_append_only on public.nanny_suspension_lifts`,
    );
    let message = "";
    try {
      await db.query(`delete from public.nannies where id = $1`, [NANNY]);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    await db.query("rollback to savepoint no_belts");
    // `<table>_subject_present_check` is what turns "the erasure job must remember the pseudonym" into "a
    // delete that does not write one fails". This is the case that proves the CHECK is load-bearing rather
    // than decorative — with every trigger removed, the row is still never detached from a subject.
    expect(message).toMatch(/subject_present_check/);
  });

  it("★ an erasure never waits on a decision in flight — it refuses, so no deadlock can form (database pass, HIGH)", async () => {
    // A `delete from nannies` holds the parent lock before any row trigger fires, so the pseudonymiser takes
    // the children after the parent — the reverse of every other writer's order, and an AB-BA deadlock with
    // `record_vetting_decision`. The trigger therefore probes `for update nowait`: the erasure is refused
    // immediately rather than waiting, which makes a cycle impossible and makes the winner deterministic.
    //
    // **Asserted on the source, and that limit is stated rather than dressed up.** A true two-transaction race
    // needs a fixture both connections can see, which means committing rows into a database every other suite
    // counts and then deleting them back out through the very guards this file installs — more moving parts
    // than the claim is worth, and a failed cleanup would corrupt other suites. What is checkable, and what
    // the defect actually was, is whether the probe is there at all: with NOWAIT the erasure can never be the
    // waiting side, and a cycle needs two waiters. The fixture race is recorded in PROGRESS as the one claim
    // in this unit proved by construction rather than by invocation.
    const { rows } = await db.query<{ src: string }>(
      `select prosrc as src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'pseudonymise_safeguarding_subject'`,
    );
    // Comments stripped, or the prose above the probes would be counted as probes.
    const code = rows[0].src.replace(/--[^\n]*/g, "");
    expect(code).toContain("for update nowait");
    expect(code).toContain("lock_not_available");
    // and all three children are probed, not just the first
    expect(code.match(/for update nowait/g)).toHaveLength(3);
  });

  it("a verifications row cannot be deleted, so the second path to the ledger never opens", async () => {
    const message = await refused(
      `delete from public.verifications where id = $1`,
      [VERIFICATION],
    );
    expect(message).toMatch(/ADR-170/);
  });
});

describe("int.safeguarding — not editable by any role the application can become (ADR-170)", () => {
  const attempts = [
    {
      what: "delete the lift",
      sql: `delete from public.nanny_suspension_lifts where id = '${LIFT}'`,
    },
    {
      what: "rewrite the lift's reason",
      sql: `update public.nanny_suspension_lifts set reason = 'nothing to see here' where id = '${LIFT}'`,
    },
    {
      what: "delete the decided submission",
      sql: `delete from public.vetting_submissions where id = '${SUBMISSION}'`,
    },
    {
      what: "detach the verification from its subject",
      sql: `update public.verifications set nanny_id = null where id = '${VERIFICATION}'`,
    },
  ] as const;

  for (const role of ASSUMABLE_ROLES) {
    for (const attempt of attempts) {
      it(`${role} cannot ${attempt.what}`, async () => {
        const outcome = await asRole(role, attempt.sql);
        // Refused, by whichever control got there first — a raise, a missing privilege, or RLS narrowing the
        // statement to nothing. What must never be true is "it went through and changed a row".
        expect(outcome.raised || outcome.rowCount === 0).toBe(true);
        // and the rows are untouched afterwards, which is the claim the refusal is only evidence for
        expect(await countOf("nanny_suspension_lifts", "id", LIFT)).toBe(1);
        expect(await countOf("vetting_submissions", "id", SUBMISSION)).toBe(1);
        expect(await countOf("verifications", "nanny_id", NANNY)).toBe(1);
      });
    }
  }

  it("★ the migration role itself is refused — the guard is not a privilege check", async () => {
    const message = await refused(
      `delete from public.nanny_suspension_lifts where id = $1`,
      [LIFT],
    );
    expect(message).toMatch(/ADR-170/);
  });

  it("★ `supabase_admin` — the dashboard's delete-user role — is NOT the exemption", async () => {
    const { rows } = await db.query<{ src: string }>(
      `select prosrc as src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'is_safeguarding_retention_job'`,
    );
    expect(rows[0].src).toContain("bbldn_retention");
    expect(rows[0].src).not.toContain("supabase_admin");
  });

  it("★ and the exemption is out of the application's reach: service_role is not a member of bbldn_retention", async () => {
    const { rows } = await db.query<{ member: boolean }>(
      `select pg_has_role('service_role', 'bbldn_retention', 'MEMBER') as member`,
    );
    expect(rows[0].member).toBe(false);
  });

  it("the pseudonym is written once: an UPDATE that moves it is refused", async () => {
    await db.query("savepoint pseudonym_once");
    await db.query(`delete from public.nannies where id = $1`, [NANNY]);
    const message = await refused(
      `update public.nanny_suspension_lifts set subject_pseudonym = gen_random_uuid() where id = $1`,
      [LIFT],
    );
    expect(message).toMatch(/ADR-170/);
    await db.query("rollback to savepoint pseudonym_once");
  });
});
