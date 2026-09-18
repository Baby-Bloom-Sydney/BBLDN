// The queue's road (ADR-159) and the level's writer (ADR-157) over the memory world: an admin with a second
// factor lists what needs a person, opens the evidence (signed URLs + one `vetting.evidence-viewed` per open),
// decides — the subject is the SUBMISSION's nanny, the actor the session's admin — and the level follows in the
// same call; a DBS `verified` is the outcome and the cross-check (the admin is the check under `stub-manual`);
// `no_change` on the Update Service is L4 and releases the hold (ADR-158); `adverse` bars and suspends (I-V5);
// the outcome comms fire (03 §8.2 rows 28–32) and the reminder funnel is cancelled at L3 (ADR-161); a nanny or
// an admin without MFA is refused; `adminRoutes` is consumed (07 §8 row 14). Written RED first — none of the
// connector's queue methods existed.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { configureAuth, stubAuth } from "@/modules/auth";
import { configureComms } from "@/modules/comms";
import { LOCALE, SECURITY, VETTING } from "@/modules/config";
import {
  configureConsent,
  configureEvents,
  configureRateLimiter,
  consent,
  createConsent,
  createEvents,
  createRateLimiter,
  log,
  memoryConsentStore,
  memoryEventLogStore,
  memoryRateLimitStore,
  ok,
} from "@/modules/platform";
import type { RateLimitStore } from "@/modules/platform";
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
import type { QueueEntry } from "../types";
import { commsDouble } from "./fixtures/comms-double";
import type { CommsDouble } from "./fixtures/comms-double";
import { tinyJpeg } from "./fixtures/tiny-jpeg";

const NANNY = "11111111-1111-4111-8111-111111111111" as UserId;
const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as UserId;
const ADMIN_NO_MFA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as UserId;
let JPEG: Uint8Array;
const PDF = new TextEncoder().encode("%PDF-1.4 test");

beforeAll(async () => {
  JPEG = await tinyJpeg();
});

let ledger: MemoryVettingStore;
let events: ReturnType<typeof memoryEventLogStore>;
let comms: CommsDouble;
let limited: string[];

const signIn = (userId: UserId) =>
  configureAuth(
    stubAuth({
      users: [
        { id: NANNY, email: "amara@example.test" as Email, role: "nanny" },
        {
          id: ADMIN,
          email: "reviewer@example.test" as Email,
          role: "admin",
          mfaVerified: true,
        },
        {
          id: ADMIN_NO_MFA,
          email: "reviewer-no-mfa@example.test" as Email,
          role: "admin",
          mfaVerified: false,
        },
      ],
      signedInUserId: userId,
      // ADR-136: the queue decorates names through the same stub world
      tables: {
        user_profiles: [
          {
            user_id: NANNY,
            first_name: "Amara",
            last_name: "Okafor",
            email: "amara@example.test",
          },
        ],
      },
    }),
  );

async function biometricConsent(): Promise<ConsentRecordId> {
  const recorded = await consent.recordConsent({
    userId: NANNY,
    party: "nanny",
    agreementId: "AGR-04",
    checkpointId: "agr04_biometric",
    checkpointText: "I consent.",
    context: {},
    purpose: "biometric-notice",
    document: { id: "biometric-notice", version: 1 },
    consentGiven: true,
  });
  if (!recorded.ok) throw new Error("consent not recorded");
  return recorded.value.id;
}

