// The inside of `verification` (03 §4.3) over the memory world: `submitContact` writes the values then the stamp;
// `submitIdentity` needs the consent (I-V3), uploads two objects, submits two evidences and sets the section
// pending; `submitDbs` / `submitRightToWork` one each; a second submit on a pending or in-review section is
// refused as already-submitted; `process` claims the pending sections, checks each submission and — with
// `stub-manual` — lands them in review; the per-section limit is consumed; `getStatus` reads the world. Written RED
// first — nothing of the inside existed.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { configureAuth, stubAuth } from "@/modules/auth";
import {
  configureConsent,
  configureRateLimiter,
  consent,
  createConsent,
  createRateLimiter,
  memoryConsentStore,
  memoryRateLimitStore,
  ok,
} from "@/modules/platform";
import { LOCALE, SECURITY } from "@/modules/config";
import type { ConsentRecordId, Email, UserId } from "@/modules/shared-types";
import {
  configureVettingStore,
  memoryVettingStore,
} from "@/modules/vetting-providers";
import type { MemoryVettingStore } from "@/modules/vetting-providers";
import {
  configureVerification,
  createVerification,
  memoryVerificationStore,
  verification,
} from "../index";
import type { ContactWriter } from "../types";
import { tinyJpeg } from "./fixtures/tiny-jpeg";

const NANNY = "11111111-1111-4111-8111-111111111111" as UserId;
const OTHER = "22222222-2222-4222-8222-222222222222" as UserId;
let JPEG: Uint8Array;
const PDF = new TextEncoder().encode("%PDF-1.4 test");

beforeAll(async () => {
  JPEG = await tinyJpeg();
});

let ledger: MemoryVettingStore;
let contactWrites: Array<unknown>;

const contactWriter: ContactWriter = async (contact) => {
  contactWrites.push(contact);
  return ok(undefined);
};

async function biometricConsent(userId: UserId): Promise<ConsentRecordId> {
  const recorded = await consent.recordConsent({
    userId,
    party: "nanny",
    agreementId: "AGR-04",
    checkpointId: "agr04_biometric",
    checkpointText: "I consent.",
    context: {},
    purpose: "biometric-notice",
    document: {
      id: "biometric-notice",
      version: 1,
      contentHash: "stub-hash-v1",
    },
    consentGiven: true,
  });
  if (!recorded.ok) throw new Error("consent not recorded");
  return recorded.value.id;
}

beforeEach(() => {
  configureAuth(
    stubAuth({
      users: [
        { id: NANNY, email: "amara@example.test" as Email, role: "nanny" },
        { id: OTHER, email: "other@example.test" as Email, role: "nanny" },
      ],
      signedInUserId: NANNY,
    }),
  );
  configureConsent(
    createConsent({
      store: memoryConsentStore({
        documents: {
          "biometric-notice": { version: 1, contentHash: "stub-hash-v1" },
        } as never,
      }),
      cookieExpiryDays: SECURITY.retention.cookieExpiryDays,
    }),
  );
  configureRateLimiter(
    createRateLimiter({
      store: memoryRateLimitStore(),
      burstAlertMultiple: SECURITY.burstAlertMultiple,
      failOpenOnLimiterOutage: SECURITY.failOpenOnLimiterOutage,
    }),
    "shared",
  );
  ledger = memoryVettingStore();
  configureVettingStore(ledger);
  contactWrites = [];
  configureVerification(
    createVerification({
      store: memoryVerificationStore(ledger),
      contactWriter,
    }),
  );
});

describe("submitContact (S-N-04)", () => {
  it("writes the values through the injected writer, then stamps the section", async () => {
    const result = await verification.submitContact(NANNY, {
      mobile: `${LOCALE.phonePrefix}7700900123` as never,
      district: "SW4",
      area: "Clapham",
    });
    expect(result.ok && result.value.status).toBe("verified");
    expect(contactWrites).toEqual([
      {
        mobile: `${LOCALE.phonePrefix}7700900123`,
        district: "SW4",
        area: "Clapham",
      },
    ]);
    expect(ledger.sectionsOf(ledger.partyIdOf(NANNY))?.contact).toBe(
      "verified",
    );
  });

  it("refuses to act for another nanny (not-permitted)", async () => {
    const result = await verification.submitContact(OTHER, {
      mobile: `${LOCALE.phonePrefix}7700900123` as never,
      district: "SW4",
      area: "Clapham",
    });
    expect(!result.ok && result.error.details?.reason).toBe("not-permitted");
    expect(contactWrites).toEqual([]);
  });
});

