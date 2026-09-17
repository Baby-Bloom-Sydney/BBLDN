// `db.constraints` (05 §4.2; HANDOFF §6.5) — asserts **by constraint name**, against the applied
// migrations, every partial unique index and CHECK the migration set is required to carry. It runs
// first in the integration project so a renamed or dropped constraint fails before any other suite
// spends time (05 §9 stage 5).
//
// Covers AC-X-31 (D-1), AC-X-32 (D-4), AC-X-33 (D-3), D-7, D-9, D-11, D-12 and the money uniques,
// plus the two conventions that hold the whole schema together: C-10 (ENABLE + FORCE RLS on every
// table) and 07 §5.1 rule 3 (no `WITH CHECK (true)`).
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";

let db: Client;

beforeAll(async () => {
  db = await connect();
});
afterAll(async () => {
  await db?.end();
});

async function indexDef(name: string): Promise<string | null> {
  const { rows } = await db.query<{ indexdef: string }>(
    "select indexdef from pg_indexes where schemaname = 'public' and indexname = $1",
    [name],
  );
  return rows[0]?.indexdef ?? null;
}

async function checkDef(name: string): Promise<string | null> {
  const { rows } = await db.query<{ def: string }>(
    "select pg_get_constraintdef(oid) as def from pg_constraint where conname = $1",
    [name],
  );
  return rows[0]?.def ?? null;
}

describe("db.constraints — the named partial uniques", () => {
  // AC-X-31 / fix D-1 / R6: the overlap index must cover `rescheduled`, or a same-row
  // reschedule would free the slot it still occupies.
  it("bookings has a partial unique on (calendar_id, start_at) over the three ACTIVE_STATUSES", async () => {
    const def = await indexDef("bookings_active_slot_unique_idx");
    expect(def).not.toBeNull();
    expect(def).toMatch(/UNIQUE/i);
    expect(def).toMatch(/calendar_id/);
    expect(def).toMatch(/start_at/);
    for (const status of ["held", "booked", "rescheduled"]) {
      expect(def).toContain(`'${status}'`);
    }
    for (const status of ["cancelled", "done", "no-answer"]) {
      expect(def).not.toContain(`'${status}'`);
    }
  });

  // AC-X-32 / fix D-4 / 03 I-10
  it("bookings has a partial unique on (subject_type, subject_id) over the same statuses", async () => {
    const def = await indexDef("bookings_active_subject_unique_idx");
    expect(def).not.toBeNull();
    expect(def).toMatch(/UNIQUE/i);
    expect(def).toMatch(/subject_type/);
    expect(def).toMatch(/subject_id/);
    expect(def).toContain("'rescheduled'");
  });

  it("bookings has the idempotency-key unique (03 I-11)", async () => {
    expect(await indexDef("bookings_idempotency_key_unique_idx")).toMatch(
      /UNIQUE/i,
    );
  });

  it("one live position per parent (I-1)", async () => {
    const def = await indexDef("nanny_positions_one_live_per_parent_idx");
    expect(def).toMatch(/UNIQUE/i);
    for (const stage of ["DRAFT", "OPEN", "CONNECTING", "ACTIVE"]) {
      expect(def).toContain(`'${stage}'`);
    }
  });

  it("one live connection per (position, nanny) and one offer per position (02 §4.2 row 7)", async () => {
    expect(await indexDef("connection_requests_one_live_per_pair_idx")).toMatch(
      /UNIQUE/i,
    );
    const offer = await indexDef(
      "connection_requests_one_offer_per_position_idx",
    );
    expect(offer).toMatch(/UNIQUE/i);
    for (const stage of ["OFFERED", "CONFIRMED", "ACTIVE"]) {
      expect(offer).toContain(`'${stage}'`);
    }
  });

  it("one non-ended placement per position and per parent (02 §4.2 row 9)", async () => {
    expect(
      await indexDef("nanny_placements_one_live_per_position_idx"),
    ).toMatch(/UNIQUE/i);
    expect(await indexDef("nanny_placements_one_live_per_parent_idx")).toMatch(
      /UNIQUE/i,
    );
  });

  it("the money uniques (02 §4.5)", async () => {
    // one spine row per family (I-M1)
    expect(await checkDef("parent_subscriptions_parent_user_id_key")).toMatch(
      /UNIQUE/i,
    );
    // R-11: provider event idempotency
    expect(await checkDef("payment_events_provider_event_key")).toMatch(
      /UNIQUE/i,
    );
    // G1-G4 once per family; G5 unbounded
    const guarantee = await indexDef("guarantee_events_once_per_family_idx");
    expect(guarantee).toMatch(/UNIQUE/i);
    expect(guarantee).toContain("'G4'");
    expect(guarantee).not.toContain("'G5'");
    // <= 1 pending subscribe invite per (child, nanny)
    expect(
      await indexDef("subscribe_invites_one_pending_per_pair_idx"),
    ).toMatch(/UNIQUE/i);
  });

  it("the app uniques (02 §4.6)", async () => {
    expect(await indexDef("child_client_one_active_per_child_idx")).toMatch(
      /UNIQUE/i,
    );
    expect(
      await indexDef("child_invites_one_pending_per_direction_idx"),
    ).toMatch(/UNIQUE/i);
    expect(await indexDef("events_name_idempotency_key_idx")).toMatch(
      /UNIQUE/i,
    );
    const dedupe = await indexDef("email_logs_dedupe_key_idx");
    expect(dedupe).toMatch(/UNIQUE/i);
    expect(dedupe).toContain("'queued'");
    expect(dedupe).toContain("'sent'");
    expect(
      await indexDef("admin_notifications_one_open_per_subject_idx"),
    ).toMatch(/UNIQUE/i);
  });
});

