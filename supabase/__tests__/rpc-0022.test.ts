// `int.rpc-0022` — the wizard's four definers `0022` adds, **invoked**, not inspected (ADR-154).
//
// The claims: a submission writes the ledger row and the section's submission columns in one call, from a
// static per-section list (a guarded key is dropped, never honoured); the `verifications` row is created on the
// first wizard write (I-V1 amended); identity cannot leave `not_started` without the caller's own
// `biometric-notice` consent row (I-V3); a known `evidence_id` answers the existing submission and writes
// nothing (03 §4.2 idempotency; 07 §4.20); another nanny's evidence id is refused; a section at `verified` or
// `processing` is closed to a new submission; contact "saved" is the `verified` value with its stamp and needs
// the contact values first; the processing claim is atomic and one-shot; the provider-side write is
// `service_role` only and never touches `level`. Every nanny write runs as `authenticated` under the caller's
// own claims, the way PostgREST would run it; the provider write runs as `service_role`.
//
// Everything runs inside one transaction that is rolled back, like `int.rpc-0021`, so the suite leaves the
// database exactly as it found it.
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
import { connect } from "./db-client";

let db: Client;

const NANNY = "0022a000-0000-4000-8000-000000000001";
const OTHER = "0022a000-0000-4000-8000-000000000002";
const EVIDENCE_1 = "0022e000-0000-4000-8000-000000000001";
const EVIDENCE_2 = "0022e000-0000-4000-8000-000000000002";
const EVIDENCE_3 = "0022e000-0000-4000-8000-000000000003";

beforeAll(async () => {
  db = await connect();
});
afterAll(async () => {
  await db?.end();
});

beforeEach(async () => {
  await db.query("begin");
});
afterEach(async () => {
  await db.query("rollback");
});

/** One statement as one PostgREST request would run it, inside a savepoint so a refusal is observable. */
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
  asRole<T>(
    "authenticated",
    { sub: userId, role: "authenticated" },
    sql,
    params,
  );

const asService = <T extends Record<string, unknown>>(
  sql: string,
  params: ReadonlyArray<unknown> = [],
) => asRole<T>("service_role", { role: "service_role" }, sql, params);

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

/** A nanny account through `0021`'s own road, so the party row exists the way production makes it. */
async function makeNanny(
  userId: string,
  email: string,
  withContact = true,
): Promise<string> {
  await makeAuthUser(userId, email);
  const { rows } = await db.query<{ district: string }>(
    "select district from public.areas order by district limit 1",
  );
  const out = await asNanny<{
    out: { nanny_id: string };
  }>(
    userId,
    `select public.create_nanny_account($1, $2, false, $3, $4, $5, null, '{}'::jsonb) as out`,
    withContact
      ? ["Amara", "Okafor", "+447700900001", rows[0]!.district, "Test Area"]
      : ["Amara", "Okafor", null, null, null],
  );
  return out[0]!.out.nanny_id;
}

/** The AGR-04 row the identity section needs (I-V3): a `biometric-notice` consent of this user. */
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

type SubmitOut = {
  submission_id: string;
  verification_id: string;
  existing: boolean;
};

const submit = (
  userId: string,
  evidenceId: string,
  section: "identity" | "dbs" | "right_to_work" | "contact",
  evidenceType: string,
  columns: Record<string, unknown>,
  status = "needs_admin",
) =>
  asNanny<{ out: SubmitOut }>(
    userId,
    `select public.submit_verification_evidence($1::uuid, $2::public.verification_section, $3, 'stub-manual',
             $4::public.vetting_submission_status, $5::jsonb) as out`,
    [evidenceId, section, evidenceType, status, JSON.stringify(columns)],
  ).then((rows) => rows[0]!.out);

const identityColumns = (consentId: string) => ({
  identity_evidence_type: "passport",
  identity_document_ref: `${NANNY}/identity-document/doc.jpg`,
  identity_selfie_ref: `${NANNY}/identity-selfie/selfie.jpg`,
  surname: "Okafor",
  given_names: "Amara",
  date_of_birth: "1990-04-12",
  biometric_consent_id: consentId,
});

const verificationRow = async (nannyId: string) =>
  (
    await db.query(`select * from public.verifications where nanny_id = $1`, [
      nannyId,
    ])
  ).rows[0];

