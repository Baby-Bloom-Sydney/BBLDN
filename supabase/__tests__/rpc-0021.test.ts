// `int.rpc-0021` — the three definers `0021` adds, **invoked**, not inspected (ADR-152).
//
// `0021`'s own verify block stops at metadata deliberately; this suite is where the claims live: the
// signup mints four rows in one call, `is_isolated` comes from the argument and nowhere else, a lead
// converts only when unclaimed and the email matches (ADR-145 (2)), the guarded columns cannot be
// written through the profile road, `profile_visible` is computed and not accepted, and the isolation
// lift is the one writer of the flag and mirrors the worklist tag. Every write runs as `authenticated`
// under the caller's own claims, the way PostgREST would run it.
//
// Everything runs inside one transaction that is rolled back, like `int.rpc-0017`, so the suite leaves
// the database exactly as it found it.
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

const NANNY = "0021a000-0000-4000-8000-000000000001";
const OTHER = "0021a000-0000-4000-8000-000000000002";
const PARENT = "0021a000-0000-4000-8000-000000000003";
const LEAD = "0021b000-0000-4000-8000-000000000001";

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

/**
 * One statement as one PostgREST request would run it: the role and the JWT claims `auth.uid()` reads the
 * subject from, inside a **savepoint** — so an expected refusal (a 42501, a CHECK) does not abort the suite's
 * transaction for the assertions that follow it, and the refusal itself is what reaches the caller rather than
 * the "transaction is aborted" the `reset role` would otherwise throw over it.
 */
async function asRole<T extends Record<string, unknown>>(
  role: "authenticated" | "anon",
  claims: Record<string, unknown>,
  sql: string,
  params: ReadonlyArray<unknown> = [],
): Promise<ReadonlyArray<T>> {
  await db.query("savepoint as_role");
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(claims),
    ]);
    await db.query(`set local role ${role}`);
    const { rows } = await db.query<T>(sql, params as unknown[]);
    await db.query("reset role");
    await db.query("release savepoint as_role");
    return rows;
  } catch (error) {
    await db.query("rollback to savepoint as_role");
    throw error;
  }
}

const asAuthenticated = <T extends Record<string, unknown>>(
  userId: string,
  sql: string,
  params: ReadonlyArray<unknown> = [],
): Promise<ReadonlyArray<T>> =>
  asRole<T>(
    "authenticated",
    { sub: userId, role: "authenticated" },
    sql,
    params,
  );

const asAnon = (sql: string): Promise<unknown> => asRole("anon", {}, sql);

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

async function aDistrict(): Promise<string> {
  const { rows } = await db.query<{ district: string }>(
    "select district from public.areas order by district limit 1",
  );
  return rows[0]!.district;
}

const create = (
  userId: string,
  args: {
    isolated: boolean;
    leadId?: string | null;
    profile?: Record<string, unknown>;
    district?: string | null;
    mobile?: string | null;
  },
) =>
  asAuthenticated<{ out: { nanny_id: string; lead_converted: boolean } }>(
    userId,
    `select public.create_nanny_account($1, $2, $3, $4, $5, $6, $7, $8::jsonb) as out`,
    [
      "Amara",
      "Okafor",
      args.isolated,
      args.mobile ?? null,
      args.district ?? null,
      args.district === undefined ? null : "Test Area",
      args.leadId ?? null,
      JSON.stringify(args.profile ?? {}),
    ],
  ).then((rows) => rows[0]!.out);

