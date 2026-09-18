// `int.rollback-security-clauses` — **ADR-165 (3), which nothing in the tree implemented.** REVIEW-4 (the
// ADR-123 checkpoint over `2c` · `2d` · `2f` · P2-HARDEN).
//
// ADR-165 rules, in three parts, that a rollback twin restores a feature and never a hole:
//
//   (1) a migration's **security clause is forward-only** — the twin keeps it, and says in its header which
//       clause it deliberately does not undo;
//   (2) where the reverted application code genuinely cannot run without the old, weaker grant, the recovery is
//       **roll-forward**, not the twin, and a twin in that position ends in `RAISE EXCEPTION` naming the
//       roll-forward, "so a half-informed operator cannot re-open the hole at 3 a.m.";
//   (3) **every twin whose forward file carried a security clause ships a test that applies forward → twin →
//       and asserts the hole is still closed, which is how this was caught.**
//
// Part (3) had no implementation anywhere: measured at `6551ddc`, **no file under `supabase/__tests__/`,
// `src/`, `scripts/` or `.github/` reads anything from `supabase/rollbacks/`**. The twins were checked by
// reading them. This file is part (3) for `0023`, the one migration in the tree whose forward file carries a
// measured security fix (ADR-162's level term) and a measured narrowing (ADR-163's grant).
//
// **How it runs the twin without wrecking the stack.** The whole file runs inside one transaction that is rolled
// back, like `int.rls`. Postgres makes DDL transactional, so `create or replace function`, `drop function` and
// `create index` all disappear on `rollback` — but the twin owns its own `begin;` / `commit;`, which would end
// the suite's transaction and make the change permanent. So the two statements are stripped (and only those
// two: the assertion below proves exactly one of each was removed) and the body is run inside the suite's
// transaction. `fileParallelism: false` in `vitest.config.ts` means no other suite is on the database meanwhile.
//
// The two cases are deliberately on opposite sides of the same file:
//
//   · **ADR-162's level term survives the twin** — passes. This is the REFUSED regression the twin's header
//     names, and it is true in fact and not only in prose: after the twin, an applied, unverified nanny still
//     reads nothing. That is REVIEW-3's CRITICAL, measured to stay shut through a rollback.
//   · **ADR-163's grant does not survive the twin** — PINNED `it.fails`. The twin restores EXECUTE on
//     `create_nanny_account` to `authenticated`, which is the escalation ADR-163 closed: an invited nanny's own
//     session calls the RPC with `p_isolated => false` and enters the matching pool outside the apply funnel.
//     The twin states this and asks the operator to revoke it by hand. ADR-165 (2) says that is exactly the
//     position in which a twin must instead refuse. **Owner: `2c` / the migration's author — a twin is a
//     migration artefact and a checkpoint sweep does not write one.** See REVIEW-4 §8 R-2.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";
import { asRole } from "./rls-fixtures";

const TWIN_0023 = resolve(
  __dirname,
  "../rollbacks/0023_verification-decision-sync.rollback.sql",
);

/** The account `/apply` creates (ADR-147 (1)): a real session, not isolated, at the level column's default. */
const APPLIED = "000000b0-0000-4000-8000-000000000000";
const PARENT = "000000b1-0000-4000-8000-000000000000";

let db: Client;
let stripped: { readonly sql: string; readonly removed: number };

/**
 * The twin's body without its own transaction control. Only a `begin;` or `commit;` that is the whole line is
 * removed — a `begin` inside a `plpgsql` body is indented and followed by declarations, and must survive.
 */
function bodyOf(path: string): {
  readonly sql: string;
  readonly removed: number;
} {
  const lines = readFileSync(path, "utf8").split("\n");
  const kept = lines.filter((line) => !/^(begin|commit);\s*$/i.test(line));
  return { sql: kept.join("\n"), removed: lines.length - kept.length };
}

