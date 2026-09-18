// `int.seed` — the development seed (06 §2.3; TRIAGE `12.09`, the `2f` unit).
//
// The seed is the one thing in this tree that writes *people* into a database, so what it refuses matters as
// much as what it writes. Three claims are load-bearing and each ships as a case here:
//
//   1. **It cannot run against production.** Two independent gates, neither of which trusts the other: the
//      environment signal the boot reads (`resolveEnvironment`, 06 §2.1) and the target database itself.
//   2. **Nobody in it is real.** Every account is on the test-user domain, every mobile is inside Ofcom's
//      reserved drama range, every DBS certificate number has the right *shape* (config) and is drawn from a
//      visibly synthetic block, and every profile carries `is_test_user` (02 §4.1, ADR-024).
//   3. **No level is asserted by hand.** The seed writes section columns and then calls
//      `sync_nanny_verification_state()` — 0023's ONE writer (ADR-157) — so a seeded world cannot disagree
//      with the product's own derivation. If it could, the seed would be the first place London's level model
//      silently forked.
//
// Everything runs inside one transaction that is rolled back, like `int.rls` and `int.rpc-0024`.
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
import { LOCALE } from "@/modules/config/locale";
import { MATCHING } from "@/modules/config/matching";
import { TEST_USER_DOMAIN } from "@/modules/config/testUserDomain";
import { VETTING } from "@/modules/config/vetting";
import { connect } from "./db-client";
import { applySeed } from "../seed/lib/apply-seed";
import { pickSeedAreas } from "../seed/lib/pick-seed-areas";
import { realDataRefusals } from "../seed/lib/real-data-refusals";
import { seedPlan } from "../seed/lib/seed-plan";
import { syntheticDbsNumber } from "../seed/lib/synthetic-dbs-number";
import { syntheticPerson } from "../seed/lib/synthetic-person";
import { targetRefusals } from "../seed/lib/target-refusals";
import type { SeedReport } from "../seed/lib/types";

const LOCAL_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const REMOTE_URL =
  "postgresql://postgres:pw@db.abcdefghijklmnop.supabase.co:5432/postgres";
/** Ofcom reserved drama range for UK mobiles: 07700 900000 – 900999 (E.164 `+447700900xxx`). */
const DRAMA_RANGE = new RegExp(`^\\${LOCALE.phonePrefix}7700900[0-9]{3}$`);

let db: Client;

beforeAll(async () => {
  db = await connect();
});
afterAll(async () => {
  await db.end();
});
beforeEach(async () => {
  await db.query("begin");
});
afterEach(async () => {
  await db.query("rollback");
});

describe("target refusals — the environment signal and the database URL", () => {
  it("refuses when VERCEL_ENV says production", () => {
    const codes = targetRefusals({ VERCEL_ENV: "production" }, LOCAL_URL).map(
      (r) => r.code,
    );
    expect(codes).toContain("PRODUCTION_ENVIRONMENT");
  });

  it("refuses off-Vercel production (NODE_ENV, no build phase) — the same road the boot guard's case 6 walks", () => {
    const codes = targetRefusals({ NODE_ENV: "production" }, LOCAL_URL).map(
      (r) => r.code,
    );
    expect(codes).toContain("PRODUCTION_ENVIRONMENT");
  });

  it("refuses a remote database by default — an allow-list, not a deny-list, so a new project ref is refused", () => {
    const codes = targetRefusals({}, REMOTE_URL).map((r) => r.code);
    expect(codes).toContain("REMOTE_TARGET_NOT_ALLOWED");
  });

  it("refuses a remote database whose ref is not the one named in the allow-list", () => {
    const codes = targetRefusals(
      { BBLDN_SEED_ALLOWED_PROJECT_REFS: "qrstuvwxyzabcdef" },
      REMOTE_URL,
    ).map((r) => r.code);
    expect(codes).toContain("REMOTE_TARGET_NOT_ALLOWED");
  });

  it("allows a remote database whose ref IS named — and still refuses it in production", () => {
    const allowed = { BBLDN_SEED_ALLOWED_PROJECT_REFS: "abcdefghijklmnop" };
    expect(targetRefusals(allowed, REMOTE_URL)).toEqual([]);
    const codes = targetRefusals(
      { ...allowed, VERCEL_ENV: "production" },
      REMOTE_URL,
    ).map((r) => r.code);
    expect(codes).toContain("PRODUCTION_ENVIRONMENT");
  });

  it("is clean for the local stack on a development machine", () => {
    expect(targetRefusals({}, LOCAL_URL)).toEqual([]);
  });
});

