// S-A-16 through the module's own read and actions (ADR-159), over the memory world: the queue view carries the
// rows with a name beside each (03 §3.6), the counters and the open row; a nanny's session renders the forbidden
// state, never an empty queue; the decision action parses at the boundary (a rejection without a reason names
// the field), records through `verification.decide`, and answers the level the sync left; the reveal action
// answers signed URLs and emits `vetting.evidence-viewed`; the Update Service action is the level-4 step.
// Written RED first — the module was types only.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { configureAuth, stubAuth } from "@/modules/auth";
import { configureComms, unconfiguredComms } from "@/modules/comms";
import { LOCALE, SECURITY } from "@/modules/config";
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
import type { ConsentRecordId, Email, UserId } from "@/modules/shared-types";
import {
  configureVerification,
  createVerification,
  memoryVerificationStore,
  verification,
} from "@/modules/verification";
import {
  configureVettingStore,
  memoryVettingStore,
} from "@/modules/vetting-providers";
import {
  decideSubmissionAction,
  loadVerificationQueue,
  openEvidenceAction,
  parseQueueQuery,
  recordUpdateServiceAction,
} from "../index";

const NANNY = "11111111-1111-4111-8111-111111111111" as UserId;
const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as UserId;
const PDF = new TextEncoder().encode("%PDF-1.4 test");
let JPEG: Uint8Array;
let events: ReturnType<typeof memoryEventLogStore>;

beforeAll(async () => {
  const { tinyJpeg } = await import(
    "@/modules/verification/__tests__/fixtures/tiny-jpeg"
  );
  JPEG = await tinyJpeg();
});

const signIn = (userId: UserId) =>
  configureAuth(
    stubAuth({
      users: [
        { id: NANNY, email: "amara@example.test" as Email, role: "nanny" },
        {
          id: ADMIN,
          email: "admin@example.test" as Email,
          role: "admin",
          mfaVerified: true,
        },
      ],
      signedInUserId: userId,
      tables: {
        user_profiles: [
          { user_id: NANNY, first_name: "Amara", last_name: "Okafor" },
        ],
      },
    }),
  );

async function submitAsNanny(): Promise<void> {
  signIn(NANNY);
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
  if (!recorded.ok) throw new Error("consent");
  await verification.submitContact(NANNY, {
    mobile: `${LOCALE.phonePrefix}7700900123` as never,
    district: "SW4",
    area: "Clapham",
  });
  await verification.submitIdentity(NANNY, {
    idType: "passport",
    document: { bytes: JPEG },
    selfie: { bytes: JPEG },
    surname: "Okafor",
    givenNames: "Amara",
    dateOfBirth: "1990-04-12" as never,
    consentRecordId: recorded.value.id as ConsentRecordId,
  });
  await verification.submitDbs(NANNY, {
    certificate: { bytes: PDF },
    certificateNumber: "123456789012",
    issueDate: "2026-01-10" as never,
    updateServiceConsent: true,
  });
  await verification.process(NANNY);
  signIn(ADMIN);
}

const form = (fields: Record<string, string>): FormData => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

