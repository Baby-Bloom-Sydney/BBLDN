// The consent connector (01 §2.4; 02 R-4 / §4.1; 07 §2.6 / §2.7(a) / §2.9) over the memory store (the stub):
// record + check a purpose incl. `vaccination-status` (ADR-103), document currency, informed actions, the
// biometric notice invariants, cookie consent with supersede + expiry, `hasMarketing` as the only PECR gate.
import { describe, expect, it } from "vitest";
import { SECURITY } from "@/modules/config";
import type {
  ConsentRecordId,
  Instant,
  UserId,
  VisitorId,
} from "@/modules/shared-types";
import {
  CONSENT_PURPOSES,
  configureConsent,
  consent,
  createConsent,
  createLogger,
  memoryConsentStore,
} from "@/modules/platform";
import type { ConsentDeps, LogLine } from "@/modules/platform";

const USER = "00000000-0000-4000-8000-0000000000aa" as UserId;
const VISITOR = "00000000-0000-4000-8000-0000000000cc" as VisitorId;
const T0 = Date.parse("2026-09-15T08:00:00.000Z");
const at = (days: number) =>
  new Date(T0 + days * 86400000).toISOString() as Instant;
const context = { ipAddress: "203.0.113.9", userAgent: "ua", sessionId: "s1" };

function harness(overrides: Partial<ConsentDeps> = {}) {
  const lines: LogLine[] = [];
  const clockState = { now: at(0) };
  const store = memoryConsentStore({
    documents: { "client-tos": { version: 3, requiresReacceptance: false } },
  });
  const idState = { n: 0 };
  const api = createConsent({
    store,
    clock: () => clockState.now,
    newId: () => `c-${(idState.n += 1)}` as ConsentRecordId,
    cookieExpiryDays: SECURITY.retention.cookieExpiryDays,
    log: createLogger({ sink: (line) => void lines.push(line) }),
    ...overrides,
  });
  return { api, store, lines, clockState };
}

describe("platform/consent — purposes", () => {
  it("lists the 02 §4.1 legal-document ids plus vaccination-status (ADR-103), frozen", () => {
    expect(CONSENT_PURPOSES).toContain("vaccination-status");
    expect(CONSENT_PURPOSES).toContain("client-tos");
    expect(CONSENT_PURPOSES).toContain("biometric-notice");
    expect(CONSENT_PURPOSES).toHaveLength(12);
    expect(Object.isFrozen(CONSENT_PURPOSES)).toBe(true);
  });
});

