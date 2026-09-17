// `int.rpc-0019` (part two) — the functional suite over the three definers `0019` adds for `app` and
// `payments`, and over `children.created_by_user_id` with `user_has_child_access()`'s fourth arm.
//
// The stage-model writes (`upsert_position` / `upsert_connection` / `upsert_placement`) are in
// `rpc-0019.test.ts` beside this file. One migration, two suites, split by subject.
//
// Same discipline as its sibling: every test **invokes** the thing it is about. S5b's lesson on `0017` was
// that 151 metadata assertions passed over a function that could not insert a row, so `0019`'s own verify
// block stops at metadata deliberately and the claims live here. Everything runs inside one transaction
// that is rolled back.
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

/** Runs `fn` and returns the raised message, or `NO_ERROR`. Savepoints so the fixture survives. */
const refusalOf = async (fn: () => Promise<unknown>): Promise<string> => {
  await db.query("savepoint rpc_probe");
  try {
    await fn();
    await db.query("rollback to savepoint rpc_probe");
    return "NO_ERROR";
  } catch (error) {
    await db.query("rollback to savepoint rpc_probe");
    return (error as { message?: string }).message ?? "UNKNOWN";
  }
};

/** A nanny adds an unclaimed child, the way 0012's `children_nanny_insert` policy lets her. */
const addUnclaimedChild = async (nannyUserId: string): Promise<string> => {
  const name = `client-${Math.random().toString(36).slice(2, 8)}`;
  await asRole(
    db,
    nannyUserId,
    `insert into public.children (first_name, date_of_birth)
     values ($1, current_date - 300)`,
    [name],
  );
  await db.query("reset role");
  const { rows } = await db.query<{ id: string }>(
    "select id from public.children where first_name = $1",
    [name],
  );
  return rows[0].id;
};

// --------------------------------------------------------------------------- children.created_by_user_id

describe("int.rpc-0019 — the creator column and user_has_child_access's fourth arm (04 §4.4 c1)", () => {
  /**
   * Insert a child the way `0012`'s `children_nanny_insert` policy lets a nanny: unclaimed, and **without
   * `RETURNING`**.
   *
   * ★ Measured, and worth writing down for whoever wires the module half: `insert … returning` on
   * `children` is refused for **every** client role, and always has been. `children_access_select` reads
   * `user_has_child_access(id)`, which is a STABLE definer that queries `public.children`; a STABLE
   * function sees the statement's start snapshot, so the row being inserted is invisible to it and the
   * RETURNING clause's SELECT check fails. `0019` does not change that and could not: the app never hit it
   * because `insertChild` runs at service scope, which bypasses RLS entirely. The id is read back here as
   * the fixture owner, which is what a service-scope insert would have returned.
   */
  const nannyAddsChild = async (
    nannyUserId: string,
    claimedCreator?: string,
  ): Promise<string> => {
    const name = `added-${Math.random().toString(36).slice(2, 8)}`;
    await asRole(
      db,
      nannyUserId,
      claimedCreator === undefined
        ? `insert into public.children (first_name, date_of_birth)
           values ($1, current_date - 300)`
        : `insert into public.children (first_name, date_of_birth, created_by_user_id)
           values ($1, current_date - 300, $2)`,
      claimedCreator === undefined ? [name] : [name, claimedCreator],
    );
    await db.query("reset role");
    const { rows } = await db.query<{ id: string }>(
      "select id from public.children where first_name = $1",
      [name],
    );
    return rows[0].id;
  };

  const seesChild = async (
    userId: string,
    childId: string,
  ): Promise<boolean> => {
    const rows = await asRole<{ seen: boolean }>(
      db,
      userId,
      "select public.user_has_child_access($1) as seen",
      [childId],
    );
    await db.query("reset role");
    return rows[0].seen;
  };

  it("stamps the creator from the session, so it cannot be named by the caller", async () => {
    // The whole reason the column is a trigger and not a plain writable column: `children_nanny_insert`
    // lets ANY nanny insert an unclaimed child, so a caller-supplied creator would hand a stranger the
    // read the fourth arm grants.
    const childId = await nannyAddsChild(fx.nannyVisible, fx.nannyIsolated);
    const { rows } = await db.query<{ created_by_user_id: string }>(
      "select created_by_user_id from public.children where id = $1",
      [childId],
    );
    expect(rows[0].created_by_user_id).toBe(fx.nannyVisible);
  });

  it("lets the creator read back the child she just added — the path 1i pinned as unreachable", async () => {
    const childId = await nannyAddsChild(fx.nannyVisible);
    expect(await seesChild(fx.nannyVisible, childId)).toBe(true);
    // and nobody else's nanny
    expect(await seesChild(fx.nannyIsolated, childId)).toBe(false);
  });

  it("takes the creator's access away the moment a family claims the child", async () => {
    const childId = await nannyAddsChild(fx.nannyVisible);
    await db.query(
      "update public.children set parent_user_id = $1 where id = $2",
      [fx.parentA, childId],
    );
    // She created it, and that is no longer enough: from here she needs an active link like anyone else.
    expect(await seesChild(fx.nannyVisible, childId)).toBe(false);
    expect(await seesChild(fx.parentA, childId)).toBe(true);
  });

  // fix: database-reviewer M-1. 0019 replaces this predicate whole, and the first version of that
  // replacement silently dropped 0012's `p_child_id is not null` guard — which changed the answer for an
  // admin caller with a null argument from false to true. Nothing passes a null today; this is here so
  // that the next policy over a nullable child column cannot find out the hard way.
  it("still answers false for a null child id, for an admin as much as anyone", async () => {
    for (const actor of [fx.admin, fx.parentA, fx.nannyVisible]) {
      const rows = await asRole<{ seen: boolean | null }>(
        db,
        actor,
        "select public.user_has_child_access(null) as seen",
      );
      await db.query("reset role");
      expect(rows[0].seen, actor).toBe(false);
    }
  });

  it("leaves 0012's first three arms exactly as they were", async () => {
    expect(await seesChild(fx.parentA, fx.childA)).toBe(true);
    expect(await seesChild(fx.parentB, fx.childA)).toBe(false);
    expect(await seesChild(fx.admin, fx.childA)).toBe(true);
    await db.query(
      `insert into public.child_client (child_id, nanny_user_id, parent_user_id, source, state)
       values ($1, $2, $3, 'manual', 'active')`,
      [fx.childA, fx.nannyVisible, fx.parentA],
    );
    expect(await seesChild(fx.nannyVisible, fx.childA)).toBe(true);
  });
});

