// The three adapters `0017` made possible, against the `DataAccessPort` seam (05 §4.3) — no network, no driver.
//
// Each of these is a claim the merge rests on, so each ships as a test: the limiter counts into the shared
// bucket through one RPC, the signup pair is minted for the session (never for an id a caller passes), and a
// cookie choice supersedes the previous row in one transaction. The scope on each call is asserted because the
// scope *is* the security boundary here — a service-role read where a session read belongs is 07 §5.1 rule 5's
// whole subject, and it is invisible without this assertion.
import { describe, expect, it } from "vitest";
import { LOCALE } from "@/modules/config";
import { dbParentProfileStore } from "../db-parent-profile-store";
import { dbRateLimitStore } from "../db-rate-limit-store";
import { dbConsentStore } from "../db-consent-store";
import { fakeDataPort } from "./fixtures/fake-data-port";
import type {
  ConsentRecordId,
  E164,
  Instant,
  UserId,
  VisitorId,
} from "@/modules/shared-types";
import type { CookieConsentRecord } from "@/modules/platform";

const NOW = "2026-09-17T11:17:00.000Z" as Instant;
/** L4: the dialling prefix is `config`'s, never a literal, even in a fixture. */
const MOBILE = `${LOCALE.phonePrefix}7700900123` as E164;

describe("dbRateLimitStore — one shared bucket, one statement (07 §8; ADR-131 (3))", () => {
  it("increments through consume_rate_limit and returns the window the database decided", async () => {
    const fake = fakeDataPort();
    fake.state.rpcAnswer = () => [
      { count: 3, reset_at: "2026-09-17T11:18:00.000Z" },
    ];
    const store = dbRateLimitStore(fake.port);

    const result = await store.increment("ip:9f2a", 60, NOW);

    expect(result).toEqual({
      ok: true,
      value: { count: 3, resetAt: "2026-09-17T11:18:00.000Z" },
    });
    // one RPC — never a read then a write, which undercounts under exactly the concurrency a limiter is for
    expect(fake.rpcs).toEqual([
      {
        name: "consume_rate_limit",
        args: { p_bucket: "ip:9f2a", p_window_seconds: 60, p_now: NOW },
      },
    ]);
    expect(fake.calls[0]?.scope).toBe("service");
    expect(fake.inserted).toEqual([]);
    expect(fake.updated).toEqual([]);
  });

  it("fails rather than inventing a window when the function answers no row", async () => {
    const fake = fakeDataPort();
    fake.state.rpcAnswer = () => [];
    const result = await dbRateLimitStore(fake.port).increment("k", 60, NOW);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.details?.reason).toBe(
      "rate-limit-store-empty",
    );
  });
});

describe("dbParentProfileStore — the signup pair (02 §4.1; L-007 1c)", () => {
  it("mints the profile through create_parent_profile, under the caller's own session", async () => {
    const fake = fakeDataPort();
    const result = await dbParentProfileStore(fake.port).create({
      userId: "u-1" as UserId,
      firstName: "Ada",
      lastName: "Lovelace",
      mobile: MOBILE,
    });

    expect(result.ok).toBe(true);
    expect(fake.rpcs).toEqual([
      {
        name: "create_parent_profile",
        args: {
          p_first_name: "Ada",
          p_last_name: "Lovelace",
          p_mobile: MOBILE,
        },
      },
    ]);
    // session scope, and no user id in the arguments: the function mints for auth.uid(), so a caller
    // cannot point it at anyone else. A service-role call here would mean "no session" and be refused.
    expect(fake.calls[0]?.scope).toBe("session");
    expect(JSON.stringify(fake.rpcs)).not.toContain("user_id");
  });

  it("carries a port failure back as a Result, never a throw (01 §4a)", async () => {
    const fake = fakeDataPort();
    fake.state.failWith = {
      code: "INTERNAL",
      message: "unreachable",
      details: { reason: "driver" },
    };
    const result = await dbParentProfileStore(fake.port).create({
      userId: "u-1" as UserId,
      firstName: "Ada",
      lastName: "Lovelace",
      mobile: MOBILE,
    });
    expect(result.ok).toBe(false);
  });
});

describe("dbConsentStore.insertCookie — the supersede is one transaction (02 §4.1 row 7; ADR-127)", () => {
  const record: CookieConsentRecord = Object.freeze({
    id: "c-2" as ConsentRecordId,
    visitorId: "v-1" as VisitorId,
    choice: "custom",
    analyticsEnabled: true,
    marketingEnabled: false,
    context: Object.freeze({ userAgent: "a-browser" }),
    expiryDate: "2027-09-17T11:17:00.000Z" as Instant,
    createdAt: NOW,
  });

  it("calls record_cookie_consent under the service role and reports the row it superseded", async () => {
    const fake = fakeDataPort();
    fake.state.rpcAnswer = () => "c-1";

    const result = await dbConsentStore(fake.port).insertCookie(record);

    expect(result).toEqual({ ok: true, value: { supersededId: "c-1" } });
    expect(fake.rpcs[0]?.name).toBe("record_cookie_consent");
    // 07 §5.1 rule 5: `cookie_consent_records` has no client policy, so this is a named service-role use
    expect(fake.calls[0]?.scope).toBe("service");
    // the absent optional arguments are omitted, not sent as null (0017 gives them DEFAULT null)
    expect(fake.rpcs[0]?.args).toEqual({
      p_id: "c-2",
      p_visitor_id: "v-1",
      p_choice: "custom",
      p_analytics: true,
      p_marketing: false,
      p_expiry_date: "2027-09-17T11:17:00.000Z",
      p_created_at: NOW,
      p_user_agent: "a-browser",
    });
  });

  it("reports no supersededId when the visitor had no current row", async () => {
    const fake = fakeDataPort();
    fake.state.rpcAnswer = () => null;
    const result = await dbConsentStore(fake.port).insertCookie(record);
    expect(result).toEqual({ ok: true, value: {} });
  });
});

describe("consent purpose round-trips since 0017 (ADR-131 (2); 07 §2.7(a))", () => {
  it("reads back a vaccination-status row that carries no document — the very row that used to vanish", async () => {
    const fake = fakeDataPort({
      consent_records: [
        {
          id: "r-1",
          user_id: "u-1",
          party: "nanny",
          agreement_id: "AGR-04",
          checkpoint_id: "cp-1",
          checkpoint_text: "I agree to share my vaccination status",
          purpose: "vaccination-status",
          document_id: null,
          document_version: null,
          consent_given: true,
          ip_address: null,
          user_agent: null,
          session_id: null,
          related_entity_id: null,
          created_at: NOW,
        },
      ],
    });

    const latest = await dbConsentStore(fake.port).latestConsent(
      "u-1" as UserId,
      "vaccination-status",
    );

    expect(latest.ok).toBe(true);
    expect(latest.ok && latest.value?.purpose).toBe("vaccination-status");
    expect(latest.ok && latest.value?.consentGiven).toBe(true);
    expect(latest.ok && latest.value?.document).toBeUndefined();
    // and the read is keyed, not a scan of the whole consent log
    expect(fake.keyedReads[0]).toEqual({
      table: "consent_records",
      column: "user_id",
      value: "u-1",
    });
  });
});