describe("real-data refusals — what the target database itself says", () => {
  it("is clean on a database built from the migrations alone", async () => {
    expect(await realDataRefusals(db)).toEqual([]);
  });

  it("refuses when one profile is not a test user", async () => {
    const id = "aaaaaaaa-0000-4000-8000-000000000001";
    await insertAccount(db, id, `real-person@${TEST_USER_DOMAIN}`);
    await db.query(
      `insert into public.user_profiles (user_id, first_name, email, is_test_user)
       values ($1, 'Real', $2, false)`,
      [id, `real-person@${TEST_USER_DOMAIN}`],
    );
    const codes = (await realDataRefusals(db)).map((r) => r.code);
    expect(codes).toContain("REAL_PERSON_PRESENT");
  });

  it("refuses when one account lives outside the test-user domain, even flagged as a test user", async () => {
    const id = "aaaaaaaa-0000-4000-8000-000000000002";
    await insertAccount(db, id, "someone@a-real-domain.example");
    await db.query(
      `insert into public.user_profiles (user_id, first_name, email, is_test_user)
       values ($1, 'Someone', 'someone@a-real-domain.example', true)`,
      [id],
    );
    const codes = (await realDataRefusals(db)).map((r) => r.code);
    expect(codes).toContain("REAL_ACCOUNT_PRESENT");
  });

  it("refuses a second run over a database the seed has already written", async () => {
    await applySeed(db, seedPlan(await pickSeedAreas(db, 5)));
    const codes = (await realDataRefusals(db)).map((r) => r.code);
    expect(codes).toContain("ALREADY_SEEDED");
  });
});

