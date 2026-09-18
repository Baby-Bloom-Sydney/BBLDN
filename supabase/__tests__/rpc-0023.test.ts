// `int.rpc-0023` — the level's one writer and the decision definers `0023` adds (ADR-157), **invoked**, not inspected,
// plus ADR-156's `payment_events.outcome` fold.
//
// The claims: `sync_nanny_verification_state()` derives 02 §4.3's level top-down from the section statuses,
// `dbs_outcome`, the cross-check and the Update Service columns against the sections-per-level the caller hands it
// (`VETTING.requiredChecksByLevel`), writes both `verifications.level` and `nannies.verification_level` (R-8),
// refuses a malformed or emptied list rather than granting, and releases a nanny's held connections at L4
// (ADR-158); `record_vetting_decision()` is the admin's one write — the ledger + the section through
// `apply_vetting_check_result(…, 'admin')`, the DBS outcome and the cross-check the admin *is* under `stub-manual`,
// then the sync, in one transaction; an `adverse` DBS rejection bars and suspends (I-V5); `record_update_service_check()`
// is the level-4 action and only `no_change` confirms it (the B-19 default); `expire_verification_section()` drops the
// level and keeps the ledger; `sweep_stale_verification_processing()` is I-V4's named job; every one is
// `service_role` only. Right-to-work never moves the level (ADR-153). The SQL derivation is pinned equal to the
// TypeScript `deriveLevel` over the same matrix, so the two cannot drift silently.
//
// Everything runs inside one transaction that is rolled back, like `int.rpc-0022`.
import type { Client } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
// Deep imports of the two pure files, deliberately: the integration project boots no environment (05 §9 stage
// 5 talks to the schema, not the app), and the barrels pull `config`'s env reader in. `supabase/` is outside
// the boundary lint's `src/modules/**` scope, and these two files import nothing but types and each other.
import { VETTING } from "@/modules/config/vetting";
import { deriveLevel } from "@/modules/verification/lib/derive-level";
import { requiredSectionsByLevel } from "@/modules/verification/lib/required-sections-by-level";
import type { LevelFacts } from "@/modules/verification/types";
import { connect } from "./db-client";
import { seedFixtures, type Fixtures } from "./rls-fixtures";

let db: Client;
let fx: Fixtures;

const NANNY = "0023a000-0000-4000-8000-000000000001";
const EV = (n: number) => `0023e000-0000-4000-8000-00000000000${n}`;
const REQUIRED = JSON.stringify(
  requiredSectionsByLevel(VETTING.requiredChecksByLevel),
);

beforeAll(async () => {
  db = await connect();
});
afterAll(async () => {
  await db?.end();
});
beforeEach(async () => {
  await db.query("begin");
  fx = await seedFixtures(db);
});
afterEach(async () => {
  await db.query("rollback");
});

// --------------------------------------------------------------------------- helpers (the 0022 suite's shape)

async function asRole<T extends Record<string, unknown>>(
  role: "authenticated" | "anon" | "service_role",
  claims: Record<string, unknown>,
  sql: string,
  params: ReadonlyArray<unknown> = [],
): Promise<ReadonlyArray<T>> {
  await db.query("savepoint as_role");
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(claims),
    ]);
    await db.query(`set local role ${role}`);
    const { rows } = await db.query<T>(sql, params as unknown[]);
    await db.query("reset role");
    await db.query("release savepoint as_role");
    return rows;
  } catch (error) {
    await db.query("rollback to savepoint as_role");
    throw error;
  }
}
const asNanny = <T extends Record<string, unknown>>(
  userId: string,
  sql: string,
  params: ReadonlyArray<unknown> = [],
) =>
  asRole<T>("authenticated", { sub: userId, role: "authenticated" }, sql, params);
const asService = <T extends Record<string, unknown>>(
  sql: string,
  params: ReadonlyArray<unknown> = [],
) => asRole<T>("service_role", { role: "service_role" }, sql, params);

