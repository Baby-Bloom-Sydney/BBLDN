// S-A-16 through the module's own read and actions (ADR-159): the module decorates, parses at the boundary and
// gates — the road itself (`verification.decide` / `openEvidence` / `recordUpdateServiceCheck`) is
// `verification`'s and is proven in its own suites, so the connector is stubbed here (05 §3 rule 2; 01 §2.3 gives
// this module no arrow to `vetting-providers`, whose memory world the road needs). The claims: the queue view
// carries the rows with a name from `auth` beside each (03 §3.6), the counters and the open row; a refusal
// renders as forbidden, never as an empty queue; the decision action parses (a rejection without a reason names
// the field) and forwards; the reveal and Update Service actions validate their ids and enums. Written RED first.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { configureAuth, stubAuth } from "@/modules/auth";
import { err, ok } from "@/modules/platform";
import type {
  Email,
  NannyId,
  SubmissionId,
  UserId,
} from "@/modules/shared-types";
import type { QueueEntry, QueueRecord } from "@/modules/verification";

const NANNY = "11111111-1111-4111-8111-111111111111" as UserId;
/**
 * ★ ADR-169 — her PARTY row, a different value from her session id. The queue carries this one (it comes
 * straight off `vetting_submissions.nanny_id`), and her name is reached by resolving it to `NANNY` first. These
 * fixtures used one value for both, which made `nannyNameOf(entry.nannyId)` resolve in the double while every
 * production row rendered `Nanny 11111111` (REVIEW-4 C-3).
 */
const NANNY_PARTY = "99999999-9999-4999-8999-999999999999" as NannyId;
const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as UserId;
const SUBMISSION = "33333333-3333-4333-8333-333333333333" as SubmissionId;

const entry: QueueEntry = {
  submissionId: SUBMISSION,
  nannyId: NANNY_PARTY,
  section: "dbs",
  evidenceType: "dbs-certificate",
  status: "needs-admin",
  submittedAt: "2026-09-18T09:00:00.000Z" as never,
};
const record: QueueRecord = {
  entry,
  state: {
    nannyId: NANNY,
    level: "L1_REGISTERED",
    suspended: false,
    sections: [
      { section: "contact", status: "verified" },
      { section: "identity", status: "review", attempts: 1 },
      { section: "dbs", status: "review" },
      { section: "right-to-work", status: "not_started" },
    ],
  },
  record: {
    nannyId: NANNY_PARTY,
    userId: NANNY,
    level: "L1_REGISTERED",
    suspended: false,
    declared: { certificateNumber: "123456789012" },
    documents: [],
    dbsOutcome: "unset",
    crossCheckPassed: false,
    updateService: {},
  },
};

const notPermitted = () =>
  err("FORBIDDEN", "You do not have access to this.", {
    reason: "not-permitted" as const,
  });

const road = {
  listQueue: vi.fn(async () => ok([entry])),
  adminOverview: vi.fn(async () =>
    ok({ pending: 1, verifiedToday: 0, rejectedToday: 0, fullyVerified: 2 }),
  ),
  readQueueRecord: vi.fn(async () => ok(record)),
  decide: vi.fn(async () =>
    ok({
      nannyId: NANNY,
      section: "dbs" as const,
      status: "verified" as const,
      sync: {
        fromLevel: "L2_ID_VERIFIED" as const,
        toLevel: "L3_PROVISIONALLY_VERIFIED" as const,
        suspended: false,
        released: 0,
      },
    }),
  ),
  openEvidence: vi.fn(async () =>
    ok({
      documents: [
        {
          section: "dbs-certificate" as const,
          url: "https://stub.storage.test/x" as never,
          expiresAt: "2026-09-18T10:00:00.000Z" as never,
        },
      ],
      declared: { certificateNumber: "123456789012" },
    }),
  ),
  recordUpdateServiceCheck: vi.fn(async () =>
    ok({
      fromLevel: "L3_PROVISIONALLY_VERIFIED" as const,
      toLevel: "L4_FULLY_VERIFIED" as const,
      suspended: false,
      released: 1,
    }),
  ),
};

vi.mock("@/modules/verification", () => ({ verification: road }));

const {
  decideSubmissionAction,
  loadVerificationQueue,
  openEvidenceAction,
  parseQueueQuery,
  recordUpdateServiceAction,
} = await import("../index");

const form = (fields: Record<string, string>): FormData => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

beforeEach(() => {
  vi.clearAllMocks();
  configureAuth(
    stubAuth({
      users: [
        {
          id: ADMIN,
          email: "reviewer@example.test" as Email,
          role: "admin",
          mfaVerified: true,
        },
      ],
      signedInUserId: ADMIN,
      tables: {
        // ADR-169: the party row is what the queue carries, and the name is one resolution away from it.
        nannies: [{ id: NANNY_PARTY, user_id: NANNY }],
        user_profiles: [
          { user_id: NANNY, first_name: "Amara", last_name: "Okafor" },
        ],
      },
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
    ).toEqual({
      tab: "dbs",
      filter: "stale-pending",
      open: null,
    });
    expect(
      parseQueueQuery({ tab: ["right-to-work"], open: SUBMISSION }).open,
    ).toBe(SUBMISSION);
  });
});

