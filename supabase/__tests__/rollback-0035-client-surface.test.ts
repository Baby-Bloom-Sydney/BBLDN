// `int.rollback-0035` — **ADR-165 (3) for `0035`**: apply forward → twin → and assert the surface is still shut.
//
// The plainest arm (1) in the folder: `0035` is seven `revoke execute … from anon, authenticated` and nothing
// else, so every statement its twin could contain hands a stranger with the public anon key something back.
// It is empty in both halves, and this file is the only thing that distinguishes it from a twin nobody wrote.
import { resolve } from "node:path";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";
import { bodyOf, type StrippedTwin } from "./rollback-twin";

const TWIN = resolve(
  __dirname,
  "../rollbacks/0035_client-function-surface-enumerated.rollback.sql",
);

/** The seven `0035` takes away (ten role-and-function pairs). Named here so a failure says which one came back. */
const REVOKED: ReadonlyArray<readonly [string, string]> = [
  ["anon", "public.nanny_is_visible(uuid)"],
  ["authenticated", "public.nanny_is_visible(uuid)"],
  ["authenticated", "public.child_has_family_access(uuid)"],
  ["authenticated", "public.family_has_access(uuid)"],
  ["authenticated", "public.nanny_profile_columns(jsonb)"],
  [
    "authenticated",
    "public.verification_submission_columns(verification_section, jsonb)",
  ],
  ["authenticated", "public.is_safeguarding_retention_job()"],
  ["anon", "public.is_safeguarding_retention_job()"],
  ["anon", "public.get_invite_preview(text)"],
  ["authenticated", "public.get_invite_preview(text)"],
];

/** What must survive the twin, because a twin that shut a door by breaking the app is the worse failure. */
const KEPT: ReadonlyArray<readonly [string, string]> = [
  ["service_role", "public.get_invite_preview(text)"],
  ["anon", "public.nanny_visible(boolean, verification_level)"],
  ["authenticated", "public.family_access_reason(uuid)"],
  ["authenticated", "public.is_admin()"],
  ["authenticated", "public.user_has_child_access(uuid)"],
  ["authenticated", "public.is_privileged_writer()"],
];

let db: Client;
let stripped: StrippedTwin;

async function canExecute(role: string, sig: string): Promise<boolean> {
  const { rows } = await db.query<{ ok: boolean }>(
    `select has_function_privilege($1, $2, 'EXECUTE') as ok`,
    [role, sig],
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

describe("int.rollback-0035 — the twin restores nothing, and proves it", () => {
  it("owns exactly one transaction, so stripping it is unambiguous", () => {
    expect(stripped.removed).toBe(2);
  });

  it("★ writes no grant at all — not even a commented one to paste", () => {
    expect(stripped.sql).not.toMatch(/^\s*grant\s+execute/im);
    expect(stripped.sql).not.toMatch(/^\s*--\s*grant\s+execute/im);
  });

  it("★ runs, and not one of the seven comes back", async () => {
    await db.query("savepoint twin");
    await db.query(stripped.sql);

    for (const [role, sig] of REVOKED) {
      expect(await canExecute(role, sig), `${role} → ${sig}`).toBe(false);
    }

    await db.query("rollback to savepoint twin");
  });

  it("★ and everything the client genuinely reaches still works", async () => {
    await db.query("savepoint twin");
    await db.query(stripped.sql);

    for (const [role, sig] of KEPT) {
      expect(await canExecute(role, sig), `${role} → ${sig}`).toBe(true);
    }

    await db.query("rollback to savepoint twin");
  });

  it("★ and the side door stays shut — nothing in `public` is PUBLIC-executable", async () => {
    await db.query("savepoint twin");
    await db.query(stripped.sql);

    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
              lateral aclexplode(p.proacl) a
        where n.nspname = 'public' and a.grantee = 0 and a.privilege_type = 'EXECUTE'`,
    );
    expect(rows[0]!.n).toBe("0");

    await db.query("rollback to savepoint twin");
  });

  it("★ is idempotent — running it twice still changes nothing", async () => {
    await db.query("savepoint twin");
    await db.query(stripped.sql);
    await db.query(stripped.sql);

    expect(await canExecute("anon", "public.nanny_is_visible(uuid)")).toBe(
      false,
    );
    expect(
      await canExecute("service_role", "public.get_invite_preview(text)"),
    ).toBe(true);

    await db.query("rollback to savepoint twin");
  });
});