const refusalOf = async (fn: () => Promise<unknown>): Promise<string> => {
  await db.query("savepoint probe");
  try {
    await fn();
    await db.query("rollback to savepoint probe");
    return "NO_ERROR";
  } catch (error) {
    await db.query("rollback to savepoint probe");
    return (error as { message?: string }).message ?? "UNKNOWN";
  }
};

async function makeAuthUser(id: string, email: string): Promise<void> {
  await db.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                             email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                             created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
             'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
    [id, email],
  );
}

/** A nanny through `0021`'s road, with contact, so the party row exists the way production makes it. */
async function makeNanny(userId: string, email: string): Promise<string> {
  await makeAuthUser(userId, email);
  const { rows } = await db.query<{ district: string }>(
    "select district from public.areas order by district limit 1",
  );
  const out = await asNanny<{ out: { nanny_id: string } }>(
    userId,
    `select public.create_nanny_account($1, $2, false, $3, $4, $5, null, '{}'::jsonb) as out`,
    ["Amara", "Okafor", "+447700900002", rows[0]!.district, "Test Area"],
  );
  return out[0]!.out.nanny_id;
}

async function giveBiometricConsent(userId: string): Promise<string> {
  await db.query(
    `insert into public.legal_documents (document_id, version, effective_date, body_md, content_hash)
     values ('biometric-notice', 1, current_date, 'placeholder body (test)', 'test-hash')
     on conflict do nothing`,
  );
  const { rows } = await db.query<{ id: string }>(
    `insert into public.consent_records
       (user_id, party, agreement_id, checkpoint_id, checkpoint_text, document_id, document_version,
        consent_given, purpose)
     values ($1, 'nanny', 'AGR-04', 'agr04_biometric', 'I consent.', 'biometric-notice', 1, true, 'biometric-notice')
     returning id`,
    [userId],
  );
  return rows[0]!.id;
}

type SubmitOut = { submission_id: string; verification_id: string };
const submit = (
  userId: string,
  evidenceId: string,
  section: "identity" | "dbs" | "right_to_work",
  evidenceType: string,
  columns: Record<string, unknown>,
) =>
  asNanny<{ out: SubmitOut }>(
    userId,
    `select public.submit_verification_evidence($1::uuid, $2::public.verification_section, $3, 'stub-manual',
             'needs_admin', $4::jsonb) as out`,
    [evidenceId, section, evidenceType, JSON.stringify(columns)],
  ).then((rows) => rows[0]!.out);

const decide = (
  submissionId: string,
  decision: "verified" | "rejected",
  reason: string | null = null,
  note: string | null = null,
) =>
  asService<{ out: Record<string, unknown> }>(
    `select public.record_vetting_decision($1::uuid, $2::text, $3::text, $4::text, null::timestamptz, $5::jsonb) as out`,
    [submissionId, decision, reason, note, REQUIRED],
  ).then((rows) => rows[0]!.out);

const sync = (nannyId: string, required = REQUIRED) =>
  asService<{ out: Record<string, unknown> }>(
    `select public.sync_nanny_verification_state($1::uuid, $2::jsonb) as out`,
    [nannyId, required],
  ).then((rows) => rows[0]!.out);

const updateService = (
  nannyId: string,
  result: string,
  subscribed: boolean,
  checkedBy: string,
) =>
  asService<{ out: Record<string, unknown> }>(
    `select public.record_update_service_check($1::uuid, $2::public.update_service_result, $3, $4::uuid, $5::jsonb) as out`,
    [nannyId, result, subscribed, checkedBy, REQUIRED],
  ).then((rows) => rows[0]!.out);

const levels = async (nannyId: string) => {
  const { rows } = await db.query<{
    n_level: string;
    n_suspended: Date | null;
    v_level: string | null;
    v_suspended: Date | null;
    dbs_outcome: string | null;
    cross_check: string | null;
    dbs_status: string | null;
    identity_status: string | null;
    level_changed_at: Date | null;
  }>(
    `select n.verification_level as n_level, n.suspended_at as n_suspended,
            v.level as v_level, v.suspended_at as v_suspended, v.dbs_outcome::text, v.cross_check_status::text as cross_check,
            v.dbs_status::text, v.identity_status::text, v.level_changed_at
       from public.nannies n left join public.verifications v on v.nanny_id = n.id
      where n.id = $1`,
    [nannyId],
  );
  return rows[0]!;
};

