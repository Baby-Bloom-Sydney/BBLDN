// The consent store over `auth`'s port (02 R-4; 0004): the append-only inserts are session-scope self writes,
// "latest for (user, purpose)" and "current document" are computed over the RLS-bounded rows, every row carries
// its own `purpose` since `0017` (ADR-131 (2)) so a non-document consent round-trips, and the cookie half writes
// through the `record_cookie_consent` definer.
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
  purpose: "client-tos",
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
        purpose: "client-tos",
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
        row({
          id: "other-purpose",
          purpose: "privacy-policy",
          document_id: "privacy-policy",
        }),
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

  // Was "skips a row whose purpose cannot be recovered — fail closed, recorded gap". `0017` closed the gap:
  // the row says what it is for, so a `vaccination-status` consent (ADR-103; 07 §2.7(a)) is evidence again
  // instead of vanishing. Fail-closed was the right answer to a missing column, not a behaviour to keep.
  it("reads back a row with no document pair on its own purpose (ADR-131 (2))", async () => {
    const fake = fakeDataPort({
      consent_records: [
        row({
          purpose: "vaccination-status",
          document_id: null,
          document_version: null,
        }),
      ],
    });
    const latest = await dbConsentStore(fake.port).latestConsent(
      USER as never,
      "vaccination-status",
    );
    expect(latest.ok && latest.value?.purpose).toBe("vaccination-status");
    expect(latest.ok && latest.value?.document).toBeUndefined();
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

describe("dbConsentStore — the cookie half writes through 0017's definer", () => {
  // Was pinned refusing with `cookie-consent-write-not-available`: the new row and the `superseded_by` stamp
  // cannot be two PostgREST statements, and until `record_cookie_consent` existed there was nothing honest to
  // call. The full argument mapping is asserted in `db-0017-stores.test.ts`; this is the seam.
  it("insertCookie goes through record_cookie_consent, under the service role", async () => {
    const fake = fakeDataPort();
    fake.state.rpcAnswer = () => null;

    const result = await dbConsentStore(fake.port).insertCookie({
      id: "c-1",
      visitorId: "v-1",
      choice: "reject_non_essential",
      analyticsEnabled: false,
      marketingEnabled: false,
      context: {},
      expiryDate: "2027-09-17T00:00:00.000Z",
      createdAt: "2026-09-17T00:00:00.000Z",
    } as never);

    expect(result.ok).toBe(true);
    expect(fake.rpcs[0]?.name).toBe("record_cookie_consent");
    expect(fake.calls[0]?.scope).toBe("service");
  });
});
