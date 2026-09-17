// `int.rpc-0019` — the functional suite over the three write definers `0019` creates:
// `upsert_position()`, `upsert_connection()` and `upsert_placement()`.
//
// Written because of what S5b learned on `0017` and `0018`: 151 metadata assertions passed over a
// function that could not insert a row, and only invoking it found the bug. `0019`'s own verify
// block therefore stops at metadata on purpose and says so; this file is where the claims that
// matter live. Every test **calls** the function.
//
// Everything runs inside one transaction that is rolled back, so the suite leaves the database as
// `supabase db reset` left it. One consequence is stated rather than hidden: `0007`'s I-3 backstop
// (`enforce_placement_position_active()`) is DEFERRABLE INITIALLY DEFERRED, so it fires at COMMIT
// and never fires here. That is the same blind spot `int.rls` has and it is not this migration's to
// close — `0019` does not touch the trigger, and the placement tests below assert the two L uniques
// `upsert_placement()` itself raises, not the trigger's rule.
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
import { refusedAs, seedFixtures, type Fixtures } from "./rls-fixtures";

let db: Client;
let fx: Fixtures;
/** `parents.id` for `parentB` — the fixtures return parentA's only, and I-1 needs a second family. */
let parentBId: string;

const POSITION_B = "0000000b-0000-4000-8000-000000000000";
const POSITION_C = "0000000c-0000-4000-8000-000000000000";
const CONNECTION_1 = "00000011-0000-4000-8000-000000000000";
const CONNECTION_2 = "00000012-0000-4000-8000-000000000000";
const PLACEMENT_1 = "00000021-0000-4000-8000-000000000000";
const PLACEMENT_2 = "00000022-0000-4000-8000-000000000000";

beforeAll(async () => {
  db = await connect();
});
afterAll(async () => {
  await db?.end();
});

beforeEach(async () => {
  await db.query("begin");
  fx = await seedFixtures(db);
  const { rows } = await db.query<{ id: string }>(
    "select id from public.parents where user_id = $1",
    [fx.parentB],
  );
  parentBId = rows[0].id;
});
afterEach(async () => {
  await db.query("rollback");
});

// --------------------------------------------------------------------------- helpers

const upsertPosition = async (args: {
  readonly id: string;
  readonly parentId: string;
  readonly stage: string;
  readonly columns?: Record<string, unknown>;
  readonly details?: Record<string, unknown> | null;
  readonly schedule?: unknown;
  readonly expectedVersion?: number;
  readonly source?: string;
}): Promise<number> => {
  const { rows } = await db.query<{ version: number }>(
    `select public.upsert_position(
       p_id               => $1,
       p_parent_id        => $2,
       p_source           => $3,
       p_stage            => $4,
       p_columns          => $5::jsonb,
       p_details          => $6::jsonb,
       p_schedule         => $7::jsonb,
       p_expected_version => $8) as version`,
    [
      args.id,
      args.parentId,
      args.source ?? "in_app",
      args.stage,
      JSON.stringify(args.columns ?? {}),
      args.details === undefined ? null : JSON.stringify(args.details),
      args.schedule === undefined ? null : JSON.stringify(args.schedule),
      args.expectedVersion ?? 0,
    ],
  );
  return rows[0].version;
};

const upsertConnection = async (args: {
  readonly id: string;
  readonly positionId: string;
  readonly parentId: string;
  readonly nannyId: string;
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
      args.positionId,
      args.parentId,
      args.nannyId,
      args.stage,
      JSON.stringify(args.columns ?? {}),
      args.expectedVersion ?? 0,
    ],
  );
  return rows[0].version;
};

const upsertPlacement = async (args: {
  readonly id: string;
  readonly positionId: string;
  readonly parentId: string;
  readonly nannyId: string;
  readonly state: string;
  readonly source?: string;
  readonly connectionId?: string | null;
  readonly columns?: Record<string, unknown>;
  readonly expectedVersion?: number;
}): Promise<number> => {
  const { rows } = await db.query<{ version: number }>(
    `select public.upsert_placement(
       p_id               => $1,
       p_position_id      => $2,
       p_parent_id        => $3,
       p_nanny_id         => $4,
       p_source           => $5,
       p_state            => $6,
       p_columns          => $7::jsonb,
       p_connection_id    => $8,
       p_expected_version => $9) as version`,
    [
      args.id,
      args.positionId,
      args.parentId,
      args.nannyId,
      args.source ?? "invite_shell",
      args.state,
      JSON.stringify(args.columns ?? {}),
      args.connectionId ?? null,
      args.expectedVersion ?? 0,
    ],
  );
  return rows[0].version;
};

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

