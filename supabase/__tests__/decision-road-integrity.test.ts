// `int.decision-road-integrity` — **two pins on `2c`'s admin decision road, both measured.** REVIEW-4.
//
// Neither is this sweep's to fix. The first lives in `0023`, and a migration is merged by the time a checkpoint
// runs (REVIEW-3 C-1's precedent). The second is a **contract** — which id space `VettingLedgerEntry.nannyId`
// carries — and REVIEW-2's H-10 settled that a checkpoint pins a contract change rather than making it. Both
// name their owner and both flip by behaviour, not by a weakened assertion.
//
// ---------------------------------------------------------------------------------------------------------
// C-2 — **a bar is not terminal.** (Found independently by this sweep's `database-reviewer` (H1) and its
// `security-reviewer` (HIGH-3); re-verified here by hand against the applied set.)
//
// 03 §4.3 is "adverse → barred → level 0 + account suspended", and I-V5 is what keeps a barred nanny out of the
// pool. `record_vetting_decision` has **no already-decided guard** — `apply_vetting_check_result`'s only
// recency check (`0022:445-456`) fires on a *newer* submission of the same evidence type, and re-deciding the
// newest row is not one. Its else-branch (`0023:427-433`) then resets `dbs_outcome` from **any** value to
// `'unset'`, and `sync_nanny_verification_state` writes `suspended_at = null` on every path where
// `dbs_outcome <> 'barred'` (`0023:301, 308`) — so the second decision un-bars her.
//
// Measured on the applied set, and it is not an argument about SQL:
//
//     AFTER BAR              L0_SIGNED_UP   suspended = t   dbs_outcome = barred
//     AFTER SECOND DECISION  L0_SIGNED_UP   suspended = f   dbs_outcome = unset
//
// The second decision is the **same submission id** with `reason = 'mismatch'`. That id is on the queue screen
// and in `SubmissionPanel`'s hidden field, so this is a browser-back-and-resubmit away, not only a deliberate
// act; `decided_by` is overwritten on the same row, so nothing anywhere records that a bar was lifted. She can
// then resubmit (`0022:180` refuses only while suspended) and climb back to L3.
//
// **Owner: `2c` / the migration's author**, in a new migration. REVIEW-4 §8 R-3 asks which of the two guards is
// wanted — a terminal-status refusal on an already-decided submission, or a rule that only an `adverse`
// decision may move `dbs_outcome` off `barred`. Either turns this pin green.
//
// ---------------------------------------------------------------------------------------------------------
// C-1 — **the ledger's `nanny_id` is a `nannies.id`, and every new admin road reads it as an `auth.users` id.**
//
// `vetting_submissions.nanny_id` references `nannies (id)` (`0008:156`) and `submit_verification_evidence`
// writes it as `select n.id from public.nannies n where n.user_id = v_user_id` (`0023:865`). But
// `db-vetting-store.ts:98` labels it `UserId`, and every consumer `2c` built keys the other way:
// `db-verification-store.ts`'s `getStatus`, `readAdminRecord`, `syncLevel` and `recordUpdateServiceCheck` all
// resolve their argument through `nannies.user_id = $1`. A `nannies.id` matches no row there, so:
//
//   · `readQueueRecord` → `readAdminRecord` null → "That check is not available" — no queue row ever opens;
//   · `openEvidence` → the same — no document is ever revealed;
//   · `recordUpdateServiceCheck` → throws → **L4 is unreachable**, so the L4 release of held connections
//     (`0023:312-317`) never fires and every held row stays withheld for ever;
//   · `decide` → `syncLevel` returns the fabricated `{L0 → L0, suspended: false, released: 0}`
//     (`db-verification-store.ts:426-434`) **instead of calling the RPC**, so `emitLevelEvents` emits nothing
//     and `sendVerificationOutcome` never runs `onBarred` — an adverse DBS produces no `verification-barred`
//     to her, no `admin-nanny-barred` to the admin mailbox and no `admin_notifications.nanny_barred` row.
//
// The database stays correct throughout — `record_vetting_decision` uses its own `v_sub.nanny_id` — so what is
// broken is the whole read-back, event and comms layer above it. Nothing caught it because the memory doubles
// use one opaque string for both id spaces, so the two are indistinguishable there; the integration suites
// drive the SQL and never the adapters. The seam again.
//
// ★ **ADR-169 answered it (R-4): the column is right, the label is wrong.** Verification is a fact about the
// nanny's PROFILE — which is where `nanny_public`, the matching index and ADR-166's reasoning already live — so
// the id space is `nannies.id` and the brand became `NannyId` through the connector, the store, the queue and
// the ledger. The boundary is where `auth.uid()` resolves to `nannies.id`: inside each definer, once and named,
// never in a caller and never by passing whichever id was to hand. The pin below is therefore RESTATED rather
// than flipped — its original form asked the schema to make the two id spaces interchangeable, which is exactly
// what the ruling refuses.
//
// One transaction, rolled back, like `int.rls`.
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";

