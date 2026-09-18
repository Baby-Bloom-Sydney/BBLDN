// `platform/consent.sweepRenewals` — the per-user annual renewal sweep (FATE `10.18`; ADR-174; L-009 `3g`).
//
// `3c` built `dueForRenewal` and deliberately did not build this, because the sweep needed a store read that did
// not exist and half of it "would look like a check that wasn't happening". The cases below are what stops it
// looking like that:
//
//   · a person whose words have **not** moved is carried forward, and the carry is a **row** — the evidence that
//     the check ran at all, which is the question an accountability request asks a year later;
//   · a person whose document's **hash** has moved is counted and **nothing is written**, because a row saying
//     we asked her would be false until a surface has;
//   · a person who **declined** is re-asked, never carried — a carry there would record consent she did not give;
//   · a carried person is not due again tomorrow, and a re-asked person still is. That is the whole idempotency
//     story, and it falls out of the carry being a row rather than out of a cursor.
import { beforeEach, describe, expect, it } from "vitest";
import { CONSENT, SECURITY } from "@/modules/config";
import {
  createConsent,
  memoryConsentStore,
  RENEWAL_CARRY,
} from "@/modules/platform";
import type { Consent, MemoryConsentStore } from "@/modules/platform";
import type { ConsentRecordId, Instant, UserId } from "@/modules/shared-types";

const NOW = "2027-09-20T08:00:00.000Z" as Instant;
const LONG_AGO = "2026-01-01T08:00:00.000Z" as Instant;
const YESTERDAY = "2027-09-19T08:00:00.000Z" as Instant;
const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as UserId;
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as UserId;

let store: MemoryConsentStore;
let api: Consent;
let ids = 0;

function install(hash = "stub-hash-v1") {
  ids = 0;
  store = memoryConsentStore({
    documents: {
      "client-tos": {
        version: 1,
        contentHash: hash,
        requiresReacceptance: false,
      },
    },
  });
  api = createConsent({
    store,
    clock: () => NOW,
    newId: () => `r-${(ids += 1)}` as ConsentRecordId,
    cookieExpiryDays: SECURITY.retention.cookieExpiryDays,
  });
}

/** A signature already on file, written straight into the store so its instant is ours to choose. */
async function signed(
  userId: UserId,
  at: Instant,
  hash: string,
  consentGiven = true,
) {
  await store.insertConsent({
    id: `seed-${userId}-${at}` as ConsentRecordId,
    userId,
    party: "parent",
    agreementId: "AGR-01",
    checkpointId: "agr01_terms_acceptance",
    checkpointText: "I agree.",
    purpose: "client-tos",
    document: { id: "client-tos", version: 1, contentHash: hash },
    consentGiven,
    context: {},
    createdAt: at,
  });
}

const carries = () =>
  store.consents.filter(
    (row) => row.checkpointId === RENEWAL_CARRY.checkpointId,
  );

beforeEach(() => install());

describe("sweepRenewals — who it looks at", () => {
  it("leaves alone a signature younger than the cadence", async () => {
    await signed(ALICE, YESTERDAY, "stub-hash-v1");

    const run = await api.sweepRenewals(NOW);

    expect(run.ok && run.value.checked).toBe(0);
    expect(carries()).toHaveLength(0);
  });

  it("★ picks up a signature older than the cadence", async () => {
    await signed(ALICE, LONG_AGO, "stub-hash-v1");

    const run = await api.sweepRenewals(NOW);

    expect(run.ok && run.value.checked).toBe(1);
  });

  it("★ judges the NEWEST row per subject — an old row plus a recent one is not due", async () => {
    await signed(ALICE, LONG_AGO, "stub-hash-v1");
    await signed(ALICE, YESTERDAY, "stub-hash-v1");

    const run = await api.sweepRenewals(NOW);

    expect(run.ok && run.value.checked).toBe(0);
  });

  it("checks the cadence config rather than a literal", () => {
    expect(CONSENT.renewalCheckMonths).toBe(12);
  });
});