/** As the nanny: contact, identity, DBS, right-to-work submitted and processed → every section in review. */
async function submitEverything(): Promise<void> {
  signIn(NANNY);
  const consentRecordId = await biometricConsent();
  await verification.submitContact(NANNY, {
    mobile: `${LOCALE.phonePrefix}7700900123` as never,
    district: "SW4",
    area: "Clapham",
  });
  const identity = await verification.submitIdentity(NANNY, {
    idType: "passport",
    document: { bytes: JPEG },
    selfie: { bytes: JPEG },
    surname: "Okafor",
    givenNames: "Amara",
    dateOfBirth: "1990-04-12" as never,
    consentRecordId,
  });
  if (!identity.ok) throw new Error(identity.error.message);
  const dbs = await verification.submitDbs(NANNY, {
    certificate: { bytes: PDF },
    certificateNumber: "123456789012",
    issueDate: "2026-01-10" as never,
    updateServiceConsent: true,
  });
  if (!dbs.ok) throw new Error(dbs.error.message);
  const rtw = await verification.submitRightToWork(NANNY, {
    kind: "share_code",
    shareCode: "ABC123XYZ",
    dateOfBirth: "1990-04-12" as never,
  });
  if (!rtw.ok) throw new Error(rtw.error.message);
  const processed = await verification.process(NANNY);
  if (!processed.ok) throw new Error(processed.error.message);
  signIn(ADMIN);
}

const queue = async (tab: "identity" | "dbs" | "right-to-work") => {
  const listed = await verification.listQueue({ tab, filter: "needs-admin" });
  if (!listed.ok) throw new Error(listed.error.message);
  return listed.value;
};
const entryOf = (entries: ReadonlyArray<QueueEntry>, type: string) => {
  const found = entries.find((e) => e.evidenceType === type);
  if (found === undefined) throw new Error(`no ${type} in the queue`);
  return found;
};
const levelOf = async () => {
  const state = await verification.getStatus(NANNY);
  if (!state.ok) throw new Error(state.error.message);
  return state.value;
};
const eventNames = () => events.rows.map((row) => row.name);

beforeEach(() => {
  configureConsent(
    createConsent({
      store: memoryConsentStore({
        documents: { "biometric-notice": { version: 1 } } as never,
      }),
      cookieExpiryDays: SECURITY.retention.cookieExpiryDays,
    }),
  );
  limited = [];
  const recording: RateLimitStore = {
    increment: async (bucket, windowSeconds, now) => {
      limited.push(bucket);
      return memoryRateLimitStore().increment(bucket, windowSeconds, now);
    },
  };
  configureRateLimiter(
    createRateLimiter({
      store: recording,
      burstAlertMultiple: SECURITY.burstAlertMultiple,
      failOpenOnLimiterOutage: SECURITY.failOpenOnLimiterOutage,
    }),
    "shared",
  );
  events = memoryEventLogStore();
  configureEvents(createEvents({ store: events, log }));
  comms = commsDouble();
  configureComms(comms);
  ledger = memoryVettingStore();
  configureVettingStore(ledger);
  configureVerification(
    createVerification({
      store: memoryVerificationStore(ledger),
      contactWriter: async () => ok(undefined),
    }),
  );
});

describe("listQueue (S-A-16; 03 §4.3)", () => {
  it("lists what needs a person per tab — two identity rows per attempt (document + selfie), one DBS, one right-to-work", async () => {
    await submitEverything();
    const identity = await queue("identity");
    expect(identity.map((e) => e.evidenceType).sort()).toEqual([
      "identity-document",
      "selfie",
    ]);
    // ★ ADR-169 — the queue carries the PARTY row, never the session id.
    expect(identity[0]?.nannyId).toBe(ledger.partyIdOf(NANNY));
    expect(identity[0]?.status).toBe("needs-admin");
    expect(await queue("dbs")).toHaveLength(1);
    expect(await queue("right-to-work")).toHaveLength(1);
    expect(
      await verification.listQueue({ tab: "dbs", filter: "stale-pending" }),
    ).toMatchObject({ ok: true, value: [] });
  });

  it("is an admin's read: a nanny is refused and sees nothing", async () => {
    await submitEverything();
    signIn(NANNY);
    const listed = await verification.listQueue({
      tab: "dbs",
      filter: "needs-admin",
    });
    expect(!listed.ok && listed.error.details?.reason).toBe("not-permitted");
  });
});

