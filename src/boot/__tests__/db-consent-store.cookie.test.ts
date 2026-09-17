// The cookie half of the consent store (02 §4.1 row 7; 07 §2.9), live under ADR-131 (1): `currentCookie` is a keyed
// read on `visitor_id` / `user_id` under the service role (`cookie_consent_records` has no client SELECT), the
// current choice being the newest row with `superseded_by IS NULL` — the definition 0004 makes structural.
import { describe, expect, it } from "vitest";
import { dbConsentStore } from "../db-consent-store";
import { fakeDataPort } from "./fixtures/fake-data-port";

const cookieRow = (over: Record<string, unknown>) => ({
  id: "ck-1",
  visitor_id: "v-1",
  user_id: null,
  consent_choice: "accept_all",
  analytics_enabled: true,
  marketing_enabled: true,
  ip_address: "203.0.113.9",
  user_agent: "ua",
  expiry_date: "2027-09-17T00:00:00.000Z",
  superseded_by: null,
  created_at: "2026-09-17T00:00:00.000Z",
  ...over,
});

describe("dbConsentStore — cookie_consent_records (read half)", () => {
  it("currentCookie for a visitor is a keyed read on visitor_id under the service role, answering the un-superseded row", async () => {
    const fake = fakeDataPort({
      cookie_consent_records: [
        cookieRow({
          id: "ck-old",
          superseded_by: "ck-1",
          marketing_enabled: false,
        }),
        cookieRow({ id: "ck-1" }),
      ],
    });
    const result = await dbConsentStore(fake.port).currentCookie({
      kind: "visitor",
      id: "v-1" as never,
    });
    expect(result).toEqual({
      ok: true,
      value: {
        id: "ck-1",
        visitorId: "v-1",
        choice: "accept_all",
        analyticsEnabled: true,
        marketingEnabled: true,
        context: { ipAddress: "203.0.113.9", userAgent: "ua" },
        expiryDate: "2027-09-17T00:00:00.000Z",
        createdAt: "2026-09-17T00:00:00.000Z",
      },
    });
    expect(fake.calls).toEqual([
      {
        name: "platform.consent.currentCookie",
        scope: "service",
        uow: undefined,
      },
    ]);
    expect(fake.keyedReads).toEqual([
      { table: "cookie_consent_records", column: "visitor_id", value: "v-1" },
    ]);
  });

  it("currentCookie for a user keys on user_id and carries userId + supersededBy when set", async () => {
    const fake = fakeDataPort({
      cookie_consent_records: [
        cookieRow({ id: "ck-2", user_id: "u-1", superseded_by: null }),
      ],
    });
    const result = await dbConsentStore(fake.port).currentCookie({
      kind: "user",
      id: "u-1" as never,
    });
    expect(result.ok && result.value?.userId).toBe("u-1");
    expect(fake.keyedReads).toEqual([
      { table: "cookie_consent_records", column: "user_id", value: "u-1" },
    ]);
  });

  it("currentCookie answers null when every row for the subject is superseded, or there is none", async () => {
    const fake = fakeDataPort({
      cookie_consent_records: [cookieRow({ superseded_by: "ck-9" })],
    });
    const store = dbConsentStore(fake.port);
    expect(
      await store.currentCookie({ kind: "visitor", id: "v-1" as never }),
    ).toEqual({ ok: true, value: null });
    expect(
      await store.currentCookie({ kind: "visitor", id: "v-none" as never }),
    ).toEqual({ ok: true, value: null });
  });
});