describe("create_nanny_account() — the signup pair + the party row + the contact state (ADR-152 (1))", () => {
  beforeEach(async () => {
    await makeAuthUser(NANNY, "amara-0021@example.test");
  });

  it("mints user_roles, user_profiles, nannies and nanny_contact_state in one call, is_isolated from the argument", async () => {
    const district = await aDistrict();
    const out = await create(NANNY, {
      isolated: false,
      district,
      mobile: "+447700900001",
    });
    expect(out.lead_converted).toBe(false);

    const role = await db.query(
      "select role from public.user_roles where user_id = $1",
      [NANNY],
    );
    expect(role.rows[0]).toEqual({ role: "nanny" });
    const profile = await db.query(
      "select first_name, email, mobile, district, area from public.user_profiles where user_id = $1",
      [NANNY],
    );
    expect(profile.rows[0]).toMatchObject({
      first_name: "Amara",
      email: "amara-0021@example.test",
      mobile: "+447700900001",
      district,
      area: "Test Area",
    });
    const nanny = await db.query(
      "select id, is_isolated, isolation_lifted_at, profile_visible, verification_level from public.nannies where user_id = $1",
      [NANNY],
    );
    expect(nanny.rows[0]).toMatchObject({
      id: out.nanny_id,
      is_isolated: false,
      isolation_lifted_at: null,
      profile_visible: false,
      verification_level: "L0_SIGNED_UP",
    });
    const state = await db.query(
      "select lead_status, is_isolated from public.nanny_contact_state where nanny_user_id = $1",
      [NANNY],
    );
    expect(state.rows[0]).toEqual({
      lead_status: "untouched",
      is_isolated: false,
    });
  });

  it("an invited nanny (S-X-07) is created isolated, with no mobile and no district", async () => {
    await create(NANNY, { isolated: true });
    const nanny = await db.query(
      "select is_isolated from public.nannies where user_id = $1",
      [NANNY],
    );
    expect(nanny.rows[0]).toEqual({ is_isolated: true });
    const state = await db.query(
      "select is_isolated from public.nanny_contact_state where nanny_user_id = $1",
      [NANNY],
    );
    expect(state.rows[0]).toEqual({ is_isolated: true });
  });

  it("is idempotent — a second call answers the existing nanny_id and changes nothing", async () => {
    const first = await create(NANNY, { isolated: false });
    const second = await create(NANNY, { isolated: true });
    expect(second.nanny_id).toBe(first.nanny_id);
    const nanny = await db.query(
      "select is_isolated from public.nannies where user_id = $1",
      [NANNY],
    );
    expect(nanny.rows[0]).toEqual({ is_isolated: false });
  });

  it("writes the profile columns it is given and drops a guarded key", async () => {
    await create(NANNY, {
      isolated: false,
      profile: {
        bio: "Ten years with under-fives.",
        years_experience: 10,
        qualification: "level-3",
        hourly_rate_min_pence: 1600,
        verification_level: "L4_FULLY_VERIFIED",
        is_isolated: true,
        profile_visible: true,
      },
    });
    const nanny = await db.query(
      "select bio, years_experience, qualification, hourly_rate_min_pence, verification_level, is_isolated, profile_visible from public.nannies where user_id = $1",
      [NANNY],
    );
    expect(nanny.rows[0]).toEqual({
      bio: "Ten years with under-fives.",
      years_experience: 10,
      qualification: "level-3",
      hourly_rate_min_pence: 1600,
      verification_level: "L0_SIGNED_UP",
      is_isolated: false,
      profile_visible: false,
    });
  });

  it("refuses an anonymous caller (42501) and a user who already holds another role", async () => {
    await expect(
      asAnon("select public.create_nanny_account('A', 'B', false)"),
    ).rejects.toMatchObject({ code: "42501" });

    await makeAuthUser(PARENT, "parent-0021@example.test");
    await db.query(
      "insert into public.user_roles (user_id, role) values ($1, 'parent')",
      [PARENT],
    );
    await expect(create(PARENT, { isolated: false })).rejects.toMatchObject({
      code: "42501",
    });
    const nanny = await db.query(
      "select 1 from public.nannies where user_id = $1",
      [PARENT],
    );
    expect(nanny.rowCount).toBe(0);
  });

  describe("lead conversion — ADR-145 (2) applied to nanny_leads", () => {
    const seedLead = (email: string) =>
      db.query(
        `insert into public.nanny_leads (id, first_name, last_name, email, lead_status)
         values ($1, 'Amara', 'Okafor', $2, 'applied')`,
        [LEAD, email],
      );

    it("converts an unclaimed lead whose email is the account's, case-insensitively, and links it", async () => {
      await seedLead("Amara-0021@Example.test");
      const out = await create(NANNY, { isolated: false, leadId: LEAD });
      expect(out.lead_converted).toBe(true);
      const lead = await db.query(
        "select lead_status, auth_user_id, converted_at is not null as converted from public.nanny_leads where id = $1",
        [LEAD],
      );
      expect(lead.rows[0]).toEqual({
        lead_status: "converted",
        auth_user_id: NANNY,
        converted: true,
      });
      const nanny = await db.query(
        "select lead_id from public.nannies where user_id = $1",
        [NANNY],
      );
      expect(nanny.rows[0]).toEqual({ lead_id: LEAD });
    });

    it("ignores a lead captured under another address — the account still stands", async () => {
      await seedLead("someone-else-0021@example.test");
      const out = await create(NANNY, { isolated: false, leadId: LEAD });
      expect(out.lead_converted).toBe(false);
      const lead = await db.query(
        "select lead_status, auth_user_id from public.nanny_leads where id = $1",
        [LEAD],
      );
      expect(lead.rows[0]).toEqual({
        lead_status: "applied",
        auth_user_id: null,
      });
      const nanny = await db.query(
        "select lead_id from public.nannies where user_id = $1",
        [NANNY],
      );
      expect(nanny.rows[0]).toEqual({ lead_id: null });
    });

    it("ignores a lead that was already converted by someone else", async () => {
      await makeAuthUser(OTHER, "other-0021@example.test");
      await seedLead("amara-0021@example.test");
      await db.query(
        "update public.nanny_leads set lead_status = 'converted', converted_at = now(), auth_user_id = $2 where id = $1",
        [LEAD, OTHER],
      );
      const out = await create(NANNY, { isolated: false, leadId: LEAD });
      expect(out.lead_converted).toBe(false);
      const lead = await db.query(
        "select auth_user_id from public.nanny_leads where id = $1",
        [LEAD],
      );
      expect(lead.rows[0]).toEqual({ auth_user_id: OTHER });
    });
  });
});