const positionRow = async (id: string) => {
  const { rows } = await db.query(
    `select stage, source, version, area, district, schedule_type, minimum_nanny_age,
            language_preference, car_required, precheck_wave_sent, details,
            call_state, call_booking_id, created_at
       from public.nanny_positions where id = $1`,
    [id],
  );
  return rows[0];
};

// --------------------------------------------------------------------------- upsert_position

describe("int.rpc-0019 — upsert_position writes the position and its roster in one call", () => {
  it("creates a position at version 1 with its columns, its snapshot and its schedule row", async () => {
    const version = await upsertPosition({
      id: POSITION_B,
      parentId: parentBId,
      stage: "DRAFT",
      columns: {
        area: "Clapham",
        district: "SW4",
        schedule_type: "fixed",
        minimum_nanny_age: 21,
        language_preference: ["English", "French"],
        car_required: true,
        precheck_wave_sent: 2,
      },
      details: { detail: { area: { district: "SW4" } } },
      schedule: { monday: ["morning"] },
    });

    expect(version).toBe(1);
    const row = await positionRow(POSITION_B);
    expect(row).toMatchObject({
      stage: "DRAFT",
      source: "in_app",
      version: 1,
      area: "Clapham",
      district: "SW4",
      schedule_type: "fixed",
      minimum_nanny_age: 21,
      car_required: true,
      precheck_wave_sent: 2,
    });
    expect(row.language_preference).toEqual(["English", "French"]);
    expect(row.details).toEqual({ detail: { area: { district: "SW4" } } });

    // the roster lands in the SAME call — ADR-127 gives the caller one RPC, so if this needed a
    // second statement the unit of work could not be atomic and the seam would be lying.
    const { rows } = await db.query<{ schedule: unknown }>(
      "select schedule from public.position_schedule where position_id = $1",
      [POSITION_B],
    );
    expect(rows[0].schedule).toEqual({ monday: ["morning"] });
  });

  it("updates on the version it was given and returns the bumped one", async () => {
    await upsertPosition({
      id: POSITION_B,
      parentId: parentBId,
      stage: "DRAFT",
      columns: { district: "SW4", minimum_nanny_age: 21 },
      details: { detail: "one" },
    });

    const next = await upsertPosition({
      id: POSITION_B,
      parentId: parentBId,
      stage: "OPEN",
      columns: { district: "SW9" },
      details: { detail: "two" },
      expectedVersion: 1,
    });

    expect(next).toBe(2);
    const row = await positionRow(POSITION_B);
    expect(row.stage).toBe("OPEN");
    expect(row.district).toBe("SW9");
    expect(row.details).toEqual({ detail: "two" });
    // an omitted key keeps the value it had: `p_columns` is merged OVER the stored row, which is the
    // semantics the store already has (an `undefined` field is left out of the patch entirely).
    expect(row.minimum_nanny_age).toBe(21);
  });

  it("refuses a stale version rather than overwriting (C-9)", async () => {
    await upsertPosition({
      id: POSITION_B,
      parentId: parentBId,
      stage: "DRAFT",
    });
    await upsertPosition({
      id: POSITION_B,
      parentId: parentBId,
      stage: "OPEN",
      expectedVersion: 1,
    });

    const refusal = await refusalOf(() =>
      upsertPosition({
        id: POSITION_B,
        parentId: parentBId,
        stage: "CONNECTING",
        expectedVersion: 1,
      }),
    );
    expect(refusal).toContain("VERSION_MISMATCH");
    // and the stale write really did not land
    expect((await positionRow(POSITION_B)).stage).toBe("OPEN");
  });

  it("refuses an update of a row that is not there, and says NOT_FOUND rather than creating one", async () => {
    const refusal = await refusalOf(() =>
      upsertPosition({
        id: POSITION_C,
        parentId: parentBId,
        stage: "OPEN",
        expectedVersion: 1,
      }),
    );
    expect(refusal).toContain("NOT_FOUND");
    expect(await positionRow(POSITION_C)).toBeUndefined();
  });

  it("refuses a second live position for the same parent by name (I-1), not as a bare 23505", async () => {
    // the fixtures already give parentA an OPEN position
    const refusal = await refusalOf(() =>
      upsertPosition({
        id: POSITION_B,
        parentId: fx.parentAId,
        stage: "DRAFT",
      }),
    );
    expect(refusal).toContain("POSITION_ALREADY_LIVE");
  });

  it("allows a second position for the same parent once the first is not live", async () => {
    await db.query(
      `update public.nanny_positions
          set stage = 'CLOSED', close_reason = 'parent_closed', closed_at = now()
        where id = $1`,
      [fx.positionA],
    );
    const version = await upsertPosition({
      id: POSITION_B,
      parentId: fx.parentAId,
      stage: "DRAFT",
    });
    expect(version).toBe(1);
  });

  it("refuses a duplicate create rather than silently updating", async () => {
    await upsertPosition({
      id: POSITION_B,
      parentId: parentBId,
      stage: "DRAFT",
    });
    const refusal = await refusalOf(() =>
      upsertPosition({
        id: POSITION_B,
        parentId: parentBId,
        stage: "DRAFT",
      }),
    );
    expect(refusal).toContain("POSITION_EXISTS");
  });

  it("leaves the call mirror's state alone even when a caller puts call_* in p_columns", async () => {
    // One writer per column: `upsert_call_mirror()` (0018) owns `call_state` and its siblings, and
    // this function strips them. Without the strip, a P row could move a call the C rows own — and
    // the D-3 biconditional CHECK would be the only thing left standing between them.
    await upsertPosition({
      id: POSITION_B,
      parentId: parentBId,
      stage: "DRAFT",
      columns: {
        district: "SW4",
        call_state: "slot-chosen",
        call_booking_id: "00000099-0000-4000-8000-000000000000",
      },
    });
    const row = await positionRow(POSITION_B);
    expect(row.call_state).toBe("awaiting-slot");
    expect(row.call_booking_id).toBeNull();
  });

  it("a null p_schedule leaves an existing roster alone rather than deleting it", async () => {
    await upsertPosition({
      id: POSITION_B,
      parentId: parentBId,
      stage: "DRAFT",
      schedule: { monday: ["morning"] },
    });
    await upsertPosition({
      id: POSITION_B,
      parentId: parentBId,
      stage: "OPEN",
      expectedVersion: 1,
    });
    const { rows } = await db.query<{ schedule: unknown }>(
      "select schedule from public.position_schedule where position_id = $1",
      [POSITION_B],
    );
    expect(rows[0].schedule).toEqual({ monday: ["morning"] });
  });
});

