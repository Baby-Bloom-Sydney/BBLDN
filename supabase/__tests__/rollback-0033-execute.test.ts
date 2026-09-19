// `int.rollback-0033` — **ADR-165 (3) for `0033`**: apply forward → twin → and assert the hole is still closed.
//
// `0033` is the second twin in this folder whose forward file is a security clause end to end, so ADR-165 (1)
// leaves it with nothing it is allowed to do — and unlike `0032`'s twin it creates no object either, so it is
// empty in both halves. A twin that does nothing is indistinguishable from a twin nobody wrote unless
// something asserts the difference. That is what this file is.
//
// Arm (1) and not arm (2), on ADR-177's test: arm (2)'s refusal belongs to a twin that genuinely cannot
// proceed. This one can — the enumerated set is a superset of what all three retention jobs exercise, proved
// by running them (97 cases) — so it completes, having correctly done nothing.
import { resolve } from "node:path";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";
import { bodyOf, type StrippedTwin } from "./rollback-twin";

const TWIN = resolve(
  __dirname,
  "../rollbacks/0033_retention-execute-enumerated.rollback.sql",
);

/** What `0033` leaves standing. Measured from the catalogue, and asserted against it below. */
const ENUMERATED_FUNCTIONS = 12;

/**
 * What `main` had before `0033`: 56 of the 88 functions in `public` effectively executable by the role.
 *
 * ★ The first draft used this only in `expect(ENUMERATED_FUNCTIONS).toBeLessThan(BEFORE_0033)` — two literals
 * compared to each other, which cannot fail for any database state and is therefore not evidence (database
 * pass, LOW). It is now re-derived: `0033`'s two revokes are the whole difference between the two numbers, so
 * re-issuing them inside this suite's transaction must reproduce 56 exactly. If the tree changes underneath
 * that claim, this goes red and the number gets re-measured rather than quietly rotting in a comment.
 */
const BEFORE_0033 = 56;

let db: Client;
let stripped: StrippedTwin;

async function reachable(): Promise<number> {
  const { rows } = await db.query<{ n: string }>(
    `select count(*)::text as n
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and has_function_privilege('bbldn_retention', p.oid, 'EXECUTE')`,
  );
  return Number(rows[0]!.n);
}

async function canExecute(signature: string): Promise<boolean> {
  const { rows } = await db.query<{ ok: boolean }>(
    `select has_function_privilege('bbldn_retention', $1, 'EXECUTE') as ok`,
    [signature],
  );
  return rows[0]!.ok;
}

beforeAll(async () => {
  db = await connect();
  stripped = bodyOf(TWIN);
  await db.query("begin");
});

afterAll(async () => {
  await db?.query("rollback");
  await db?.end();
});

describe("int.rollback-0033 — the twin restores nothing, and proves it", () => {
  it("owns exactly one transaction, so stripping it is unambiguous", () => {
    expect(stripped.removed).toBe(2);
  });

  it("★ contains no `grant execute` at all — every one it could hold is one ADR-165 forbids", () => {
    const executable = stripped.sql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    expect(executable.toLowerCase()).not.toMatch(
      /\bgrant\b[\s\S]{0,40}\bexecute\b/,
    );
  });

  it("★ applies cleanly, and the retention identity can call exactly what it could before", async () => {
    expect(await reachable()).toBe(ENUMERATED_FUNCTIONS);

    await db.query(stripped.sql);

    expect(await reachable()).toBe(ENUMERATED_FUNCTIONS);
  });

  it("★ and `main`'s number is re-derived rather than remembered — undoing `0033`'s two revokes reproduces 56", async () => {
    expect(await reachable()).toBe(ENUMERATED_FUNCTIONS);

    // ⚠️ Inside a savepoint of its own. Every other case in this file shares one transaction rolled back in
    // `afterAll`, so without this the grants below would leak sideways into them — which they did on the
    // first run, taking four sibling cases red and proving the point better than a comment would.
    await db.query("savepoint before_0033");
    try {
      // the inverse of `0033` section 1, which is the whole difference between the two numbers. Never run
      // outside a rolled-back transaction: it is the hole ADR-165 forbids the twin from restoring.
      await db.query(
        `grant execute on all routines in schema public to bbldn_retention`,
      );
      await db.query(
        `grant execute on all routines in schema public to public`,
      );

      const { rows } = await db.query<{ n: string }>(
        `select count(*)::text as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'`,
      );
      // every function in `public` is reachable once both blanket grants are back — 88 — and 56 is what
      // `0016:291` actually reached, being the subset that existed when it ran plus the three `TO PUBLIC`
      expect(await reachable()).toBe(Number(rows[0]!.n));
      expect(BEFORE_0033).toBeLessThan(Number(rows[0]!.n));
    } finally {
      await db.query("rollback to savepoint before_0033");
    }

    expect(await reachable()).toBe(ENUMERATED_FUNCTIONS);
  });

  it("★ the escalation path is still shut — no foreign-owned definer beyond ADR-183's three", async () => {
    await db.query(stripped.sql);

    const { rows } = await db.query<{ fn: string }>(
      `select n.nspname || '.' || p.proname as fn
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.prosecdef
          and pg_get_userbyid(p.proowner) <> 'bbldn_retention'
          and has_function_privilege('bbldn_retention', p.oid, 'EXECUTE')
        order by 1`,
    );
    expect(rows.map((r) => r.fn)).toEqual([
      "public.auth_user_purge_state",
      "public.purge_auth_user",
      "public.scrub_auth_user",
    ]);
  });

  it("★ the specific calls that succeeded on `main` are still refused", async () => {
    await db.query(stripped.sql);

    // measured live before `0033`: this one returned successfully as `bbldn_retention`
    expect(await canExecute("public.set_access_window(uuid, integer)")).toBe(
      false,
    );
    expect(
      await canExecute("public.open_dfy_access(uuid, uuid, integer, integer)"),
    ).toBe(false);
    expect(
      await canExecute(
        "public.start_family_trial_if_first(uuid, integer, boolean)",
      ),
    ).toBe(false);
    expect(await canExecute("public.connect_child_invite(text, uuid)")).toBe(
      false,
    );
  });

  it("★ nothing in `public` is PUBLIC-executable again — `0016:279`'s intent stays restored", async () => {
    await db.query(stripped.sql);

    const { rows } = await db.query<{ fn: string }>(
      `select n.nspname || '.' || p.proname as fn
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace, lateral aclexplode(p.proacl) a
        where n.nspname = 'public' and a.grantee = 0 and a.privilege_type = 'EXECUTE'
        order by 1`,
    );
    expect(rows.map((r) => r.fn)).toEqual([]);
  });

  it("★ and the three jobs can still do their work after it — a twin that shut a hole by breaking erasure would be worse", async () => {
    await db.query(stripped.sql);

    expect(await canExecute("public.scrub_auth_user(uuid)")).toBe(true);
    expect(await canExecute("public.purge_auth_user(uuid)")).toBe(true);
    expect(await canExecute("public.auth_user_purge_state(uuid)")).toBe(true);
    expect(await canExecute("public.is_retention_job()")).toBe(true);
    expect(await canExecute("public.is_safeguarding_retention_job()")).toBe(
      true,
    );
    expect(await canExecute("public.is_privileged_writer()")).toBe(true);
    expect(await canExecute("public.money_last_activity_at(uuid)")).toBe(true);
  });
});
