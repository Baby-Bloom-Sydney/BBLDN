// `int.rollback-0028` — **ADR-165 (3) for `0028`**: apply forward → twin → and assert the clauses are still shut.
//
// `0028` carries two security clauses and its header names them: the six person→history keys stay off `cascade`
// with their columns nullable, and the two evidence tables stay with their append-only guards attached. ADR-165
// (1) says a twin keeps such a clause and names it; ADR-165 (3) says the twin ships a test that proves it rather
// than a comment claiming it.
//
// **Why arm (1) and not arm (2)** (ADR-177's shape, and `0027`'s precedent). ADR-165 (2)'s `RAISE EXCEPTION` is
// owed by a twin that would hand a hole back to reverted code that genuinely cannot run without it. Nothing
// before `0028` needs these cascades: the only road that deletes a `parents` or `nannies` row is the erasure
// path, and this twin removes that road entirely. So the twin completes, keeps both clauses, and **announces**
// what it costs — after it, no erasure can run at all, and an outstanding Art 17 request stays outstanding.
import { resolve } from "node:path";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";
import { bodyOf, type StrippedTwin } from "./rollback-twin";

const TWIN_0028 = resolve(
  __dirname,
  "../rollbacks/0028_erasure-job.rollback.sql",
);

const USER = "000000f8-0000-4000-8000-000000000001";
const NANNY_USER = "000000f8-0000-4000-8000-000000000002";
const PARENT = "000000f8-0000-4000-8000-000000000003";
const NANNY = "000000f8-0000-4000-8000-000000000004";
const POSITION = "000000f8-0000-4000-8000-000000000005";
const PLACEMENT = "000000f8-0000-4000-8000-000000000006";

let db: Client;
let stripped: StrippedTwin;

async function onDelete(table: string, column: string): Promise<string> {
  const { rows } = await db.query<{ action: string }>(
    `select c.confdeltype::text as action
       from pg_constraint c
       join pg_class t on t.oid = c.conrelid
       join pg_namespace n on n.oid = t.relnamespace
       join pg_attribute a on a.attrelid = t.oid and a.attnum = c.conkey[1]
      where n.nspname = 'public' and t.relname = $1 and c.contype = 'f'
        and array_length(c.conkey, 1) = 1 and a.attname = $2`,
    [table, column],
  );
  return rows[0]?.action ?? "none";
}

beforeAll(async () => {
  db = await connect();
  stripped = bodyOf(TWIN_0028);
  await db.query("begin");
  await db.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                             email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
             $2, 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
            ('00000000-0000-0000-0000-000000000000', $3, 'authenticated', 'authenticated',
             $4, 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
    [
      USER,
      "twin-0028-parent@example.test",
      NANNY_USER,
      "twin-0028-nanny@example.test",
    ],
  );
  await db.query(
    `insert into public.parents (id, user_id, signup_source) values ($1,$2,'results')`,
    [PARENT, USER],
  );
  await db.query(`insert into public.nannies (id, user_id) values ($1,$2)`, [
    NANNY,
    NANNY_USER,
  ]);
  await db.query(
    `insert into public.nanny_positions (id, parent_id, source, stage) values ($1,$2,'results_signup','OPEN')`,
    [POSITION, PARENT],
  );
  await db.query(
    `insert into public.nanny_placements (id, position_id, parent_id, nanny_id, source, state, ended_at, end_reason)
     values ($1,$2,$3,$4,'invite_shell','ENDED', now(), 'natural')`,
    [PLACEMENT, POSITION, PARENT, NANNY],
  );
  // A request row, so the guard has something to refuse: an UPDATE that matches nothing fires no row trigger and
  // would pass for the wrong reason.
  await db.query(
    `insert into public.account_erasure_requests (subject_user_id, requested_by, road)
     values ($1::uuid, $1::uuid, 'self-service')`,
    [USER],
  );
  await db.query(stripped.sql);
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("int.rollback-0028 — the twin applies, and its own verify block passed", () => {
  it("strips exactly the file-level begin / commit and applies in one transaction", () => {
    expect(stripped.removed).toBe(2);
  });
});

describe("int.rollback-0028 — clause (1): the cascades do NOT come back", () => {
  it.each([
    ["nanny_positions", "parent_id"],
    ["connection_requests", "parent_id"],
    ["connection_requests", "nanny_id"],
    ["nanny_placements", "parent_id"],
    ["nanny_placements", "nanny_id"],
    ["precheck_notifications", "nanny_id"],
  ])("public.%s.%s is still ON DELETE SET NULL", async (table, column) => {
    expect(await onDelete(table, column)).toBe("n");
  });

  it("★ and the behaviour behind the catalogue: a hire record still survives its parent", async () => {
    // The claim is not "the constraint says `n`" but "the row is still there afterwards" — which is the thing a
    // `confdeltype` cannot tell you and the thing the six keys exist for.
    await db.query("delete from public.parents where id = $1", [PARENT]);
    const { rows } = await db.query<{
      parent_id: string | null;
      nanny_id: string | null;
    }>(
      "select parent_id, nanny_id from public.nanny_placements where id = $1",
      [PLACEMENT],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].parent_id).toBeNull();
    expect(rows[0].nanny_id).toBe(NANNY);
  });
});

describe("int.rollback-0028 — clause (2): the evidence stays, and stays unrewritable", () => {
  it.each(["file_retention_log", "account_erasure_requests"])(
    "public.%s is still there",
    async (table) => {
      const { rows } = await db.query<{ present: string | null }>(
        "select to_regclass($1)::text as present",
        [`public.${table}`],
      );
      expect(rows[0].present).toBe(table);
    },
  );

  it("★ `account_erasure_requests` still refuses an UPDATE, and `service_role` still cannot", async () => {
    await db.query("savepoint ledger_after_twin");
    let message = "the UPDATE was ACCEPTED after the twin";
    try {
      await db.query(
        "update public.account_erasure_requests set state = 'completed'",
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    await db.query("rollback to savepoint ledger_after_twin");
    expect(message).toMatch(/written by erase_account\(\) alone/);

    const { rows } = await db.query<{ can: boolean }>(
      "select has_table_privilege('service_role', 'public.account_erasure_requests', 'update') as can",
    );
    expect(rows[0].can).toBe(false);
  });

  it("★ `file_retention_log` still refuses an UPDATE — by behaviour, not by trigger count", async () => {
    await db.query("savepoint rewrite_probe");
    let message = "the UPDATE was ACCEPTED after the twin";
    try {
      await db.query(
        "update public.file_retention_log set reason = 'rewritten by a rollback'",
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    await db.query("rollback to savepoint rewrite_probe");
    expect(message).toMatch(/append-only/);
  });
});

describe("int.rollback-0028 — what the twin DID undo, so a half-run file is loud", () => {
  it.each([
    "public.erase_account(uuid, uuid, jsonb)",
    "public.collect_erasure_objects(uuid)",
    "public.scrub_auth_user(uuid)",
  ])("%s is gone — no erasure can run after this twin", async (signature) => {
    const { rows } = await db.query<{ present: string | null }>(
      "select to_regprocedure($1)::text as present",
      [signature],
    );
    expect(rows[0].present).toBeNull();
  });

  it("`is_privileged_writer()` narrows back to `0000`'s three roles", async () => {
    const { rows } = await db.query<{ src: string }>(
      "select p.prosrc as src from pg_proc p where p.oid = to_regprocedure('public.is_privileged_writer()')",
    );
    expect(rows[0].src).not.toContain("bbldn_retention");
    expect(rows[0].src).toContain("service_role");
  });
});