describe("platform/consent — recordConsent + hasConsent", () => {
  it("records a document consent at the current version and reads it back", async () => {
    const { api, store } = harness();
    const recorded = await api.recordConsent({
      userId: USER,
      party: "parent",
      purpose: "client-tos",
      agreementId: "AGR-01",
      checkpointId: "cp-1",
      checkpointText: "I agree",
      document: { id: "client-tos", version: 3 },
      consentGiven: true,
      context,
    });
    expect(recorded.ok).toBe(true);
    if (recorded.ok)
      expect(recorded.value).toMatchObject({
        id: "c-1",
        createdAt: at(0),
        purpose: "client-tos",
        consentGiven: true,
      });
    expect(store.consents).toHaveLength(1);
    const has = await api.hasConsent(USER, "client-tos");
    expect(has).toEqual({ ok: true, value: true });
  });

  it("refuses a stale document version and a document consent without a document", async () => {
    const { api } = harness();
    const stale = await api.recordConsent({
      userId: USER,
      party: "parent",
      purpose: "client-tos",
      agreementId: "AGR-01",
      checkpointId: "cp",
      checkpointText: "t",
      document: { id: "client-tos", version: 2 },
      consentGiven: true,
      context,
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok)
      expect(stale.error.details).toEqual({ reason: "document-not-current" });

    // the type forbids this shape; the runtime check is for callers that arrive through JSON
    const missing = await api.recordConsent({
      userId: USER,
      party: "parent",
      purpose: "privacy-policy",
      agreementId: "AGR-02",
      checkpointId: "cp",
      checkpointText: "t",
      consentGiven: true,
      context,
    } as never);
    expect(missing.ok).toBe(false);
    if (!missing.ok)
      expect(missing.error.details).toEqual({ reason: "document-required" });
  });

  it("vaccination-status is its own purpose with no document; a decline is a new row and hasConsent follows the latest", async () => {
    const { api, store, clockState } = harness();
    const tick = await api.recordConsent({
      userId: USER,
      party: "nanny",
      purpose: "vaccination-status",
      agreementId: "AGR-20",
      checkpointId: "vaccination-tick",
      checkpointText: "I consent to my vaccination status being recorded",
      consentGiven: true,
      context,
    });
    expect(tick.ok).toBe(true);
    expect(await api.hasConsent(USER, "vaccination-status")).toEqual({
      ok: true,
      value: true,
    });

    clockState.now = at(1);
    const withdraw = await api.recordConsent({
      userId: USER,
      party: "nanny",
      purpose: "vaccination-status",
      agreementId: "AGR-20",
      checkpointId: "vaccination-tick",
      checkpointText: "withdrawn",
      consentGiven: false,
      context,
    });
    expect(withdraw.ok).toBe(true);
    expect(store.consents).toHaveLength(2);
    expect(await api.hasConsent(USER, "vaccination-status")).toEqual({
      ok: true,
      value: false,
    });
    expect(await api.hasConsent(USER, "media-consent")).toEqual({
      ok: true,
      value: false,
    });
  });

  it("rejects an unknown purpose at the boundary", async () => {
    const { api } = harness();
    const result = await api.recordConsent({
      userId: USER,
      party: "parent",
      purpose: "loyalty-card" as never,
      agreementId: "AGR-99",
      checkpointId: "cp",
      checkpointText: "t",
      consentGiven: true,
      context,
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.details).toEqual({ reason: "unknown-purpose" });
  });

  it("recordInformedAction is a fairness record: always consentGiven, document optional (07 §2.8)", async () => {
    const { api } = harness();
    const result = await api.recordInformedAction({
      userId: USER,
      party: "parent",
      purpose: "parent-app-consent",
      agreementId: "AGR-14",
      checkpointId: "child-add",
      checkpointText: "t",
      context,
      relatedEntityId: "00000000-0000-4000-8000-0000000000dd" as never,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.consentGiven).toBe(true);
      expect(result.value.document).toBeUndefined();
    }
  });

  it("getPolicy returns the current document (or none for vaccination-status)", async () => {
    const { api } = harness();
    expect(await api.getPolicy("client-tos")).toEqual({
      ok: true,
      value: {
        purpose: "client-tos",
        currentDocument: {
          id: "client-tos",
          version: 3,
          requiresReacceptance: false,
        },
      },
    });
    expect(await api.getPolicy("vaccination-status")).toEqual({
      ok: true,
      value: { purpose: "vaccination-status" },
    });
    const unknown = await api.getPolicy("nope" as never);
    expect(unknown.ok).toBe(false);
  });
});

describe("platform/consent — recordBiometricConsent (AGR-04; 02 §4.1 invariants)", () => {
  const valid = {
    userId: USER,
    noticeVersion: 1,
    noticeOpenedAt: at(0),
    noticeScrollCompletedAt: at(0.001),
    checkboxesEnabledAt: at(0.001),
    noticeTimeSpentSeconds: 90,
    checkboxTimestamps: { understand: at(0.002) },
    aiProviderDisclosed: "provider-from-config",
    processingLocationDisclosed: "location-from-config",
  };

  it("records the notice evidence", async () => {
    const { api, store } = harness();
    const result = await api.recordBiometricConsent(valid);
    expect(result.ok).toBe(true);
    expect(store.biometrics).toHaveLength(1);
  });

  it("refuses scroll-complete before open (scroll ≥ opened)", async () => {
    const { api } = harness();
    const result = await api.recordBiometricConsent({
      ...valid,
      noticeScrollCompletedAt: at(-1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.details).toEqual({ reason: "scroll-before-open" });
  });

  it("re-consent on the same version is a CONFLICT (UNIQUE user, version)", async () => {
    const { api } = harness();
    await api.recordBiometricConsent(valid);
    const again = await api.recordBiometricConsent(valid);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("CONFLICT");
  });
});

describe("platform/consent — cookie consent + hasMarketing (PECR; 07 §2.9; 03 §10.3)", () => {
  const choice = {
    visitorId: VISITOR,
    choice: "custom" as const,
    analyticsEnabled: true,
    marketingEnabled: false,
    context,
  };

  it("records a choice with the config expiry and reads marketing off it — false by default", async () => {
    const { api } = harness();
    expect(await api.hasMarketing({ kind: "visitor", id: VISITOR })).toEqual({
      ok: true,
      value: false,
    });
    const first = await api.recordCookieConsent(choice);
    expect(first.ok).toBe(true);
    if (first.ok)
      expect(first.value.expiryDate).toBe(
        at(SECURITY.retention.cookieExpiryDays),
      );
    expect(await api.hasMarketing({ kind: "visitor", id: VISITOR })).toEqual({
      ok: true,
      value: false,
    });
  });

  it("a change inserts a new row and supersedes the old; the newest wins; a user id reads too", async () => {
    const { api, store } = harness();
    await api.recordCookieConsent(choice);
    const second = await api.recordCookieConsent({
      ...choice,
      userId: USER,
      choice: "accept_all",
      marketingEnabled: true,
    });
    expect(second.ok).toBe(true);
    expect(store.cookies).toHaveLength(2);
    expect(store.cookies[0]?.supersededBy).toBe(store.cookies[1]?.id);
    expect(await api.hasMarketing({ kind: "visitor", id: VISITOR })).toEqual({
      ok: true,
      value: true,
    });
    expect(await api.hasMarketing({ kind: "user", id: USER })).toEqual({
      ok: true,
      value: true,
    });
  });

  it("an expired record reads as no marketing consent", async () => {
    const { api, clockState } = harness();
    await api.recordCookieConsent({ ...choice, marketingEnabled: true });
    clockState.now = at(SECURITY.retention.cookieExpiryDays + 1);
    expect(await api.hasMarketing({ kind: "visitor", id: VISITOR })).toEqual({
      ok: true,
      value: false,
    });
  });

  it("emits consent.updated through the injected hook; a failed hook is logged warn, the record stands", async () => {
    const seen: unknown[] = [];
    const { api } = harness({
      onCookieConsent: async (record) => {
        seen.push(record.marketingEnabled);
        return { ok: true, value: undefined };
      },
    });
    await api.recordCookieConsent({ ...choice, marketingEnabled: true });
    expect(seen).toEqual([true]);

    const failing = harness({
      onCookieConsent: async () => ({
        ok: false,
        error: { code: "INTERNAL", message: "sink down" },
      }),
    });
    const result = await failing.api.recordCookieConsent(choice);
    expect(result.ok).toBe(true);
    expect(
      failing.lines.some(
        (line) =>
          line.level === "warn" && line.alert === "ALERT_EVENT_SINK_FAILED",
      ),
    ).toBe(true);
    expect(JSON.stringify(failing.lines)).not.toContain("203.0.113.9");
  });
});

describe("platform/consent — the module-level connector", () => {
  it("fails closed (INTERNAL, consent-not-configured) until configured, then delegates", async () => {
    const before = await consent.hasMarketing({ kind: "visitor", id: VISITOR });
    expect(before.ok).toBe(false);
    if (!before.ok)
      expect(before.error.details).toEqual({
        reason: "consent-not-configured",
      });
    const { api } = harness();
    configureConsent(api);
    expect(
      await consent.hasMarketing({ kind: "visitor", id: VISITOR }),
    ).toEqual({ ok: true, value: false });
  });
});