/** identity + dbs submitted and decided `verified` — the L3 road, as the admin walks it. */
async function verifyToL3(userId: string): Promise<{
  identity: string;
  dbs: string;
}> {
  const consent = await giveBiometricConsent(userId);
  const identity = await submit(userId, EV(1), "identity", "identity-document", {
    identity_evidence_type: "passport",
    identity_document_ref: `${userId}/identity-document/doc.jpg`,
    surname: "Okafor",
    given_names: "Amara",
    date_of_birth: "1990-04-12",
    biometric_consent_id: consent,
  });
  await submit(userId, EV(2), "identity", "selfie", {
    identity_selfie_ref: `${userId}/identity-selfie/selfie.jpg`,
    biometric_consent_id: consent,
  });
  const dbs = await submit(userId, EV(3), "dbs", "dbs-certificate", {
    dbs_certificate_ref: `${userId}/dbs-certificate/cert.pdf`,
    dbs_certificate_number: "123456789012",
    dbs_issue_date: "2026-01-10",
  });
  await decide(identity.submission_id, "verified");
  await decide(dbs.submission_id, "verified");
  return { identity: identity.submission_id, dbs: dbs.submission_id };
}

// --------------------------------------------------------------------------- the sync

describe("sync_nanny_verification_state() — the level's one writer (ADR-157 (1))", () => {
  let nannyId: string;
  beforeEach(async () => {
    nannyId = await makeNanny(NANNY, "amara-0023@example.test");
  });

  it("is service_role only: a signed-in nanny and an anonymous caller are refused", async () => {
    expect(
      await refusalOf(() =>
        asNanny(
          NANNY,
          `select public.sync_nanny_verification_state($1::uuid, $2::jsonb)`,
          [nannyId, REQUIRED],
        ),
      ),
    ).toMatch(/permission denied/);
    expect(
      await refusalOf(() =>
        asRole(
          "anon",
          {},
          `select public.sync_nanny_verification_state($1::uuid, $2::jsonb)`,
          [nannyId, REQUIRED],
        ),
      ),
    ).toMatch(/permission denied/);
  });

  it("a nanny with no verifications row is L0 (I-V1) and the call answers from = to", async () => {
    const out = await sync(nannyId);
    expect(out).toMatchObject({
      from_level: "L0_SIGNED_UP",
      to_level: "L0_SIGNED_UP",
      suspended: false,
      released: 0,
    });
    expect((await levels(nannyId)).n_level).toBe("L0_SIGNED_UP");
  });

  it("identity submitted → L1; identity verified → L2; both written to nannies and verifications with level_changed_at", async () => {
    const consent = await giveBiometricConsent(NANNY);
    const identity = await submit(NANNY, EV(1), "identity", "identity-document", {
      identity_evidence_type: "passport",
      identity_document_ref: `${NANNY}/identity-document/doc.jpg`,
      surname: "Okafor",
      given_names: "Amara",
      date_of_birth: "1990-04-12",
      biometric_consent_id: consent,
    });
    expect((await sync(nannyId)).to_level).toBe("L1_REGISTERED");
    expect((await levels(nannyId)).v_level).toBe("L1_REGISTERED");

    await decide(identity.submission_id, "verified");
    const after = await levels(nannyId);
    expect(after.n_level).toBe("L2_ID_VERIFIED");
    expect(after.v_level).toBe("L2_ID_VERIFIED");
    expect(after.level_changed_at).not.toBeNull();
  });

  it("refuses a malformed list and an emptied L2–L4 list rather than granting a level (ADR-157 (1))", async () => {
    expect(
      await refusalOf(() => sync(nannyId, JSON.stringify({ L2_ID_VERIFIED: ["dbs"] }))),
    ).toMatch(/must require at least one section|L3_PROVISIONALLY_VERIFIED/);
    expect(
      await refusalOf(() =>
        sync(
          nannyId,
          JSON.stringify({
            L0_SIGNED_UP: [],
            L1_REGISTERED: [],
            L2_ID_VERIFIED: ["identity"],
            L3_PROVISIONALLY_VERIFIED: ["identity", "dbs"],
            L4_FULLY_VERIFIED: ["identity", "wwcc"],
          }),
        ),
      ),
    ).toMatch(/is not an evidence section/);
    expect(await refusalOf(() => sync(nannyId, '"nope"'))).toMatch(
      /must be an object/,
    );
  });

  it("right-to-work verified alone never moves the level (ADR-153)", async () => {
    const rtw = await submit(NANNY, EV(4), "right_to_work", "right-to-work-passport", {
      rtw_evidence_type: "british_irish_passport",
      rtw_document_ref: `${NANNY}/rtw-document/passport.jpg`,
    });
    await decide(rtw.submission_id, "verified");
    expect((await levels(nannyId)).n_level).toBe("L0_SIGNED_UP");
  });

  it("agrees with the TypeScript deriveLevel over the whole matrix (the two cannot drift)", async () => {
    const statuses = ["not_started", "pending", "verified", "rejected"] as const;
    const outcomes = ["unset", "cleared", "barred"] as const;
    const crossChecks = ["not_started", "passed"] as const;
    const usResults = [null, "no_change", "new_information"] as const;
    // 0008: an identity section past not_started needs the consent row (I-V3) — the CHECK reads it on insert
    const consent = await giveBiometricConsent(NANNY);
    let cases = 0;
    for (const identity of statuses)
      for (const dbs of statuses)
        for (const outcome of outcomes)
          for (const cross of crossChecks)
            for (const us of usResults) {
              // the CHECK on verifications: barred ⇒ L0 + suspended, so the row is written in that shape
              await db.query(
                `insert into public.verifications (nanny_id, identity_status, dbs_status, rtw_status, dbs_outcome,
                   cross_check_status, dbs_update_service_last_result, dbs_update_service_checked_by, level, suspended_at,
                   biometric_consent_id)
                 values ($1, $2::public.section_status, $3::public.section_status, 'verified', $4::public.dbs_outcome,
                         $5::public.cross_check_status, $6::public.update_service_result, $7::uuid, 'L0_SIGNED_UP',
                         case when $4::public.dbs_outcome = 'barred' then now() else null end, $8::uuid)
                 on conflict (nanny_id) do update set identity_status = excluded.identity_status,
                   dbs_status = excluded.dbs_status, dbs_outcome = excluded.dbs_outcome,
                   cross_check_status = excluded.cross_check_status,
                   dbs_update_service_last_result = excluded.dbs_update_service_last_result,
                   dbs_update_service_checked_by = excluded.dbs_update_service_checked_by,
                   level = 'L0_SIGNED_UP', suspended_at = excluded.suspended_at`,
                [nannyId, identity, dbs, outcome, cross, us, us === null ? null : fx.admin, consent],
              );
              const out = await sync(nannyId);
              const facts: LevelFacts = {
                sections: { identity, dbs, "right-to-work": "verified" },
                dbsOutcome: outcome,
                crossCheckPassed: cross === "passed",
                updateServiceConfirmed: us === "no_change",
              };
              expect(out.to_level, JSON.stringify(facts)).toBe(
                deriveLevel(facts, VETTING.requiredChecksByLevel),
              );
              cases += 1;
            }
    expect(cases).toBe(4 * 4 * 3 * 2 * 3);
  });
});