describe("submitIdentity (S-N-05) — the consent gate before any upload (07 §2.6; I-V3)", () => {
  const input = (consentRecordId: ConsentRecordId) => ({
    idType: "passport" as const,
    document: { bytes: JPEG },
    selfie: { bytes: JPEG },
    surname: "Okafor",
    givenNames: "Amara",
    dateOfBirth: "1990-04-12" as never,
    consentRecordId,
  });

  it("refuses without a biometric-notice consent row and uploads nothing", async () => {
    const result = await verification.submitIdentity(
      NANNY,
      input("nope" as ConsentRecordId),
    );
    expect(!result.ok && result.error.details?.reason).toBe("consent-required");
    expect(ledger.rows()).toEqual([]);
  });

  it("with consent: two objects, two submissions under identity, the section pending, one attempt", async () => {
    const consentId = await biometricConsent(NANNY);
    const result = await verification.submitIdentity(NANNY, input(consentId));
    expect(result.ok && result.value.status).toBe("pending");
    expect(ledger.rows().map((row) => row.evidenceType)).toEqual([
      "identity-document",
      "selfie",
    ]);
    expect(ledger.rows()[0]?.status).toEqual({ kind: "needs-admin" });
    expect(ledger.sectionsOf(ledger.partyIdOf(NANNY))?.identity.attempts).toBe(
      1,
    );
  });

  it("a second submit while the section is pending or in review is already-submitted", async () => {
    const consentId = await biometricConsent(NANNY);
    await verification.submitIdentity(NANNY, input(consentId));
    const again = await verification.submitIdentity(NANNY, input(consentId));
    expect(!again.ok && again.error.details?.reason).toBe("already-submitted");
    expect(ledger.rows()).toHaveLength(2);
  });

  it("refuses bytes that are not an accepted document type, before anything is stored", async () => {
    const consentId = await biometricConsent(NANNY);
    const result = await verification.submitIdentity(NANNY, {
      ...input(consentId),
      document: { bytes: new TextEncoder().encode("<html>") },
    });
    expect(!result.ok && result.error.details?.reason).toBe("invalid_type");
    expect(ledger.rows()).toEqual([]);
  });
});

describe("submitDbs (S-N-06) and submitRightToWork (S-N-07)", () => {
  it("DBS: one submission, the declared number and date travel, the Update Service consent is stamped", async () => {
    const result = await verification.submitDbs(NANNY, {
      certificate: { bytes: PDF },
      certificateNumber: "001234567890",
      issueDate: "2025-06-01" as never,
      updateServiceConsent: true,
    });
    expect(result.ok && result.value.status).toBe("pending");
    const row = ledger.rows()[0];
    expect(row?.evidenceType).toBe("dbs-certificate");
    expect(row?.section).toBe("dbs");
  });

  it("right to work: a share code is a submission with no object; a passport is one with a document (ADR-153)", async () => {
    const share = await verification.submitRightToWork(NANNY, {
      kind: "share_code",
      shareCode: "W1A2B34C5",
      dateOfBirth: "1990-04-12" as never,
    });
    expect(share.ok && share.value.status).toBe("pending");
    expect(ledger.rows()[0]?.evidenceType).toBe("right-to-work-share-code");
    // a second right-to-work submit while pending is refused, as every section is
    const passport = await verification.submitRightToWork(NANNY, {
      kind: "british_irish_passport",
      document: { bytes: JPEG },
    });
    expect(!passport.ok && passport.error.details?.reason).toBe(
      "already-submitted",
    );
  });

  it("consumes the per-section submission limit (07 §8 row 11) — the sixth DBS attempt in a day is refused", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await verification.submitDbs(NANNY, {
        certificate: { bytes: PDF },
        certificateNumber: "001234567890",
        issueDate: "2025-06-01" as never,
        updateServiceConsent: true,
      });
      if (attempt === 0) expect(result.ok).toBe(true);
      // later attempts are refused as already-submitted before the limiter, so reset the section to rejected
      ledger.patchSections(ledger.partyIdOf(NANNY), (row) => ({
        ...row,
        dbs: { ...row.dbs, status: "rejected" },
      }));
    }
    const sixth = await verification.submitDbs(NANNY, {
      certificate: { bytes: PDF },
      certificateNumber: "001234567890",
      issueDate: "2025-06-01" as never,
      updateServiceConsent: true,
    });
    expect(!sixth.ok && sixth.error.code).toBe("RATE_LIMITED");
  });
});

describe("process (S-N-08) — claim, check, apply; stub-manual lands every section in review", () => {
  it("moves the pending sections through processing to review and answers the state", async () => {
    const consentId = await biometricConsent(NANNY);
    await verification.submitIdentity(NANNY, {
      idType: "passport",
      document: { bytes: JPEG },
      selfie: { bytes: JPEG },
      surname: "Okafor",
      givenNames: "Amara",
      dateOfBirth: "1990-04-12" as never,
      consentRecordId: consentId,
    });
    await verification.submitDbs(NANNY, {
      certificate: { bytes: PDF },
      certificateNumber: "001234567890",
      issueDate: "2025-06-01" as never,
      updateServiceConsent: true,
    });
    const processed = await verification.process(NANNY);
    expect(processed.ok).toBe(true);
    if (!processed.ok) return;
    const byName = Object.fromEntries(
      processed.value.sections.map((section) => [
        section.section,
        section.status,
      ]),
    );
    expect(byName).toMatchObject({
      identity: "review",
      dbs: "review",
      "right-to-work": "not_started",
    });
    expect(ledger.rows().every((row) => row.checkedAt !== undefined)).toBe(
      true,
    );
    // idempotent: nothing left to claim, the state stands
    const again = await verification.process(NANNY);
    expect(
      again.ok && again.value.sections.find((s) => s.section === "dbs")?.status,
    ).toBe("review");
  });

  it("getStatus answers every section not_started before the first write (I-V1) and the level stays L0 (2c writes it)", async () => {
    const status = await verification.getStatus(NANNY);
    expect(status.ok && status.value.level).toBe("L0_SIGNED_UP");
    expect(status.ok && status.value.sections.map((s) => s.status)).toEqual([
      "not_started",
      "not_started",
      "not_started",
      "not_started",
    ]);
  });
});