async function makeUser(
  id: string,
  email: string,
  role: "parent" | "nanny",
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

beforeAll(async () => {
  db = await connect();
  await db.query("begin");

  // A family with an OPEN position, a child carrying care-needs text (`0016`'s own comment calls
  // `position_children.needs_details` "potentially Art 9 child health data") and a schedule.
  await makeUser(PARENT, "rollback-parent@example.test", "parent");
  const { rows: parent } = await db.query<{ id: string }>(
    `insert into public.parents (user_id, signup_source) values ($1, 'cold') returning id`,
    [PARENT],
  );
  const { rows: position } = await db.query<{ id: string }>(
    `insert into public.nanny_positions (parent_id, source, stage, title, district, area)
     values ($1, 'in_app', 'OPEN', 'Rollback family position', 'SW4', 'Clapham') returning id`,
    [parent[0].id],
  );
  await db.query(
    `insert into public.position_children (position_id, child_label, age_months, needs_details)
     values ($1, 'A', 18, 'private care needs')`,
    [position[0].id],
  );
  await db.query(
    `insert into public.position_schedule (position_id, schedule) values ($1, $2::jsonb)`,
    [position[0].id, '{"mon":"09:00-17:00"}'],
  );

  // The nanny the whole finding is about: applied through the public funnel, level 0, nothing verified.
  await makeUser(APPLIED, "rollback-applied@example.test", "nanny");
  await db.query(
    `insert into public.nannies (user_id, is_isolated) values ($1, false)`,
    [APPLIED],
  );

  // Forward → twin. Everything after this line is measured against the ROLLED-BACK database.
  stripped = bodyOf(TWIN_0023);
  await db.query(stripped.sql);
});

afterAll(async () => {
  await db?.query("rollback");
  await db?.end();
});

describe("int.rollback — a twin restores a feature, never a hole (ADR-165)", () => {
  it("the twin really ran: its own transaction control was stripped and nothing else", () => {
    // One `begin;` and one `commit;`, both at column 0. If the twin ever grows a second pair this assertion
    // fails loudly rather than letting half a file run.
    expect(stripped.removed).toBe(2);
    expect(stripped.sql).toContain(
      "create or replace function public.is_active_nanny()",
    );
  });

  it("the twin undid what it says it undid — `nanny_visible()` is gone", async () => {
    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
        where s.nspname = 'public' and p.proname in ('nanny_visible', 'nanny_is_visible')`,
    );
    expect(rows[0].n).toBe("0");
  });

  it("★ ADR-165 (1) — after the twin, an applied unverified nanny still reads nothing (REVIEW-3 C-1 stays shut)", async () => {
    const active = await asRole<{ active: boolean }>(
      db,
      APPLIED,
      "select public.is_active_nanny() as active",
    );
    const positions = await asRole<{ id: string }>(
      db,
      APPLIED,
      "select id from public.nanny_positions",
    );
    const children = await asRole<{ needs_details: string | null }>(
      db,
      APPLIED,
      "select needs_details from public.position_children",
    );
    const schedule = await asRole<{ position_id: string }>(
      db,
      APPLIED,
      "select position_id from public.position_schedule",
    );

    expect(active[0]).toEqual({ active: false });
    expect(positions).toEqual([]);
    expect(children).toEqual([]);
    expect(schedule).toEqual([]);
  });

  /**
   * PINNED — ADR-165 (2). The twin restores `create_nanny_account`'s EXECUTE to `authenticated` and tells the
   * operator to revoke it by hand if the rolled-back state outlives the incident. ADR-165 (2) rules that a twin
   * in exactly that position must `RAISE EXCEPTION` naming the roll-forward instead, because a comment is not a
   * control and the operator reading it is at 3 a.m.
   *
   * Red on the shipped tree; green the moment the twin either keeps the narrowing or refuses to run.
   * **Owner: `2c` / the migration's author.** REVIEW-4 §8 R-2.
   */
  it.fails(
    "★ PINNED — ADR-165 (2): the twin does not hand `authenticated` EXECUTE on create_nanny_account back (owner: `2c`)",
    async () => {
      const { rows } = await db.query<{ granted: boolean }>(
        `select has_function_privilege('authenticated',
                  'public.create_nanny_account(text, text, boolean, text, text, text, uuid, jsonb)',
                  'EXECUTE') as granted`,
      );
      expect(rows[0].granted).toBe(false);
    },
  );
});