// --------------------------------------------------------------------------- the decision

describe("record_vetting_decision() — the admin's one write (ADR-157 (2); ADR-159)", () => {
  let nannyId: string;
  beforeEach(async () => {
    nannyId = await makeNanny(NANNY, "amara-0023@example.test");
  });

  it("is service_role only", async () => {
    const consent = await giveBiometricConsent(NANNY);
    const identity = await submit(NANNY, EV(1), "identity", "identity-document", {
      identity_evidence_type: "passport",
      identity_document_ref: `${NANNY}/identity-document/doc.jpg`,
      surname: "Okafor",
      given_names: "Amara",
      date_of_birth: "1990-04-12",
      biometric_consent_id: consent,
    });
    expect(
      await refusalOf(() =>
        asNanny(
          NANNY,
          `select public.record_vetting_decision($1::uuid, 'verified', null::text, null::text, null::timestamptz, $2::jsonb)`,
          [identity.submission_id, REQUIRED],
        ),
      ),
    ).toMatch(/permission denied/);
  });

  it("DBS verified: outcome cleared, cross-check passed by the admin, L3 — in one call; checked_by = admin", async () => {
    const { dbs } = await verifyToL3(NANNY);
    const row = await levels(nannyId);
    expect(row.n_level).toBe("L3_PROVISIONALLY_VERIFIED");
    expect(row.dbs_outcome).toBe("cleared");
    expect(row.cross_check).toBe("passed");
    const { rows } = await db.query<{ checked_by: string; status: string; note: string | null }>(
      `select v.dbs_checked_by::text as checked_by, s.status::text, s.raw_response ->> 'note' as note
         from public.vetting_submissions s join public.verifications v on v.id = s.verification_id
        where s.id = $1`,
      [dbs],
    );
    expect(rows[0]).toMatchObject({ checked_by: "admin", status: "passed" });
  });

  it("a rejection needs a reason; the note lands on the ledger; the outcome returns to unset and the level drops", async () => {
    const { dbs } = await verifyToL3(NANNY);
    expect(
      await refusalOf(() => decide(dbs, "rejected", null)),
    ).toMatch(/needs a reason/);
    // a later DBS submission is refused while the section is verified (0022) — so the re-decision is on the same row
    const out = await decide(dbs, "rejected", "mismatch", "name differs from the passport");
    expect(out).toMatchObject({ section: "dbs", status: "rejected", to_level: "L2_ID_VERIFIED" });
    const row = await levels(nannyId);
    expect(row.dbs_outcome).toBe("unset");
    expect(row.cross_check).toBe("not_started");
    const { rows } = await db.query<{ note: string | null }>(
      `select raw_response ->> 'note' as note from public.vetting_submissions where id = $1`,
      [dbs],
    );
    expect(rows[0]!.note).toBe("name differs from the passport");
  });

  it("DBS rejected `adverse` bars: dbs_outcome = barred, L0 and suspended on both tables, the view says so (I-V5)", async () => {
    const { dbs } = await verifyToL3(NANNY);
    const out = await decide(dbs, "rejected", "adverse");
    expect(out).toMatchObject({ to_level: "L0_SIGNED_UP", suspended: true });
    const row = await levels(nannyId);
    expect(row.dbs_outcome).toBe("barred");
    expect(row.n_level).toBe("L0_SIGNED_UP");
    expect(row.n_suspended).not.toBeNull();
    expect(row.v_suspended).not.toBeNull();
    const view = await asNanny<{ is_suspended: boolean }>(
      NANNY,
      `select is_suspended from public.verification_status where nanny_id = $1`,
      [nannyId],
    );
    expect(view[0]!.is_suspended).toBe(true);
    // and she is out of the pool: the view's predicate excludes a suspended row
    const pool = await asRole<{ nanny_id: string }>(
      "anon",
      {},
      `select nanny_id from public.nanny_public where nanny_id = $1`,
      [nannyId],
    );
    expect(pool).toHaveLength(0);
  });

  it("refuses an older identity attempt once a newer one exists (STALE_SUBMISSION, as 0022 does)", async () => {
    const consent = await giveBiometricConsent(NANNY);
    const first = await submit(NANNY, EV(1), "identity", "identity-document", {
      identity_evidence_type: "passport",
      identity_document_ref: `${NANNY}/identity-document/a.jpg`,
      surname: "Okafor",
      given_names: "Amara",
      date_of_birth: "1990-04-12",
      biometric_consent_id: consent,
    });
    await decide(first.submission_id, "rejected", "document-unreadable");
    // one transaction, one now(): the second attempt is made later by hand, as 0022's own suite does
    await db.query(
      "update public.vetting_submissions set submitted_at = submitted_at - interval '1 minute' where id = $1",
      [first.submission_id],
    );
    await submit(NANNY, EV(5), "identity", "identity-document", {
      identity_evidence_type: "passport",
      identity_document_ref: `${NANNY}/identity-document/b.jpg`,
      surname: "Okafor",
      given_names: "Amara",
      date_of_birth: "1990-04-12",
      biometric_consent_id: consent,
    });
    expect(await refusalOf(() => decide(first.submission_id, "verified"))).toMatch(
      /STALE_SUBMISSION/,
    );
  });
});

