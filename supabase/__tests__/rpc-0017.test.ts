// `int.rpc-0017` — the three definers `0017` adds, **invoked**, not inspected.
//
// `db.constraints` asserts their metadata (SECURITY DEFINER, pinned `search_path`, owner, grants) and
// `int.rls` never calls them, so without this file the migration's central claims — the signup pair lands,
// the limiter counts, a cookie choice supersedes the previous one — were only ever read, never run. The
// `database-reviewer` named that gap (L-3), and it is the gap that let a real concurrency bug in
// `record_cookie_consent` (H-1) sit unnoticed behind 151 passing tests.
//
// Everything runs inside one transaction that is rolled back, like `int.rls`, so the suite leaves the
// database exactly as it found it and can be re-run without a reset.
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

let db: Client;

const USER = "0017a000-0000-4000-8000-000000000000";
const VISITOR = "visitor-0017";

beforeAll(async () => {
  db = await connect();
});
afterAll(async () => {
  await db?.end();
});

beforeEach(async () => {
  await db.query("begin");
});
afterEach(async () => {
  await db.query("rollback");
});

/** What PostgREST does per request: the role, plus the JWT claims `auth.uid()` reads the subject from. */
async function asAuthenticated<T extends Record<string, unknown>>(
  userId: string,
  sql: string,
  params: ReadonlyArray<unknown> = [],
): Promise<ReadonlyArray<T>> {
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
  await db.query("set local role authenticated");
  const { rows } = await db.query<T>(sql, params as unknown[]);
  await db.query("reset role");
  return rows;
}

async function makeAuthUser(id: string, email: string): Promise<void> {
  await db.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                             email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                             created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
             'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
    [id, email],
  );
}

describe("create_parent_profile() — the signup pair (02 §4.1; L-007 1c)", () => {
  beforeEach(async () => {
    await makeAuthUser(USER, "signup-0017@example.test");
  });

  it("mints one user_roles row and one user_profiles row for the calling session", async () => {
    await asAuthenticated(
      USER,
      `select public.create_parent_profile($1, $2, $3)`,
      ["Ada", "Lovelace", "+447700900123"],
    );

    const { rows: roles } = await db.query<{ role: string }>(
      `select role::text from public.user_roles where user_id = $1`,
      [USER],
    );
    const { rows: profiles } = await db.query<{
      first_name: string;
      last_name: string;
      mobile: string;
      email: string;
    }>(
      `select first_name, last_name, mobile, email::text from public.user_profiles where user_id = $1`,
      [USER],
    );

    expect(roles).toEqual([{ role: "parent" }]);
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({
      first_name: "Ada",
      last_name: "Lovelace",
      mobile: "+447700900123",
    });
    // C-8: `email` mirrors the auth email, and the function reads it rather than taking it
    expect(profiles[0]?.email).toBe("signup-0017@example.test");
  });

  it("is idempotent — a retried signup is a no-op, not a second row and not an error", async () => {
    const call = `select public.create_parent_profile('Ada', 'Lovelace', '+447700900123')`;
    await asAuthenticated(USER, call);
    await asAuthenticated(USER, call);

    const { rows } = await db.query<{ profiles: string; roles: string }>(
      `select (select count(*) from public.user_profiles where user_id = $1) as profiles,
              (select count(*) from public.user_roles    where user_id = $1) as roles`,
      [USER],
    );
    expect(rows[0]).toEqual({ profiles: "1", roles: "1" });
  });

  it("never re-roles an existing user — a nanny who reaches it stays a nanny", async () => {
    await db.query(
      `insert into public.user_roles (user_id, role) values ($1, 'nanny')`,
      [USER],
    );

    await asAuthenticated(
      USER,
      `select public.create_parent_profile('Ada', 'L', '+447700900123')`,
    );

    const { rows } = await db.query<{ role: string }>(
      `select role::text from public.user_roles where user_id = $1`,
      [USER],
    );
    expect(rows).toEqual([{ role: "nanny" }]);
  });

  it("refuses without a session — it mints for auth.uid(), and there is no id to pass instead", async () => {
    await db.query("savepoint no_session");
    await expect(
      db.query(
        `select public.create_parent_profile('Ada', 'L', '+447700900123')`,
      ),
    ).rejects.toThrow();
    await db.query("rollback to savepoint no_session");
  });
});

