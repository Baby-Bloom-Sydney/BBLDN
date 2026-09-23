// `int.rollback-0036` — **ADR-165 (3) for `0036`**: apply forward → twin → and assert the surface is still shut.
//
// `0036` is a blanket revoke, an enumerated re-grant, and one `alter default privileges`. Every statement its
// twin could contain hands a stranger with the public anon key something back — and the default-privilege
// half is the one that would go unnoticed, because re-arming it writes no `grant` line anywhere and its
// effect arrives on the *next* migration's table. The twin is empty in both halves, and this file is the only
// thing that distinguishes it from a twin nobody wrote.
import { resolve } from "node:path";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";
import { bodyOf, type StrippedTwin } from "./rollback-twin";

const TWIN = resolve(
  __dirname,
  "../rollbacks/0036_client-relation-surface-enumerated.rollback.sql",
);

/** What must stay gone. Named as role/relation/privilege so a failure says exactly which came back. */
const REVOKED: ReadonlyArray<readonly [string, string, string]> = [
  // the two safeguarding tables `3i` fought over, now from the client side
  ["authenticated", "public.verifications", "UPDATE"],
  ["authenticated", "public.vetting_submissions", "INSERT"],
  // the money spine
  ["authenticated", "public.parent_subscriptions", "UPDATE"],
  ["authenticated", "public.payment_events", "INSERT"],
  // ★ the five auto-updatable views — the half where RLS is not the backstop
  ["authenticated", "public.booking_events", "INSERT"],
  ["authenticated", "public.child_client_events", "UPDATE"],
  ["authenticated", "public.connection_events", "DELETE"],
  ["authenticated", "public.page_visits", "INSERT"],
  ["authenticated", "public.verification_events", "UPDATE"],
  // anon, which holds no write policy anywhere in the schema
  ["anon", "public.children", "INSERT"],
  ["anon", "public.user_roles", "INSERT"],
  ["anon", "public.nanny_public", "UPDATE"],
  ["anon", "public.user_profiles", "SELECT"],
  // the four tables with no SELECT policy for any client role
  ["authenticated", "public.events", "SELECT"],
  ["authenticated", "public.nanny_leads", "SELECT"],
  ["authenticated", "public.parent_leads", "SELECT"],
  ["authenticated", "public.chat_draft_locks", "SELECT"],
];

/** What must survive the twin, because a twin that shut a door by breaking the app is the worse failure. */
const KEPT: ReadonlyArray<readonly [string, string, string]> = [
  ["anon", "public.areas", "SELECT"],
  ["anon", "public.legal_documents", "SELECT"],
  ["anon", "public.nanny_public", "SELECT"],
  ["authenticated", "public.verification_status", "SELECT"],
  ["authenticated", "public.family_access", "SELECT"],
  ["authenticated", "public.booking_events", "SELECT"],
  ["authenticated", "public.user_profiles", "UPDATE"],
  ["authenticated", "public.children", "DELETE"],
  ["authenticated", "public.consent_records", "INSERT"],
  ["service_role", "public.events", "INSERT"],
  ["bbldn_retention", "public.account_erasure_requests", "SELECT"],
];

let db: Client;
let stripped: StrippedTwin;

async function can(role: string, rel: string, priv: string): Promise<boolean> {
  const { rows } = await db.query<{ ok: boolean }>(
    `select (has_table_privilege($1, $2, $3)
             or ($3 <> 'DELETE' and has_any_column_privilege($1, $2, $3))) as ok`,
    [role, rel, priv],
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

describe("int.rollback-0036 — the twin restores nothing, and proves it", () => {
  it("owns exactly one transaction, so stripping it is unambiguous", () => {
    expect(stripped.removed).toBe(2);
  });

  it("★ writes no grant at all — not even a commented one to paste", () => {
    expect(stripped.sql).not.toMatch(/^\s*grant\s+/im);
    expect(stripped.sql).not.toMatch(/^\s*--\s*grant\s+/im);
  });

  it("★ and no `alter default privileges … grant`, which is the half nobody would notice", () => {
    // Re-arming `postgres`'s default ACL for `public` writes no grant line and blanket-grants every table a
    // future migration creates. It is the quietest way to undo this file, so it is asserted separately.
    expect(stripped.sql).not.toMatch(/alter\s+default\s+privileges[\s\S]{0,120}\bgrant\b/i);
  });

  it("★ runs, and not one of the revoked privileges comes back", async () => {
    await db.query("savepoint twin");
    await db.query(stripped.sql);

    for (const [role, rel, priv] of REVOKED) {
      expect(await can(role, rel, priv), `${role} → ${rel} ${priv}`).toBe(false);
    }

    await db.query("rollback to savepoint twin");
  });

  it("★ and everything the client genuinely uses still works", async () => {
    await db.query("savepoint twin");
    await db.query(stripped.sql);

    for (const [role, rel, priv] of KEPT) {
      expect(await can(role, rel, priv), `${role} → ${rel} ${priv}`).toBe(true);
    }

    await db.query("rollback to savepoint twin");
  });

  it("★ the side door stays shut — nothing in `public` is granted TO PUBLIC", async () => {
    await db.query("savepoint twin");
    await db.query(stripped.sql);

    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n
         from pg_class c join pg_namespace n on n.oid = c.relnamespace,
              lateral aclexplode(c.relacl) a
        where n.nspname = 'public' and c.relkind in ('r','p','v') and a.grantee = 0`,
    );
    expect(rows[0]!.n).toBe("0");

    await db.query("rollback to savepoint twin");
  });

  it("★ the durable half survives — a table created after the twin is still born with no client privilege", async () => {
    await db.query("savepoint twin");
    await db.query(stripped.sql);
    await db.query("create table public.zz_twin_probe (id int)");

    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n
         from (select unnest(array['anon','authenticated']) as g) r,
              lateral (select unnest(array['SELECT','INSERT','UPDATE','DELETE']) as p) p
        where has_table_privilege(r.g, 'public.zz_twin_probe'::regclass, p.p)`,
    );
    expect(rows[0]!.n).toBe("0");

    await db.query("rollback to savepoint twin");
  });

  it("★ is idempotent — running it twice still changes nothing", async () => {
    await db.query("savepoint twin");
    await db.query(stripped.sql);
    await db.query(stripped.sql);

    expect(await can("anon", "public.children", "INSERT")).toBe(false);
    expect(await can("authenticated", "public.booking_events", "INSERT")).toBe(
      false,
    );
    expect(await can("anon", "public.areas", "SELECT")).toBe(true);

    await db.query("rollback to savepoint twin");
  });
});
