// `int.rollback-0025` — **ADR-165 (3) for `0025`**: apply forward → twin → and assert the hole is still shut.
//
// `0025` carries a security clause and says so in its header: `sync_nanny_verification_state()` may SET a bar
// and may never CLEAR one (ADR-168 (a), closing REVIEW-4 C-2 — measured `suspended t → f` when the same
// submission was re-decided with `mismatch`). ADR-165 (1) says a twin keeps such a clause and names it;
// ADR-165 (3) says the twin ships a test that proves it, "which is how this was caught".
//
// This is that test. It reuses H-3's harness rather than rebuilding it: `bodyOf` — the one piece of machinery
// that strips a twin's own `begin;` / `commit;` so the file can run inside the suite's rolled-back transaction —
// now lives in `./rollback-twin` and is shared with `rollback-security-clauses.test.ts`.
//
// **Why arm (1) and not arm (2).** ADR-165 (2)'s `RAISE EXCEPTION` gate is owed by a twin whose reverted
// application code cannot run without the old, weaker behaviour. Nothing needs a bar to come off silently: with
// `lift_nanny_suspension()` dropped and the narrowing kept, a suspension simply cannot be lifted by any road at
// all, which is the fail-SAFE direction. So this twin drops what `0025` added and refuses to undo the clause —
// and the case below drives that refusal rather than reading it.
import { resolve } from "node:path";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";
import { bodyOf, type StrippedTwin } from "./rollback-twin";

const TWIN_0025 = resolve(
  __dirname,
  "../rollbacks/0025_suspension-is-terminal.rollback.sql",
);

const NANNY = "000000e1-0000-4000-8000-000000000000";
const ADMIN = "000000e9-0000-4000-8000-000000000000";

/** `VETTING.requiredChecksByLevel` as the adapters compute it — the shape, not a test invention. */
const REQUIRED = {
  L2_ID_VERIFIED: ["identity"],
  L3_PROVISIONALLY_VERIFIED: ["identity", "dbs"],
  L4_FULLY_VERIFIED: ["identity", "dbs", "right_to_work"],
};

let db: Client;
let stripped: StrippedTwin;
let nannyId: string;

async function makeUser(
  id: string,
  email: string,
  role: "nanny" | "admin",
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

async function suspended(): Promise<{
  readonly nanny: boolean;
  readonly verification: boolean;
}> {
  const { rows } = await db.query<{ nanny: boolean; verification: boolean }>(
    `select n.suspended_at is not null as nanny, v.suspended_at is not null as verification
       from public.nannies n join public.verifications v on v.nanny_id = n.id
      where n.id = $1`,
    [nannyId],
  );
  return rows[0];
}

beforeAll(async () => {
  db = await connect();
  await db.query("begin");

  await makeUser(NANNY, "twin-0025-nanny@example.test", "nanny");
  await makeUser(ADMIN, "twin-0025-admin@example.test", "admin");
  const { rows } = await db.query<{ id: string }>(
    `insert into public.nannies (user_id, is_isolated, verification_level)
     values ($1, false, 'L0_SIGNED_UP') returning id`,
    [NANNY],
  );
  nannyId = rows[0].id;

  // Barred, the state the whole clause exists for: I-V5's three columns written together, as
  // `record_vetting_decision`'s adverse branch writes them.
  await db.query(
    `insert into public.verifications (nanny_id, dbs_outcome, level, suspended_at)
     values ($1, 'barred', 'L0_SIGNED_UP', now())`,
    [nannyId],
  );
  await db.query(
    `update public.nannies set suspended_at = now() where id = $1`,
    [nannyId],
  );

  // Forward → twin. Everything after this line is measured against the ROLLED-BACK database.
  stripped = bodyOf(TWIN_0025);
  await db.query(stripped.sql);
});

afterAll(async () => {
  await db?.query("rollback");
  await db?.end();
});

describe("int.rollback — `0025`'s twin drops a lever and keeps a clause (ADR-165)", () => {
  it("the twin really ran: its own transaction control was stripped and nothing else", () => {
    expect(stripped.removed).toBe(2);
    expect(stripped.sql).toContain(
      "drop function if exists public.lift_nanny_suspension(uuid, text, uuid)",
    );
  });

  it("the twin undid what it says it undid — the lift and its audit table are gone", async () => {
    const { rows } = await db.query<{ fn: string; tbl: string }>(
      `select (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = 'lift_nanny_suspension') as fn,
              (select count(*)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relname = 'nanny_suspension_lifts') as tbl`,
    );
    expect(rows[0]).toEqual({ fn: "0", tbl: "0" });
  });

  it("★ ADR-165 (1) — after the twin the sync STILL cannot clear a bar, driven and not read", async () => {
    // The exact shape of REVIEW-4 C-2: the outcome moves off `barred` (which is what
    // `record_vetting_decision`'s else-branch does on any non-`adverse` rejection), and then the sync runs.
    // Before `0025` this pair walked `suspended_at` to null in both tables.
    await db.query(
      `update public.verifications set dbs_outcome = 'unset' where nanny_id = $1`,
      [nannyId],
    );

    await db.query(
      `select public.sync_nanny_verification_state($1::uuid, $2::jsonb)`,
      [nannyId, JSON.stringify(REQUIRED)],
    );

    expect(await suspended()).toEqual({ nanny: true, verification: true });
  });

  it("★ and there is no road left that clears it — the lever the twin removed is the only one there was", async () => {
    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n
         from pg_proc p join pg_namespace s on s.oid = p.pronamespace
        where s.nspname = 'public'
          and p.prosrc ~ 'suspended_at\\s*=\\s*null'`,
    );

    expect(rows[0].n).toBe("0");
    expect(await suspended()).toEqual({ nanny: true, verification: true });
  });
});