describe("db.constraints — the named CHECKs", () => {
  // AC-X-33 / fix D-3 / R6. 0006 writes it as the biconditional R-1 states, which is
  // strictly stronger than the tabled form and satisfies all three AC-X-33 cases.
  it("nanny_positions ties call_state to call_booking_id", async () => {
    const def = await checkDef(
      "nanny_positions_call_state_requires_booking_check",
    );
    expect(def).not.toBeNull();
    expect(def).toContain("call_booking_id");
    expect(def).toContain("awaiting-slot");
  });

  it("the C-7 / ADR-102 mobile shape is UK-only", async () => {
    const def = await checkDef("user_profiles_mobile_e164_gb_check");
    expect(def).toContain("+44");
  });

  it("the profile picture path is tied to its own row (07 §5.3 rule 1)", async () => {
    const def = await checkDef("user_profiles_picture_path_owned_check");
    expect(def).not.toBeNull();
    expect(def).toContain("user_id");
  });

  it("I-3's backstop is a DEFERRABLE INITIALLY DEFERRED constraint trigger (D-7)", async () => {
    const { rows } = await db.query<{
      tgdeferrable: boolean;
      tginitdeferred: boolean;
    }>(
      `select tgdeferrable, tginitdeferred from pg_trigger
       where tgname = 'nanny_placements_enforce_i3'`,
    );
    expect(rows[0]?.tgdeferrable).toBe(true);
    expect(rows[0]?.tginitdeferred).toBe(true);
  });

  it("the verification invariants I-V3 / I-V5 / I-V7 are CHECKs, not conventions", async () => {
    expect(await checkDef("verifications_barred_is_suspended_check")).toContain(
      "barred",
    );
    expect(
      await checkDef("verifications_refs_are_object_paths_check"),
    ).not.toBeNull();
    expect(
      await checkDef("verifications_identity_needs_biometric_consent_check"),
    ).toContain("biometric_consent_id");
  });

  it("ADR-103's two columns exist and are nullable", async () => {
    const { rows } = await db.query<{
      table_name: string;
      is_nullable: string;
    }>(
      `select table_name, is_nullable from information_schema.columns
       where table_schema = 'public'
         and ((table_name = 'nannies' and column_name = 'is_vaccinated')
           or (table_name = 'nanny_positions' and column_name = 'vaccination_required'))
       order by table_name`,
    );
    expect(rows.map((r) => r.table_name)).toEqual([
      "nannies",
      "nanny_positions",
    ]);
    expect(rows.every((r) => r.is_nullable === "YES")).toBe(true);
  });
});

describe("db.constraints — the named indexes 02 §6 asks for", () => {
  it.each([
    ["user_profiles_district_idx", "D-9"],
    ["nannies_matching_idx", "D-9"],
    ["connection_requests_nanny_stage_idx", "D-11"],
    ["nanny_positions_open_call_idx", "D-12"],
    ["events_name_ts_idx", "02 §4.6"],
    ["events_position_idx", "02 §4.6"],
    ["events_visitor_ts_idx", "02 §4.6"],
    ["events_subject_idx", "02 §4.6"],
    ["events_undispatched_idx", "02 §4.6"],
  ])("%s exists (%s)", async (name) => {
    expect(await indexDef(name)).not.toBeNull();
  });
});