// --------------------------------------------------------------------------- upsert_connection

describe("int.rpc-0019 — upsert_connection writes connection_requests", () => {
  const live = {
    positionId: "",
    parentId: "",
    nannyId: "",
  };

  beforeEach(() => {
    live.positionId = fx.positionA;
    live.parentId = fx.parentAId;
    live.nannyId = fx.nannyVisibleId;
  });

  it("creates at version 1 and updates on the version it was given", async () => {
    const first = await upsertConnection({
      id: CONNECTION_1,
      ...live,
      stage: "REQUEST_SENT",
    });
    expect(first).toBe(1);

    const next = await upsertConnection({
      id: CONNECTION_1,
      ...live,
      stage: "INTRO_SCHEDULED",
      columns: { meeting_at: "2026-10-01T10:00:00Z", meeting_set_by: "parent" },
      expectedVersion: 1,
    });
    expect(next).toBe(2);

    const { rows } = await db.query<{
      stage: string;
      meeting_set_by: string;
      version: number;
    }>(
      "select stage, meeting_set_by, version from public.connection_requests where id = $1",
      [CONNECTION_1],
    );
    expect(rows[0]).toMatchObject({
      stage: "INTRO_SCHEDULED",
      meeting_set_by: "parent",
      version: 2,
    });
  });

  it("refuses a stale version", async () => {
    await upsertConnection({
      id: CONNECTION_1,
      ...live,
      stage: "REQUEST_SENT",
    });
    const refusal = await refusalOf(() =>
      upsertConnection({
        id: CONNECTION_1,
        ...live,
        stage: "DECLINED",
        expectedVersion: 7,
      }),
    );
    expect(refusal).toContain("VERSION_MISMATCH");
  });

  it("refuses a second live connection for the same (position, nanny) by name", async () => {
    await upsertConnection({
      id: CONNECTION_1,
      ...live,
      stage: "REQUEST_SENT",
    });
    const refusal = await refusalOf(() =>
      upsertConnection({ id: CONNECTION_2, ...live, stage: "REQUEST_SENT" }),
    );
    expect(refusal).toContain("CONNECTION_ALREADY_LIVE");
  });

  it("allows a second connection for the pair once the first reached a terminal stage", async () => {
    await upsertConnection({
      id: CONNECTION_1,
      ...live,
      stage: "REQUEST_SENT",
    });
    await upsertConnection({
      id: CONNECTION_1,
      ...live,
      stage: "DECLINED",
      expectedVersion: 1,
    });
    const version = await upsertConnection({
      id: CONNECTION_2,
      ...live,
      stage: "REQUEST_SENT",
    });
    expect(version).toBe(1);
  });

  it("refuses a second OFFERED / CONFIRMED / ACTIVE connection on one position by name", async () => {
    await upsertConnection({
      id: CONNECTION_1,
      ...live,
      stage: "OFFERED",
      columns: {
        meeting_at: "2026-10-01T10:00:00Z",
        fill_initiated_by: "parent",
      },
    });
    const refusal = await refusalOf(() =>
      upsertConnection({
        id: CONNECTION_2,
        ...live,
        nannyId: fx.nannyIsolatedId,
        stage: "CONFIRMED",
        columns: { meeting_at: "2026-10-02T10:00:00Z" },
      }),
    );
    expect(refusal).toContain("POSITION_ALREADY_OFFERED");
  });
});

