// `int.rpc-0024` — the functional suite over the one thing `0024` changes: `upsert_connection()`'s create branch
// writes the silent hold's pair (ADR-158 (2); 02 §4.2 row 7, R-14), and its update branch still does not.
//
// Written for the reason S5b learned on `0017` / `0018` and `2c` repeated on `0023`: metadata assertions pass
// over functions that cannot do the thing. Every test here **calls** the function and reads the row back.
//
// The other half of the mechanism — the **release** at L4 — is `0023`'s and is proved in `int.rpc-0023`. This
// suite proves the two meet: a row written held here is a row that release clears.
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
import { seedFixtures, type Fixtures } from "./rls-fixtures";

let db: Client;
let fx: Fixtures;

const CONNECTION_1 = "00000031-0000-4000-8000-000000000000";
const CONNECTION_2 = "00000032-0000-4000-8000-000000000000";

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

const upsertConnection = async (args: {
  readonly id: string;
  readonly stage: string;
  readonly columns?: Record<string, unknown>;
  readonly expectedVersion?: number;
}): Promise<number> => {
  const { rows } = await db.query<{ version: number }>(
    `select public.upsert_connection(
       p_id               => $1,
       p_position_id      => $2,
       p_parent_id        => $3,
       p_nanny_id         => $4,
       p_stage            => $5,
       p_origin           => 'nanny_application',
       p_columns          => $6::jsonb,
       p_expected_version => $7) as version`,
    [
      args.id,
      fx.positionA,
      fx.parentAId,
      fx.nannyVisibleId,
      args.stage,
      JSON.stringify(args.columns ?? {}),
      args.expectedVersion ?? 0,
    ],
  );
  return rows[0].version;
};

const heldPair = async (id: string) => {
  const { rows } = await db.query<{
    held_for_verification: boolean;
    held_at: string | null;
  }>(
    "select held_for_verification, held_at from public.connection_requests where id = $1",
    [id],
  );
  return rows[0];
};

describe("int.rpc-0024 — upsert_connection writes the silent hold at creation", () => {
  it("creates the row held when the caller says so, with the instant it was given", async () => {
    const at = "2026-09-19T09:00:00.000Z";

    await upsertConnection({
      id: CONNECTION_1,
      stage: "NANNY_APPLIED",
      columns: { held_for_verification: true, held_at: at },
    });

    const row = await heldPair(CONNECTION_1);
    expect(row.held_for_verification).toBe(true);
    expect(new Date(row.held_at ?? "").toISOString()).toBe(at);
  });

  it("creates the row unheld when the caller says so", async () => {
    await upsertConnection({
      id: CONNECTION_1,
      stage: "NANNY_APPLIED",
      columns: { held_for_verification: false },
    });

    const row = await heldPair(CONNECTION_1);
    expect(row.held_for_verification).toBe(false);
    expect(row.held_at).toBeNull();
  });

  it("a caller that names neither still lands on 0007's default — never a null flag", async () => {
    await upsertConnection({ id: CONNECTION_1, stage: "NANNY_APPLIED" });

    const row = await heldPair(CONNECTION_1);
    expect(row.held_for_verification).toBe(false);
    expect(row.held_at).toBeNull();
  });

  it("refuses a half-written pair — 0007's CHECK, reached through the definer", async () => {
    await expect(
      upsertConnection({
        id: CONNECTION_1,
        stage: "NANNY_APPLIED",
        columns: { held_for_verification: true },
      }),
    ).rejects.toThrow(/connection_requests_held_at_check/);
  });

  it("a later K row leaves the pair alone — the update branch never names it", async () => {
    const at = "2026-09-19T09:00:00.000Z";
    await upsertConnection({
      id: CONNECTION_1,
      stage: "NANNY_APPLIED",
      columns: { held_for_verification: true, held_at: at },
    });

    await upsertConnection({
      id: CONNECTION_1,
      stage: "ACCEPTED",
      columns: { held_for_verification: false, availability_slots: [] },
      expectedVersion: 1,
    });

    const row = await heldPair(CONNECTION_1);
    expect(row.held_for_verification).toBe(true);
    expect(new Date(row.held_at ?? "").toISOString()).toBe(at);
  });

  it("0016 hides a held row from the family and shows it once it is released", async () => {
    const at = "2026-09-19T09:00:00.000Z";
    await upsertConnection({
      id: CONNECTION_1,
      stage: "NANNY_APPLIED",
      columns: { held_for_verification: true, held_at: at },
    });
    await db.query("set local role authenticated");
    await db.query(
      `select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
      [fx.parentA],
    );

    const hidden = await db.query(
      "select id from public.connection_requests where id = $1",
      [CONNECTION_1],
    );
    expect(hidden.rowCount).toBe(0);

    await db.query("reset role");
    await db.query(
      "update public.connection_requests set held_for_verification = false, held_at = null where id = $1",
      [CONNECTION_1],
    );
    await db.query("set local role authenticated");
    const shown = await db.query(
      "select id from public.connection_requests where id = $1",
      [CONNECTION_1],
    );
    expect(shown.rowCount).toBe(1);
    await db.query("reset role");
  });

  it("the security clause 0019 set is untouched: no client role may execute it", async () => {
    const { rows } = await db.query<{
      anon: boolean;
      authed: boolean;
      service: boolean;
      definer: boolean;
    }>(
      `select has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as authed,
              has_function_privilege('service_role', p.oid, 'execute') as service,
              p.prosecdef as definer
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'upsert_connection'`,
    );
    expect(rows[0]).toEqual({
      anon: false,
      authed: false,
      service: true,
      definer: true,
    });
  });

  it("a second connection on the same position for the same nanny is still refused by name", async () => {
    await upsertConnection({ id: CONNECTION_1, stage: "NANNY_APPLIED" });

    await expect(
      upsertConnection({
        id: CONNECTION_2,
        stage: "NANNY_APPLIED",
        columns: {
          held_for_verification: true,
          held_at: "2026-09-19T09:00:00.000Z",
        },
      }),
    ).rejects.toThrow(/CONNECTION_ALREADY_LIVE/);
  });
});