const NANNY = "000000d1-0000-4000-8000-000000000000";
const ADMIN = "000000d9-0000-4000-8000-000000000000";
const EVIDENCE = "000000f1-0000-4000-8000-000000000000";
const EVIDENCE_2 = "000000f2-0000-4000-8000-000000000000";

/** `VETTING.requiredChecksByLevel` as the adapters compute it — the shape, not a test invention. */
const REQUIRED = {
  L2_ID_VERIFIED: ["identity"],
  L3_PROVISIONALLY_VERIFIED: ["identity", "dbs"],
  L4_FULLY_VERIFIED: ["identity", "dbs", "right_to_work"],
};

let db: Client;
let submissionId: string;

async function makeUser(
  id: string,
  email: string,
  role: "nanny" | "admin",
): Promise<void> {
  await db.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                             email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                             created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
             'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
    [id, email],
  );
  await db.query(
    `insert into public.user_roles (user_id, role) values ($1, $2)`,
    [id, role],
  );
  await db.query(
    `insert into public.user_profiles (user_id, first_name, last_name, email, district, area)
     values ($1, 'Test', 'User', $2, 'SW4', 'Clapham')`,
    [id, email],
  );
}

/** The nanny's own session, as PostgREST would run it. */
async function asNanny(sql: string): Promise<void> {
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: NANNY, role: "authenticated" }),
  ]);
  await db.query("set local role authenticated");
  try {
    await db.query(sql);
  } finally {
    // `reset role` must run even when the statement raised, or every later query in this transaction runs as
    // `authenticated` and the suite's own fixtures start failing for the wrong reason. Its own failure is
    // swallowed on purpose: a raise inside the statement aborts the transaction, so this query fails too, and
    // the error the CALLER needs is the first one, not `25P02`. `refusal()`'s savepoint does the real cleanup.
    try {
      await db.query("reset role");
    } catch {
      /* the statement's own error is the one that matters */
    }
  }
}

type NannyState = {
  readonly level: string;
  readonly suspended: boolean;
  readonly outcome: string;
};

async function stateOfNanny(): Promise<NannyState> {
  const { rows } = await db.query<NannyState>(
    `select n.verification_level::text as level,
            n.suspended_at is not null   as suspended,
            v.dbs_outcome::text          as outcome
       from public.nannies n
       join public.verifications v on v.nanny_id = n.id
      where n.user_id = $1`,
    [NANNY],
  );
  return rows[0];
}

/**
 * Everything here runs inside one transaction, and a `raise` aborts a transaction: without a savepoint the
 * first refused call would make every later query fail with `25P02` for the wrong reason. Each expected refusal
 * therefore runs inside its own savepoint, which is rolled back whether it raised or not — so a refusal that
 * silently SUCCEEDS also leaves no trace, and the assertion after it is measuring the real state.
 */
async function refusal(sql: () => Promise<unknown>): Promise<string> {
  await db.query("savepoint probe");
  try {
    await sql();
    await db.query("rollback to savepoint probe");
    return "";
  } catch (error) {
    await db.query("rollback to savepoint probe");
    return error instanceof Error ? error.message : String(error);
  } finally {
    await db.query("release savepoint probe");
  }
}

async function nannyPartyId(): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `select id from public.nannies where user_id = $1`,
    [NANNY],
  );
  return rows[0].id;
}

async function lift(decider: string, reason: string): Promise<void> {
  await db.query(
    `select public.lift_nanny_suspension($1::uuid, $2, $3::uuid)`,
    [await nannyPartyId(), reason, decider],
  );
}

async function liftRowCount(): Promise<number> {
  const { rows } = await db.query<{ n: string }>(
    `select count(*)::text as n from public.nanny_suspension_lifts l
       join public.nannies n on n.id = l.nanny_id where n.user_id = $1`,
    [NANNY],
  );
  return Number(rows[0].n);
}

