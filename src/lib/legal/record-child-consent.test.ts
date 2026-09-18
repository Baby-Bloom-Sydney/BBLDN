// Bundled per-child consent (FATE `10.16`) and the shared writer under it (L-009 `3g`).
//
// The claims worth driving are the ones the Sydney writer got wrong: the row must carry the **whole** document
// triple, a decline must be a row rather than an absence, the consent must be scoped to the child, and the
// parent's and the nanny's must be two different agreements against two different documents.
import { beforeEach, describe, expect, it } from "vitest";
import { SECURITY } from "@/modules/config";
import {
  configureConsent,
  createConsent,
  memoryConsentStore,
} from "@/modules/platform";
import type { MemoryConsentStore } from "@/modules/platform";
import type { UserId, Uuid } from "@/modules/shared-types";
import { purposeForAgreement } from "./purpose-for-agreement";
import { recordChildConsent } from "./record-child-consent";

const PARENT = "11111111-1111-4111-8111-111111111111" as UserId;
const NANNY = "22222222-2222-4222-8222-222222222222" as UserId;
const CHILD = "33333333-3333-4333-8333-333333333333" as Uuid;

let store: MemoryConsentStore;

function install(options: Parameters<typeof memoryConsentStore>[0] = {}) {
  store = memoryConsentStore(options);
  configureConsent(
    createConsent({
      store,
      cookieExpiryDays: SECURITY.retention.cookieExpiryDays,
    }),
  );
}

beforeEach(() => install());

describe("recordChildConsent — the row it writes", () => {
  it("★ names the whole triple, not a version — the Sydney writer named two thirds and was refused", async () => {
    const recorded = await recordChildConsent({
      userId: PARENT,
      childId: CHILD,
      agreementId: "PARENT-APP-CONSENT",
      checkpointId: "bundled_child_consent",
      checkpointText: "I agree to Baby Bloom holding a record for this child.",
      consentGiven: true,
    });

    expect(recorded.ok).toBe(true);
    expect(store.consents).toHaveLength(1);
    expect(store.consents[0].document).toEqual({
      id: "parent-app-consent",
      version: 1,
      contentHash: "stub-hash-v1",
    });
  });

  it("★ scopes the consent to the child, which is what makes it per-child at all", async () => {
    await recordChildConsent({
      userId: PARENT,
      childId: CHILD,
      agreementId: "PARENT-APP-CONSENT",
      checkpointId: "bundled_child_consent",
      checkpointText: "…",
      consentGiven: true,
    });

    expect(store.consents[0].relatedEntityId).toBe(CHILD);
  });

  it("keeps the checkpoint text verbatim — the evidence must read as she saw it", async () => {
    const text = "I agree that photographs of my child may be stored.";
    await recordChildConsent({
      userId: PARENT,
      childId: CHILD,
      agreementId: "PARENT-APP-CONSENT",
      checkpointId: "bundled_child_consent",
      checkpointText: text,
      consentGiven: true,
    });

    expect(store.consents[0].checkpointText).toBe(text);
  });

  it("★ a decline is a NEW row with `false`, not a deletion — withdrawal is evidence too", async () => {
    await recordChildConsent({
      userId: PARENT,
      childId: CHILD,
      agreementId: "PARENT-APP-CONSENT",
      checkpointId: "bundled_child_consent",
      checkpointText: "…",
      consentGiven: true,
    });
    await recordChildConsent({
      userId: PARENT,
      childId: CHILD,
      agreementId: "PARENT-APP-CONSENT",
      checkpointId: "bundled_child_consent_withdrawn",
      checkpointText: "I withdraw my consent.",
      consentGiven: false,
    });

    expect(store.consents.map((row) => row.consentGiven)).toEqual([
      true,
      false,
    ]);
  });
});

describe("recordChildConsent — the two parties are two agreements", () => {
  it("the parent's is AGR-15 against parent-app-consent", async () => {
    await recordChildConsent({
      userId: PARENT,
      childId: CHILD,
      agreementId: "PARENT-APP-CONSENT",
      checkpointId: "bundled_child_consent",
      checkpointText: "…",
      consentGiven: true,
    });

    expect(store.consents[0]).toMatchObject({
      agreementId: "AGR-15",
      purpose: "parent-app-consent",
      party: "parent",
    });
  });

  it("the nanny's is AGR-16 against nanny-attestation, and she consents as a nanny", async () => {
    await recordChildConsent({
      userId: NANNY,
      childId: CHILD,
      agreementId: "NANNY-ATTESTATION",
      checkpointId: "bundled_child_attestation",
      checkpointText: "…",
      consentGiven: true,
    });

    expect(store.consents[0]).toMatchObject({
      agreementId: "AGR-16",
      purpose: "nanny-attestation",
      party: "nanny",
    });
  });
});

describe("recordChildConsent — it refuses rather than recording a consent to nothing", () => {
  it("★ refuses when the document has no current version, instead of writing a row with no document", async () => {
    // The seed is what makes a document exist (`0026`); a missing one is an outage, and a consent recorded
    // against nothing is evidence of nothing.
    const missing = memoryConsentStore();
    configureConsent(
      createConsent({
        store: {
          ...missing,
          currentDocument: async () => ({ ok: true, value: null }),
        },
        cookieExpiryDays: SECURITY.retention.cookieExpiryDays,
      }),
    );

    const recorded = await recordChildConsent({
      userId: PARENT,
      childId: CHILD,
      agreementId: "PARENT-APP-CONSENT",
      checkpointId: "bundled_child_consent",
      checkpointText: "…",
      consentGiven: true,
    });

    expect(recorded.ok).toBe(false);
    expect(missing.consents).toHaveLength(0);
  });
});

describe("purposeForAgreement — the translation table", () => {
  it("★ AGR-03 maps to nothing, because the client biometric notice does not exist (ADR-071)", () => {
    expect(purposeForAgreement("AGR-03")).toBeNull();
  });

  it("every other agreement names a document", () => {
    const ids = [
      "AGR-01",
      "AGR-02",
      "AGR-04",
      "AGR-05",
      "AGR-06",
      "AGR-07",
      "AGR-08",
      "AGR-09",
      "AGR-10",
      "AGR-11",
      "AGR-12",
      "AGR-13",
      "AGR-14",
      "PARENT-APP-CONSENT",
      "NANNY-ATTESTATION",
    ] as const;
    for (const id of ids) {
      expect(purposeForAgreement(id), id).not.toBeNull();
    }
  });

  it("★ every agreement id it hands the connector has 02 §4.1's `AGR-nn` shape", () => {
    const ids = ["PARENT-APP-CONSENT", "NANNY-ATTESTATION"] as const;
    for (const id of ids) {
      expect(purposeForAgreement(id)?.agreementId).toMatch(/^AGR-\d{2}$/);
    }
  });
});