// --------------------------------------------------------------------------- the invite definers

describe("int.rpc-0019 — create_child_invite / revoke_child_invite (07 §5.2)", () => {
  const TOKEN_A = "ABCD-2345";
  const TOKEN_B = "EFGH-6789";

  const mint = async (
    userId: string,
    childId: string,
    direction: string,
    token: string,
  ): Promise<string> => {
    const rows = await asRole<{ id: string }>(
      db,
      userId,
      "select public.create_child_invite($1, $2::public.invite_direction, $3) as id",
      [childId, direction, token],
    );
    await db.query("reset role");
    return rows[0].id;
  };

  const revoke = async (userId: string, inviteId: string): Promise<boolean> => {
    const rows = await asRole<{ revoked: boolean }>(
      db,
      userId,
      "select public.revoke_child_invite($1, 'manual') as revoked",
      [inviteId],
    );
    await db.query("reset role");
    return rows[0].revoked;
  };

  it("a parent mints parent_to_nanny for her own child, and the creator is her session", async () => {
    const id = await mint(fx.parentA, fx.childA, "parent_to_nanny", TOKEN_A);
    const { rows } = await db.query<{
      token: string;
      status: string;
      created_by_user_id: string;
      direction: string;
    }>(
      "select token, status, created_by_user_id, direction from public.child_invites where id = $1",
      [id],
    );
    expect(rows[0]).toEqual({
      token: TOKEN_A,
      status: "pending",
      created_by_user_id: fx.parentA,
      direction: "parent_to_nanny",
    });
  });

  it("minting twice returns the invite that is already pending, never a second token", async () => {
    // The link is already with a family; a second token would silently invalidate the one they hold.
    // Since database-reviewer M-3 this goes through `ON CONFLICT … DO NOTHING` rather than a
    // select-then-insert, so the second mint exercises the conflict path rather than the fast path.
    const first = await mint(fx.parentA, fx.childA, "parent_to_nanny", TOKEN_A);
    const again = await mint(fx.parentA, fx.childA, "parent_to_nanny", TOKEN_B);
    expect(again).toBe(first);
    const { rows } = await db.query<{ n: string }>(
      "select count(*)::text as n from public.child_invites where child_id = $1",
      [fx.childA],
    );
    expect(rows[0].n).toBe("1");
  });

  it("refuses a parent who is not the child's parent, with the same line either way (07 §4)", async () => {
    const refusal = await refusalOf(() =>
      mint(fx.parentB, fx.childA, "parent_to_nanny", TOKEN_A),
    );
    expect(refusal).toContain("INVITE_NOT_YOURS");
  });

  it("refuses a malformed token before it can reach 0012's CHECK", async () => {
    const refusal = await refusalOf(() =>
      mint(fx.parentA, fx.childA, "parent_to_nanny", "ILOU-0000"),
    );
    expect(refusal).toContain("INVITE_TOKEN_MALFORMED");
  });

  it("★ 04 §4.4 c1: a nanny mints nanny_to_parent for the child she created", async () => {
    const childId = await addUnclaimedChild(fx.nannyVisible);
    const id = await mint(fx.nannyVisible, childId, "nanny_to_parent", TOKEN_A);
    expect(id).toBeTruthy();
  });

  it("refuses a nanny who neither created the child nor holds a live link to it", async () => {
    const childId = await addUnclaimedChild(fx.nannyVisible);
    const refusal = await refusalOf(() =>
      mint(fx.nannyIsolated, childId, "nanny_to_parent", TOKEN_A),
    );
    expect(refusal).toContain("INVITE_NOT_YOURS");
  });

  it("the creator revokes, and the row carries the reason and the instant", async () => {
    const id = await mint(fx.parentA, fx.childA, "parent_to_nanny", TOKEN_A);
    expect(await revoke(fx.parentA, id)).toBe(true);
    const { rows } = await db.query<{
      status: string;
      revoked_reason: string;
      revoked_at: Date | null;
    }>(
      "select status, revoked_reason, revoked_at from public.child_invites where id = $1",
      [id],
    );
    expect(rows[0].status).toBe("revoked");
    expect(rows[0].revoked_reason).toBe("manual");
    expect(rows[0].revoked_at).not.toBeNull();
  });

  it("an admin may revoke somebody else's invite; a stranger may not", async () => {
    const id = await mint(fx.parentA, fx.childA, "parent_to_nanny", TOKEN_A);
    const refusal = await refusalOf(() => revoke(fx.parentB, id));
    expect(refusal).toContain("INVITE_NOT_YOURS");
    expect(await revoke(fx.admin, id)).toBe(true);
  });

  it("a second revoke answers false and changes nothing — revoke is terminal, never un-revoked", async () => {
    const id = await mint(fx.parentA, fx.childA, "parent_to_nanny", TOKEN_A);
    await revoke(fx.parentA, id);
    const { rows: before } = await db.query<{ revoked_at: Date }>(
      "select revoked_at from public.child_invites where id = $1",
      [id],
    );
    expect(await revoke(fx.parentA, id)).toBe(false);
    const { rows: after } = await db.query<{ revoked_at: Date }>(
      "select revoked_at from public.child_invites where id = $1",
      [id],
    );
    expect(after[0].revoked_at).toEqual(before[0].revoked_at);
  });

  it("an anonymous visitor can execute neither — get_invite_preview is the only anon invite road", async () => {
    expect(
      await refusedAs(
        db,
        null,
        "select public.create_child_invite($1, 'parent_to_nanny', 'ABCD-2345')",
        [fx.childA],
      ),
    ).toBe("42501");
    expect(
      await refusedAs(
        db,
        null,
        "select public.revoke_child_invite($1, 'manual')",
        [fx.childA],
      ),
    ).toBe("42501");
  });
});