describe("db.constraints — the schema-wide conventions", () => {
  it("every table in public has RLS enabled AND forced (02 C-10)", async () => {
    const { rows } = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
         and not (c.relrowsecurity and c.relforcerowsecurity)`,
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("no policy anywhere uses WITH CHECK (true) (07 §5.1 rule 3)", async () => {
    const { rows } = await db.query<{ tablename: string; policyname: string }>(
      `select tablename, policyname from pg_policies
       where schemaname in ('public', 'storage') and with_check = 'true'`,
    );
    expect(rows).toEqual([]);
  });

  it("every SECURITY DEFINER in public pins search_path (07 §5.1 rule 2)", async () => {
    const { rows } = await db.query<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef
         and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
                         where cfg like 'search_path=%')`,
    );
    expect(rows.map((r) => r.proname)).toEqual([]);
  });

  it("the schema is the 58 tables and 9 views of 02 §4 and §7 (56 + rate_limit_buckets 0017 + position_call_mirror 0018)", async () => {
    const { rows } = await db.query<{ tables: string; views: string }>(
      `select
         (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r') as tables,
         (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'v') as views`,
    );
    expect(Number(rows[0].tables)).toBe(58);
    expect(Number(rows[0].views)).toBe(9);
  });

  it("every element of the 02 §5 not-created list is absent", async () => {
    const forbidden = [
      "babysitting_requests",
      "bsr_time_slots",
      "bsr_notifications",
      "nanny_payouts",
      "earnings_events",
      "viral_shares",
      "sydney_postcodes",
      "parent_verifications",
      "activity_logs",
      "connections_log",
      "connection_events_table",
      "user_progress",
      "delayed_emails",
      "stripe_webhook_events",
      "dfy_match_notifications",
      "london_areas",
      "slot_holds",
      "calls",
      "sms_logs",
      "email_delivery_audit",
      "interview_requests",
    ];
    const { rows } = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = any($1::text[])`,
      [forbidden],
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("the three buckets exist and all three are private (02 §8; 07 §5.3 rule 1)", async () => {
    const { rows } = await db.query<{ id: string; public: boolean }>(
      `select id, public from storage.buckets order by id`,
    );
    expect(rows.map((r) => r.id)).toEqual([
      "development-images",
      "profile-pictures",
      "verification-documents",
    ]);
    expect(rows.every((r) => r.public === false)).toBe(true);
  });
});

describe("db.constraints — what 0017 added (ADR-131)", () => {
  // ADR-131 (2): without this column a consent row written for a non-document purpose has
  // `document_id IS NULL` and cannot be attributed on the way back, so `hasConsent` answers false
  // for evidence that exists. The CHECK is what stops the column and `document_id` drifting apart.
  it("consent_records.purpose is NOT NULL and agrees with document_id", async () => {
    const { rows } = await db.query<{ is_nullable: string; udt_name: string }>(
      `select is_nullable, udt_name from information_schema.columns
        where table_schema = 'public' and table_name = 'consent_records' and column_name = 'purpose'`,
    );
    expect(rows[0]?.is_nullable).toBe("NO");
    expect(rows[0]?.udt_name).toBe("consent_purpose");
    const def = await checkDef("consent_records_purpose_document_check");
    expect(def).not.toBeNull();
    expect(def).toMatch(/document_id/);
    expect(def).toMatch(/purpose/);
  });

  it("consent_records keeps the (user_id, purpose, created_at desc) read index", async () => {
    const def = await indexDef("consent_records_user_purpose_idx");
    expect(def).not.toBeNull();
    expect(def).toMatch(/user_id/);
    expect(def).toMatch(/purpose/);
  });

  // ADR-131 (3) / 07 §8: the limiter is only a limiter if every instance counts into one row. The
  // table is service-role only — a client policy here would let a caller reset its own bucket.
  it("rate_limit_buckets exists, forces RLS and carries no policy at all (07 §5.2)", async () => {
    const { rows } = await db.query<{ forced: boolean; enabled: boolean }>(
      `select c.relrowsecurity as enabled, c.relforcerowsecurity as forced
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'rate_limit_buckets'`,
    );
    expect(rows[0]).toEqual({ enabled: true, forced: true });
    const policies = await db.query(
      `select 1 from pg_policies where schemaname = 'public' and tablename = 'rate_limit_buckets'`,
    );
    expect(policies.rowCount).toBe(0);
  });

  it("rate_limit_buckets refuses a non-positive count and an already-expired window", async () => {
    expect(await checkDef("rate_limit_buckets_count_positive_check")).toMatch(
      /count/,
    );
    expect(await checkDef("rate_limit_buckets_window_open_check")).toMatch(
      /reset_at/,
    );
  });

  // 02 §7: every definer is SECURITY DEFINER with `search_path` pinned, or it is a search-path
  // hijack waiting for a schema a caller controls.
  it.each([
    "consume_rate_limit",
    "create_parent_profile",
    "record_cookie_consent",
  ])("%s is SECURITY DEFINER with search_path pinned", async (name: string) => {
    const { rows } = await db.query<{
      prosecdef: boolean;
      proconfig: string[] | null;
    }>(
      `select p.prosecdef, p.proconfig from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = $1`,
      [name],
    );
    expect(rows[0]?.prosecdef).toBe(true);
    expect(rows[0]?.proconfig).toContain('search_path=""');
  });

  // 07 §5.1 rule 5 / §5.2: `anon` executes none of them; only the signup definer reaches
  // `authenticated`, and it takes no user id so it can only ever write the caller's own rows.
  it("grants: anon executes none of the 0017 functions; authenticated only create_parent_profile", async () => {
    const { rows } = await db.query<{
      name: string;
      anon: boolean;
      authed: boolean;
    }>(
      `select p.proname as name,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as authed
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('consume_rate_limit', 'create_parent_profile', 'record_cookie_consent')
        order by p.proname`,
    );
    expect(rows).toEqual([
      { name: "consume_rate_limit", anon: false, authed: false },
      { name: "create_parent_profile", anon: false, authed: true },
      { name: "record_cookie_consent", anon: false, authed: false },
    ]);
  });
});

describe("db.constraints — what 0018 added (the call mirror)", () => {
  // 02 R-1 is the whole point of the table's shape: it holds the call's DETAIL and none of its
  // state. A later edit that "helpfully" adds `call_state` here would give the model two homes for
  // one fact, which is the drift R-1 exists to prevent.
  it("position_call_mirror duplicates none of the call state R-1 puts on nanny_positions", async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'position_call_mirror'
        order by column_name`,
    );
    expect(rows.map((r) => r.column_name)).toEqual([
      "about_nanny",
      "created_at",
      "no_answer_count",
      "notes",
      "outcome",
      "position_id",
      "updated_at",
      "version",
    ]);
  });

  it("position_call_mirror is keyed by position_id alone and cascades with its position", async () => {
    const { rows } = await db.query<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint
        where conrelid = 'public.position_call_mirror'::regclass and contype in ('p', 'f')
        order by contype`,
    );
    expect(rows.map((r) => r.def)).toEqual([
      "FOREIGN KEY (position_id) REFERENCES nanny_positions(id) ON DELETE CASCADE",
      "PRIMARY KEY (position_id)",
    ]);
  });

  it("position_call_mirror carries only SELECT policies, and none for anon (07 §5.1 rule 4)", async () => {
    const { rows } = await db.query<{
      policyname: string;
      cmd: string;
      roles: string;
    }>(
      `select policyname, cmd, roles::text as roles from pg_policies
        where schemaname = 'public' and tablename = 'position_call_mirror'
        order by policyname`,
    );
    expect(rows.map((r) => r.policyname)).toEqual([
      "position_call_mirror_select_admin",
      "position_call_mirror_select_own",
    ]);
    expect(rows.every((r) => r.cmd === "SELECT")).toBe(true);
    expect(rows.some((r) => r.roles.includes("anon"))).toBe(false);
  });

  // fix: database-reviewer H-1. The parent check goes through 0002's definer helper, like every
  // other "is this my position" policy, and not through a second join of its own.
  it("the parent's SELECT resolves ownership through current_parent_id()", async () => {
    const { rows } = await db.query<{ qual: string }>(
      `select qual from pg_policies
        where schemaname = 'public' and tablename = 'position_call_mirror'
          and policyname = 'position_call_mirror_select_own'`,
    );
    expect(rows[0]?.qual).toContain("current_parent_id");
    expect(rows[0]?.qual).not.toContain("parents");
  });

  it("the no_answer_count tally cannot be wound backwards (R5)", async () => {
    const def = await checkDef("position_call_mirror_no_answer_count_check");
    expect(def).toBe("CHECK ((no_answer_count >= 0))");
    const { rows } = await db.query<{ tgname: string }>(
      `select tgname from pg_trigger
        where tgrelid = 'public.position_call_mirror'::regclass and not tgisinternal
        order by tgname`,
    );
    expect(rows.map((r) => r.tgname)).toEqual([
      "position_call_mirror_no_answer_count_guard",
      "position_call_mirror_set_updated_at",
    ]);
  });

  it("a note cannot stand without the outcome it is about", async () => {
    const def = await checkDef("position_call_mirror_notes_need_outcome_check");
    expect(def).toBe("CHECK (((notes IS NULL) OR (outcome IS NOT NULL)))");
  });

  // ADR-127: the C rows' one write is one RPC because it is two tables.
  it("upsert_call_mirror is a single service-role-only definer", async () => {
    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname = 'public' and p.proname = 'upsert_call_mirror'`,
    );
    expect(rows[0]?.n).toBe("1");
    const { rows: priv } = await db.query<{ anon: boolean; auth: boolean }>(
      `select has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth
         from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname = 'public' and p.proname = 'upsert_call_mirror'`,
    );
    expect(priv[0]).toEqual({ anon: false, auth: false });
  });

  // 1f pinned `unblock` because nothing could take a block out of force.
  it("availability_blocks.revoked_at exists with a partial index over the in-force rows", async () => {
    const { rows } = await db.query<{ is_nullable: string }>(
      `select is_nullable from information_schema.columns
        where table_schema = 'public' and table_name = 'availability_blocks'
          and column_name = 'revoked_at'`,
    );
    expect(rows[0]?.is_nullable).toBe("YES");
    const def = await indexDef("availability_blocks_in_force_idx");
    expect(def).toContain("revoked_at IS NULL");
    expect(def).toContain("calendar_id");
  });
});