// --------------------------------------------------------------------------- the level-4 action + the hold release

describe("record_update_service_check() — the level-4 action (ADR-157 (3); B-19 default) and the release (ADR-158)", () => {
  let nannyId: string;
  beforeEach(async () => {
    nannyId = await makeNanny(NANNY, "amara-0023@example.test");
    await verifyToL3(NANNY);
  });

  it("only an admin's user id may be recorded as the checker; a nanny's id is refused (07 §5.4 row 6)", async () => {
    expect(
      await refusalOf(() => updateService(nannyId, "no_change", true, NANNY)),
    ).toMatch(/must be an admin/);
  });

  it("no_change → L4; the nanny's held connections are released and counted", async () => {
    // a held connection made while she was L3 (R-14). Measured here: `upsert_connection()` (0019) carries no
    // `held_for_verification` / `held_at` — the pair has NO writer yet (ADR-158 (2): connections' side, pinned in
    // `connections.hold.pin.test.ts`) — so the row is seeded directly, the way a future K-row write would leave it.
    await db.query(
      `insert into public.connection_requests (id, position_id, parent_id, nanny_id, stage, origin, held_for_verification, held_at)
       values ($1, $2, $3, $4, 'REQUEST_SENT', 'parent_request', true, now())`,
      ["00230000-0000-4000-8000-000000000011", fx.positionA, fx.parentAId, nannyId],
    );
    const out = await updateService(nannyId, "no_change", true, fx.admin);
    expect(out).toMatchObject({ to_level: "L4_FULLY_VERIFIED", released: 1 });
    const { rows } = await db.query<{ held: boolean; held_at: Date | null }>(
      `select held_for_verification as held, held_at from public.connection_requests where nanny_id = $1`,
      [nannyId],
    );
    expect(rows[0]).toEqual({ held: false, held_at: null });
    const { rows: us } = await db.query<{ by: string; result: string; subscribed: boolean }>(
      `select dbs_update_service_checked_by::text as by, dbs_update_service_last_result::text as result,
              dbs_update_service_subscribed as subscribed from public.verifications where nanny_id = $1`,
      [nannyId],
    );
    expect(us[0]).toEqual({ by: fx.admin, result: "no_change", subscribed: true });
  });

  it("not_subscribed and check_failed confirm nothing (L3 stays); new_information returns the section to review (L2)", async () => {
    expect((await updateService(nannyId, "not_subscribed", false, fx.admin)).to_level).toBe(
      "L3_PROVISIONALLY_VERIFIED",
    );
    expect((await updateService(nannyId, "check_failed", true, fx.admin)).to_level).toBe(
      "L3_PROVISIONALLY_VERIFIED",
    );
    const out = await updateService(nannyId, "new_information", true, fx.admin);
    expect(out.to_level).toBe("L2_ID_VERIFIED");
    expect((await levels(nannyId)).dbs_status).toBe("review");
  });
});

