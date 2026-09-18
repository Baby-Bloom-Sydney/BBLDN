// `platform/consent` — annual renewal (**ruling 5.2**) and the PECR gate before any choice has been made
// (**ruling 5.3**, 07 §2.9 / §10.3). L-009 `3c`.
//
// The store double here is hand-rolled rather than `memoryConsentStore`, for one reason: the stub fixes its
// document versions at construction, and every interesting renewal case is about a document **changing while a
// signature already exists**. A double whose documents can move is the only way to test the thing the ruling is
// about.
import { describe, expect, it } from "vitest";
import { SECURITY } from "@/modules/config";
import type {
  ConsentRecordId,
  Instant,
  Result,
  UserId,
  VisitorId,
} from "@/modules/shared-types";
import {
  RENEWABLE_PURPOSES,
  RENEWAL_CARRY,
  createConsent,
  createLogger,
  memoryConsentStore,
} from "@/modules/platform";
import type {
  Consent,
  ConsentRecord,
  ConsentStore,
  CurrentDocument,
  LegalDocumentId,
  LogLine,
} from "@/modules/platform";

const USER = "00000000-0000-4000-8000-0000000000aa" as UserId;
const VISITOR = "00000000-0000-4000-8000-0000000000cc" as VisitorId;
const NOW = "2026-09-19T08:00:00.000Z" as Instant;

type Doc = { readonly version: number; readonly contentHash: string };

/** A store whose documents can be re-published between calls, and whose consent rows accumulate. */
function movableStore(initial: Partial<Record<LegalDocumentId, Doc>>) {
  const state = {
    documents: { ...initial } as Partial<Record<LegalDocumentId, Doc>>,
    consents: [] as ConsentRecord[],
  };
  const store: ConsentStore = {
    insertConsent: async (row) => {
      state.consents.push(row);
      return { ok: true, value: undefined };
    },
    latestConsent: async (userId, purpose) => ({
      ok: true,
      value:
        [...state.consents]
          .reverse()
          .find((r) => r.userId === userId && r.purpose === purpose) ?? null,
    }),
    insertBiometric: async () => ({ ok: true, value: undefined }),
    insertCookie: async () => ({ ok: true, value: {} }),
    currentCookie: async () => ({ ok: true, value: null }),
    currentDocument: async (id): Promise<Result<CurrentDocument | null>> => {
      const doc = state.documents[id];
      return {
        ok: true,
        value:
          doc === undefined
            ? null
            : Object.freeze({
                id,
                version: doc.version,
                contentHash: doc.contentHash,
                requiresReacceptance: false as const,
              }),
      };
    },
  };
  return { state, store };
}

function harness(initial: Partial<Record<LegalDocumentId, Doc>>) {
  const { state, store } = movableStore(initial);
  let n = 0;
  const api: Consent = createConsent({
    store,
    clock: () => NOW,
    newId: () => `r-${(n += 1)}` as ConsentRecordId,
    cookieExpiryDays: SECURITY.retention.cookieExpiryDays,
  });
  return { api, state };
}

const sign = (api: Consent, doc: CurrentDocument, given = true) =>
  api.recordConsent({
    userId: USER,
    party: "parent",
    agreementId: "AGR-01",
    checkpointId: "agr01_terms_acceptance",
    checkpointText: "I agree.",
    context: {},
    purpose: doc.id,
    document: {
      id: doc.id,
      version: doc.version,
      contentHash: doc.contentHash,
    },
    consentGiven: given,
  });

async function currentOf(
  api: Consent,
  purpose: LegalDocumentId,
): Promise<CurrentDocument> {
  const policy = await api.getPolicy(purpose);
  if (!policy.ok || policy.value.currentDocument === undefined)
    throw new Error("no current document");
  return policy.value.currentDocument;
}

