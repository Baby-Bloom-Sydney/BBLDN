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
// The pin below asserts the property the whole road assumes: **the id the ledger hands the application is one
// a `nannies.user_id` lookup can resolve.** It is schema-level on purpose, so it flips whichever way the owner
// closes it — a join in `entryOf`, or a distinct `NannyPartyId` brand with the conversion made explicit at the
// module seam. **Owner: `2c` / `03 §4.2`'s connector shape.** REVIEW-4 §8 R-4.
//
// One transaction, rolled back, like `int.rls`.
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";

const NANNY = "000000d1-0000-4000-8000-000000000000";
const ADMIN = "000000d9-0000-4000-8000-000000000000";
const EVIDENCE = "000000f1-0000-4000-8000-000000000000";

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
  await db.query(sql);
  await db.query("reset role");
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
   * PINNED — REVIEW-4 C-2. A second decision on the SAME submission id, with any non-`adverse` reason, resets
   * `dbs_outcome` to `unset` and the sync then clears `suspended_at` because it derives the suspension from
   * `dbs_outcome = 'barred'` alone. Measured: `suspended` goes `t → f`.
   *
   * **Owner: `2c` / the migration's author** — a guard in a new migration, not a twin and not a review agent's.
   */
  it.fails(
    "★ PINNED — re-deciding the same submission cannot lift the bar (owner: `2c`, a new migration)",
    async () => {
      await decide("mismatch");

      const after = await stateOfNanny();
      expect(after.suspended).toBe(true);
      expect(after.outcome).toBe("barred");
    },
  );
});

describe("int.decision — the ledger hands the application an id its own stores can resolve", () => {
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
   * PINNED — REVIEW-4 C-1. `db-vetting-store.ts:98` labels that value `UserId` and hands it to stores that
   * resolve it through `nannies.user_id = $1`, which matches nothing. Asserted at the schema so it flips on
   * either fix — a join in `entryOf`, or a distinct brand with the conversion made explicit at the seam.
   *
   * **Owner: `2c` / 03 §4.2's connector shape.**
   */
  it.fails(
    "★ PINNED — that id also resolves as a session user id, which is what every 2c admin road assumes (owner: `2c`)",
    async () => {
      const { rows } = await db.query<{ resolves: boolean }>(
        `select exists (select 1 from public.nannies n
                         where n.user_id = (select s.nanny_id from public.vetting_submissions s where s.id = $1)
        ) as resolves`,
        [submissionId],
      );
      expect(rows[0].resolves).toBe(true);
    },
  );
});