beforeEach(() => {
  configureConsent(
    createConsent({
      store: memoryConsentStore({
        documents: { "biometric-notice": { version: 1 } } as never,
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
  events = memoryEventLogStore();
  configureEvents(createEvents({ store: events, log }));
  // comms fails closed here on purpose: a decision never depends on a message going (01 §4a rule 2)
  configureComms(unconfiguredComms);
  const ledger = memoryVettingStore();
  configureVettingStore(ledger);
  configureVerification(
    createVerification({
      store: memoryVerificationStore(ledger),
      contactWriter: async () => ok(undefined),
    }),
  );
});

describe("parseQueueQuery", () => {
  it("falls back to the first tab and the needs-a-person filter; an open id must be a uuid", () => {
    expect(parseQueueQuery({})).toEqual({
      tab: "identity",
      filter: "needs-admin",
      open: null,
    });
    expect(
      parseQueueQuery({ tab: "dbs", filter: "stale-pending", open: "nope" }),
    ).toEqual({ tab: "dbs", filter: "stale-pending", open: null });
    expect(parseQueueQuery({ tab: ["right-to-work"] }).tab).toBe("right-to-work");
  });
});

describe("loadVerificationQueue (S-A-16's read)", () => {
  it("lists the tab's rows with the nanny's name beside each, the counters, and the open row", async () => {
    await submitAsNanny();
    const view = await loadVerificationQueue({
      tab: "dbs",
      filter: "needs-admin",
      open: null,
    });
    expect(view.kind).toBe("queue");
    if (view.kind !== "queue") return;
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]?.nannyName).toBe("Amara Okafor");
    expect(view.overview.pending).toBe(3);
    const opened = await loadVerificationQueue({
      tab: "dbs",
      filter: "needs-admin",
      open: view.rows[0]!.submissionId,
    });
    expect(opened.kind === "queue" && opened.open?.nannyName).toBe("Amara Okafor");
    expect(opened.kind === "queue" && opened.open?.record.declared.certificateNumber).toBe(
      "123456789012",
    );
  });

  it("renders the forbidden state for a nanny's session — never an empty queue", async () => {
    await submitAsNanny();
    signIn(NANNY);
    const view = await loadVerificationQueue({
      tab: "dbs",
      filter: "needs-admin",
      open: null,
    });
    expect(view).toEqual({ kind: "forbidden" });
  });
});

describe("the three actions", () => {
  it("decideSubmissionAction: a rejection without a reason names the field; a decision records and answers the level", async () => {
    await submitAsNanny();
    const view = await loadVerificationQueue({
      tab: "identity",
      filter: "needs-admin",
      open: null,
    });
    if (view.kind !== "queue") throw new Error("no queue");
    const document = view.rows.find((r) => r.evidenceType === "identity-document")!;
    const noReason = await decideSubmissionAction(
      null,
      form({ submissionId: document.submissionId, decision: "rejected" }),
    );
    expect(!noReason.ok && noReason.error.details?.reason).toBe("invalid-input");
    expect(!noReason.ok && (noReason.error.details as { field?: string }).field).toBe(
      "reason",
    );
    const verified = await decideSubmissionAction(
      null,
      form({ submissionId: document.submissionId, decision: "verified", note: "clear scan" }),
    );
    expect(verified.ok && verified.value.sync.toLevel).toBe("L2_ID_VERIFIED");
    expect(events.rows.map((r) => r.name)).toContain("vetting.decision-recorded");
  });

  it("openEvidenceAction: signed URLs for the section and one vetting.evidence-viewed; a malformed id is refused", async () => {
    await submitAsNanny();
    const view = await loadVerificationQueue({
      tab: "identity",
      filter: "needs-admin",
      open: null,
    });
    if (view.kind !== "queue") throw new Error("no queue");
    const bad = await openEvidenceAction(null, form({ submissionId: "x" }));
    expect(!bad.ok && bad.error.details?.reason).toBe("invalid-input");
    const opened = await openEvidenceAction(
      null,
      form({ submissionId: view.rows[0]!.submissionId }),
    );
    expect(opened.ok && opened.value.documents.length).toBe(2);
    expect(events.rows.filter((r) => r.name === "vetting.evidence-viewed")).toHaveLength(1);
  });

  it("recordUpdateServiceAction: the level-4 step after L3", async () => {
    await submitAsNanny();
    const identity = await loadVerificationQueue({ tab: "identity", filter: "needs-admin", open: null });
    const dbs = await loadVerificationQueue({ tab: "dbs", filter: "needs-admin", open: null });
    if (identity.kind !== "queue" || dbs.kind !== "queue") throw new Error("no queue");
    await decideSubmissionAction(
      null,
      form({
        submissionId: identity.rows.find((r) => r.evidenceType === "identity-document")!.submissionId,
        decision: "verified",
      }),
    );
    await decideSubmissionAction(
      null,
      form({ submissionId: dbs.rows[0]!.submissionId, decision: "verified" }),
    );
    const l4 = await recordUpdateServiceAction(
      null,
      form({ nannyId: NANNY, result: "no_change", subscribed: "true" }),
    );
    expect(l4.ok && l4.value.toLevel).toBe("L4_FULLY_VERIFIED");
    const bad = await recordUpdateServiceAction(null, form({ nannyId: NANNY, result: "maybe" }));
    expect(!bad.ok && bad.error.details?.reason).toBe("invalid-input");
  });
});