describe("consume_rate_limit() — the shared token bucket (07 §8; ADR-131 (3))", () => {
  const consume = async (
    bucket: string,
    windowSeconds: number,
    now: string,
  ) => {
    const { rows } = await db.query<{ count: number; reset_at: Date }>(
      `select * from public.consume_rate_limit($1, $2, $3::timestamptz)`,
      [bucket, windowSeconds, now],
    );
    return rows[0];
  };

  it("counts up inside one window and keeps the window it opened", async () => {
    const first = await consume("k-1", 60, "2026-09-17T11:17:00Z");
    const second = await consume("k-1", 60, "2026-09-17T11:17:30Z");

    expect(first?.count).toBe(1);
    expect(second?.count).toBe(2);
    // the window is the first caller's, not extended by the second — otherwise a steady stream of
    // requests would push the reset forward for ever and the limit would never release
    expect(second?.reset_at).toEqual(first?.reset_at);
  });

  it("rolls the window — and starts the new one at 1, not at the old count", async () => {
    await consume("k-2", 60, "2026-09-17T11:17:00Z");
    await consume("k-2", 60, "2026-09-17T11:17:30Z");

    const rolled = await consume("k-2", 60, "2026-09-17T11:19:00Z");

    expect(rolled?.count).toBe(1);
  });

  it("counts each bucket separately", async () => {
    await consume("k-3", 60, "2026-09-17T11:17:00Z");
    const other = await consume("k-4", 60, "2026-09-17T11:17:00Z");
    expect(other?.count).toBe(1);
  });
});

describe("record_cookie_consent() — the supersede chain (02 §4.1 row 7; ADR-127)", () => {
  const record = async (
    id: string,
    marketing: boolean,
  ): Promise<string | null> => {
    const { rows } = await db.query<{ record_cookie_consent: string | null }>(
      `select public.record_cookie_consent(
         $1::uuid, $2, 'custom'::public.cookie_choice, true, $3,
         now() + interval '1 year', now())`,
      [id, VISITOR, marketing],
    );
    return rows[0]?.record_cookie_consent ?? null;
  };

  const FIRST = "0017c001-0000-4000-8000-000000000000";
  const SECOND = "0017c002-0000-4000-8000-000000000000";
  const THIRD = "0017c003-0000-4000-8000-000000000000";

  it("the first choice supersedes nothing", async () => {
    expect(await record(FIRST, true)).toBeNull();
  });

  it("a change stamps the previous row and leaves exactly one current row", async () => {
    await record(FIRST, true);
    const superseded = await record(SECOND, false);

    expect(superseded).toBe(FIRST);

    const { rows } = await db.query<{
      id: string;
      superseded_by: string | null;
    }>(
      `select id, superseded_by from public.cookie_consent_records
        where visitor_id = $1 order by created_at`,
      [VISITOR],
    );
    expect(rows).toEqual([
      { id: FIRST, superseded_by: SECOND },
      { id: SECOND, superseded_by: null },
    ]);
  });

  it("chains across three changes — the partial unique index is never violated", async () => {
    await record(FIRST, true);
    await record(SECOND, false);
    expect(await record(THIRD, true)).toBe(SECOND);

    const { rows } = await db.query<{ current: string }>(
      `select count(*)::text as current from public.cookie_consent_records
        where visitor_id = $1 and superseded_by is null`,
      [VISITOR],
    );
    expect(rows[0]?.current).toBe("1");
  });
});
