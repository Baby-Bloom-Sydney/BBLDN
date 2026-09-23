// `int.self-service-purge` — **B-49**, against the applied set (L-009 `3k`).
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE DEFECT THIS SUITE EXISTS FOR
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// `3j`'s security pass measured it and left it deliberately unfixed: **every self-service erasure fails its
// 30-day purge, for ever.** `create-privacy.ts:39` sets `requested_by` to the subject's own id, so when
// `purge_auth_user()` deletes the `auth.users` row, Postgres' own referential action fires
//
//     UPDATE ONLY "public"."account_erasure_requests" SET "requested_by" = NULL WHERE $1 = "requested_by"
//
// — and that UPDATE runs under the **owner of `purge_auth_user()`**, which is `postgres`, not under the caller.
// `is_retention_job()` is therefore false inside the cascade, and `prevent_erasure_request_modification()`
// refuses with `restrict_violation`. The admin road survives only because `requested_by` names somebody else.
//
// It is not one table. Three `ON DELETE SET NULL` keys from `public` into `auth.users` land on a table whose
// UPDATE guard consults `is_retention_job()`, and each of the three refuses the cascade:
//
//   · `account_erasure_requests.requested_by`  → `prevent_erasure_request_modification()`
//   · `cookie_consent_records.user_id`         → `prevent_cookie_consent_modification()`
//   · `katie_prompt_edits.applied_by`          → `prevent_row_modification()`
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// AND THE SHAPE OF THE FIX, WHICH IS WHAT MOST OF THIS FILE ASSERTS
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// The obvious repair — admit `postgres` to `is_retention_job()` — is a **widening**: it would hand every
// `postgres`-owned definer in the schema, and the console owner, a standing licence to rewrite consent and
// erasure history. ADR-186 says a privilege answer must say *from where*, not merely *who*, so the fix does
// not touch the guard at all. `purge_scrubbed_user()` — the one body entitled, already running as
// `bbldn_retention`, where the guard already passes — **releases its own references immediately before the
// delete**, exactly as `0030` already does for `account_erasure_requests.subject_user_id` ("so the FK never
// has to act"). The cascade then has nothing left to write.
//
// So this suite asserts three things, and the third is the one that keeps the fix from becoming the hole:
//
//   1. both roads now purge, and the released rows survive with their reference nulled (§1);
//   2. the release set is the catalogue's, not a hand-typed three — and a fourth guarded key fails it (§2);
//   3. **the guard still refuses everything it refused before**, from every role this session can assume, and
//      the two new privileges are column-narrow and pinned to the one body that may use them (§3, §4).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

const MIGRATION = resolve(
  __dirname,
  "../migrations/0034_purge-releases-its-own-references.sql",
);

const WINDOWS = {
  money: { months: 72, from: "last-activity" },
  consent: { months: 72, from: "scrub" },
  safeguarding: { months: 12, from: "scrub" },
};

/**
 * The three `ON DELETE SET NULL` keys into `auth.users` whose table carries a guard that consults
 * `is_retention_job()`. Derived from the catalogue in §2 as well as written here, so neither can drift alone.
 */
const RELEASES: ReadonlyArray<readonly [string, string]> = [
  ["account_erasure_requests", "requested_by"],
  ["cookie_consent_records", "user_id"],
  ["katie_prompt_edits", "applied_by"],
];

type Answer = { outcome: string; reason?: string; table?: string };

let db: Client;
let seq = 0;