// --------------------------------------------------------------------------- apply_payment_event

describe("int.rpc-0019 — apply_payment_event folds the webhook's two writes into one (03 §5.4.3)", () => {
  const EVENT_ID = "evt_test_0019";

  beforeEach(async () => {
    await db.query(
      `insert into public.parent_subscriptions (parent_user_id, status) values ($1, 'lapsed')`,
      [fx.parentA],
    );
  });

  const apply = async (
    over: {
      readonly eventId?: string;
      readonly parentUserId?: string | null;
      readonly patch?: Record<string, unknown> | null;
      readonly accessAgeYears?: number | null;
    } = {},
  ): Promise<Record<string, unknown>> => {
    const { rows } = await db.query<{ result: Record<string, unknown> }>(
      `select public.apply_payment_event(
         p_provider          => 'stripe',
         p_provider_event_id => $1,
         p_event_type        => 'checkout.session.completed',
         p_payload           => '{"id":"evt"}'::jsonb,
         p_received_at       => now(),
         p_parent_user_id    => $2,
         p_spine_patch       => $3::jsonb,
         p_access_age_years  => $4) as result`,
      [
        over.eventId ?? EVENT_ID,
        over.parentUserId === undefined ? fx.parentA : over.parentUserId,
        over.patch === undefined || over.patch === null
          ? null
          : JSON.stringify(over.patch),
        over.accessAgeYears ?? null,
      ],
    );
    return rows[0].result;
  };

  const spineOf = async () => {
    const { rows } = await db.query(
      `select status, plan_shape, price_pence, access_until
         from public.parent_subscriptions where parent_user_id = $1`,
      [fx.parentA],
    );
    return rows[0];
  };

  it("writes the ledger row, the spine patch and processed_at together", async () => {
    const result = await apply({
      patch: {
        status: "paid_in_full",
        plan_shape: "upfront",
        price_pence: 150000,
      },
    });
    expect(result["outcome"]).toBe("applied");

    const spine = await spineOf();
    expect(spine).toMatchObject({
      status: "paid_in_full",
      plan_shape: "upfront",
    });

    const { rows } = await db.query<{
      processed_at: Date | null;
      parent_user_id: string;
      processing_error: string | null;
    }>(
      `select processed_at, parent_user_id, processing_error
         from public.payment_events where provider_event_id = $1`,
      [EVENT_ID],
    );
    expect(rows[0].processed_at).not.toBeNull();
    expect(rows[0].parent_user_id).toBe(fx.parentA);
    expect(rows[0].processing_error).toBeNull();
  });

  it("a replay is a duplicate that touches no money", async () => {
    await apply({ patch: { status: "paid_in_full" } });
    const replay = await apply({ patch: { status: "cancelled" } });
    expect(replay["outcome"]).toBe("duplicate");
    // the cancellation in the replay's patch must NOT have landed
    expect((await spineOf())["status"]).toBe("paid_in_full");
    const { rows } = await db.query<{ n: string }>(
      "select count(*)::text as n from public.payment_events where provider_event_id = $1",
      [EVENT_ID],
    );
    expect(rows[0].n).toBe("1");
  });

  it("an unresolved delivery is recorded with its error and leaves the spine alone", async () => {
    const result = await apply({
      parentUserId: null,
      patch: { status: "cancelled" },
    });
    expect(result["outcome"]).toBe("unresolved");
    expect((await spineOf())["status"]).toBe("lapsed");
    const { rows } = await db.query<{ processing_error: string }>(
      "select processing_error from public.payment_events where provider_event_id = $1",
      [EVENT_ID],
    );
    expect(rows[0].processing_error).toBe("E_EVENT_UNRESOLVED");
  });

  it("recomputes the access window inside the same transaction when the status moved", async () => {
    await db.query(
      `insert into public.child_client (child_id, nanny_user_id, parent_user_id, source, state)
       values ($1, $2, $3, 'manual', 'active')`,
      [fx.childA, fx.nannyVisible, fx.parentA],
    );
    const result = await apply({
      patch: { status: "paid_in_full" },
      accessAgeYears: 3,
    });
    expect(result["outcome"]).toBe("applied");
    expect(result["access_until"]).not.toBeNull();
    expect((await spineOf())["access_until"]).not.toBeNull();
  });

  it("never lets a patch write access_until directly — set_access_window owns it (ADR-083 / 084)", async () => {
    await apply({
      patch: { status: "paid_in_full", access_until: "2099-01-01T00:00:00Z" },
    });
    expect((await spineOf())["access_until"]).toBeNull();
  });

  it("an omitted key keeps the value it had rather than nulling it", async () => {
    await apply({ patch: { status: "active", plan_shape: "instalments" } });
    await apply({ eventId: "evt_two", patch: { status: "paid_in_full" } });
    expect(await spineOf()).toMatchObject({
      status: "paid_in_full",
      plan_shape: "instalments",
    });
  });

  it("no client role can execute it — nothing but the service role writes the spine (I-M2)", async () => {
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
