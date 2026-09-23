// `int.rpc-0020` — the functional suite over what `0020` changes (ADR-146): `apply_payment_event()`'s fourth
// outcome, and `parent_leads.email`.
//
// Same discipline as `rpc-0019` / `rpc-0019-app`: every test **invokes** the thing it is about. S5b's lesson on
// `0017` was that 151 metadata assertions passed over a function that could not insert a row, so `0020`'s own
// verify block stops at metadata deliberately and the claims live here. Everything runs inside one transaction
// that is rolled back.
//
// The three outcomes `0019` already had are `rpc-0019-app`'s and are not re-asserted; what is asserted here is
// the **line between them and the new one** — a delivery with no patch is `ignored` and stamped processed, a
// patch that cannot be applied is still `unresolved` and still on the runbook's unprocessed index.
import type { Client } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { connect } from "./db-client";
import { asRole, refusedAs, seedFixtures, type Fixtures } from "./rls-fixtures";

let db: Client;
let fx: Fixtures;

beforeAll(async () => {
  db = await connect();
});
afterAll(async () => {
  await db?.end();
});

beforeEach(async () => {
  await db.query("begin");
  fx = await seedFixtures(db);
});
afterEach(async () => {
  await db.query("rollback");
});

// --------------------------------------------------------------------------- apply_payment_event: `ignored`

describe("int.rpc-0020 — apply_payment_event's fourth outcome (ADR-146 (1))", () => {
  const EVENT_ID = "evt_test_0020";

  beforeEach(async () => {
    await db.query(
      `insert into public.parent_subscriptions (parent_user_id, status) values ($1, 'lapsed')`,
      [fx.parentA],
    );
  });

  const apply = async (
    over: {
      readonly eventId?: string;
      readonly eventType?: string;
      readonly parentUserId?: string | null;
      readonly patch?: Record<string, unknown> | null;
      readonly accessAgeYears?: number | null;
    } = {},
  ): Promise<Record<string, unknown>> => {
    const { rows } = await db.query<{ result: Record<string, unknown> }>(
      `select public.apply_payment_event(
         p_provider          => 'stripe',
         p_provider_event_id => $1,
         p_event_type        => $2,
         p_payload           => '{"id":"evt"}'::jsonb,
         p_received_at       => now(),
         p_parent_user_id    => $3,
         p_spine_patch       => $4::jsonb,
         p_access_age_years  => $5) as result`,
      [
        over.eventId ?? EVENT_ID,
        over.eventType ?? "payout.paid",
        over.parentUserId === undefined ? null : over.parentUserId,
        over.patch === undefined || over.patch === null
          ? null
          : JSON.stringify(over.patch),
        over.accessAgeYears ?? null,
      ],
    );
    return rows[0].result;
  };

  const ledger = async (eventId = EVENT_ID) => {
    const { rows } = await db.query<{
      processed_at: Date | null;
      processing_error: string | null;
      parent_user_id: string | null;
      event_type: string;
    }>(
      `select processed_at, processing_error, parent_user_id, event_type
         from public.payment_events where provider_event_id = $1`,
      [eventId],
    );
    return rows[0];
  };

  const spineStatus = async (): Promise<string> => {
    const { rows } = await db.query<{ status: string }>(
      `select status from public.parent_subscriptions where parent_user_id = $1`,
      [fx.parentA],
    );
    return rows[0].status;
  };

  it("a delivery we cannot place is `ignored` — recorded, stamped processed, no error", async () => {
    const result = await apply();

    expect(result["outcome"]).toBe("ignored");
    expect(result["event_id"]).not.toBeNull();
    const row = await ledger();
    expect(row.processed_at).not.toBeNull();
    expect(row.processing_error).toBeNull();
    expect(row.parent_user_id).toBeNull();
  });

  it("a delivery we CAN place but do not act on is `ignored` too, and keeps the family", async () => {
    const result = await apply({ parentUserId: fx.parentA });

    expect(result["outcome"]).toBe("ignored");
    const row = await ledger();
    expect(row.processed_at).not.toBeNull();
    expect(row.processing_error).toBeNull();
    expect(row.parent_user_id).toBe(fx.parentA);
    expect(await spineStatus()).toBe("lapsed");
  });

  it("an ignored delivery is off the runbook's unprocessed queue, which is the whole point", async () => {
    // `payment_events_unprocessed_idx` (0010 §2) is what 06 reconciles from. Before ADR-146 every event type we
    // do not act on joined it for ever, because the only answer for a null family stamped `processing_error`.
    await apply();
    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n from public.payment_events
        where processed_at is null and provider_event_id = $1`,
      [EVENT_ID],
    );
    expect(rows[0].n).toBe("0");
  });

  it("a patch with no family is still `unresolved`, unstamped, and keeps its error", async () => {
    // The narrowing, measured: `unresolved` now means "work that could not be done", not "nothing to do".
    const result = await apply({ patch: { status: "cancelled" } });

    expect(result["outcome"]).toBe("unresolved");
    const row = await ledger();
    expect(row.processed_at).toBeNull();
    expect(row.processing_error).toBe("E_EVENT_UNRESOLVED");
    expect(await spineStatus()).toBe("lapsed");
  });

  it("a patch whose family has no spine row is still `unresolved` — I-M1 is untouched", async () => {
    const result = await apply({
      parentUserId: fx.parentB,
      patch: { status: "paid_in_full" },
    });

    expect(result["outcome"]).toBe("unresolved");
    const row = await ledger();
    expect(row.processed_at).toBeNull();
    expect(row.processing_error).toBe("E_SPINE_MISSING");
    expect(row.parent_user_id).toBe(fx.parentB);
  });

  it("a patch, a family and a spine row is `applied` — the money path is unchanged", async () => {
    const result = await apply({
      parentUserId: fx.parentA,
      patch: { status: "paid_in_full", plan_shape: "upfront" },
    });

    expect(result["outcome"]).toBe("applied");
    expect(await spineStatus()).toBe("paid_in_full");
    expect((await ledger()).processed_at).not.toBeNull();
  });

  it("a replay of an ignored delivery is a duplicate, not a second ledger row", async () => {
    await apply();
    const replay = await apply();

    expect(replay["outcome"]).toBe("duplicate");
    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n from public.payment_events where provider_event_id = $1`,
      [EVENT_ID],
    );
    expect(rows[0].n).toBe("1");
  });

  it("no client role can execute it — the grant `0019` set is what `create or replace` must not have widened", async () => {
    for (const actor of [fx.parentA, fx.admin, null]) {
      expect(
        await refusedAs(
          db,
          actor,
          `select public.apply_payment_event('stripe', 'evt_x', 't', '{}'::jsonb, now())`,
        ),
      ).toBe("42501");
    }
  });
});