// --------------------------------------------------------------------------- upsert_placement

describe("int.rpc-0019 — upsert_placement writes nanny_placements", () => {
  it("creates at version 1 and updates on the version it was given", async () => {
    const first = await upsertPlacement({
      id: PLACEMENT_1,
      positionId: fx.positionA,
      parentId: fx.parentAId,
      nannyId: fx.nannyVisibleId,
      state: "CONFIRMED",
    });
    expect(first).toBe(1);

    const next = await upsertPlacement({
      id: PLACEMENT_1,
      positionId: fx.positionA,
      parentId: fx.parentAId,
      nannyId: fx.nannyVisibleId,
      state: "ACTIVE",
      columns: { started_at: "2026-10-05T09:00:00Z", start_date: "2026-10-05" },
      expectedVersion: 1,
    });
    expect(next).toBe(2);

    const { rows } = await db.query<{ state: string; started_at: Date | null }>(
      "select state, started_at from public.nanny_placements where id = $1",
      [PLACEMENT_1],
    );
    expect(rows[0].state).toBe("ACTIVE");
    expect(rows[0].started_at).not.toBeNull();
  });

  it("refuses a stale version", async () => {
    await upsertPlacement({
      id: PLACEMENT_1,
      positionId: fx.positionA,
      parentId: fx.parentAId,
      nannyId: fx.nannyVisibleId,
      state: "CONFIRMED",
    });
    const refusal = await refusalOf(() =>
      upsertPlacement({
        id: PLACEMENT_1,
        positionId: fx.positionA,
        parentId: fx.parentAId,
        nannyId: fx.nannyVisibleId,
        state: "ENDED",
        expectedVersion: 9,
      }),
    );
    expect(refusal).toContain("VERSION_MISMATCH");
  });

  it("refuses a second live placement on one position by name", async () => {
    await upsertPlacement({
      id: PLACEMENT_1,
      positionId: fx.positionA,
      parentId: fx.parentAId,
      nannyId: fx.nannyVisibleId,
      state: "CONFIRMED",
    });
    const refusal = await refusalOf(() =>
      upsertPlacement({
        id: PLACEMENT_2,
        positionId: fx.positionA,
        parentId: fx.parentAId,
        nannyId: fx.nannyIsolatedId,
        state: "CONFIRMED",
      }),
    );
    expect(refusal).toContain("PLACEMENT_ALREADY_LIVE");
  });

  it("refuses a second live placement for one parent, even on another position, by name", async () => {
    await upsertPlacement({
      id: PLACEMENT_1,
      positionId: fx.positionA,
      parentId: fx.parentAId,
      nannyId: fx.nannyVisibleId,
      state: "CONFIRMED",
    });
    // a second position for the same parent, opened only after the first is closed (I-1)
    await db.query(
      `update public.nanny_positions
          set stage = 'CLOSED', close_reason = 'parent_closed', closed_at = now()
        where id = $1`,
      [fx.positionA],
    );
    await upsertPosition({
      id: POSITION_B,
      parentId: fx.parentAId,
      stage: "ACTIVE",
    });

    const refusal = await refusalOf(() =>
      upsertPlacement({
        id: PLACEMENT_2,
        positionId: POSITION_B,
        parentId: fx.parentAId,
        nannyId: fx.nannyIsolatedId,
        state: "CONFIRMED",
      }),
    );
    expect(refusal).toContain("PARENT_ALREADY_PLACED");
  });

  it("writes NULL for an absent connection rather than an empty string", async () => {
    await upsertPlacement({
      id: PLACEMENT_1,
      positionId: fx.positionA,
      parentId: fx.parentAId,
      nannyId: fx.nannyVisibleId,
      state: "CONFIRMED",
      connectionId: null,
    });
    const { rows } = await db.query<{ connection_id: string | null }>(
      "select connection_id from public.nanny_placements where id = $1",
      [PLACEMENT_1],
    );
    expect(rows[0].connection_id).toBeNull();
  });
});