// --------------------------------------------------------------------------- expiry + the stale sweep

describe("expire_verification_section() and sweep_stale_verification_processing() (ADR-157 (4) / (5))", () => {
  let nannyId: string;
  beforeEach(async () => {
    nannyId = await makeNanny(NANNY, "amara-0023@example.test");
  });

  it("expiring the DBS section drops the level and keeps the ledger row passed", async () => {
    const { dbs } = await verifyToL3(NANNY);
    const out = await asService<{ out: Record<string, unknown> }>(
      `select public.expire_verification_section($1::uuid, $2::jsonb) as out`,
      [dbs, REQUIRED],
    ).then((rows) => rows[0]!.out);
    expect(out).toMatchObject({ section: "dbs", to_level: "L2_ID_VERIFIED" });
    const row = await levels(nannyId);
    expect(row.dbs_status).toBe("expired");
    const { rows } = await db.query<{ status: string }>(
      `select status::text from public.vetting_submissions where id = $1`,
      [dbs],
    );
    expect(rows[0]!.status).toBe("passed");
  });

  it("the stale sweep moves a processing section older than the window to review and leaves a fresh one", async () => {
    const consent = await giveBiometricConsent(NANNY);
    await submit(NANNY, EV(1), "identity", "identity-document", {
      identity_evidence_type: "passport",
      identity_document_ref: `${NANNY}/identity-document/doc.jpg`,
      surname: "Okafor",
      given_names: "Amara",
      date_of_birth: "1990-04-12",
      biometric_consent_id: consent,
    });
    await submit(NANNY, EV(3), "dbs", "dbs-certificate", {
      dbs_certificate_ref: `${NANNY}/dbs-certificate/cert.pdf`,
      dbs_certificate_number: "123456789012",
      dbs_issue_date: "2026-01-10",
    });
    await asNanny(NANNY, `select public.claim_verification_processing()`);
    await db.query(
      `update public.verifications set identity_status_at = now() - interval '20 minutes' where nanny_id = $1`,
      [nannyId],
    );
    const swept = await asService<{ n: number }>(
      `select public.sweep_stale_verification_processing(5) as n`,
    );
    expect(swept[0]!.n).toBe(1);
    const row = await levels(nannyId);
    expect(row.identity_status).toBe("review");
    expect(row.dbs_status).toBe("processing");
  });

  it("both are service_role only", async () => {
    expect(
      await refusalOf(() =>
        asNanny(NANNY, `select public.sweep_stale_verification_processing(5)`),
      ),
    ).toMatch(/permission denied/);
    expect(
      await refusalOf(() =>
        asNanny(
          NANNY,
          `select public.expire_verification_section($1::uuid, $2::jsonb)`,
          ["00000000-0000-4000-8000-000000000000", REQUIRED],
        ),
      ),
    ).toMatch(/permission denied/);
  });
});