async function scrubbedSubject(): Promise<string> {
  seq += 1;
  const id = `00000b49-0000-4000-8000-${seq.toString(16).padStart(12, "0")}`;
  await db.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                             email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                             banned_until, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
             $2, null, now(), '{}'::jsonb, '{}'::jsonb, 'infinity', now(), now())`,
    [id, `deleted+${id}@invalid`],
  );
  await db.query(
    `insert into public.user_roles (user_id, role) values ($1, 'parent')`,
    [id],
  );
  return id;
}

/** A completed erasure on the road named, with `requested_by` set the way that road actually sets it. */
async function completedRequest(
  subjectId: string,
  road: "self-service" | "admin",
  requestedBy: string,
): Promise<void> {
  await db.query(
    `insert into public.account_erasure_requests
       (subject_user_id, requested_by, road, state, completed_at)
     values ($1, $2, $3, 'completed', now() - interval '31 days')`,
    [subjectId, requestedBy, road],
  );
}

async function purge(id: string): Promise<Answer> {
  const { rows } = await db.query<{ answer: Answer }>(
    `select public.purge_scrubbed_user($1, $2::jsonb) as answer`,
    [id, JSON.stringify(WINDOWS)],
  );
  return rows[0]!.answer;
}

async function stillThere(id: string): Promise<boolean> {
  const { rows } = await db.query(`select 1 from auth.users where id = $1`, [
    id,
  ]);
  return rows.length > 0;
}

/**
 * Runs one statement under an assumed role and rolls it back — `int.retention-grants`'s idiom, because a
 * privilege is measured by doing rather than by reading the catalogue.
 */
async function asRole(
  role: string,
  sql: string,
): Promise<{ raised: boolean; code?: string }> {
  await db.query("savepoint role_attempt");
  try {
    await db.query(`set local role ${role}`);
    await db.query(sql);
    await db.query("reset role");
    await db.query("rollback to savepoint role_attempt");
    return { raised: false };
  } catch (error) {
    await db.query("rollback to savepoint role_attempt");
    await db.query("reset role");
    return { raised: true, code: (error as { code?: string }).code };
  }
}

beforeAll(async () => {
  db = await connect();
  await db.query("begin");
});

// One savepoint per case, released whatever happened. A raised statement aborts the whole transaction, and
// every later case would then fail with `25P02` on a defect it did not find — which is how a suite about
// refusals reports one failure as thirty-eight. `rollback to savepoint` is legal inside an aborted
// transaction, so this is the only recovery that actually holds.
beforeEach(async () => {
  await db.query("savepoint case_start");
});

afterEach(async () => {
  await db.query("rollback to savepoint case_start");
  await db.query("release savepoint case_start");
});

afterAll(async () => {
  await db?.query("rollback");
  await db?.end();
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("int.self-service-purge — B-49, the defect and both roads", () => {
  it("★ B-49: a SELF-SERVICE erasure reaches its purge (it raised restrict_violation for ever)", async () => {
    const id = await scrubbedSubject();
    await completedRequest(id, "self-service", id);

    expect(await purge(id)).toMatchObject({ outcome: "purged" });
    expect(await stillThere(id)).toBe(false);
  });

  it("★ the ledger survives the purge with its subject AND its requester released", async () => {
    const id = await scrubbedSubject();
    await completedRequest(id, "self-service", id);

    await purge(id);
    const { rows } = await db.query<{
      subject_user_id: string | null;
      requested_by: string | null;
      purged_at: string | null;
    }>(
      `select subject_user_id, requested_by, purged_at
         from public.account_erasure_requests where road = 'self-service'
        order by completed_at desc limit 1`,
    );
    expect(rows[0]).toMatchObject({
      subject_user_id: null,
      requested_by: null,
    });
    expect(rows[0]!.purged_at).not.toBeNull();
  });

  it("the ADMIN road still purges, and the admin who asked is not touched", async () => {
    const admin = await scrubbedSubject();
    const id = await scrubbedSubject();
    await completedRequest(id, "admin", admin);

    expect(await purge(id)).toMatchObject({ outcome: "purged" });
    expect(await stillThere(id)).toBe(false);
    expect(await stillThere(admin)).toBe(true);
  });

  it("★ a cookie-consent record survives the purge with its user released, not deleted", async () => {
    const id = await scrubbedSubject();
    await completedRequest(id, "self-service", id);
    await db.query(
      `insert into public.cookie_consent_records
         (visitor_id, user_id, consent_choice, analytics_enabled, marketing_enabled, expiry_date)
       values ($1, $2, 'reject_non_essential', false, false, now() + interval '1 year')`,
      [`v-${id}`, id],
    );

    expect(await purge(id)).toMatchObject({ outcome: "purged" });
    const { rows } = await db.query<{ user_id: string | null }>(
      `select user_id from public.cookie_consent_records where visitor_id = $1`,
      [`v-${id}`],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.user_id).toBeNull();
  });

  it("★ a Katie prompt edit survives the purge with its author released, not deleted", async () => {
    const id = await scrubbedSubject();
    await completedRequest(id, "self-service", id);
    await db.query(
      `insert into public.katie_prompt_edits (section, applied_by) values ($1, $2)`,
      [`b49-${id}`, id],
    );

    expect(await purge(id)).toMatchObject({ outcome: "purged" });
    const { rows } = await db.query<{ applied_by: string | null }>(
      `select applied_by from public.katie_prompt_edits where section = $1`,
      [`b49-${id}`],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.applied_by).toBeNull();
  });

  it("all three references at once, which is the shape a real account has", async () => {
    const id = await scrubbedSubject();
    await completedRequest(id, "self-service", id);
    await db.query(
      `insert into public.cookie_consent_records
         (visitor_id, user_id, consent_choice, analytics_enabled, marketing_enabled, expiry_date)
       values ($1, $2, 'accept_all', true, true, now() + interval '1 year')`,
      [`v-all-${id}`, id],
    );
    await db.query(
      `insert into public.katie_prompt_edits (section, applied_by) values ($1, $2)`,
      [`b49-all-${id}`, id],
    );

    expect(await purge(id)).toMatchObject({ outcome: "purged" });
    expect(await stillThere(id)).toBe(false);
  });

  it("the refusals `0030` already made are unchanged — a subject who was never erased", async () => {
    const id = await scrubbedSubject();

    expect(await purge(id)).toMatchObject({
      outcome: "refused",
      reason: "not-erased",
    });
    expect(await stillThere(id)).toBe(true);
  });

  it("a money row still inside its window refuses BEFORE anything is released", async () => {
    const id = await scrubbedSubject();
    await completedRequest(id, "self-service", id);
    await db.query(
      `insert into public.payment_events
         (parent_user_id, provider, provider_event_id, event_type, payload, received_at)
       values ($1, 'stripe-uk', $2, 'invoice.paid', '{}'::jsonb, now())`,
      [id, `evt-b49-${id}`],
    );

    expect(await purge(id)).toMatchObject({
      outcome: "refused",
      reason: "retained-money",
    });
    const { rows } = await db.query<{ requested_by: string | null }>(
      `select requested_by from public.account_erasure_requests where subject_user_id = $1`,
      [id],
    );
    expect(rows[0]!.requested_by).toBe(id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("int.self-service-purge — the release set is the catalogue's, not a typed three", () => {
  /** The derivation the gate and the migration's verify block share. */
  const DERIVATION = `
    select t.relname as tbl, a.attname as col
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_class rt on rt.oid = c.confrelid
      join pg_namespace rn on rn.oid = rt.relnamespace
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confdeltype = 'n'
       and rn.nspname = 'auth' and rt.relname = 'users'
       and n.nspname = 'public' and array_length(c.conkey, 1) = 1
       and exists (
         select 1 from pg_trigger tg join pg_proc p on p.oid = tg.tgfoid
          where tg.tgrelid = c.conrelid and not tg.tgisinternal
            and (tg.tgtype & 16) <> 0
            and p.prosrc like '%is_retention_job%')
     order by 1, 2`;

  it("★ the catalogue names exactly the three this suite names", async () => {
    const { rows } = await db.query<{ tbl: string; col: string }>(DERIVATION);
    expect(rows.map((r) => [r.tbl, r.col])).toEqual(
      RELEASES.map(([t, c]) => [t, c]),
    );
  });

  it("★ the migration's release block and this list name the same keys, so neither drifts alone", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const start = sql.indexOf("RELEASE SET — START");
    const end = sql.indexOf("RELEASE SET — END");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = sql.slice(start, end);
    const named: Array<[string, string]> = [];
    for (const match of block.matchAll(/'([a-z_]+)\.([a-z_]+)'/g)) {
      named.push([match[1]!, match[2]!]);
    }
    expect(named.sort()).toEqual(RELEASES.map(([t, c]) => [t, c]).sort());
  });

  it("★ driven the other way: a FOURTH guarded SET NULL key makes the derivation disagree", async () => {
    await db.query(
      `create table public.b49_probe (id uuid primary key default gen_random_uuid(),
                                      who uuid references auth.users(id) on delete set null)`,
    );
    await db.query(
      `create trigger b49_probe_append_only before update on public.b49_probe
         for each row execute function public.prevent_row_modification()`,
    );

    const { rows } = await db.query<{ tbl: string }>(DERIVATION);
    expect(rows.map((r) => r.tbl)).toContain("b49_probe");
    expect(rows).toHaveLength(RELEASES.length + 1);
  });

  it("★ and the purge would then record a refusal naming it, rather than raising 23001", async () => {
    await db.query(
      `create table public.b49_probe (id uuid primary key default gen_random_uuid(),
                                      who uuid references auth.users(id) on delete set null)`,
    );
    await db.query(
      `create trigger b49_probe_append_only before update on public.b49_probe
         for each row execute function public.prevent_row_modification()`,
    );
    const id = await scrubbedSubject();
    await completedRequest(id, "self-service", id);
    await db.query(`insert into public.b49_probe (who) values ($1)`, [id]);

    // The probe table is NOT in the enumerated release set and the retention identity holds no privilege on
    // it, so the cascade would refuse. `0030`'s own 23503 net is not what answers here.
    const answer = await purge(id);
    expect(answer.outcome).toBe("refused");
    expect(answer.reason).toBe("reference-refused");
    expect(answer.table).toBe("b49_probe");
    expect(await stillThere(id)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("int.self-service-purge — the guard still refuses everything it refused", () => {
  // ★ **The assertion is "the reference did not move", not "an error was raised", and the difference is a
  // measurement.** Three controls stand in front of these columns and they answer differently: RLS silently
  // matches no row for `anon` / `authenticated` (they hold table-level UPDATE on two of the three — measured,
  // not assumed); a missing grant raises `42501`; the append-only trigger raises `23001` and only ever fires
  // when a row is actually matched. A case that asserted `raised` would have passed for the wrong reason on an
  // empty table, which is exactly how the first draft of this block was green against a defect.
  const ORDINARY_ROLES = [
    "anon",
    "authenticated",
    "service_role",
    "authenticator",
    "supabase_auth_admin",
    "supabase_storage_admin",
  ];

  /** Seeds one row, attempts the write under `role`, and answers whether the reference actually moved. */
  async function referenceSurvives(
    role: string | null,
    seed: () => Promise<{ where: string; params: unknown[] }>,
    table: string,
    column: string,
    sql: string,
  ): Promise<boolean> {
    const { where, params } = await seed();
    await db.query("savepoint attempt");
    try {
      if (role) await db.query(`set local role ${role}`);
      await db.query(sql);
    } catch {
      await db.query("rollback to savepoint attempt");
    } finally {
      if (role) await db.query("reset role");
    }
    const { rows } = await db.query<Record<string, string | null>>(
      `select ${column} as ref from public.${table} where ${where}`,
      params,
    );
    return rows.length === 1 && rows[0]!.ref !== null;
  }

  async function seedLedger() {
    const id = await scrubbedSubject();
    await completedRequest(id, "self-service", id);
    return { where: "requested_by = $1 or subject_user_id = $1", params: [id] };
  }

  async function seedCookie() {
    const id = await scrubbedSubject();
    await db.query(
      `insert into public.cookie_consent_records
         (visitor_id, user_id, consent_choice, analytics_enabled, marketing_enabled, expiry_date)
       values ($1, $2, 'reject_non_essential', false, false, now() + interval '1 year')`,
      [`guard-${id}`, id],
    );
    return { where: "visitor_id = $1", params: [`guard-${id}`] };
  }

  async function seedKatie() {
    const id = await scrubbedSubject();
    await db.query(
      `insert into public.katie_prompt_edits (section, applied_by) values ($1, $2)`,
      [`guard-${id}`, id],
    );
    return { where: "section = $1", params: [`guard-${id}`] };
  }

  for (const role of ORDINARY_ROLES) {
    it(`★ ${role} still cannot null a requester on the erasure ledger`, async () => {
      expect(
        await referenceSurvives(
          role,
          seedLedger,
          "account_erasure_requests",
          "requested_by",
          `update public.account_erasure_requests set requested_by = null`,
        ),
      ).toBe(true);
    });

    it(`★ ${role} still cannot null a user on a cookie-consent record`, async () => {
      expect(
        await referenceSurvives(
          role,
          seedCookie,
          "cookie_consent_records",
          "user_id",
          `update public.cookie_consent_records set user_id = null`,
        ),
      ).toBe(true);
    });

    it(`★ ${role} still cannot null an author on a Katie prompt edit`, async () => {
      expect(
        await referenceSurvives(
          role,
          seedKatie,
          "katie_prompt_edits",
          "applied_by",
          `update public.katie_prompt_edits set applied_by = null`,
        ),
      ).toBe(true);
    });
  }

  it("★ `postgres` — the identity the cascade actually runs as — is still refused, on all three", async () => {
    // Not a role assumption: this session IS `postgres`, which is the identity a referential action runs
    // under. The guard answers false for it, which is why B-49 existed and why the fix could not widen it.
    const { rows } = await db.query<{ guard: boolean }>(
      `select public.is_retention_job() as guard`,
    );
    expect(rows[0]!.guard).toBe(false);
    expect(
      await referenceSurvives(
        null,
        seedLedger,
        "account_erasure_requests",
        "requested_by",
        `update public.account_erasure_requests set requested_by = null`,
      ),
    ).toBe(true);
    expect(
      await referenceSurvives(
        null,
        seedCookie,
        "cookie_consent_records",
        "user_id",
        `update public.cookie_consent_records set user_id = null`,
      ),
    ).toBe(true);
    expect(
      await referenceSurvives(
        null,
        seedKatie,
        "katie_prompt_edits",
        "applied_by",
        `update public.katie_prompt_edits set applied_by = null`,
      ),
    ).toBe(true);
  });

  it("★ and the guard itself is unchanged — `is_retention_job()` still admits exactly two names", async () => {
    const { rows } = await db.query<{ prosrc: string }>(
      `select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'is_retention_job'`,
    );
    expect(rows[0]!.prosrc).toContain("'bbldn_retention', 'supabase_admin'");
    expect(rows[0]!.prosrc).not.toContain("postgres");
  });

  it("★ the three guard bodies are unchanged too — the fix is not a quiet edit to a trigger", async () => {
    const { rows } = await db.query<{ proname: string; prosrc: string }>(
      `select p.proname, p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('prevent_row_modification',
                            'prevent_cookie_consent_modification',
                            'prevent_erasure_request_modification')`,
    );
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.prosrc, row.proname).toContain("public.is_retention_job()");
      expect(row.prosrc, row.proname).not.toMatch(/current_user|app\./);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("int.self-service-purge — the new privilege is narrow, and pinned to one body", () => {
  it("★ the retention identity may null a cookie user_id …", async () => {
    const result = await asRole(
      "bbldn_retention",
      `update public.cookie_consent_records set user_id = null where false`,
    );
    expect(result.raised).toBe(false);
  });

  it("★ … and is still refused every other column of that record", async () => {
    const result = await asRole(
      "bbldn_retention",
      `update public.cookie_consent_records set analytics_enabled = true where false`,
    );
    expect(result).toMatchObject({ raised: true, code: "42501" });
  });

  it("★ may null a Katie prompt edit's author …", async () => {
    const result = await asRole(
      "bbldn_retention",
      `update public.katie_prompt_edits set applied_by = null where false`,
    );
    expect(result.raised).toBe(false);
  });

  it("★ … and is still refused the content of that edit, and its deletion", async () => {
    expect(
      await asRole(
        "bbldn_retention",
        `update public.katie_prompt_edits set after_content = 'x' where false`,
      ),
    ).toMatchObject({ raised: true, code: "42501" });
    expect(
      await asRole(
        "bbldn_retention",
        `delete from public.katie_prompt_edits where false`,
      ),
    ).toMatchObject({ raised: true, code: "42501" });
  });

  it("★ ADR-186 — from where: exactly ONE retention-owned body carries the release", async () => {
    // The capability is "null a guarded `set null` reference to `auth.users`", and it is exercised through a
    // template rather than a named function, so the pin is the template. A second body that grew this line
    // would be a second place the column grants above can be spent, which is precisely what ADR-186 says an
    // enumeration must not leave open.
    const { rows } = await db.query<{ proname: string }>(
      `select p.proname
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         join pg_roles r on r.oid = p.proowner
        where n.nspname = 'public' and r.rolname = 'bbldn_retention'
          and p.prosrc like '%update public.%I set %I = null%'
        order by 1`,
    );
    expect(rows.map((r) => r.proname)).toEqual(["purge_scrubbed_user"]);
  });

  it("★ and no OTHER body in the schema carries it either — not only the retention-owned ones", async () => {
    const { rows } = await db.query<{ fn: string }>(
      `select n.nspname || '.' || p.proname as fn
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where p.prosrc like '%update public.%I set %I = null%'
        order by 1`,
    );
    expect(rows.map((r) => r.fn)).toEqual(["public.purge_scrubbed_user"]);
  });

  it("★ ★ the retention identity may RELEASE a reference and may not RE-POINT it (security pass, HIGH)", async () => {
    // The reviewer's own attack, as an executable case. A column grant is *column*-scoped and says nothing
    // about the **value**; the append-only guards pass any write once `is_retention_job()` is true; and
    // `postgres` is a member of `bbldn_retention` with admin option, because `0000` grants it so migrations
    // can set a function's owner. So this succeeded before `refuse_reference_rewrite()`, and the pin that was
    // supposed to prevent it was a `prosrc` regex that ad-hoc SQL never goes near.
    const victim = await scrubbedSubject();
    const other = await scrubbedSubject();
    await db.query(
      `insert into public.cookie_consent_records
         (visitor_id, user_id, consent_choice, analytics_enabled, marketing_enabled, expiry_date)
       values ($1, $2, 'accept_all', true, true, now() + interval '1 year')`,
      [`repoint-${victim}`, victim],
    );

    const repoint = await asRole(
      "bbldn_retention",
      `update public.cookie_consent_records set user_id = '${other}' where visitor_id = 'repoint-${victim}'`,
    );
    expect(repoint).toMatchObject({ raised: true, code: "23001" });

    // …and the release itself still works, which is the half that must not break.
    const release = await asRole(
      "bbldn_retention",
      `update public.cookie_consent_records set user_id = null where visitor_id = 'repoint-${victim}'`,
    );
    expect(release.raised).toBe(false);
  });

  it("★ the same invariant on the other two release columns, and it holds for EVERY role", async () => {
    const victim = await scrubbedSubject();
    const other = await scrubbedSubject();
    await completedRequest(victim, "self-service", victim);
    await db.query(
      `insert into public.katie_prompt_edits (section, applied_by) values ($1, $2)`,
      [`repoint-${victim}`, victim],
    );

    for (const role of [null, "bbldn_retention", "supabase_admin"]) {
      const ledger = role
        ? await asRole(
            role,
            `update public.account_erasure_requests set requested_by = '${other}' where subject_user_id = '${victim}'`,
          )
        : await (async () => {
            await db.query("savepoint direct");
            try {
              await db.query(
                `update public.account_erasure_requests set requested_by = '${other}' where subject_user_id = '${victim}'`,
              );
              await db.query("rollback to savepoint direct");
              return { raised: false, code: undefined as string | undefined };
            } catch (error) {
              await db.query("rollback to savepoint direct");
              return { raised: true, code: (error as { code?: string }).code };
            }
          })();
      expect(ledger.raised, `${role ?? "postgres"} → requested_by`).toBe(true);
    }

    // ★ the WHERE keys on `applied_by`, not on `section`: the identity's SELECT is column-scoped to
    // `applied_by` alone, so reading `section` in a predicate answers `42501` before the invariant is even
    // consulted. Two controls in front of one column, and the case says which one it is measuring.
    const katie = await asRole(
      "bbldn_retention",
      `update public.katie_prompt_edits set applied_by = '${other}' where applied_by = '${victim}'`,
    );
    expect(katie).toMatchObject({ raised: true, code: "23001" });
  });

  it("★ and the retention identity cannot read what a prompt edit said (security pass, MEDIUM)", async () => {
    expect(
      await asRole(
        "bbldn_retention",
        `select after_content from public.katie_prompt_edits where false`,
      ),
    ).toMatchObject({ raised: true, code: "42501" });
    // the one column the release needs is readable, which is what makes `for update nowait` possible
    expect(
      await asRole(
        "bbldn_retention",
        `select applied_by from public.katie_prompt_edits where false`,
      ),
    ).toMatchObject({ raised: false });
  });

  it("★ the release set carries no table the retention identity cannot already reach lawfully", async () => {
    for (const [table, column] of RELEASES) {
      const { rows } = await db.query<{ ok: boolean }>(
        `select has_column_privilege('bbldn_retention', $1, $2, 'UPDATE') as ok`,
        [`public.${table}`, column],
      );
      expect(rows[0]!.ok, `${table}.${column}`).toBe(true);
    }
  });
});