describe("update_nanny_profile() — the nanny's own row; profile_visible is computed, never accepted (ADR-152 (2))", () => {
  const update = (
    profile: Record<string, unknown>,
    contact: Record<string, unknown> = {},
  ) =>
    asAuthenticated<{ complete: boolean }>(
      NANNY,
      "select public.update_nanny_profile($1::jsonb, $2::jsonb) as complete",
      [JSON.stringify(profile), JSON.stringify(contact)],
    ).then((rows) => rows[0]!.complete);

  beforeEach(async () => {
    await makeAuthUser(NANNY, "amara-0021@example.test");
    await create(NANNY, { isolated: true });
  });

  it("refuses a session with no nannies row and an anonymous caller", async () => {
    await makeAuthUser(OTHER, "other-0021@example.test");
    await expect(
      asAuthenticated(
        OTHER,
        "select public.update_nanny_profile('{}'::jsonb, '{}'::jsonb)",
      ),
    ).rejects.toMatchObject({ code: "P0002" });
    await expect(
      asAnon("select public.update_nanny_profile('{}'::jsonb, '{}'::jsonb)"),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("an omitted key keeps its value; a present key is written; the completeness rule decides profile_visible", async () => {
    expect(await update({ bio: "Hello", years_experience: 4 })).toBe(false);
    expect(
      await update({ qualification: "level-3", hourly_rate_min_pence: 1500 }),
    ).toBe(false);
    const district = await aDistrict();
    expect(
      await update(
        { availability: { monday: ["morning"] } },
        { mobile: "+447700900002", district, area: "Test Area" },
      ),
    ).toBe(true);
    const nanny = await db.query(
      "select bio, years_experience, qualification, hourly_rate_min_pence, availability, profile_visible from public.nannies where user_id = $1",
      [NANNY],
    );
    expect(nanny.rows[0]).toEqual({
      bio: "Hello",
      years_experience: 4,
      qualification: "level-3",
      hourly_rate_min_pence: 1500,
      availability: { monday: ["morning"] },
      profile_visible: true,
    });
    const profile = await db.query(
      "select mobile, district, area from public.user_profiles where user_id = $1",
      [NANNY],
    );
    expect(profile.rows[0]).toEqual({
      mobile: "+447700900002",
      district,
      area: "Test Area",
    });
    // blanking a required field takes visibility away again — the rule is the one writer
    expect(await update({ bio: "" })).toBe(false);
    const again = await db.query(
      "select profile_visible from public.nannies where user_id = $1",
      [NANNY],
    );
    expect(again.rows[0]).toEqual({ profile_visible: false });
  });

  it("the guarded columns cannot be reached through the profile road", async () => {
    await update({
      is_isolated: false,
      verification_level: "L4_FULLY_VERIFIED",
      suspended_at: "2026-01-01T00:00:00Z",
      profile_visible: true,
      lead_id: LEAD,
      is_vaccinated: true,
    });
    const nanny = await db.query(
      "select is_isolated, verification_level, suspended_at, profile_visible, lead_id, is_vaccinated from public.nannies where user_id = $1",
      [NANNY],
    );
    expect(nanny.rows[0]).toEqual({
      is_isolated: true,
      verification_level: "L0_SIGNED_UP",
      suspended_at: null,
      profile_visible: false,
      lead_id: null,
      is_vaccinated: null,
    });
  });

  it("a bad mobile is refused by the table's own CHECK, not silently stored", async () => {
    await expect(update({}, { mobile: "0412 345 678" })).rejects.toMatchObject({
      code: "23514",
    });
  });
});

describe("lift_nanny_isolation() — the one writer of is_isolated → false (ADR-147 / ADR-152 (3))", () => {
  const lift = (userId: string) =>
    asAuthenticated<{ moved: boolean }>(
      userId,
      "select public.lift_nanny_isolation() as moved",
    ).then((rows) => rows[0]!.moved);

  beforeEach(async () => {
    await makeAuthUser(NANNY, "amara-0021@example.test");
    await create(NANNY, { isolated: true });
  });

  it("clears the flag, stamps the lift, mirrors the worklist tag, and answers true exactly once", async () => {
    expect(await lift(NANNY)).toBe(true);
    const nanny = await db.query(
      "select is_isolated, isolation_lifted_at is not null as stamped from public.nannies where user_id = $1",
      [NANNY],
    );
    expect(nanny.rows[0]).toEqual({ is_isolated: false, stamped: true });
    const state = await db.query(
      "select is_isolated from public.nanny_contact_state where nanny_user_id = $1",
      [NANNY],
    );
    expect(state.rows[0]).toEqual({ is_isolated: false });
    expect(await lift(NANNY)).toBe(false);
  });

  it("touches only the caller's own row", async () => {
    await makeAuthUser(OTHER, "other-0021@example.test");
    await create(OTHER, { isolated: true });
    await lift(NANNY);
    const other = await db.query(
      "select is_isolated from public.nannies where user_id = $1",
      [OTHER],
    );
    expect(other.rows[0]).toEqual({ is_isolated: true });
  });

  it("refuses an anonymous caller", async () => {
    await expect(
      asAnon("select public.lift_nanny_isolation()"),
    ).rejects.toMatchObject({
      code: "42501",
    });
  });

  it("is_active_nanny() — the jobs-board predicate of 0005 — follows the flag", async () => {
    const before = await asAuthenticated<{ active: boolean }>(
      NANNY,
      "select public.is_active_nanny() as active",
    );
    expect(before[0]).toEqual({ active: false });
    await lift(NANNY);
    const after = await asAuthenticated<{ active: boolean }>(
      NANNY,
      "select public.is_active_nanny() as active",
    );
    expect(after[0]).toEqual({ active: true });
  });
});