describe("platform/consent — ruling 5.2: renewal re-asks only for the documents that changed", () => {
  it("a purpose she has never signed is re-asked, and the plan says she signed nothing", async () => {
    const { api } = harness({ "client-tos": { version: 1, contentHash: "a" } });
    const plan = await api.dueForRenewal(USER, ["client-tos"]);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.reAsk.map((item) => item.purpose)).toEqual([
      "client-tos",
    ]);
    expect(plan.value.reAsk[0].signed).toBeUndefined();
    expect(plan.value.carryForward).toEqual([]);
  });

  it("★ a purpose whose words are unchanged is carried forward, not re-asked", async () => {
    const { api } = harness({ "client-tos": { version: 1, contentHash: "a" } });
    await sign(api, await currentOf(api, "client-tos"));

    const plan = await api.dueForRenewal(USER, ["client-tos"]);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.reAsk).toEqual([]);
    expect(plan.value.carryForward.map((item) => item.purpose)).toEqual([
      "client-tos",
    ]);
    expect(plan.value.carryForward[0].signed?.contentHash).toBe("a");
  });

  it("★ a purpose whose WORDS changed is re-asked, and the plan still names what she signed", async () => {
    const { api, state } = harness({
      "client-tos": { version: 1, contentHash: "a" },
    });
    await sign(api, await currentOf(api, "client-tos"));

    // v2 is published: a new row, new words, new hash — `legal_documents` is append-only.
    state.documents["client-tos"] = { version: 2, contentHash: "b" };

    const plan = await api.dueForRenewal(USER, ["client-tos"]);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.reAsk.map((item) => item.purpose)).toEqual([
      "client-tos",
    ]);
    expect(plan.value.reAsk[0].signed?.contentHash).toBe("a");
    expect(plan.value.reAsk[0].current.contentHash).toBe("b");
    expect(plan.value.carryForward).toEqual([]);
  });

  it("★ changed words at the SAME version number are still a re-ask — the hash is what is compared", async () => {
    // This is the case a version-only comparison silently gets wrong, and it is the whole reason ruling 5.1
    // exists: the row number did not move, the words did.
    const { api, state } = harness({
      "client-tos": { version: 1, contentHash: "a" },
    });
    await sign(api, await currentOf(api, "client-tos"));
    state.documents["client-tos"] = { version: 1, contentHash: "edited" };

    const plan = await api.dueForRenewal(USER, ["client-tos"]);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.reAsk.map((item) => item.purpose)).toEqual([
      "client-tos",
    ]);
  });

  it("★ a decline is re-asked, never carried — carrying it would record consent she did not give", async () => {
    const { api } = harness({ "client-tos": { version: 1, contentHash: "a" } });
    await sign(api, await currentOf(api, "client-tos"), false);

    const plan = await api.dueForRenewal(USER, ["client-tos"]);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.reAsk.map((item) => item.purpose)).toEqual([
      "client-tos",
    ]);
    expect(plan.value.carryForward).toEqual([]);
  });

  it("a purpose with no current document is `unavailable` — an outage, not a renewal question", async () => {
    const { api } = harness({});
    const plan = await api.dueForRenewal(USER, ["client-tos"]);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.unavailable).toEqual(["client-tos"]);
    expect(plan.value.reAsk).toEqual([]);
    expect(plan.value.carryForward).toEqual([]);
  });

  it("defaults to every renewable purpose, and `vaccination-status` is not one (it accepts no words)", async () => {
    const { api } = harness({ "client-tos": { version: 1, contentHash: "a" } });
    const plan = await api.dueForRenewal(USER);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(RENEWABLE_PURPOSES).not.toContain("vaccination-status");
    expect(RENEWABLE_PURPOSES).toHaveLength(11);
    expect(
      [...plan.value.reAsk, ...plan.value.carryForward].length +
        plan.value.unavailable.length,
    ).toBe(RENEWABLE_PURPOSES.length);
  });

  it("★ the carry is RECORDED, and a recorded carry still reads as a carry next year", async () => {
    // Without the row, "no renewal was needed" and "the renewal never ran" are the same observation.
    const { api, state } = harness({
      "client-tos": { version: 1, contentHash: "a" },
    });
    const document = await currentOf(api, "client-tos");
    await sign(api, document);

    const plan = await api.dueForRenewal(USER, ["client-tos"]);
    expect(plan.ok && plan.value.carryForward).toHaveLength(1);

    const carried = await api.recordConsent({
      userId: USER,
      party: "parent",
      agreementId: "AGR-01",
      checkpointId: RENEWAL_CARRY.checkpointId,
      checkpointText: RENEWAL_CARRY.checkpointText,
      context: {},
      purpose: "client-tos",
      document: {
        id: "client-tos",
        version: document.version,
        contentHash: document.contentHash,
      },
      consentGiven: true,
    });
    expect(carried.ok).toBe(true);
    expect(state.consents).toHaveLength(2);
    expect(state.consents[1].checkpointId).toBe("annual_renewal_carry_forward");

    // The carry does not turn next year's answer into a re-ask.
    const next = await api.dueForRenewal(USER, ["client-tos"]);
    expect(next.ok && next.value.carryForward.map((i) => i.purpose)).toEqual([
      "client-tos",
    ]);
  });
});

