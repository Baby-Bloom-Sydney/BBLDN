// The two adapters L-008 `2b` binds (ADR-154), asserted on what they say to the port: the ledger's `upsert` is
// `submit_verification_evidence()` at **session** scope with the section columns mapped from the evidence; the
// ledger reads are keyed reads at **service** scope (02 §4.3 row 2); the verification store reads the
// `verification_status` view for the session's nanny and calls the other three definers — the provider-side
// write at service scope. The functions' behaviour is `int.rpc-0022`'s; this is the wiring. Written after the
// adapters (recorded as such in the L-008 entry), against `db-nanny-stores.test.ts`'s pattern.
import { describe, expect, it } from "vitest";
import type { Evidence, SubmissionId, UserId } from "@/modules/shared-types";
import { dbVerificationStore } from "../db-verification-store";
import { dbVettingStore } from "../db-vetting-store";
import { fakeDataPort } from "./fixtures/fake-data-port";

const USER = "22222222-2222-4222-8222-222222222222" as UserId;
const SUBMISSION = "33333333-3333-4333-8333-333333333333" as SubmissionId;

const evidenceOf = (over: Partial<Evidence>): Evidence => ({
  id: "ev-1" as Evidence["id"],
  nannyId: USER,
  type: "identity-document",
  documents: [
    {
      bucket: "verification-documents",
      path: `${USER}/identity-document/a.jpg`,
      signedUrl: "https://stub.storage.test/a" as never,
      expiresAt: "2026-09-18T01:00:00.000Z" as never,
    },
  ],
  declared: {
    idType: "passport",
    surname: "Okafor",
    givenNames: "Amara",
    dateOfBirth: "1990-04-12",
  },
  consent: { biometric: "consent-1" as never },
  submittedAt: "2026-09-18T00:00:00.000Z" as Evidence["submittedAt"],
  ...over,
});

const LEDGER_ROW = {
  id: SUBMISSION,
  nanny_id: USER,
  evidence_id: "ev-1",
  section: "dbs",
  evidence_type: "dbs-certificate",
  provider_key: "stub-manual",
  provider_ref: null,
  status: "failed",
  raw_response: {
    reject_reason: "document-unreadable",
    guidance_key: "dbs.unreadable",
  },
  submitted_at: "2026-09-18T00:00:00.000Z",
  checked_at: "2026-09-18T00:05:00.000Z",
};

