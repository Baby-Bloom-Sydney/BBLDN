// The ledger behind `stub-manual` (03 §4.4; ADR-154), exercised through the memory double the boot adapter
// mirrors: a submit lands `needs-admin` and is idempotent on the evidence id; `check` answers the stored
// status; the section's state follows the ledger (pending on submit, review once the stub's result is applied);
// `list` answers the queue's question (2c); `record` writes an admin decision. Written RED first — the memory
// double and the two reads did not exist.
import { beforeEach, describe, expect, it } from "vitest";
import type {
  Evidence,
  EvidenceType,
  SubmissionId,
  UserId,
} from "@/modules/shared-types";
import {
  configureVettingStore,
  getProvider,
  listSubmissions,
  memoryVettingStore,
  readSubmission,
  stubManualProvider,
} from "../index";
import type { MemoryVettingStore } from "../types";

const NANNY = "11111111-1111-4111-8111-111111111111" as UserId;
const OTHER = "22222222-2222-4222-8222-222222222222" as UserId;

const evidenceOf = (
  type: EvidenceType,
  over: Partial<Evidence> = {},
): Evidence => ({
  id: `${type}-1` as Evidence["id"],
  nannyId: NANNY,
  type,
  documents: [
    {
      bucket: "verification-documents",
      path: `${NANNY}/identity-document/a.jpg`,
      signedUrl: "https://stub.storage.test/x" as never,
      expiresAt: "2026-09-18T01:00:00.000Z" as never,
    },
  ],
  declared: { surname: "Okafor" },
  consent: { biometric: "consent-1" as never },
  submittedAt: "2026-09-18T00:00:00.000Z" as Evidence["submittedAt"],
  ...over,
});

let ledger: MemoryVettingStore;

beforeEach(() => {
  ledger = memoryVettingStore();
  configureVettingStore(ledger);
});

describe("stub-manual over the memory ledger (03 §4.4)", () => {
  it("submit lands needs-admin, mints one submission per evidence id, and sets the section pending", async () => {
    const submitted = await stubManualProvider.submit(
      evidenceOf("identity-document"),
    );
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    expect(submitted.value.status).toEqual({ kind: "needs-admin" });
    expect(submitted.value.provider).toBe("stub-manual");
    expect(ledger.sectionsOf(NANNY)?.identity.status).toBe("pending");
    expect(ledger.sectionsOf(NANNY)?.identity.attempts).toBe(1);
    expect(ledger.sectionsOf(NANNY)?.dbs.status).toBe("not_started");
  });

  it("is idempotent on the evidence id — a second submit answers the same submission and adds no row", async () => {
    const first = await stubManualProvider.submit(
      evidenceOf("dbs-certificate"),
    );
    const second = await stubManualProvider.submit(
      evidenceOf("dbs-certificate", { declared: { certificateNumber: "x" } }),
    );
    expect(second.ok && first.ok && second.value.submissionId).toBe(
      first.ok ? first.value.submissionId : "",
    );
    expect(ledger.rows()).toHaveLength(1);
  });

  it("a selfie is its own submission under the identity section, and does not count as an attempt", async () => {
    await stubManualProvider.submit(evidenceOf("identity-document"));
    await stubManualProvider.submit(evidenceOf("selfie"));
    expect(ledger.rows().map((row) => row.section)).toEqual([
      "identity",
      "identity",
    ]);
    expect(ledger.sectionsOf(NANNY)?.identity.attempts).toBe(1);
  });

  it("check answers the stored status; an unknown id is unsupported-evidence", async () => {
    const submitted = await stubManualProvider.submit(
      evidenceOf("right-to-work-share-code"),
    );
    if (!submitted.ok) throw new Error("submit failed");
    const checked = await stubManualProvider.check(
      submitted.value.submissionId,
    );
    expect(checked.ok && checked.value.status).toEqual({ kind: "needs-admin" });
    const unknown = await stubManualProvider.check("nope" as SubmissionId);
    expect(!unknown.ok && unknown.error.details?.reason).toBe(
      "unsupported-evidence",
    );
  });

  it("extract answers an empty consistency list and expiry a never-expiring policy (03 §4.4)", async () => {
    const extracted = await stubManualProvider.extract(evidenceOf("selfie"));
    expect(extracted.ok && extracted.value).toEqual({ consistency: [] });
    const expiry = await stubManualProvider.expiry("any" as SubmissionId);
    expect(expiry.ok && expiry.value).toEqual({
      expiresAt: null,
      renewable: false,
      source: "policy",
    });
  });

  it("record writes the admin decision: the ledger passes and the section reads verified", async () => {
    const submitted = await stubManualProvider.submit(
      evidenceOf("dbs-certificate"),
    );
    if (!submitted.ok) throw new Error("submit failed");
    const recorded = await stubManualProvider.record({
      submissionId: submitted.value.submissionId,
      decision: "verified",
      actor: { kind: "admin", id: "admin-1" as never },
      expiresAt: "2030-01-01T00:00:00.000Z" as never,
    });
    expect(recorded.ok && recorded.value.status.kind).toBe("verified");
    expect(ledger.sectionsOf(NANNY)?.dbs.status).toBe("verified");
    const rejected = await stubManualProvider.record({
      submissionId: submitted.value.submissionId,
      decision: "rejected",
      reason: "document-unreadable",
      actor: { kind: "admin", id: "admin-1" as never },
    });
    expect(rejected.ok && rejected.value.status).toMatchObject({
      kind: "rejected",
      reason: "document-unreadable",
    });
    expect(ledger.sectionsOf(NANNY)?.dbs.status).toBe("rejected");
  });
});

describe("the two ledger reads the wizard and the queue share", () => {
  it("listSubmissions filters by nanny, section and status kind; readSubmission answers one", async () => {
    await stubManualProvider.submit(evidenceOf("identity-document"));
    await stubManualProvider.submit(
      evidenceOf("dbs-certificate", {
        id: "dbs-other" as never,
        nannyId: OTHER,
      }),
    );
    const mine = await listSubmissions({ nannyId: NANNY });
    expect(mine.ok && mine.value.map((row) => row.section)).toEqual([
      "identity",
    ]);
    const needsAdmin = await listSubmissions({ status: "needs-admin" });
    expect(needsAdmin.ok && needsAdmin.value).toHaveLength(2);
    const dbs = await listSubmissions({ nannyId: OTHER, section: "dbs" });
    expect(dbs.ok && dbs.value[0]?.evidenceType).toBe("dbs-certificate");
    const one = await readSubmission(
      dbs.ok ? dbs.value[0]!.submissionId : ("" as SubmissionId),
    );
    expect(one.ok && one.value?.nannyId).toBe(OTHER);
  });

  it("getProvider still binds every accepted type to stub-manual (05 §3 rule 1)", () => {
    const provider = getProvider("selfie");
    expect(provider.ok && provider.value.id).toBe("stub-manual");
  });
});