describe("openEvidence (07 §4.32) and readQueueRecord", () => {
  it("answers signed URLs for the identity objects and emits one vetting.evidence-viewed naming the admin", async () => {
    await submitEverything();
    const entry = entryOf(await queue("identity"), "identity-document");
    const opened = await verification.openEvidence(entry.submissionId);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.value.documents.map((d) => d.section).sort()).toEqual([
      "identity-document",
      "identity-selfie",
    ]);
    for (const doc of opened.value.documents)
      expect(doc.url).toMatch(/^https:\/\/stub\.storage\.test\//);
    expect(opened.value.declared).toMatchObject({
      surname: "Okafor",
      givenNames: "Amara",
    });
    const viewed = events.rows.filter(
      (row) => row.name === "vetting.evidence-viewed",
    );
    expect(viewed).toHaveLength(1);
    expect(viewed[0]?.props).toMatchObject({
      submissionId: entry.submissionId,
      evidenceType: "identity-document",
      viewerAdminId: ADMIN,
    });
  });

  it("the record carries the nanny's section states, the declared fields and no URL", async () => {
    await submitEverything();
    const entry = entryOf(await queue("dbs"), "dbs-certificate");
    const record = await verification.readQueueRecord(entry.submissionId);
    expect(record.ok).toBe(true);
    if (!record.ok) return;
    expect(record.value.state.level).toBe("L1_REGISTERED");
    expect(record.value.record.declared.certificateNumber).toBe("123456789012");
    expect(JSON.stringify(record.value)).not.toMatch(/https?:\/\//);
    expect(eventNames()).not.toContain("vetting.evidence-viewed");
  });
});

describe("decide — the admin is the check (ADR-157 (2); ADR-159)", () => {
  it("identity verified → L2 with one verification.level-changed; the decision event carries actor admin + onBehalfOf the SUBMISSION's nanny", async () => {
    await submitEverything();
    const entry = entryOf(await queue("identity"), "identity-document");
    const decided = await verification.decide({
      submissionId: entry.submissionId,
      decision: "verified",
    });
    expect(decided.ok).toBe(true);
    if (!decided.ok) return;
    expect(decided.value).toMatchObject({
      nannyId: ledger.partyIdOf(NANNY),
      section: "identity",
      status: "verified",
      sync: { fromLevel: "L1_REGISTERED", toLevel: "L2_ID_VERIFIED" },
    });
    expect((await levelOf()).level).toBe("L2_ID_VERIFIED");
    // one per change: L0 → L1 when the processing step synced the submission, L1 → L2 on this decision
    const changed = events.rows.filter(
      (row) => row.name === "verification.level-changed",
    );
    expect(
      changed.map((row) => (row.props as { toLevel: string }).toLevel),
    ).toEqual(["L1_REGISTERED", "L2_ID_VERIFIED"]);
    expect(changed[1]?.props).toMatchObject({
      nannyId: NANNY,
      fromLevel: "L1_REGISTERED",
      toLevel: "L2_ID_VERIFIED",
    });
    const recorded = events.rows.find(
      (row) => row.name === "vetting.decision-recorded",
    );
    expect(recorded?.actor).toMatchObject({
      kind: "admin",
      id: ADMIN,
      onBehalfOf: { role: "nanny", id: NANNY },
    });
    expect(limited).toContainEqual(expect.stringContaining("admin-routes"));
  });

  it("DBS verified → cleared + cross-check passed → L3: verification-approved sent, verification.held emitted, the reminders cancelled", async () => {
    await submitEverything();
    await verification.decide({
      submissionId: entryOf(await queue("identity"), "identity-document")
        .submissionId,
      decision: "verified",
    });
    const decided = await verification.decide({
      submissionId: entryOf(await queue("dbs"), "dbs-certificate").submissionId,
      decision: "verified",
    });
    expect(decided.ok && decided.value.sync.toLevel).toBe(
      "L3_PROVISIONALLY_VERIFIED",
    );
    expect(ledger.sectionsOf(ledger.partyIdOf(NANNY))?.dbsOutcome).toBe(
      "cleared",
    );
    expect(ledger.sectionsOf(ledger.partyIdOf(NANNY))?.crossCheckPassed).toBe(
      true,
    );
    expect(eventNames()).toContain("verification.held");
    const approved = comms.sent.filter(
      (m) => m.templateId === "verification-approved",
    );
    expect(approved).toHaveLength(1);
    expect(approved[0]?.to).toEqual({ userId: NANNY });
    expect(approved[0]?.dedupeKey).toBe(
      `verification-approved:${NANNY}:L3_PROVISIONALLY_VERIFIED`,
    );
    for (const i of VETTING.reminderOffsetsMinutes.keys())
      expect(comms.cancelled).toContain(`verification-reminder:${NANNY}:${i}`);
  });

  it("a rejection needs a reason; it schedules verification-action-needed +10 min keyed per section, and the level follows", async () => {
    await submitEverything();
    await verification.decide({
      submissionId: entryOf(await queue("identity"), "identity-document")
        .submissionId,
      decision: "verified",
    });
    const dbs = entryOf(await queue("dbs"), "dbs-certificate");
    const noReason = await verification.decide({
      submissionId: dbs.submissionId,
      decision: "rejected",
    });
    expect(!noReason.ok && noReason.error.details?.reason).toBe(
      "reason-required",
    );
    const rejected = await verification.decide({
      submissionId: dbs.submissionId,
      decision: "rejected",
      reason: "document-unreadable",
      note: "the scan cut off the top",
    });
    expect(rejected.ok && rejected.value.status).toBe("rejected");
    expect((await levelOf()).level).toBe("L2_ID_VERIFIED");
    const needed = comms.scheduled.filter(
      (m) => m.templateId === "verification-action-needed",
    );
    expect(needed).toHaveLength(1);
    expect(needed[0]?.dedupeKey).toBe(
      `verification-action-needed:${NANNY}:dbs`,
    );
    expect(needed[0]?.sendAt).toBeDefined();
    expect(needed[0]?.data).toEqual({
      section: "dbs",
      guidanceKey: "document-unreadable",
    });
    expect(comms.sent.map((m) => m.templateId)).not.toContain(
      "verification-approved",
    );
  });

  it("DBS rejected `adverse` bars: L0 + suspended, verification-barred to her, admin-nanny-barred + a nanny_barred row for the admin", async () => {
    await submitEverything();
    await verification.decide({
      submissionId: entryOf(await queue("identity"), "identity-document")
        .submissionId,
      decision: "verified",
    });
    const barred = await verification.decide({
      submissionId: entryOf(await queue("dbs"), "dbs-certificate").submissionId,
      decision: "rejected",
      reason: "adverse",
    });
    expect(barred.ok && barred.value.sync).toMatchObject({
      toLevel: "L0_SIGNED_UP",
      suspended: true,
    });
    const state = await levelOf();
    expect(state.suspended).toBe(true);
    expect(comms.sent.map((m) => m.templateId)).toEqual(
      expect.arrayContaining(["verification-barred", "admin-nanny-barred"]),
    );
    expect(comms.adminNotices).toContainEqual(
      expect.objectContaining({
        kind: "nanny_barred",
        subject: { type: "nanny", id: NANNY },
      }),
    );
    // no reason enumeration reaches her: the barred template carries the nanny, nothing about why
    const toHer = comms.sent.find(
      (m) => m.templateId === "verification-barred",
    );
    expect(JSON.stringify(toHer?.data ?? {})).not.toMatch(/adverse|barred/);
  });

  it("refuses a nanny (not-permitted), an admin without a second factor (not-permitted), and an unknown submission", async () => {
    await submitEverything();
    const entry = entryOf(await queue("dbs"), "dbs-certificate");
    signIn(NANNY);
    const asNanny = await verification.decide({
      submissionId: entry.submissionId,
      decision: "verified",
    });
    expect(!asNanny.ok && asNanny.error.details?.reason).toBe("not-permitted");
    signIn(ADMIN_NO_MFA);
    const noMfa = await verification.decide({
      submissionId: entry.submissionId,
      decision: "verified",
    });
    expect(!noMfa.ok && noMfa.error.details?.reason).toBe("not-permitted");
    signIn(ADMIN);
    const unknown = await verification.decide({
      submissionId: "00000000-0000-4000-8000-000000000000" as never,
      decision: "verified",
    });
    expect(!unknown.ok && unknown.error.details?.reason).toBe(
      "unsupported-evidence",
    );
    expect((await levelOf()).level).toBe("L1_REGISTERED");
    expect(eventNames()).not.toContain("vetting.decision-recorded");
  });
});

describe("recordUpdateServiceCheck — the level-4 action (04 §4.1 row 15; ADR-157 (3); ADR-158)", () => {
  let dbsSubmission: QueueEntry["submissionId"];
  async function toL3(): Promise<void> {
    await submitEverything();
    await verification.decide({
      submissionId: entryOf(await queue("identity"), "identity-document")
        .submissionId,
      decision: "verified",
    });
    dbsSubmission = entryOf(await queue("dbs"), "dbs-certificate").submissionId;
    await verification.decide({
      submissionId: dbsSubmission,
      decision: "verified",
    });
  }

  it("no_change → L4, the held connections released (verification.released), Fully verified approved once", async () => {
    await toL3();
    ledger.patchSections(ledger.partyIdOf(NANNY), (row) => ({
      ...row,
      heldConnections: 2,
    }));
    const out = await verification.recordUpdateServiceCheck({
      submissionId: dbsSubmission,
      result: "no_change",
      subscribed: true,
    });
    expect(out.ok && out.value).toMatchObject({
      toLevel: "L4_FULLY_VERIFIED",
      released: 2,
    });
    expect(ledger.sectionsOf(ledger.partyIdOf(NANNY))?.heldConnections).toBe(0);
    expect(
      ledger.sectionsOf(ledger.partyIdOf(NANNY))?.updateService?.checkedBy,
    ).toBe(ADMIN);
    expect(eventNames()).toContain("verification.released");
    expect(
      comms.sent.filter((m) => m.templateId === "verification-approved"),
    ).toHaveLength(2);
  });

  it("new_information returns the DBS section to review and the level to L2; a nanny cannot record it", async () => {
    await toL3();
    const out = await verification.recordUpdateServiceCheck({
      submissionId: dbsSubmission,
      result: "new_information",
      subscribed: true,
    });
    expect(out.ok && out.value.toLevel).toBe("L2_ID_VERIFIED");
    expect(ledger.sectionsOf(ledger.partyIdOf(NANNY))?.dbs.status).toBe(
      "review",
    );
    signIn(NANNY);
    const refused = await verification.recordUpdateServiceCheck({
      submissionId: dbsSubmission,
      result: "no_change",
      subscribed: true,
    });
    expect(!refused.ok && refused.error.details?.reason).toBe("not-permitted");
  });
});

describe("adminOverview (05 AC-A-17's counters)", () => {
  it("counts pending, today's decisions and the fully verified", async () => {
    await submitEverything();
    const before = await verification.adminOverview();
    expect(before.ok && before.value).toEqual({
      pending: 4,
      verifiedToday: 0,
      rejectedToday: 0,
      fullyVerified: 0,
    });
    await verification.decide({
      submissionId: entryOf(await queue("dbs"), "dbs-certificate").submissionId,
      decision: "rejected",
      reason: "mismatch",
    });
    const after = await verification.adminOverview();
    expect(after.ok && after.value).toMatchObject({
      pending: 3,
      rejectedToday: 1,
    });
  });
});