// --------------------------------------------------------------------------- parent_leads.email

describe("int.rpc-0020 — parent_leads.email (ADR-146 (2))", () => {
  const LEAD = "aaaaaaaa-0000-4000-8000-00000000beef";

  const insertLead = async (email: string | null): Promise<void> => {
    await db.query(
      `insert into public.parent_leads (id, form_data, email) values ($1, '{}'::jsonb, $2)`,
      [LEAD, email],
    );
  };

  it("holds a captured address, and a wizard-only lead holds none", async () => {
    await insertLead("ada@example.test");
    await db.query(
      `insert into public.parent_leads (id, form_data) values ($1, '{}'::jsonb)`,
      ["bbbbbbbb-0000-4000-8000-00000000beef"],
    );
    const { rows } = await db.query<{ id: string; email: string | null }>(
      `select id, email from public.parent_leads order by email nulls last`,
    );
    expect(rows.map((row) => row.email)).toEqual(["ada@example.test", null]);
  });

  it("compares case-insensitively without anyone folding the case — the column is citext", async () => {
    // This is what ADR-145 (2)'s "equals the signup email case-insensitively" rests on. The store folds what it
    // writes, but the comparison must not depend on that having happened: a row written any other way still
    // answers the same question the same way.
    await insertLead("ADA@Example.TEST");
    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n from public.parent_leads where email = $1`,
      ["ada@example.test"],
    );
    expect(rows[0].n).toBe("1");
  });

  it("does not make a lead's address unique — two families may share one", async () => {
    // `nanny_leads.email` is `unique` and this deliberately is not: two parents can drop the signup form from
    // the same household address, and a unique here would refuse the second lead rather than hold it (ADR-041).
    await insertLead("shared@example.test");
    await db.query(
      `insert into public.parent_leads (id, form_data, email) values ($1, '{}'::jsonb, $2)`,
      ["cccccccc-0000-4000-8000-00000000beef", "shared@example.test"],
    );
    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n from public.parent_leads where email = $1`,
      ["shared@example.test"],
    );
    expect(rows[0].n).toBe("2");
  });

  it("is unreadable by every client role — 07 §5.2's last row survives the new column", async () => {
    // The lead table has no policy at all, so an authenticated parent saw nothing — not her own row, not
    // anyone's. A new column carrying a contact is exactly the kind that invites a first policy.
    // `0036` went one better: a table with no SELECT policy for any client role has no business holding
    // a SELECT grant either, so the read is now refused outright rather than answered with an empty set.
    await insertLead("ada@example.test");
    for (const actor of [fx.parentA, fx.admin, null]) {
      expect(await refusedAs(db, actor, `select email from public.parent_leads`)).toBe("42501");
    }
  });
});