describe("db.constraints — what 0019 added (the three write definers)", () => {
  const SIGNATURES = [
    "upsert_position",
    "upsert_connection",
    "upsert_placement",
    "apply_payment_event",
  ] as const;

  /** The two that ARE the user-session road — 07 §5.2, not 07 §5.1 rule 5. */
  const SESSION_ROADS = ["create_child_invite", "revoke_child_invite"] as const;

  // ADR-127: without these three, every position / connection / placement write is refused inside
  // the caller's unit of work and no definer exists to call instead — the state P1-STORES measured.
  it("all three exist exactly once, as SECURITY DEFINER with search_path pinned", async () => {
    for (const name of SIGNATURES) {
      const { rows } = await db.query<{
        n: string;
        secdef: boolean;
        config: string | null;
      }>(
        `select count(*) over ()::text as n, p.prosecdef as secdef,
                array_to_string(p.proconfig, ',') as config
           from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
          where ns.nspname = 'public' and p.proname = $1`,
        [name],
      );
      expect(rows.length, `${name} overload count`).toBe(1);
      expect(rows[0]?.secdef, `${name} SECURITY DEFINER`).toBe(true);
      expect(rows[0]?.config, `${name} search_path`).toContain(
        'search_path=""',
      );
    }
  });

  // 07 §5.1 rule 5, and 0006 §4's own rule: each of these takes `stage` as an argument, and a
  // parent may never touch `stage`, `call_*` or `precheck_*`. `book_slot()` — the one definer 07
  // §5.1 rule 5 calls a user-session road — is granted the same way, to service_role alone.
  it("none of the three is executable by anon or authenticated, and all three are by service_role", async () => {
    for (const name of SIGNATURES) {
      const { rows } = await db.query<{
        anon: boolean;
        auth: boolean;
        service: boolean;
      }>(
        `select has_function_privilege('anon', p.oid, 'execute') as anon,
                has_function_privilege('authenticated', p.oid, 'execute') as auth,
                has_function_privilege('service_role', p.oid, 'execute') as service
           from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
          where ns.nspname = 'public' and p.proname = $1`,
        [name],
      );
      expect(rows[0], name).toEqual({
        anon: false,
        auth: false,
        service: true,
      });
    }
  });

  // 0017's database-reviewer M-1: a definer over a FORCE RLS table reaches it only because its
  // owner has BYPASSRLS. If ownership ever differed these would write nothing, silently.
  it("all three are owned by a role that bypasses RLS", async () => {
    const { rows } = await db.query<{ proname: string }>(
      `select p.proname from pg_proc p
         join pg_namespace ns on ns.oid = p.pronamespace
         join pg_roles r on r.oid = p.proowner
        where ns.nspname = 'public' and p.proname = any($1)
          and not (r.rolbypassrls or r.rolsuper)`,
      [[...SIGNATURES]],
    );
    expect(rows.map((r) => r.proname)).toEqual([]);
  });

  // The functions raise these by name so a caller gets a message it can act on; the indexes are
  // what make the rule true under concurrency. Dropping one would leave the named refusal as a
  // read-then-check that loses a race, which is exactly the failure this assertion guards.
  it("the five stage-model partial uniques 0019 raises by name are all still present", async () => {
    for (const index of [
      "nanny_positions_one_live_per_parent_idx",
      "connection_requests_one_live_per_pair_idx",
      "connection_requests_one_offer_per_position_idx",
      "nanny_placements_one_live_per_position_idx",
      "nanny_placements_one_live_per_parent_idx",
    ]) {
      const def = await indexDef(index);
      expect(def, index).not.toBeNull();
      expect(def, index).toMatch(/UNIQUE/i);
      expect(def, index).toContain("WHERE");
    }
  });

  // 0019 is additive: it creates no table, column, index, policy or constraint, which is what lets
  // the whole set still apply forwards from an empty database in one pass (02 §1).
  it("0019 added no client write policy to any of the four tables it writes", async () => {
    const { rows } = await db.query<{ tablename: string; cmd: string }>(
      `select tablename, cmd from pg_policies
        where schemaname = 'public'
          and tablename in ('nanny_positions', 'position_schedule',
                            'connection_requests', 'nanny_placements')
          and cmd <> 'SELECT'`,
    );
    expect(rows).toEqual([]);
  });

  it("the two invite definers exist, are definers, and are the session road (07 §5.2)", async () => {
    for (const name of SESSION_ROADS) {
      const { rows } = await db.query<{
        secdef: boolean;
        config: string | null;
        anon: boolean;
        auth: boolean;
      }>(
        `select p.prosecdef as secdef,
                array_to_string(p.proconfig, ',') as config,
                has_function_privilege('anon', p.oid, 'execute') as anon,
                has_function_privilege('authenticated', p.oid, 'execute') as auth
           from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
          where ns.nspname = 'public' and p.proname = $1`,
        [name],
      );
      expect(rows.length, `${name} exists exactly once`).toBe(1);
      expect(rows[0]?.secdef, name).toBe(true);
      expect(rows[0]?.config, name).toContain('search_path=""');
      // the inverse of §§1-3: authenticated MUST have it, anon must not
      expect(rows[0]?.auth, `${name} authenticated`).toBe(true);
      expect(rows[0]?.anon, `${name} anon`).toBe(false);
    }
  });

  // 07 §5.2: "links and invites written only by the RPCs". The functions are only meaningful while the
  // table still refuses a direct client write.
  it("child_invites still carries no client write policy", async () => {
    const { rows } = await db.query<{ policyname: string; cmd: string }>(
      `select policyname, cmd from pg_policies
        where schemaname = 'public' and tablename = 'child_invites'`,
    );
    expect(rows.map((r) => r.cmd)).toEqual(["SELECT"]);
  });

  // 04 §4.4 c1. The column, its covering index, and the arm that makes it useful.
  it("children.created_by_user_id is a nullable FK with a covering index and a stamp trigger", async () => {
    const { rows } = await db.query<{ is_nullable: string }>(
      `select is_nullable from information_schema.columns
        where table_schema = 'public' and table_name = 'children'
          and column_name = 'created_by_user_id'`,
    );
    expect(rows[0]?.is_nullable).toBe("YES");
    expect(await checkDef("children_created_by_user_id_fkey")).toContain(
      "ON DELETE SET NULL",
    );
    expect(await indexDef("children_created_by_idx")).toContain(
      "created_by_user_id",
    );
    const { rows: trg } = await db.query<{ tgname: string }>(
      `select tgname from pg_trigger
        where tgrelid = 'public.children'::regclass and tgname = 'children_stamp_creator'`,
    );
    expect(trg).toHaveLength(1);
  });

  // The one that was measured rather than reasoned: as a SECURITY DEFINER, is_privileged_writer() is
  // always true inside this trigger (0000's own comment), so it stamps nothing and the nanny's own row
  // becomes unreadable to her — the exact symptom 0019 exists to fix.
  it("children_stamp_creator is SECURITY INVOKER, or it stamps nothing at all", async () => {
    const { rows } = await db.query<{ secdef: boolean }>(
      `select p.prosecdef as secdef from pg_proc p
         join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname = 'public' and p.proname = 'children_stamp_creator'`,
    );
    expect(rows[0]?.secdef).toBe(false);
  });

  it("user_has_child_access carries the creator arm, limited to an unclaimed child", async () => {
    const { rows } = await db.query<{ src: string }>(
      `select p.prosrc as src from pg_proc p
         join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname = 'public' and p.proname = 'user_has_child_access'`,
    );
    expect(rows[0]?.src).toContain("created_by_user_id");
    // without this clause the arm is a permanent read on a family's record
    expect(rows[0]?.src).toContain("parent_user_id is null");
  });

  // apply_payment_event's replay guard is this constraint, not a lookup it invents.
  it("payment_events still carries the provider/event unique the webhook fold rests on", async () => {
    expect(await checkDef("payment_events_provider_event_key")).toBe(
      "UNIQUE (provider, provider_event_id)",
    );
  });
});