// --------------------------------------------------------------------------- ADR-156 folded

describe("apply_payment_event() writes payment_events.outcome (ADR-156, folded into 0023)", () => {
  const apply = async (
    eventId: string,
    parentUserId: string | null,
    patch: Record<string, unknown> | null,
  ): Promise<Record<string, unknown>> => {
    const { rows } = await db.query<{ result: Record<string, unknown> }>(
      `select public.apply_payment_event('stripe', $1, 'payout.paid', '{"id":"evt"}'::jsonb, now(), $2, $3::jsonb, null) as result`,
      [eventId, parentUserId, patch === null ? null : JSON.stringify(patch)],
    );
    return rows[0]!.result;
  };
  const outcomeOf = async (eventId: string) => {
    const { rows } = await db.query<{ outcome: string | null }>(
      `select outcome from public.payment_events where provider_event_id = $1`,
      [eventId],
    );
    return rows[0]!.outcome;
  };

  it("ignored, unresolved and applied are told apart on the row, and only an unresolved row stays on the unprocessed index", async () => {
    await db.query(
      `insert into public.parent_subscriptions (parent_user_id, status) values ($1, 'lapsed')`,
      [fx.parentA],
    );
    expect((await apply("evt_ignored", fx.parentA, null)).outcome).toBe("ignored");
    expect(await outcomeOf("evt_ignored")).toBe("ignored");
    expect((await apply("evt_unresolved", null, { status: "trial" })).outcome).toBe("unresolved");
    expect(await outcomeOf("evt_unresolved")).toBe("unresolved");
    expect((await apply("evt_applied", fx.parentA, { status: "trial" })).outcome).toBe("applied");
    expect(await outcomeOf("evt_applied")).toBe("applied");
    const { rows } = await db.query<{ provider_event_id: string }>(
      `select provider_event_id from public.payment_events where outcome is null`,
    );
    expect(rows).toHaveLength(0);
  });
});
