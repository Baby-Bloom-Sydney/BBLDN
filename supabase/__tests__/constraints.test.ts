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

  it("the schema is the 56 tables and 9 views of 02 §4 and §7", async () => {
    const { rows } = await db.query<{ tables: string; views: string }>(
      `select
         (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r') as tables,
         (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'v') as views`,
    );
    expect(Number(rows[0].tables)).toBe(56);
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