// --------------------------------------------------------------------------- authority

describe("int.rpc-0019 — the three definers are service-role roads and nothing else", () => {
  // 07 §5.1 rule 5, and the reason recorded in 0019's header: each of these takes `stage` as an
  // argument, and 0006 §4 says a parent may never touch `stage`, `call_*` or `precheck_*`. Asserted
  // as a signed-in parent, which is the caller that would otherwise reach it through PostgREST.
  it("a signed-in parent cannot execute upsert_position", async () => {
    const code = await refusedAs(
      db,
      fx.parentA,
      `select public.upsert_position($1::uuid, $2::uuid, 'in_app', 'DRAFT',
                                     '{}'::jsonb, null, null, 0)`,
      [POSITION_B, fx.parentAId],
    );
    expect(code).toBe("42501");
  });

  it("a signed-in parent cannot execute upsert_connection", async () => {
    const code = await refusedAs(
      db,
      fx.parentA,
      `select public.upsert_connection($1::uuid, $2::uuid, $3::uuid, $4::uuid,
                                       'REQUEST_SENT', 'nanny_application', '{}'::jsonb, 0)`,
      [CONNECTION_1, fx.positionA, fx.parentAId, fx.nannyVisibleId],
    );
    expect(code).toBe("42501");
  });

  it("a signed-in parent cannot execute upsert_placement", async () => {
    const code = await refusedAs(
      db,
      fx.parentA,
      `select public.upsert_placement($1::uuid, $2::uuid, $3::uuid, $4::uuid,
                                      'invite_shell', 'CONFIRMED', '{}'::jsonb, null, 0)`,
      [PLACEMENT_1, fx.positionA, fx.parentAId, fx.nannyVisibleId],
    );
    expect(code).toBe("42501");
  });

  it("an anonymous visitor cannot execute any of the three", async () => {
    for (const sql of [
      `select public.upsert_position($1::uuid, $1::uuid, 'in_app', 'DRAFT', '{}'::jsonb, null, null, 0)`,
      `select public.upsert_connection($1::uuid, $1::uuid, $1::uuid, $1::uuid, 'REQUEST_SENT', 'nanny_application', '{}'::jsonb, 0)`,
      `select public.upsert_placement($1::uuid, $1::uuid, $1::uuid, $1::uuid, 'invite_shell', 'CONFIRMED', '{}'::jsonb, null, 0)`,
    ]) {
      expect(await refusedAs(db, null, sql, [POSITION_C])).toBe("42501");
    }
  });
});