async function decide(reason: string): Promise<void> {
  await db.query(
    `select public.record_vetting_decision($1::uuid, 'rejected', $2, null, null, $3::jsonb, $4::uuid)`,
    [submissionId, reason, JSON.stringify(REQUIRED), ADMIN],
  );
}

beforeAll(async () => {
  db = await connect();
  await db.query("begin");
  await makeUser(NANNY, "barred-probe@example.test", "nanny");
  await makeUser(ADMIN, "admin-probe@example.test", "admin");
  await db.query(
    `insert into public.nannies (user_id, is_isolated, verification_level)
     values ($1, false, 'L1_REGISTERED')`,
    [NANNY],
  );
  await db.query(
    `insert into public.verifications (nanny_id)
     select id from public.nannies where user_id = $1`,
    [NANNY],
  );
  await asNanny(
    `select public.submit_verification_evidence('${EVIDENCE}'::uuid, 'dbs', 'dbs-certificate',
            'stub-manual', 'needs_admin',
            '{"dbs_certificate_ref":"x/dbs/a.pdf","dbs_certificate_number":"001234567890",
              "dbs_issue_date":"2026-01-02","dbs_update_service_consent_at":null}'::jsonb)`,
  );
  const { rows } = await db.query<{ id: string }>(
    `select id from public.vetting_submissions where evidence_id = $1`,
    [EVIDENCE],
  );
  submissionId = rows[0].id;
});

afterAll(async () => {
  await db?.query("rollback");
  await db?.end();
});

describe("int.decision — an adverse DBS bars, and the bar holds (03 §4.3 / I-V5)", () => {
  it("the adverse decision bars her: level 0, suspended, outcome barred", async () => {
    await decide("adverse");

    expect(await stateOfNanny()).toEqual({
      level: "L0_SIGNED_UP",
      suspended: true,
      outcome: "barred",
    });
  });

  /**
   * ★ REVIEW-4 C-2's pin, FLIPPED by `0025` (ADR-168 (a)). A second decision on the SAME submission id with
   * any non-`adverse` reason still resets `dbs_outcome` to `unset` — `record_vetting_decision`'s else-branch is
   * unchanged — but the sync no longer derives `suspended_at` at all, so the bar it did not set is the bar it
   * cannot lift. Measured before `0025`: `suspended` went `t → f`. Measured after: it stays `t`.
   *
   * The outcome moving off `barred` is deliberate and is not the finding: what keeps her out of the pool is
   * `suspended_at` (`is_active_nanny()`, `nanny_is_visible()`, and `0022:180`'s SUSPENDED gate on resubmission
   * all read that column, not the outcome). The bar is the suspension.
   */
  it("★ re-deciding the same submission cannot lift the bar (ADR-168 (a))", async () => {
    await decide("mismatch");

    const after = await stateOfNanny();
    expect(after.suspended).toBe(true);
    expect(after.level).toBe("L0_SIGNED_UP");
  });

  it("she still cannot resubmit while the bar stands — `0022`'s SUSPENDED gate reads the column the sync kept", async () => {
    const message = await refusal(() =>
      asNanny(
        `select public.submit_verification_evidence('${EVIDENCE_2}'::uuid, 'dbs', 'dbs-certificate',
                'stub-manual', 'needs_admin',
                '{"dbs_certificate_ref":"x/dbs/b.pdf","dbs_certificate_number":"001234567891",
                  "dbs_issue_date":"2026-01-03","dbs_update_service_consent_at":null}'::jsonb)`,
      ),
    );

    expect(message).toMatch(/SUSPENDED|suspended/);
  });
});

