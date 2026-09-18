// `int.rollback-0031` — **ADR-165 (3) for `0031`**: apply forward → twin → and assert the clause is still shut.
//
// `0031`'s twin keeps one thing and its header names it; ADR-165 (3) says the twin ships a test that proves it
// rather than a comment claiming it. The clause is `bbldn_retention`'s DELETE on `verifications` and
// `vetting_submissions`, revoked by `0031` after measuring that it held DELETE on those two (created by `0008`,
// before `0016:288` granted the identity DML on every table then in existence) while it did not on
// `nanny_suspension_lifts` (created by `0025`, after). Handing it back mid-incident restores a road on which a
// retention job can delete a vetting decision, and it costs the reverted code nothing, because no job before or
// after `0031` deletes a safeguarding record.
//
// Arm (1) and not arm (2) (ADR-177's shape): the twin completes and announces its cost. The cost is the whole
// point of this unit reappearing — after the twin, `purge-scrubbed-users` goes back to answering
// `rows-outstanding` for ever, which the last case measures rather than describes.
import { resolve } from "node:path";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";
import { bodyOf, type StrippedTwin } from "./rollback-twin";

const TWIN = resolve(
  __dirname,
  "../rollbacks/0031_retention-sweep.rollback.sql",
);

let db: Client;
let stripped: StrippedTwin;

async function functionExists(name: string): Promise<boolean> {
  const { rows } = await db.query(
    `select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = $1`,
    [name],
  );
  return rows.length > 0;
}

async function canDelete(table: string): Promise<boolean> {
  const { rows } = await db.query<{ can: boolean }>(
    `select has_table_privilege('bbldn_retention', 'public.' || $1, 'delete') as can`,
    [table],
  );
  return rows[0].can;
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

describe("int.rollback-0031 — the twin", () => {
  it("owns exactly one transaction, so stripping it is unambiguous", () => {
    expect(stripped.removed).toBe(2);
  });

  it("★ applies cleanly and removes the sweep", async () => {
    await db.query("savepoint s");
    expect(await functionExists("retention_sweep_class")).toBe(true);

    await db.query(stripped.sql);

    expect(await functionExists("retention_sweep_class")).toBe(false);
    await db.query("rollback to savepoint s");
  });

  it("★ does NOT hand DELETE on a safeguarding table back to the retention identity", async () => {
    await db.query("savepoint s");
    await db.query(stripped.sql);

    expect(await canDelete("verifications")).toBe(false);
    expect(await canDelete("vetting_submissions")).toBe(false);
    expect(await canDelete("nanny_suspension_lifts")).toBe(false);

    await db.query("rollback to savepoint s");
  });

  it("★ leaves the erasure job and the purge alone — it removes the sweep, never a right", async () => {
    await db.query("savepoint s");
    await db.query(stripped.sql);

    expect(await functionExists("erase_account")).toBe(true);
    expect(await functionExists("purge_scrubbed_user")).toBe(true);

    await db.query("rollback to savepoint s");
  });

  it("★ the cost it announces is real: after the twin, nothing can clear a `rows-outstanding` purge", async () => {
    await db.query("savepoint s");
    await db.query(stripped.sql);

    // The header's claim, asserted as behaviour rather than read as prose: with the sweep gone there is no
    // function in the schema that removes an expired money or consent row, so the purge's refusal is permanent.
    await expect(
      db.query(
        `select public.retention_sweep_class('money', '{"window":{"months":72}}'::jsonb, 10)`,
      ),
    ).rejects.toThrow(/does not exist/);

    await db.query("rollback to savepoint s");
  });
});