describe("db.constraints — what 0020 added (ADR-146)", () => {
  // The shape of the column ADR-145 (2)'s control compares against. `citext` is the assertion that matters:
  // `text` would compile, pass every unit test with a folded writer, and quietly answer "no" to a lead written
  // any other way — which is a control that fails **open** on the path it exists to close.
  it("parent_leads.email is citext and nullable, because a wizard-only lead captures none", async () => {
    const { rows } = await db.query<{
      udt: string;
      nullable: string;
    }>(
      `select udt_name as udt, is_nullable as nullable
         from information_schema.columns
        where table_schema = 'public' and table_name = 'parent_leads' and column_name = 'email'`,
    );
    expect(rows[0]?.udt).toBe("citext");
    expect(rows[0]?.nullable).toBe("YES");
  });

  it("parent_leads carries no unique on the address — two families may share one (ADR-041)", async () => {
    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n from pg_indexes
        where schemaname = 'public' and tablename = 'parent_leads' and indexdef ilike '%email%'`,
    );
    expect(rows[0]?.n).toBe("0");
  });

  // 07 §5.2's last row. A new column holding a contact is exactly the kind that invites a first policy, and
  // `parent_leads` must keep having none at all — a nanny never reads her own lead row, and nor does a parent.
  it("0020 added no policy to parent_leads — it is still service role only", async () => {
    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n from pg_policies
        where schemaname = 'public' and tablename = 'parent_leads'`,
    );
    expect(rows[0]?.n).toBe("0");
  });

  // `create or replace` keeps grants and ownership, and this is the assertion that it did. 0019's
  // database-reviewer H-1 removed the in-function authority check as dead code, so **the grant is the whole
  // defence** on this function: a replace that widened EXECUTE would be the entire hole.
  it("apply_payment_event is still service_role only after the replace (I-M2)", async () => {
    const { rows } = await db.query<{
      anon: boolean;
      auth: boolean;
      service: boolean;
      secdef: boolean;
      config: string | null;
      n: string;
    }>(
      `select count(*) over ()::text as n,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth,
              has_function_privilege('service_role', p.oid, 'execute') as service,
              p.prosecdef as secdef,
              array_to_string(p.proconfig, ',') as config
         from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname = 'public' and p.proname = 'apply_payment_event'`,
    );
    // one overload, not two: a replace that changed an argument type would leave 0019's beside 0020's
    expect(rows.length).toBe(1);
    expect(rows[0]?.anon).toBe(false);
    expect(rows[0]?.auth).toBe(false);
    expect(rows[0]?.service).toBe(true);
    expect(rows[0]?.secdef).toBe(true);
    expect(rows[0]?.config).toContain('search_path=""');
  });

  it("apply_payment_event still recomputes the access window inside its own transaction", async () => {
    const { rows } = await db.query<{ src: string }>(
      `select p.prosrc as src from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname = 'public' and p.proname = 'apply_payment_event'`,
    );
    // ADR-083 / 084 — 0019's own assertion, which a rewrite of the body could silently drop
    expect(rows[0]?.src).toContain("set_access_window");
    expect(rows[0]?.src).toContain("'ignored'");
  });
});