describe("dbVettingStore — the ledger over 0022 (ADR-154)", () => {
  it("upsert → submit_verification_evidence at session scope with the identity columns mapped from the evidence", async () => {
    const fake = fakeDataPort();
    fake.state.rpcAnswer = () => ({
      submission_id: SUBMISSION,
      verification_id: "v-1",
      existing: false,
    });
    const result = await dbVettingStore(fake.port).upsert({
      evidence: evidenceOf({}),
      provider: "stub-manual",
      status: { kind: "needs-admin" },
    });
    expect(result.ok && result.value.submissionId).toBe(SUBMISSION);
    expect(fake.rpcs).toEqual([
      {
        name: "submit_verification_evidence",
        args: {
          p_evidence_id: "ev-1",
          p_section: "identity",
          p_evidence_type: "identity-document",
          p_provider_key: "stub-manual",
          p_status: "needs_admin",
          p_columns: {
            identity_evidence_type: "passport",
            identity_document_ref: `${USER}/identity-document/a.jpg`,
            surname: "Okafor",
            given_names: "Amara",
            date_of_birth: "1990-04-12",
            biometric_consent_id: "consent-1",
          },
        },
      },
    ]);
    expect(fake.calls[0]?.scope).toBe("session");
  });

  it("maps a selfie, a DBS certificate (with the Update Service stamp) and a share code to their own columns", async () => {
    const fake = fakeDataPort();
    fake.state.rpcAnswer = () => ({
      submission_id: SUBMISSION,
      verification_id: "v-1",
      existing: false,
    });
    const store = dbVettingStore(fake.port);
    await store.upsert({
      evidence: evidenceOf({ type: "selfie", declared: {} }),
      provider: "stub-manual",
      status: { kind: "needs-admin" },
    });
    await store.upsert({
      evidence: evidenceOf({
        type: "dbs-certificate",
        declared: {
          certificateNumber: "001234567890",
          issueDate: "2025-06-01",
          updateServiceConsent: "true",
        },
        consent: {},
      }),
      provider: "stub-manual",
      status: { kind: "needs-admin" },
    });
    await store.upsert({
      evidence: evidenceOf({
        type: "right-to-work-share-code",
        documents: [],
        declared: {
          kind: "share_code",
          shareCode: "W1A2B34C5",
          dateOfBirth: "1990-04-12",
        },
        consent: {},
      }),
      provider: "stub-manual",
      status: { kind: "needs-admin" },
    });
    const columns = fake.rpcs.map(
      (call) => call.args as { p_columns: unknown; p_section: string },
    );
    expect(columns[0]).toMatchObject({
      p_section: "identity",
      p_columns: {
        identity_selfie_ref: `${USER}/identity-document/a.jpg`,
        biometric_consent_id: "consent-1",
      },
    });
    expect(columns[1]).toMatchObject({
      p_section: "dbs",
      p_columns: {
        dbs_certificate_number: "001234567890",
        dbs_issue_date: "2025-06-01",
        dbs_update_service_consent_at: "2026-09-18T00:00:00.000Z",
      },
    });
    expect(columns[2]).toMatchObject({
      p_section: "right_to_work",
      p_columns: {
        rtw_evidence_type: "share_code",
        rtw_share_code: "W1A2B34C5",
      },
    });
  });

  it("read / findByEvidence / list are keyed reads at service scope, and a failed ledger row reads as rejected with its reason", async () => {
    const fake = fakeDataPort({ vetting_submissions: [LEDGER_ROW] });
    const store = dbVettingStore(fake.port);
    const one = await store.read(SUBMISSION);
    expect(one.ok && one.value).toMatchObject({
      submissionId: SUBMISSION,
      nannyId: USER,
      section: "dbs",
      evidenceType: "dbs-certificate",
      status: {
        kind: "rejected",
        reason: "document-unreadable",
        guidanceKey: "dbs.unreadable",
      },
      checkedAt: "2026-09-18T00:05:00.000Z",
    });
    const byEvidence = await store.findByEvidence("ev-1" as Evidence["id"]);
    expect(byEvidence.ok && byEvidence.value?.submissionId).toBe(SUBMISSION);
    const listed = await store.list({ nannyId: USER, status: "rejected" });
    expect(listed.ok && listed.value).toHaveLength(1);
    const none = await store.list({ nannyId: USER, status: "verified" });
    expect(none.ok && none.value).toEqual([]);
    expect(fake.calls.every((call) => call.scope === "service")).toBe(true);
    expect(fake.keyedReads.map((read) => read.column)).toEqual([
      "id",
      "evidence_id",
      "nanny_id",
      "nanny_id",
    ]);
  });

  it("recordDecision is 2c's road and refuses by name", async () => {
    const fake = fakeDataPort();
    const result = await dbVettingStore(fake.port).recordDecision({
      submissionId: SUBMISSION,
      decision: "verified",
      actor: { kind: "admin", id: "admin-1" as never },
    });
    expect(!result.ok && result.error.details?.reason).toBe(
      "decision-not-built",
    );
    expect(fake.rpcs).toEqual([]);
  });
});