describe("int.decision — lifting a bar is its own act, recorded (ADR-168 (b))", () => {
  it("an unattributable lift is refused before anything is read or written", async () => {
    const message = await refusal(() =>
      lift(NANNY, "the DBS was another person's"),
    );

    expect(message).toMatch(/must be an admin/);
    expect((await stateOfNanny()).suspended).toBe(true);
    expect(await liftRowCount()).toBe(0);
  });

  it("a blank reason is refused — a lift with no reason answers half the question", async () => {
    const message = await refusal(() => lift(ADMIN, "   "));

    expect(message).toMatch(/needs a reason/);
    expect((await stateOfNanny()).suspended).toBe(true);
    expect(await liftRowCount()).toBe(0);
  });

  it("★ the explicit lift works, and the audit row records who, why and what it walked back", async () => {
    const before = await stateOfNanny();
    expect(before.suspended).toBe(true);

    await lift(ADMIN, "  Identified as a different person; DBS reissued.  ");

    const after = await stateOfNanny();
    expect(after.suspended).toBe(false);
    expect(after.outcome).toBe("unset");

    const { rows } = await db.query<{
      reason: string;
      decided_by: string;
      previous_dbs_outcome: string;
      attributed: boolean;
    }>(
      `select l.reason, l.decided_by::text, l.previous_dbs_outcome::text,
              l.decided_at is not null as attributed
         from public.nanny_suspension_lifts l
         join public.nannies n on n.id = l.nanny_id
        where n.user_id = $1`,
      [NANNY],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      reason: "Identified as a different person; DBS reissued.",
      decided_by: ADMIN,
      previous_dbs_outcome: "unset",
      attributed: true,
    });
  });

  it("lifting a suspension that is not there refuses rather than recording a second lift", async () => {
    const message = await refusal(() => lift(ADMIN, "again"));

    expect(message).toMatch(/is not suspended/);
    expect(await liftRowCount()).toBe(1);
  });

  it("neither anon nor authenticated may execute the lift, and neither may read its audit rows", async () => {
    const { rows } = await db.query<{
      anon_exec: boolean;
      auth_exec: boolean;
      anon_read: boolean;
    }>(
      `select has_function_privilege('anon', 'public.lift_nanny_suspension(uuid, text, uuid)', 'EXECUTE') as anon_exec,
              has_function_privilege('authenticated', 'public.lift_nanny_suspension(uuid, text, uuid)', 'EXECUTE') as auth_exec,
              has_table_privilege('anon', 'public.nanny_suspension_lifts', 'SELECT') as anon_read`,
    );
    expect(rows[0]).toEqual({
      anon_exec: false,
      auth_exec: false,
      anon_read: false,
    });
  });
});

describe("int.decision — the ledger's id space, as ADR-169 rules it", () => {
  it("the ledger's nanny_id is the party row's id, as `0008`'s foreign key says", async () => {
    const { rows } = await db.query<{ matches: boolean }>(
      `select exists (select 1 from public.nannies n
                       where n.id = (select s.nanny_id from public.vetting_submissions s where s.id = $1)
      ) as matches`,
      [submissionId],
    );
    expect(rows[0].matches).toBe(true);
  });

  /**
   * ★ REVIEW-4 C-3's pin, RESTATED rather than flipped — because ADR-169 ruled the other way and a pin that
   * asserts the opposite of the ruling can only ever go green by breaking the schema.
   *
   * The pin asked that the ledger's id ALSO resolve as a session user id, so it would flip on either fix — a
   * join in `entryOf`, or a distinct brand. ADR-169 picked the brand and said why: **the column is right and
   * the label is wrong.** Verification is a fact about the nanny's profile, which is where `nanny_public`, the
   * matching index and ADR-166's reasoning already live. So the property to hold is the INVERSE of the pin:
   * the two id spaces are distinct, and nothing may quietly treat one as the other.
   *
   * The half of ADR-169 that lives in TypeScript — that a session id can no longer be ACCEPTED where a profile
   * id belongs — is `src/modules/verification/__tests__/verification.id-space.test.ts`, held by the compiler.
   * This is the half that lives in the database.
   */
  it("★ the two id spaces are distinct, so a session id resolves nothing in the ledger's place (ADR-169)", async () => {
    const { rows } = await db.query<{
      party_is_user: boolean;
      user_resolves: boolean;
    }>(
      `select (n.id = n.user_id) as party_is_user,
              exists (select 1 from public.vetting_submissions s where s.nanny_id = n.user_id) as user_resolves
         from public.nannies n where n.user_id = $1`,
      [NANNY],
    );

    expect(rows[0].party_is_user).toBe(false);
    expect(rows[0].user_resolves).toBe(false);
  });

  it("★ and the ledger's id is the one the decision-side writes are keyed by, on every road `2c` built", async () => {
    const { rows } = await db.query<{
      verifications: boolean;
      sync: boolean;
      update_service: boolean;
    }>(
      `with party as (
         select s.nanny_id as id from public.vetting_submissions s where s.id = $1
       )
       select exists (select 1 from public.verifications v, party p where v.nanny_id = p.id) as verifications,
              exists (select 1 from public.nannies n, party p where n.id = p.id) as sync,
              exists (select 1 from public.nannies n, party p
                       where n.id = p.id and n.user_id is not null) as update_service`,
      [submissionId],
    );

    expect(rows[0]).toEqual({
      verifications: true,
      sync: true,
      update_service: true,
    });
  });
});
