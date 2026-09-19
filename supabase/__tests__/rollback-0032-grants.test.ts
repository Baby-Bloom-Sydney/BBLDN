// `int.rollback-0032` — **ADR-165 (3) for `0032`**: apply forward → twin → and assert the hole is still closed.
//
// `0032` is unusual among the twins in this folder: its forward file is a security clause end to end, so ADR-165
// (1) leaves its twin with nothing it is allowed to do. A twin that does nothing is indistinguishable from a
// twin nobody wrote unless something asserts the difference — which is exactly what ADR-165 (3) asks for, and
// what this file is.
//
// Arm (1) and not arm (2) (ADR-177's shape): the twin completes rather than refusing, because the reverted code
// can run without the blanket grant — the enumerated set is a superset of what all three retention jobs
// exercise, proved by running them.
import { resolve } from "node:path";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";
import { bodyOf, type StrippedTwin } from "./rollback-twin";

const TWIN = resolve(
  __dirname,
  "../rollbacks/0032_retention-grants-enumerated.rollback.sql",
);

/** What `0032` leaves standing, and what `main` had before it. Both measured, not assumed. */
const ENUMERATED_RELATIONS = 33;

let db: Client;
let stripped: StrippedTwin;

async function relationsHeld(): Promise<number> {
  const { rows } = await db.query<{ n: string }>(
    `select count(*)::text as n
       from (
         select distinct c.oid
           from pg_class c, lateral aclexplode(c.relacl) a
          where c.relkind in ('r','p','v','m','f')
            and a.grantee = 'bbldn_retention'::regrole
       ) s`,
  );
  return Number(rows[0]!.n);
}

async function holds(
  table: string,
  privilege: string,
  column?: string,
): Promise<boolean> {
  const { rows } = await db.query<{ ok: boolean }>(
    column
      ? `select has_column_privilege('bbldn_retention', $1, $2, $3) as ok`
      : `select has_table_privilege('bbldn_retention', $1, $2) as ok`,
    column ? [table, column, privilege] : [table, privilege],
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

describe("int.rollback-0032 — the twin restores nothing, and proves it", () => {
  it("owns exactly one transaction, so stripping it is unambiguous", () => {
    expect(stripped.removed).toBe(2);
  });

  it("★ drops `0032` §3's three key-rewrite guards, and says what that costs", async () => {
    const guards = `select count(*)::text as n from pg_trigger t
       where not t.tgisinternal
         and t.tgname in ('nannies_refuse_key_rewrite', 'admin_notifications_refuse_key_rewrite',
                          'cookie_consent_records_refuse_key_rewrite')`;
    const before = await db.query<{ n: string }>(guards);
    expect(Number(before.rows[0]!.n)).toBe(3);

    await db.query(stripped.sql);

    const after = await db.query<{ n: string }>(guards);
    expect(Number(after.rows[0]!.n)).toBe(0);
  });

  it("★ contains no privilege `grant` at all — every one it could hold is one ADR-165 forbids", () => {
    const executable = stripped.sql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    expect(executable.toLowerCase()).not.toMatch(
      /\bgrant\b\s+(select|insert|update|delete|all)/,
    );
  });

  it("★ applies cleanly, and the retention identity holds exactly what it held before", async () => {
    expect(await relationsHeld()).toBe(ENUMERATED_RELATIONS);

    await db.query(stripped.sql);

    expect(await relationsHeld()).toBe(ENUMERATED_RELATIONS);
  });

  it("★ the blanket grant is still gone — a retention job reaches no table the set does not name", async () => {
    expect(await holds("public.contact_messages", "select")).toBe(false);
    expect(await holds("public.rate_limit_buckets", "select")).toBe(false);
    expect(await holds("public.user_roles", "delete")).toBe(false);
    expect(await holds("public.feed_posts", "update")).toBe(false);
  });

  it("★ the safeguarding holes `0032` closed are still closed", async () => {
    expect(await holds("public.verifications", "insert")).toBe(false);
    expect(await holds("public.vetting_submissions", "insert")).toBe(false);
    expect(
      await holds("public.nanny_suspension_lifts", "update", "decided_by"),
    ).toBe(false);
    expect(await holds("public.verifications", "update", "dbs_outcome")).toBe(
      false,
    );
    expect(await holds("public.events", "delete")).toBe(false);
  });

  it("★ and the three jobs can still do their work after it — a twin that shut a hole by breaking erasure would be worse", async () => {
    expect(
      await holds("public.verifications", "update", "subject_pseudonym"),
    ).toBe(true);
    expect(
      await holds(
        "public.nanny_suspension_lifts",
        "update",
        "subject_pseudonym",
      ),
    ).toBe(true);
    expect(await holds("public.nannies", "delete")).toBe(true);
    expect(await holds("public.payment_events", "delete")).toBe(true);
    expect(await holds("public.file_retention_log", "insert")).toBe(true);
    // the row locks the arms take, which is the thing `0032` §2h found by running rather than by reading
    expect(await holds("public.admin_notifications", "update", "id")).toBe(
      true,
    );
  });
});