describe("the seeded world", () => {
  let report: SeedReport;

  beforeEach(async () => {
    report = await applySeed(db, seedPlan(await pickSeedAreas(db, 5)));
  });

  it("puts a pool of verified nannies across several real London areas", async () => {
    expect(report.areas).toHaveLength(5);
    const { rows } = await db.query<{ area: string; n: string }>(
      `select up.area, count(*) n from public.nanny_public np
         join public.nannies nn on nn.id = np.nanny_id
         join public.user_profiles up on up.user_id = nn.user_id
        where np.verification_level >= 'L3_PROVISIONALLY_VERIFIED'
        group by up.area order by up.area`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(report.areas.length);
    const pooled = rows.reduce((sum, row) => sum + Number(row.n), 0);
    expect(pooled).toBe(
      report.counts.poolNannies + report.counts.stateNanniesInPool,
    );
  });

  it("every district it writes is an active row in `areas` — the seed invents no geography", async () => {
    const { rows } = await db.query<{ n: string }>(
      `select count(*) n from public.user_profiles up
        where up.district is not null
          and not exists (select 1 from public.areas a where a.district = up.district and a.is_active)`,
    );
    expect(Number(rows[0].n)).toBe(0);
  });

  it("derives every level through `sync_nanny_verification_state`, never by hand", async () => {
    const { rows } = await db.query<{ n: string }>(
      `select count(*) n from public.nannies nn
         join public.verifications v on v.nanny_id = nn.id
        where nn.verification_synced_at is null or v.level <> nn.verification_level`,
    );
    expect(Number(rows[0].n)).toBe(0);
  });

  it("shows the admin queue one submission in each state it has to tell apart", async () => {
    const { rows } = await db.query<{ status: string }>(
      `select distinct status::text from public.vetting_submissions order by 1`,
    );
    expect(rows.map((r) => r.status)).toEqual(
      expect.arrayContaining(["needs_admin", "passed", "pending"]),
    );
  });

  it("carries a nanny at every verification level the model has", async () => {
    const { rows } = await db.query<{ level: string }>(
      `select distinct verification_level::text level from public.nannies order by 1`,
    );
    expect(rows.map((r) => r.level)).toEqual(
      expect.arrayContaining([
        "L0_SIGNED_UP",
        "L1_REGISTERED",
        "L2_ID_VERIFIED",
        "L3_PROVISIONALLY_VERIFIED",
        "L4_FULLY_VERIFIED",
      ]),
    );
  });

  it("suspends the barred nanny at L0 and keeps her out of the pool (I-V5, ADR-158)", async () => {
    const { rows } = await db.query<{
      level: string;
      suspended: string | null;
      visible: string;
    }>(
      `select nn.verification_level::text level,
              nn.suspended_at::text suspended,
              (exists (select 1 from public.nanny_public np where np.nanny_id = nn.id))::text visible
         from public.nannies nn
         join public.verifications v on v.nanny_id = nn.id
        where v.dbs_outcome = 'barred'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].level).toBe("L0_SIGNED_UP");
    expect(rows[0].suspended).not.toBeNull();
    expect(rows[0].visible).toBe("false");
  });

  it("holds one connection for verification, on a nanny who is in the pool but not yet L4", async () => {
    const { rows } = await db.query<{ level: string; held_at: string | null }>(
      `select nn.verification_level::text level, c.held_at::text held_at
         from public.connection_requests c
         join public.nannies nn on nn.id = c.nanny_id
        where c.held_for_verification`,
    );
    expect(rows).toHaveLength(report.counts.heldConnections);
    expect(rows[0].level).toBe("L3_PROVISIONALLY_VERIFIED");
    expect(rows[0].held_at).not.toBeNull();
  });

  it("keeps the invited nanny isolated and out of every public read (I-5, ADR-017)", async () => {
    const { rows } = await db.query<{ n: string }>(
      `select count(*) n from public.nannies nn
        where nn.is_isolated
          and exists (select 1 from public.nanny_public np where np.nanny_id = nn.id)`,
    );
    expect(Number(rows[0].n)).toBe(0);
    expect(report.counts.isolatedNannies).toBe(1);
  });

  it("gives the demo family an OPEN position in a seeded area, so a quick match has candidates", async () => {
    const { rows } = await db.query<{ n: string }>(
      `select count(*) n from public.nanny_public np
         join public.nannies nn on nn.id = np.nanny_id
         join public.user_profiles up on up.user_id = nn.user_id
         join public.nanny_positions p on p.district = up.district
        where p.stage = 'OPEN' and np.verification_level >= 'L3_PROVISIONALLY_VERIFIED'`,
    );
    expect(Number(rows[0].n)).toBeGreaterThanOrEqual(
      MATCHING.quickMatch.topCount,
    );
  });
});

describe("nobody in it is real", () => {
  beforeEach(async () => {
    await applySeed(db, seedPlan(await pickSeedAreas(db, 5)));
  });

  it("puts every account on the test-user domain and flags every profile (ADR-024)", async () => {
    const { rows } = await db.query<{ off_domain: string; unflagged: string }>(
      `select (select count(*) from auth.users where email not like $1) off_domain,
              (select count(*) from public.user_profiles where not is_test_user) unflagged`,
      [`%@${TEST_USER_DOMAIN}`],
    );
    expect(Number(rows[0].off_domain)).toBe(0);
    expect(Number(rows[0].unflagged)).toBe(0);
  });

  it("uses only Ofcom's reserved drama range for mobiles — no number that could ring a person", async () => {
    const { rows } = await db.query<{ mobile: string }>(
      `select mobile from public.user_profiles where mobile is not null`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.mobile).toMatch(DRAMA_RANGE);
  });

  it("writes DBS certificate numbers of the config shape, from a visibly synthetic block", async () => {
    const shape = new RegExp(VETTING.dbsCertificateNumber.pattern);
    const { rows } = await db.query<{ number: string }>(
      `select dbs_certificate_number as number from public.verifications
        where dbs_certificate_number is not null`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.number).toMatch(shape);
      expect(row.number).toBe(syntheticDbsNumber(Number(row.number.slice(-4))));
    }
  });

  it("stores no document object, no URL and no share code (I-V7; 07 §6 row 5)", async () => {
    const { rows } = await db.query<{ n: string }>(
      `select count(*) n from public.verifications
        where identity_document_ref is not null or identity_selfie_ref is not null
           or dbs_certificate_ref is not null or rtw_document_ref is not null
           or rtw_share_code is not null`,
    );
    expect(Number(rows[0].n)).toBe(0);
  });
});

describe("the synthetic person", () => {
  it("builds its address and mobile from config, and is stable for the same index", () => {
    const first = syntheticPerson("nanny", 7);
    expect(first).toEqual(syntheticPerson("nanny", 7));
    expect(first.email.endsWith(`@${TEST_USER_DOMAIN}`)).toBe(true);
    expect(first.mobile).toMatch(DRAMA_RANGE);
  });

  it("gives every role its own id space, so two roles at the same index never collide", () => {
    expect(syntheticPerson("nanny", 7).id).not.toBe(
      syntheticPerson("parent", 7).id,
    );
  });
});

async function insertAccount(
  db: Client,
  id: string,
  email: string,
): Promise<void> {
  await db.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                             email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                             created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
             'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
    [id, email],
  );
}