describe("submit_verification_evidence() — the one write per submission (ADR-154 (2))", () => {
  let nannyId: string;
  beforeEach(async () => {
    nannyId = await makeNanny(NANNY, "amara-0022@example.test");
  });

  it("refuses an anonymous caller and a session with no nannies row", async () => {
    await expect(
      asRole(
        "anon",
        {},
        `select public.submit_verification_evidence($1::uuid, 'dbs', 'dbs-certificate', 'stub-manual', 'needs_admin', '{}'::jsonb)`,
        [EVIDENCE_1],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await makeAuthUser(OTHER, "no-row-0022@example.test");
    await expect(
      submit(OTHER, EVIDENCE_1, "dbs", "dbs-certificate", {}),
    ).rejects.toMatchObject({ code: "P0002" });
  });

  it("identity cannot leave not_started without the caller's own biometric-notice consent (I-V3)", async () => {
    await expect(
      submit(NANNY, EVIDENCE_1, "identity", "identity-document", {
        identity_evidence_type: "passport",
        identity_document_ref: `${NANNY}/identity-document/doc.jpg`,
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("BIOMETRIC_CONSENT_REQUIRED"),
    });
    // another user's consent row does not count
    await makeAuthUser(OTHER, "other-0022@example.test");
    const foreign = await giveBiometricConsent(OTHER);
    await expect(
      submit(
        NANNY,
        EVIDENCE_1,
        "identity",
        "identity-document",
        identityColumns(foreign),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining("BIOMETRIC_CONSENT_REQUIRED"),
    });
    expect(await verificationRow(nannyId)).toBeUndefined();
  });

  it("creates the verifications row on the first write (I-V1), inserts the ledger row and writes the identity columns from the static list", async () => {
    const consentId = await giveBiometricConsent(NANNY);
    const out = await submit(
      NANNY,
      EVIDENCE_1,
      "identity",
      "identity-document",
      {
        ...identityColumns(consentId),
        // guarded keys — dropped, never honoured
        identity_status: "verified",
        level: "L4_FULLY_VERIFIED",
        dbs_outcome: "cleared",
        identity_checked_by: "admin",
      },
    );
    expect(out.existing).toBe(false);

    const row = await verificationRow(nannyId);
    expect(row).toMatchObject({
      id: out.verification_id,
      level: "L0_SIGNED_UP",
      identity_status: "pending",
      identity_evidence_type: "passport",
      identity_document_ref: `${NANNY}/identity-document/doc.jpg`,
      identity_selfie_ref: `${NANNY}/identity-selfie/selfie.jpg`,
      surname: "Okafor",
      given_names: "Amara",
      biometric_consent_id: consentId,
      identity_checked_by: "none",
      identity_attempts: 1,
      dbs_status: "not_started",
      rtw_status: "not_started",
      contact_status: "not_started",
      dbs_outcome: "unset",
    });
    expect(row.identity_status_at).not.toBeNull();

    const { rows: ledger } = await db.query(
      `select evidence_id, section, evidence_type, provider_key, status, nanny_id, verification_id
         from public.vetting_submissions where id = $1`,
      [out.submission_id],
    );
    expect(ledger[0]).toEqual({
      evidence_id: EVIDENCE_1,
      section: "identity",
      evidence_type: "identity-document",
      provider_key: "stub-manual",
      status: "needs_admin",
      nanny_id: nannyId,
      verification_id: out.verification_id,
    });
  });

  it("is idempotent on evidence_id — the second call answers the existing submission and writes nothing", async () => {
    const consentId = await giveBiometricConsent(NANNY);
    const first = await submit(
      NANNY,
      EVIDENCE_1,
      "identity",
      "identity-document",
      identityColumns(consentId),
    );
    const second = await submit(
      NANNY,
      EVIDENCE_1,
      "identity",
      "identity-document",
      {
        ...identityColumns(consentId),
        surname: "Changed",
      },
    );
    expect(second).toEqual({ ...first, existing: true });
    const row = await verificationRow(nannyId);
    expect(row.surname).toBe("Okafor");
    expect(row.identity_attempts).toBe(1);
    const { rows } = await db.query(
      "select count(*)::int as n from public.vetting_submissions where verification_id = $1",
      [first.verification_id],
    );
    expect(rows[0]).toEqual({ n: 1 });
  });

  it("refuses another nanny's evidence id rather than answering it", async () => {
    const consentId = await giveBiometricConsent(NANNY);
    await submit(
      NANNY,
      EVIDENCE_1,
      "identity",
      "identity-document",
      identityColumns(consentId),
    );
    await makeNanny(OTHER, "other-nanny-0022@example.test");
    await expect(
      submit(OTHER, EVIDENCE_1, "dbs", "dbs-certificate", {}),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("dbs and right_to_work write only their own columns; a second section's key is dropped", async () => {
    const dbs = await submit(NANNY, EVIDENCE_2, "dbs", "dbs-certificate", {
      dbs_certificate_ref: `${NANNY}/dbs-certificate/cert.pdf`,
      dbs_certificate_number: "001234567890",
      dbs_issue_date: "2025-06-01",
      dbs_update_service_consent_at: "2026-09-18T00:00:00Z",
      rtw_share_code: "SMUGGLED1",
      dbs_outcome: "cleared",
    });
    const rtw = await submit(
      NANNY,
      EVIDENCE_3,
      "right_to_work",
      "right-to-work-share-code",
      {
        rtw_evidence_type: "share_code",
        rtw_share_code: "W1A2B3C4D",
        dbs_certificate_number: "999999999999",
      },
    );
    expect(dbs.verification_id).toBe(rtw.verification_id);
    const row = await verificationRow(nannyId);
    expect(row).toMatchObject({
      dbs_status: "pending",
      dbs_certificate_ref: `${NANNY}/dbs-certificate/cert.pdf`,
      dbs_certificate_number: "001234567890",
      dbs_outcome: "unset",
      rtw_status: "pending",
      rtw_evidence_type: "share_code",
      rtw_share_code: "W1A2B3C4D",
      identity_status: "not_started",
    });
    expect(row.dbs_update_service_consent_at).not.toBeNull();
    const { rows } = await db.query<{ section: string }>(
      "select section from public.vetting_submissions where verification_id = $1 order by section",
      [dbs.verification_id],
    );
    expect(rows.map((r) => r.section)).toEqual(["dbs", "right_to_work"]);
  });

  it("refuses a section that is verified or processing, a suspended row, and a section that is not evidence", async () => {
    await submit(NANNY, EVIDENCE_2, "dbs", "dbs-certificate", {
      dbs_certificate_ref: `${NANNY}/dbs-certificate/cert.pdf`,
    });
    await db.query(
      "update public.verifications set dbs_status = 'verified' where nanny_id = $1",
      [nannyId],
    );
    await expect(
      submit(NANNY, EVIDENCE_3, "dbs", "dbs-certificate", {}),
    ).rejects.toMatchObject({
      message: expect.stringContaining("SECTION_NOT_OPEN"),
    });
    await db.query(
      "update public.verifications set dbs_status = 'processing' where nanny_id = $1",
      [nannyId],
    );
    await expect(
      submit(NANNY, EVIDENCE_3, "dbs", "dbs-certificate", {}),
    ).rejects.toMatchObject({
      message: expect.stringContaining("SECTION_NOT_OPEN"),
    });
    await db.query(
      "update public.verifications set dbs_status = 'rejected', suspended_at = now() where nanny_id = $1",
      [nannyId],
    );
    await expect(
      submit(NANNY, EVIDENCE_3, "dbs", "dbs-certificate", {}),
    ).rejects.toMatchObject({ message: expect.stringContaining("SUSPENDED") });
    await expect(
      submit(NANNY, EVIDENCE_3, "contact", "dbs-certificate", {}),
    ).rejects.toMatchObject({ code: "22023" });
  });
});

describe("save_verification_contact() — contact 'saved' is the verified value with its stamp (ADR-154 (3))", () => {
  it("stamps the row (creating it if absent) once the contact values exist on user_profiles", async () => {
    const nannyId = await makeNanny(NANNY, "amara-contact-0022@example.test");
    const out = await asNanny<{ ok: boolean }>(
      NANNY,
      "select public.save_verification_contact() as ok",
    );
    expect(out[0]).toEqual({ ok: true });
    const row = await verificationRow(nannyId);
    expect(row.contact_status).toBe("verified");
    expect(row.contact_saved_at).not.toBeNull();
    expect(row.identity_status).toBe("not_started");
  });

  it("refuses while the mobile or the district is missing — the values go through update_nanny_profile first (R-7)", async () => {
    await makeNanny(NANNY, "amara-nocontact-0022@example.test", false);
    await expect(
      asNanny(NANNY, "select public.save_verification_contact()"),
    ).rejects.toMatchObject({
      message: expect.stringContaining("CONTACT_INCOMPLETE"),
    });
  });
});

describe("claim_verification_processing() — I-V4's atomic claim (ADR-154 (4))", () => {
  it("moves every pending section to processing in one statement, names them, and is one-shot", async () => {
    const nannyId = await makeNanny(NANNY, "amara-claim-0022@example.test");
    const consentId = await giveBiometricConsent(NANNY);
    await submit(
      NANNY,
      EVIDENCE_1,
      "identity",
      "identity-document",
      identityColumns(consentId),
    );
    await submit(NANNY, EVIDENCE_2, "dbs", "dbs-certificate", {
      dbs_certificate_ref: `${NANNY}/dbs-certificate/cert.pdf`,
    });
    const first = await asNanny<{ claimed: string[] }>(
      NANNY,
      "select public.claim_verification_processing() as claimed",
    );
    expect([...first[0]!.claimed].sort()).toEqual(["dbs", "identity"]);
    const row = await verificationRow(nannyId);
    expect(row).toMatchObject({
      identity_status: "processing",
      dbs_status: "processing",
      rtw_status: "not_started",
    });
    const second = await asNanny<{ claimed: string[] }>(
      NANNY,
      "select public.claim_verification_processing() as claimed",
    );
    expect(second[0]!.claimed).toEqual([]);
  });

  it("answers an empty list for a nanny with no verifications row", async () => {
    await makeNanny(NANNY, "amara-norow-0022@example.test");
    const out = await asNanny<{ claimed: string[] }>(
      NANNY,
      "select public.claim_verification_processing() as claimed",
    );
    expect(out[0]!.claimed).toEqual([]);
  });
});

describe("apply_vetting_check_result() — the provider-side write, service_role only (ADR-154 (5))", () => {
  let nannyId: string;
  let submissionId: string;
  let verificationId: string;
  beforeEach(async () => {
    nannyId = await makeNanny(NANNY, "amara-apply-0022@example.test");
    const consentId = await giveBiometricConsent(NANNY);
    const out = await submit(
      NANNY,
      EVIDENCE_1,
      "identity",
      "identity-document",
      identityColumns(consentId),
    );
    submissionId = out.submission_id;
    verificationId = out.verification_id;
    await asNanny(NANNY, "select public.claim_verification_processing()");
  });

  const apply = (
    status: string,
    over: {
      reason?: string;
      guidance?: string;
      extracted?: unknown;
      expiresAt?: string;
    } = {},
    id = submissionId,
  ) =>
    asService<{ out: { section: string; status: string } }>(
      `select public.apply_vetting_check_result($1::uuid, $2, $3, $4, $5::jsonb, 'none', $6::timestamptz) as out`,
      [
        id,
        status,
        over.reason ?? null,
        over.guidance ?? null,
        over.extracted === undefined ? null : JSON.stringify(over.extracted),
        over.expiresAt ?? null,
      ],
    ).then((rows) => rows[0]!.out);

  it("the nanny cannot execute it, even for her own submission", async () => {
    await expect(
      asNanny(
        NANNY,
        `select public.apply_vetting_check_result($1::uuid, 'needs-admin', null, null, null, 'none', null)`,
        [submissionId],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("needs-admin: the ledger lands needs_admin and the section reads review, provider ref = the submission; level untouched", async () => {
    const out = await apply("needs-admin", { extracted: { consistency: [] } });
    expect(out).toEqual({ section: "identity", status: "review" });
    const row = await verificationRow(nannyId);
    expect(row).toMatchObject({
      identity_status: "review",
      identity_checked_by: "none",
      identity_provider_key: "stub-manual",
      identity_provider_ref: submissionId,
      identity_extracted: { consistency: [] },
      level: "L0_SIGNED_UP",
      level_changed_at: null,
    });
    expect(row.identity_checked_at).not.toBeNull();
    const { rows } = await db.query(
      "select status, checked_at, raw_response from public.vetting_submissions where id = $1",
      [submissionId],
    );
    expect(rows[0]).toMatchObject({ status: "needs_admin" });
    expect(rows[0].checked_at).not.toBeNull();
    expect(rows[0].raw_response).toMatchObject({ status: "needs-admin" });
  });

  it("verified carries the expiry; rejected carries the reason and the guidance key", async () => {
    await apply("verified", { expiresAt: "2030-01-01T00:00:00Z" });
    let row = await verificationRow(nannyId);
    expect(row).toMatchObject({
      identity_status: "verified",
      identity_document_expiry: expect.any(Date),
      level: "L0_SIGNED_UP",
    });
    // a fresh attempt on a second section, rejected
    const dbs = await submit(NANNY, EVIDENCE_2, "dbs", "dbs-certificate", {
      dbs_certificate_ref: `${NANNY}/dbs-certificate/cert.pdf`,
    });
    await apply(
      "rejected",
      { reason: "document-unreadable", guidance: "dbs.unreadable" },
      dbs.submission_id,
    );
    row = await verificationRow(nannyId);
    expect(row).toMatchObject({
      dbs_status: "rejected",
      dbs_rejection_reason: "document-unreadable",
      dbs_user_guidance: { key: "dbs.unreadable" },
      dbs_outcome: "unset",
    });
    const { rows } = await db.query(
      "select status from public.vetting_submissions where id = $1",
      [dbs.submission_id],
    );
    expect(rows[0]).toEqual({ status: "failed" });
    expect(verificationId).toBe(dbs.verification_id);
  });

  it("refuses an unknown submission and an unknown status", async () => {
    await expect(
      apply("needs-admin", {}, "0022e000-0000-4000-8000-0000000000ff"),
    ).rejects.toMatchObject({ code: "P0002" });
    await expect(apply("maybe")).rejects.toMatchObject({ code: "22023" });
  });
});
