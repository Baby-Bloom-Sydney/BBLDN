// Fixtures and the role-assumption helper `int.rls` runs on (05 §4.2).
//
// Everything happens inside one transaction that is rolled back, so the suite leaves the database
// exactly as `supabase db reset` left it and can be re-run without a reset.
//
// `asRole` reproduces what PostgREST does per request: `SET LOCAL ROLE <role>` plus the request's
// JWT claims in a GUC, which is where `auth.uid()` reads the subject from. Testing policies any
// other way — as `postgres`, which has BYPASSRLS — would assert nothing at all.
import type { Client, QueryResultRow } from "pg";

export type Fixtures = {
  readonly parentA: string;
  readonly parentB: string;
  readonly nannyVisible: string;
  readonly nannyIsolated: string;
  readonly admin: string;
  readonly nannyVisibleId: string;
  readonly nannyIsolatedId: string;
  readonly parentAId: string;
  readonly positionA: string;
  readonly childA: string;
};

const uuid = (n: number): string =>
  `${n.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;

async function makeUser(
  db: Client,
  id: string,
  email: string,
  role: "parent" | "nanny" | "admin",
): Promise<void> {
  await db.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                             email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                             created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
             'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
    [id, email],
  );
  await db.query(
    `insert into public.user_roles (user_id, role) values ($1, $2)`,
    [id, role],
  );
  await db.query(
    `insert into public.user_profiles (user_id, first_name, last_name, email, district, area)
     values ($1, 'Test', 'User', $2, 'SW4', 'Clapham')`,
    [id, email],
  );
}

/** Builds the world every RLS assertion is made against. Caller owns the transaction. */
export async function seedFixtures(db: Client): Promise<Fixtures> {
  const parentA = uuid(1);
  const parentB = uuid(2);
  const nannyVisible = uuid(3);
  const nannyIsolated = uuid(4);
  const admin = uuid(5);

  await makeUser(db, parentA, "parent-a@example.test", "parent");
  await makeUser(db, parentB, "parent-b@example.test", "parent");
  await makeUser(db, nannyVisible, "nanny-visible@example.test", "nanny");
  await makeUser(db, nannyIsolated, "nanny-isolated@example.test", "nanny");
  await makeUser(db, admin, "admin@example.test", "admin");

  const { rows: pa } = await db.query<{ id: string }>(
    `insert into public.parents (user_id, signup_source) values ($1, 'cold') returning id`,
    [parentA],
  );
  await db.query(
    `insert into public.parents (user_id, signup_source) values ($1, 'cold')`,
    [parentB],
  );

  // visible: profile on, not isolated, L3 — the nanny_public predicate
  const { rows: nv } = await db.query<{ id: string }>(
    `insert into public.nannies (user_id, profile_visible, is_isolated, verification_level)
     values ($1, true, false, 'L3_PROVISIONALLY_VERIFIED') returning id`,
    [nannyVisible],
  );
  // isolated: created by a child invite, so out of every candidate set (I-5)
  const { rows: ni } = await db.query<{ id: string }>(
    `insert into public.nannies (user_id, profile_visible, is_isolated, verification_level)
     values ($1, true, true, 'L4_FULLY_VERIFIED') returning id`,
    [nannyIsolated],
  );

  const { rows: pos } = await db.query<{ id: string }>(
    `insert into public.nanny_positions (parent_id, source, stage, title, district, area)
     values ($1, 'in_app', 'OPEN', 'Parent A position', 'SW4', 'Clapham') returning id`,
    [pa[0].id],
  );
  await db.query(
    `insert into public.position_children (position_id, child_label, age_months, needs_details)
     values ($1, 'A', 18, 'private care needs')`,
    [pos[0].id],
  );

  const { rows: child } = await db.query<{ id: string }>(
    `insert into public.children (parent_user_id, first_name, date_of_birth)
     values ($1, 'Child A', current_date - 400) returning id`,
    [parentA],
  );

  return {
    parentA,
    parentB,
    nannyVisible,
    nannyIsolated,
    admin,
    nannyVisibleId: nv[0].id,
    nannyIsolatedId: ni[0].id,
    parentAId: pa[0].id,
    positionA: pos[0].id,
    childA: child[0].id,
  };
}

/**
 * Run `sql` as a PostgREST request would: the `authenticated` (or `anon`) role, with the JWT
 * claims a real session carries. Restores `postgres` afterwards so the fixture transaction can
 * carry on.
 */
export async function asRole<T extends QueryResultRow = QueryResultRow>(
  db: Client,
  userId: string | null,
  sql: string,
  params: ReadonlyArray<unknown> = [],
): Promise<ReadonlyArray<T>> {
  const role = userId === null ? "anon" : "authenticated";
  const claims = JSON.stringify({ sub: userId, role });
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
  await db.query(`set local role ${role}`);
  try {
    const { rows } = await db.query<T>(sql, params as unknown[]);
    await db.query("reset role");
    return rows;
  } catch (error) {
    // A failed statement aborts the transaction block, so `reset role` would fail too. The caller
    // (`refusedAs`, or the test) rolls back to its savepoint, which restores the role with it.
    throw error;
  }
}

/** Asserts a statement is refused. Returns the SQLSTATE so a test can be specific about why. */
export async function refusedAs(
  db: Client,
  userId: string | null,
  sql: string,
  params: ReadonlyArray<unknown> = [],
): Promise<string> {
  await db.query("savepoint rls_probe");
  try {
    await asRole(db, userId, sql, params);
    await db.query("rollback to savepoint rls_probe");
    return "NO_ERROR";
  } catch (error) {
    const code = (error as { code?: string }).code ?? "UNKNOWN";
    await db.query("rollback to savepoint rls_probe");
    await db.query("reset role");
    return code;
  }
}