describe("db.constraints — what 0021 added (the nanny side's three definers; ADR-152)", () => {
  const SESSION_ROADS = [
    "create_nanny_account",
    "update_nanny_profile",
    "lift_nanny_isolation",
  ] as const;

  // 0005 gives `nannies` SELECT-only client policies and its verify block refuses a write policy; these three
  // are the only road a nanny has to her own party row, and each acts for `auth.uid()` — the authority IS the
  // session, so `authenticated` may execute them and `anon` may not (the opposite split from 0019's stage-writers).
  it("all three exist exactly once, SECURITY DEFINER, search_path pinned, executable by authenticated and not by anon", async () => {
    for (const name of SESSION_ROADS) {
      const { rows } = await db.query<{
        secdef: boolean;
        config: string | null;
        anon: boolean;
        auth: boolean;
      }>(
        `select p.prosecdef as secdef, array_to_string(p.proconfig, ',') as config,
                has_function_privilege('anon', p.oid, 'execute') as anon,
                has_function_privilege('authenticated', p.oid, 'execute') as auth
           from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
          where ns.nspname = 'public' and p.proname = $1`,
        [name],
      );
      expect(rows.length, `${name} overload count`).toBe(1);
      expect(rows[0]?.secdef, `${name} SECURITY DEFINER`).toBe(true);
      expect(rows[0]?.config, `${name} search_path`).toContain(
        'search_path=""',
      );
      expect(rows[0]?.anon, `${name} anon`).toBe(false);
      expect(rows[0]?.auth, `${name} authenticated`).toBe(true);
    }
  });

  it("0021 added no client write policy to nannies — 0005's rule still holds (07 §5.1 rule 4)", async () => {
    const { rows } = await db.query<{ cmd: string }>(
      "select cmd from pg_policies where schemaname = 'public' and tablename = 'nannies' and cmd <> 'SELECT'",
    );
    expect(rows).toEqual([]);
  });

  it("nanny_profile_columns() is the one static list, and it drops every guarded column", async () => {
    const { rows } = await db.query<{ kept: Record<string, unknown> }>(
      `select public.nanny_profile_columns($1::jsonb) as kept`,
      [
        JSON.stringify({
          bio: "x",
          is_isolated: false,
          verification_level: "L4_FULLY_VERIFIED",
          suspended_at: "2026-01-01",
          profile_visible: true,
          lead_id: "00000000-0000-4000-8000-000000000000",
          is_vaccinated: true,
          commission_pitch_opted_in_at: "2026-01-01",
        }),
      ],
    );
    expect(rows[0]?.kept).toEqual({ bio: "x" });
  });
});