describe("loadVerificationQueue (S-A-16's read)", () => {
  it("lists the tab's rows with the nanny's name beside each, the counters, and the open row", async () => {
    const view = await loadVerificationQueue({
      tab: "dbs",
      filter: "needs-admin",
      open: SUBMISSION,
    });
    expect(view.kind).toBe("queue");
    if (view.kind !== "queue") return;
    expect(view.rows).toEqual([{ ...entry, nannyName: "Amara Okafor" }]);
    expect(view.overview.fullyVerified).toBe(2);
    expect(view.open?.nannyName).toBe("Amara Okafor");
    expect(view.open?.record.declared.certificateNumber).toBe("123456789012");
    expect(road.listQueue).toHaveBeenCalledWith({
      tab: "dbs",
      filter: "needs-admin",
      open: SUBMISSION,
    });
  });

  it("a profile that cannot be read shows the id's short form, never an error on the list", async () => {
    configureAuth(
      stubAuth({
        users: [
          {
            id: ADMIN,
            email: "a@example.test" as Email,
            role: "admin",
            mfaVerified: true,
          },
        ],
        signedInUserId: ADMIN,
      }),
    );
    const view = await loadVerificationQueue({
      tab: "dbs",
      filter: "needs-admin",
      open: null,
    });
    // ADR-169: with no `nannies` row to resolve, the fallback names the id the queue actually carries.
    expect(view.kind === "queue" && view.rows[0]?.nannyName).toBe(
      `Nanny ${(NANNY_PARTY as string).slice(0, 8)}`,
    );
  });

  it("renders the forbidden state when the road refuses — never an empty queue", async () => {
    road.listQueue.mockResolvedValueOnce(notPermitted() as never);
    const view = await loadVerificationQueue({
      tab: "dbs",
      filter: "needs-admin",
      open: null,
    });
    expect(view).toEqual({ kind: "forbidden" });
    road.adminOverview.mockResolvedValueOnce(
      err("INTERNAL", "x", { reason: "store-failed" as const }) as never,
    );
    const down = await loadVerificationQueue({
      tab: "dbs",
      filter: "needs-admin",
      open: null,
    });
    expect(down).toEqual({ kind: "unavailable" });
  });
});

describe("the three actions (01 §4a: validate once at the boundary)", () => {
  it("decideSubmissionAction: a rejection without a reason names the field; a decision forwards and answers the level", async () => {
    const noReason = await decideSubmissionAction(
      null,
      form({ submissionId: SUBMISSION, decision: "rejected" }),
    );
    expect(!noReason.ok && noReason.error.details?.reason).toBe(
      "invalid-input",
    );
    expect(
      !noReason.ok && (noReason.error.details as { field?: string }).field,
    ).toBe("reason");
    expect(road.decide).not.toHaveBeenCalled();
    const verified = await decideSubmissionAction(
      null,
      form({
        submissionId: SUBMISSION,
        decision: "verified",
        note: "clear scan",
      }),
    );
    expect(verified.ok && verified.value.sync.toLevel).toBe(
      "L3_PROVISIONALLY_VERIFIED",
    );
    expect(road.decide).toHaveBeenCalledWith({
      submissionId: SUBMISSION,
      decision: "verified",
      note: "clear scan",
    });
  });

  it("a refusal the panel can act on passes through; anything else is the generic line", async () => {
    road.decide.mockResolvedValueOnce(notPermitted() as never);
    const refused = await decideSubmissionAction(
      null,
      form({ submissionId: SUBMISSION, decision: "verified" }),
    );
    expect(!refused.ok && refused.error.details?.reason).toBe("not-permitted");
    road.decide.mockResolvedValueOnce(
      err("INTERNAL", "provider said no", {
        reason: "provider-unavailable" as const,
      }) as never,
    );
    const generic = await decideSubmissionAction(
      null,
      form({ submissionId: SUBMISSION, decision: "verified" }),
    );
    expect(!generic.ok && generic.error.message).not.toMatch(
      /provider said no/,
    );
    expect(!generic.ok && generic.error.code).toBe("INTERNAL");
  });

  it("openEvidenceAction: a malformed id is refused before the road; a uuid opens", async () => {
    const bad = await openEvidenceAction(null, form({ submissionId: "x" }));
    expect(!bad.ok && bad.error.details?.reason).toBe("invalid-input");
    expect(road.openEvidence).not.toHaveBeenCalled();
    const opened = await openEvidenceAction(
      null,
      form({ submissionId: SUBMISSION }),
    );
    expect(opened.ok && opened.value.documents).toHaveLength(1);
    expect(road.openEvidence).toHaveBeenCalledWith(SUBMISSION);
  });

  it("recordUpdateServiceAction: the result is 02 §3's enum, subscribed a boolean; the level-4 answer comes back", async () => {
    const bad = await recordUpdateServiceAction(
      null,
      form({ submissionId: SUBMISSION, result: "maybe" }),
    );
    expect(!bad.ok && bad.error.details?.reason).toBe("invalid-input");
    const l4 = await recordUpdateServiceAction(
      null,
      form({
        submissionId: SUBMISSION,
        result: "no_change",
        subscribed: "true",
      }),
    );
    expect(l4.ok && l4.value.toLevel).toBe("L4_FULLY_VERIFIED");
    expect(road.recordUpdateServiceCheck).toHaveBeenCalledWith({
      submissionId: SUBMISSION,
      result: "no_change",
      subscribed: true,
    });
  });
});