describe("sweepRenewals — what it writes (ADR-174)", () => {
  it("★ carries forward an unchanged document and RECORDS the carry", async () => {
    await signed(ALICE, LONG_AGO, "stub-hash-v1");

    const run = await api.sweepRenewals(NOW);

    expect(run.ok && run.value.carried).toBe(1);
    expect(carries()).toHaveLength(1);
    expect(carries()[0]).toMatchObject({
      userId: ALICE,
      purpose: "client-tos",
      consentGiven: true,
      checkpointText: RENEWAL_CARRY.checkpointText,
    });
  });

  it("★ the carry belongs to the agreement she already signed, not to a new one", async () => {
    await signed(ALICE, LONG_AGO, "stub-hash-v1");

    await api.sweepRenewals(NOW);

    expect(carries()[0]).toMatchObject({
      agreementId: "AGR-01",
      party: "parent",
    });
  });

  it("the carry names the current triple, so it is evidence of WHICH words were checked", async () => {
    await signed(ALICE, LONG_AGO, "stub-hash-v1");

    await api.sweepRenewals(NOW);

    expect(carries()[0].document).toEqual({
      id: "client-tos",
      version: 1,
      contentHash: "stub-hash-v1",
    });
  });

  it("★ writes NOTHING when the hash has moved — it counts a re-ask instead", async () => {
    await signed(ALICE, LONG_AGO, "the-words-she-actually-read");

    const run = await api.sweepRenewals(NOW);

    expect(run.ok && run.value.reAsk).toBe(1);
    expect(run.ok && run.value.carried).toBe(0);
    expect(carries()).toHaveLength(0);
  });

  it("★ re-asks a DECLINE rather than carrying it — a carry would record consent she never gave", async () => {
    await signed(ALICE, LONG_AGO, "stub-hash-v1", false);

    const run = await api.sweepRenewals(NOW);

    expect(run.ok && run.value.reAsk).toBe(1);
    expect(carries()).toHaveLength(0);
  });

  it("counts a document with no current version as unavailable, and writes nothing", async () => {
    await signed(ALICE, LONG_AGO, "stub-hash-v1");
    // Re-install with no document at all for the purpose she signed, keeping her row.
    const rows = store.consents;
    store = memoryConsentStore({ documents: {} });
    for (const row of rows) await store.insertConsent(row);
    api = createConsent({
      store: {
        ...store,
        currentDocument: async () => ({ ok: true, value: null }),
      },
      clock: () => NOW,
      newId: () => `r-${(ids += 1)}` as ConsentRecordId,
      cookieExpiryDays: SECURITY.retention.cookieExpiryDays,
    });

    const run = await api.sweepRenewals(NOW);

    expect(run.ok && run.value.unavailable).toBeGreaterThan(0);
    expect(run.ok && run.value.carried).toBe(0);
  });
});

describe("sweepRenewals — idempotency, which falls out of the carry being a row", () => {
  it("★ a carried subject is not due on the next run", async () => {
    await signed(ALICE, LONG_AGO, "stub-hash-v1");
    const first = await api.sweepRenewals(NOW);
    expect(first.ok && first.value.carried).toBe(1);

    const second = await api.sweepRenewals(NOW);

    expect(second.ok && second.value.checked).toBe(0);
    expect(carries()).toHaveLength(1);
  });

  it("★ a re-asked subject IS still due tomorrow — because she still is", async () => {
    await signed(ALICE, LONG_AGO, "the-words-she-actually-read");
    await api.sweepRenewals(NOW);

    const second = await api.sweepRenewals(NOW);

    expect(second.ok && second.value.reAsk).toBe(1);
  });
});

describe("sweepRenewals — more than one subject", () => {
  it("carries one and re-asks the other in a single run", async () => {
    await signed(ALICE, LONG_AGO, "stub-hash-v1");
    await signed(BOB, LONG_AGO, "the-words-bob-actually-read");

    const run = await api.sweepRenewals(NOW);

    expect(run.ok && run.value).toMatchObject({
      checked: 2,
      carried: 1,
      reAsk: 1,
      unavailable: 0,
    });
  });

  it("★ a read failure fails the whole run rather than reporting a clean partial sweep", async () => {
    const broken = createConsent({
      store: {
        ...store,
        subjectsDueForRenewal: async () => ({
          ok: false,
          error: { code: "INTERNAL", message: "the read failed" },
        }),
      },
      clock: () => NOW,
      newId: () => `r-${(ids += 1)}` as ConsentRecordId,
      cookieExpiryDays: SECURITY.retention.cookieExpiryDays,
    });

    const run = await broken.sweepRenewals(NOW);

    expect(run.ok).toBe(false);
  });
});