describe("platform/consent — ruling 5.3: the pixel may not load before a choice (PECR; 07 §10.3)", () => {
  it("★ `hasMarketing` is false when no cookie choice has been made at all", async () => {
    // The PECR claim of 07 §10.3 does not rest on the CSP — the Meta origins are statically allow-listed there.
    // It rests on this: `platform/events` mounts the pixel loader only when `hasMarketing` is true, and with no
    // record at all that is false. "No answer" is not consent, and an unconfigured seam fails closed too
    // (`consent-registry.ts`), so there is no state in which the pixel loads before a person has chosen.
    const api = createConsent({
      store: memoryConsentStore(),
      cookieExpiryDays: SECURITY.retention.cookieExpiryDays,
    });
    expect(await api.hasMarketing({ kind: "visitor", id: VISITOR })).toEqual({
      ok: true,
      value: false,
    });
  });

  it("★ rejecting non-essential leaves marketing off; the record exists, and it says no", async () => {
    // The reject path is a recorded choice, not the absence of one: PECR needs to be able to show she was asked
    // and declined, and without the row the banner would ask her again on every page.
    const api = createConsent({
      store: memoryConsentStore(),
      cookieExpiryDays: SECURITY.retention.cookieExpiryDays,
    });
    const recorded = await api.recordCookieConsent({
      visitorId: VISITOR,
      choice: "reject_non_essential",
      analyticsEnabled: false,
      marketingEnabled: false,
      context: {},
    });
    expect(recorded.ok).toBe(true);
    expect(await api.hasMarketing({ kind: "visitor", id: VISITOR })).toEqual({
      ok: true,
      value: false,
    });
  });

  it("★ accepting turns it on — nothing else does, which is what makes this the only gate", async () => {
    const api = createConsent({
      store: memoryConsentStore(),
      cookieExpiryDays: SECURITY.retention.cookieExpiryDays,
    });
    await api.recordCookieConsent({
      visitorId: VISITOR,
      choice: "accept_all",
      analyticsEnabled: true,
      marketingEnabled: true,
      context: {},
    });
    expect(await api.hasMarketing({ kind: "visitor", id: VISITOR })).toEqual({
      ok: true,
      value: true,
    });
  });
});

describe("platform/consent — auditExpiry: the `audit-consent-expiry` cron's inside (10.19 / 07.72 / 08.34)", () => {
  const lines: LogLine[] = [];
  const withLog = (initial: Partial<Record<LegalDocumentId, Doc>>) => {
    lines.length = 0;
    const { store, state } = movableStore(initial);
    return {
      state,
      api: createConsent({
        store,
        clock: () => NOW,
        cookieExpiryDays: SECURITY.retention.cookieExpiryDays,
        log: createLogger({ sink: (line) => void lines.push(line) }),
      }),
    };
  };

  it("counts the documents it audited and reports none missing when all are present", async () => {
    const { api } = withLog({
      "client-tos": { version: 1, contentHash: "a" },
      "privacy-policy": { version: 1, contentHash: "b" },
    });
    const run = await api.auditExpiry(NOW, ["client-tos", "privacy-policy"]);
    expect(run).toEqual({ ok: true, value: { handled: 2, skipped: 0 } });
    expect(lines).toEqual([]);
  });

  it("★ a day-one document with no version at all is an alert, not a silent skip", async () => {
    // With no row, every consent road that names it fails closed with `document-required`, and nothing else in
    // the tree reads `legal_documents` on a schedule — so without this the outage is invisible until a user hits it.
    const { api } = withLog({ "client-tos": { version: 1, contentHash: "a" } });
    const run = await api.auditExpiry(NOW, ["client-tos", "privacy-policy"]);
    expect(run).toEqual({ ok: true, value: { handled: 1, skipped: 1 } });
    expect(lines).toHaveLength(1);
    expect(lines[0].level).toBe("error");
    expect(lines[0].alert).toBe("ALERT_CONSENT_DOCUMENT_MISSING");
    expect(lines[0].purpose).toBe("privacy-policy");
  });

  it("a read failure fails the whole run — a partial audit reporting a clean run is worse than no run", async () => {
    const api = createConsent({
      store: {
        insertConsent: async () => ({ ok: true, value: undefined }),
        latestConsent: async () => ({ ok: true, value: null }),
        insertBiometric: async () => ({ ok: true, value: undefined }),
        insertCookie: async () => ({ ok: true, value: {} }),
        currentCookie: async () => ({ ok: true, value: null }),
        currentDocument: async () => ({
          ok: false,
          error: { code: "INTERNAL", message: "port down" },
        }),
      } as unknown as ConsentStore,
      cookieExpiryDays: SECURITY.retention.cookieExpiryDays,
    });
    const run = await api.auditExpiry(NOW, ["client-tos"]);
    expect(run.ok).toBe(false);
  });
});