describe("dbVerificationStore — the view read + 0022's definers (ADR-154)", () => {
  const STATUS_ROW = {
    nanny_id: "n-1",
    level: "L0_SIGNED_UP",
    is_suspended: false,
    identity_status: "review",
    identity_status_at: "2026-09-18T00:05:00.000Z",
    identity_evidence_type: "passport",
    identity_user_guidance: null,
    identity_rejection_reason: null,
    identity_attempts: 1,
    dbs_status: "rejected",
    dbs_status_at: null,
    dbs_user_guidance: { key: "dbs.unreadable" },
    dbs_rejection_reason: "document-unreadable",
    rtw_status: "not_started",
    rtw_status_at: null,
    rtw_evidence_type: null,
    rtw_user_guidance: null,
    rtw_rejection_reason: null,
    contact_status: "verified",
  };

  it("getStatus reads nannies then verification_status at session scope and maps the four sections", async () => {
    const fake = fakeDataPort({
      nannies: [{ id: "n-1", user_id: USER }],
      verification_status: [STATUS_ROW],
    });
    const result = await dbVerificationStore(fake.port).getStatus(USER);
    expect(result.ok && result.value).toMatchObject({
      nannyId: USER,
      level: "L0_SIGNED_UP",
      suspended: false,
      sections: [
        { section: "contact", status: "verified" },
        {
          section: "identity",
          status: "review",
          attempts: 1,
          statusAt: "2026-09-18T00:05:00.000Z",
        },
        {
          section: "dbs",
          status: "rejected",
          rejectionReason: "document-unreadable",
          guidanceKey: "dbs.unreadable",
        },
        { section: "right-to-work", status: "not_started" },
      ],
    });
    expect(fake.calls[0]?.scope).toBe("session");
    expect(
      fake.keyedReads.map((read) => `${read.table}.${read.column}`),
    ).toEqual(["nannies.user_id", "verification_status.nanny_id"]);
  });

  it("getStatus answers null before the first write (I-V1) and when there is no party row", async () => {
    const fake = fakeDataPort({
      nannies: [{ id: "n-1", user_id: USER }],
      verification_status: [],
    });
    const noRow = await dbVerificationStore(fake.port).getStatus(USER);
    expect(noRow.ok && noRow.value).toBeNull();
    const noNanny = await dbVerificationStore(fakeDataPort().port).getStatus(
      USER,
    );
    expect(noNanny.ok && noNanny.value).toBeNull();
  });

  it("saveContact and claimProcessing are session-scope definers; the claim maps right_to_work back", async () => {
    const fake = fakeDataPort();
    fake.state.rpcAnswer = (name) =>
      name === "claim_verification_processing"
        ? ["identity", "right_to_work"]
        : true;
    const store = dbVerificationStore(fake.port);
    expect((await store.saveContact()).ok).toBe(true);
    const claimed = await store.claimProcessing();
    expect(claimed.ok && claimed.value).toEqual(["identity", "right-to-work"]);
    expect(fake.rpcs.map((call) => call.name)).toEqual([
      "save_verification_contact",
      "claim_verification_processing",
    ]);
    expect(fake.calls.every((call) => call.scope === "session")).toBe(true);
  });

  it("applyCheckResult → apply_vetting_check_result at SERVICE scope with the status kind and the rejection fields", async () => {
    const fake = fakeDataPort();
    fake.state.rpcAnswer = () => ({ section: "dbs", status: "rejected" });
    const result = await dbVerificationStore(fake.port).applyCheckResult({
      submissionId: SUBMISSION,
      status: {
        kind: "rejected",
        reason: "document-unreadable",
        guidanceKey: "dbs.unreadable" as never,
      },
      checkedBy: "none",
    });
    expect(result.ok && result.value).toEqual({
      section: "dbs",
      status: "rejected",
    });
    expect(fake.rpcs).toEqual([
      {
        name: "apply_vetting_check_result",
        args: {
          p_submission_id: SUBMISSION,
          p_status: "rejected",
          p_reject_reason: "document-unreadable",
          p_guidance_key: "dbs.unreadable",
          p_extracted: undefined,
          p_checked_by: "none",
          p_expires_at: undefined,
        },
      },
    ]);
    expect(fake.calls[0]?.scope).toBe("service");
  });
});