describe("db.constraints — what 0022 added (the wizard's four definers + the ledger's idempotency key; ADR-154)", () => {
  const SESSION_ROADS = [
    "submit_verification_evidence",
    "save_verification_contact",
    "claim_verification_processing",
  ] as const;

  const oneFunction = async (name: string) => {
    const { rows } = await db.query<{
      secdef: boolean;
      config: string | null;
      anon: boolean;
      auth: boolean;
      service: boolean;
    }>(
      `select p.prosecdef as secdef, array_to_string(p.proconfig, ',') as config,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth,
              has_function_privilege('service_role', p.oid, 'execute') as service
         from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname = 'public' and p.proname = $1`,
      [name],
    );
    expect(rows.length, `${name} overload count`).toBe(1);
    return rows[0]!;
  };

  // The three wizard writes act for auth.uid() — the authority is the session (0021's split).
  it("the three wizard writes exist once, SECURITY DEFINER, search_path pinned, executable by authenticated and not by anon", async () => {
    for (const name of SESSION_ROADS) {
      const fn = await oneFunction(name);
      expect(fn.secdef, `${name} SECURITY DEFINER`).toBe(true);
      expect(fn.config, `${name} search_path`).toContain('search_path=""');
      expect(fn.anon, `${name} anon`).toBe(false);
      expect(fn.auth, `${name} authenticated`).toBe(true);
    }
  });

  // The provider-side write moves a section on a check the nanny did not make (I-V2): service_role only.
  it("apply_vetting_check_result exists once, SECURITY DEFINER, and only service_role may execute it", async () => {
    const fn = await oneFunction("apply_vetting_check_result");
    expect(fn.secdef).toBe(true);
    expect(fn.config).toContain('search_path=""');
    expect(fn.anon).toBe(false);
    expect(fn.auth).toBe(false);
    expect(fn.service).toBe(true);
  });

  it("vetting_submissions.evidence_id is NOT NULL and unique (03 §4.2's idempotency key)", async () => {
    const { rows } = await db.query<{ is_nullable: string }>(
      `select is_nullable from information_schema.columns
        where table_schema = 'public' and table_name = 'vetting_submissions' and column_name = 'evidence_id'`,
    );
    expect(rows[0]).toEqual({ is_nullable: "NO" });
    const { rows: idx } = await db.query<{ indexdef: string }>(
      `select indexdef from pg_indexes where schemaname = 'public'
        and tablename = 'vetting_submissions' and indexname = 'vetting_submissions_evidence_id_key'`,
    );
    expect(idx[0]?.indexdef ?? "").toMatch(/^CREATE UNIQUE INDEX/);
  });

  it("0022 added no client write policy to verifications or vetting_submissions — 0008's rule still holds (I-V2)", async () => {
    const { rows } = await db.query<{ cmd: string }>(
      "select cmd from pg_policies where schemaname = 'public' and tablename in ('verifications', 'vetting_submissions') and cmd <> 'SELECT'",
    );
    expect(rows).toEqual([]);
  });

  it("verification_submission_columns() is one static list per section, and drops every status / decision / level key", async () => {
    const probe = {
      identity_document_ref: "u/identity-document/x.jpg",
      identity_status: "verified",
      identity_checked_by: "admin",
      level: "L4_FULLY_VERIFIED",
      dbs_outcome: "cleared",
      dbs_certificate_number: "001234567890",
      rtw_share_code: "W1A2B3C4D",
      cross_check_status: "passed",
      dbs_update_service_last_result: "no_change",
    };
    const kept = async (section: string) =>
      (
        await db.query<{ kept: Record<string, unknown> }>(
          `select public.verification_submission_columns($1::public.verification_section, $2::jsonb) as kept`,
          [section, JSON.stringify(probe)],
        )
      ).rows[0]!.kept;
    expect(await kept("identity")).toEqual({
      identity_document_ref: "u/identity-document/x.jpg",
    });
    expect(await kept("dbs")).toEqual({
      dbs_certificate_number: "001234567890",
    });
    expect(await kept("right_to_work")).toEqual({
      rtw_share_code: "W1A2B3C4D",
    });
    expect(await kept("contact")).toEqual({});
  });
});
