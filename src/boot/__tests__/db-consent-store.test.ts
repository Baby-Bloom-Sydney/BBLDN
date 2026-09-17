// The consent store over `auth`'s port (02 R-4; 0004): the append-only inserts are session-scope self writes,
// "latest for (user, purpose)" and "current document" are computed over the RLS-bounded rows, a row whose
// purpose cannot be recovered (no document pair) is skipped — fail closed — and the cookie half refuses.
import { describe, expect, it } from "vitest";
import type { ConsentRecord } from "@/modules/platform";
import type { UnitOfWork } from "@/modules/shared-types";
import { dbConsentStore } from "../db-consent-store";
import { fakeDataPort } from "./fixtures/fake-data-port";

const USER = "11111111-1111-4111-8111-111111111111";
const row = (over: Record<string, unknown>) => ({
  id: "c-1",
  user_id: USER,
  party: "parent",
  agreement_id: "AGR-01",
  checkpoint_id: "signup",
  checkpoint_text: "I agree",
  document_id: "client-tos",
  document_version: 1,
  consent_given: true,
  ip_address: "203.0.113.9",
  user_agent: "ua",
  session_id: "s-1",
  related_entity_id: null,
  created_at: "2026-09-01T00:00:00.000Z",
  ...over,
});

const record = (): ConsentRecord => ({
  id: "c-9" as never,
  userId: USER as never,
  party: "parent",
  agreementId: "AGR-01",
  checkpointId: "signup",
  checkpointText: "I agree",
  context: { ipAddress: "203.0.113.9" },
  purpose: "client-tos",
  document: { id: "client-tos", version: 1 },
  consentGiven: true,
  createdAt: "2026-09-17T00:00:00.000Z" as never,
});

describe("dbConsentStore — consent_records", () => {
  it("inserts one row in session scope with the document pair, and joins a unit of work when given one", async () => {
    const fake = fakeDataPort();
    const uow = {} as UnitOfWork;
    const result = await dbConsentStore(fake.port).insertConsent(record(), {
      uow,
    });
    expect(result).toEqual({ ok: true, value: undefined });
    expect(fake.calls).toEqual([
      { name: "platform.consent.insertConsent", scope: "session", uow },
    ]);
    expect(fake.inserted[0]).toEqual({
      table: "consent_records",
      row: {
        id: "c-9",
        user_id: USER,
        party: "parent",
        agreement_id: "AGR-01",
        checkpoint_id: "signup",
        checkpoint_text: "I agree",
        document_id: "client-tos",
        document_version: 1,
        consent_given: true,
        ip_address: "203.0.113.9",
        user_agent: null,
        session_id: null,
        related_entity_id: null,
        created_at: "2026-09-17T00:00:00.000Z",
      },
    });
  });

  it("answers the newest row for (user, purpose) and ignores other users, other purposes and a decline's elders", async () => {
    const fake = fakeDataPort({
      consent_records: [
        row({ id: "old", created_at: "2026-09-01T00:00:00.000Z" }),
        row({
          id: "new",
          consent_given: false,
          created_at: "2026-09-02T00:00:00.000Z",
        }),
        row({ id: "other-purpose", document_id: "privacy-policy" }),
        row({
          id: "other-user",
          user_id: "22222222-2222-4222-8222-222222222222",
        }),
      ],
    });
    const latest = await dbConsentStore(fake.port).latestConsent(
      USER as never,
      "client-tos",
    );
    expect(latest.ok && latest.value?.id).toBe("new");
    expect(latest.ok && latest.value?.consentGiven).toBe(false);
    expect(latest.ok && latest.value?.context).toEqual({
      ipAddress: "203.0.113.9",
      userAgent: "ua",
      sessionId: "s-1",
    });
  });

  it("skips a row whose purpose cannot be recovered (no document pair) — fail closed, recorded gap", async () => {
    const fake = fakeDataPort({
      consent_records: [row({ document_id: null, document_version: null })],
    });
    const latest = await dbConsentStore(fake.port).latestConsent(
      USER as never,
      "vaccination-status",
    );
    expect(latest).toEqual({ ok: true, value: null });
  });
});

describe("dbConsentStore — legal_documents", () => {
  const doc = (over: Record<string, unknown>) => ({
    document_id: "privacy-policy",
    version: 1,
    effective_date: "2026-01-01",
    body_md: "x",
    content_hash: "h",
    change_summary: null,
    requires_reacceptance: false,
    reacceptance_deadline: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...over,
  });

  it("answers the highest version, with its re-acceptance deadline when the row carries one", async () => {
    const fake = fakeDataPort({
      legal_documents: [
        doc({ version: 1 }),
        doc({
          version: 2,
          requires_reacceptance: true,
          reacceptance_deadline: "2026-10-01",
        }),
        doc({ document_id: "client-tos", version: 7 }),
      ],
    });
    const current = await dbConsentStore(fake.port).currentDocument(
      "privacy-policy",
    );
    expect(current).toEqual({
      ok: true,
      value: {
        id: "privacy-policy",
        version: 2,
        requiresReacceptance: true,
        reacceptanceDeadline: "2026-10-01T00:00:00.000Z",
      },
    });
  });

  it("answers null for a document with no row", async () => {
    const fake = fakeDataPort({ legal_documents: [] });
    const current = await dbConsentStore(fake.port).currentDocument(
      "client-tos",
    );
    expect(current).toEqual({ ok: true, value: null });
  });
});

describe("dbConsentStore — the cookie half fails closed", () => {
  it("refuses insertCookie and currentCookie with their own reason and never reaches the port", async () => {
    const fake = fakeDataPort();
    const store = dbConsentStore(fake.port);
    const inserted = await store.insertCookie({} as never);
    const current = await store.currentCookie({
      kind: "visitor",
      id: "v" as never,
    });
    expect(!inserted.ok && inserted.error.details?.reason).toBe(
      "cookie-consent-not-available",
    );
    expect(!current.ok && current.error.details?.reason).toBe(
      "cookie-consent-not-available",
    );
    expect(fake.calls).toEqual([]);
  });
});
