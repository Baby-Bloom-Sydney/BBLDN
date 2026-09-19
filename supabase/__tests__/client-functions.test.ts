// `int.client-functions` — **ADR-185/186 turned outward.** `anon` and `authenticated` may execute the
// functions the enumerated set names, and nothing else.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS, AND WHY IT IS THE OTHER HALF OF `0033`
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// `0032` enumerated what the retention identity may touch and `0033` what it may call. Both are about one
// NOLOGIN role. The surface a **stranger with the anon key** reaches was left untouched and said so out loud
// (07 §5.7's "out of scope" note, `3j`'s Q-2): **26** functions in `public` executable by `authenticated` and
// **4** by `anon`, 21 of them `SECURITY DEFINER` owned by `postgres` and therefore running with BYPASSRLS
// and trusting their arguments. Every one is a live `POST /rest/v1/rpc/<name>`.
//
// ★ **And the default is against us, which is what makes a gate the control rather than a migration.**
// Measured on this stack, not read: a function created by `postgres` in `public` comes out with
// `{=X/postgres, postgres=X, service_role=X}` — the `=X` is **PUBLIC**, so `anon` and `authenticated` reach
// it. `0000:329` runs `alter default privileges in schema public revoke execute on functions from public,
// anon, authenticated` and its stated claim is *"Default: no client role may execute anything in public"*.
// **That claim has been false since `0000`.** Re-issuing the revoke inside a transaction and creating another
// function changes nothing: the world default for a function is merged in regardless. So the only thing that
// can hold this line is a gate that reads the live catalogue after the whole migration set — `3j`'s D-3,
// which is the same finding one more time.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// HOW TO CHANGE IT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// Adding a row to `CLIENT_SURFACE` is a privilege change and is reviewed as one. Each entry carries **why**
// and, per ADR-186, **from where** — a policy expression, a non-definer trigger body running as the invoking
// role, or a named `.rpc()` call site with the scope it is made at. "The app might need it" is not an entry;
// a call site is.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";

const MIGRATION = resolve(
  __dirname,
  "../migrations/0035_client-function-surface-enumerated.sql",
);

type Entry = {
  /** `anon` reaches it too, not only `authenticated`. */
  readonly anon?: true;
  /** how it is reached — ADR-186's field. */
  readonly via: "policy" | "trigger-callee" | "view" | "rpc";
  /** the reason it is on the surface at all, including the call site or the policy count. */
  readonly why: string;
};

/**
 * ★ The client surface. `schema.name(identity args)` — the identity arguments matter, because a
 * `SECURITY DEFINER` **overload** is a different function wearing the same name (`3j`'s MEDIUM).
 */
const CLIENT_SURFACE: Readonly<Record<string, Entry>> = {
  // ── reached from an RLS policy expression, which is evaluated as the querying role ───────────────────────
  "public.is_admin()": {
    via: "policy",
    why: "55 policies. Every admin read and write in the schema is gated on it",
  },
  "public.is_nanny()": {
    via: "policy",
    why: "5 policies — the nanny-only reads and the nanny side of child linking",
  },
  "public.is_parent()": {
    via: "policy",
    why: "1 policy — the parent side of the same gate, kept separate so a role change reads as one",
  },
  "public.is_active_nanny()": {
    via: "policy",
    why: "7 policies — the visible-nanny gate",
  },
  "public.current_nanny_id()": {
    via: "policy",
    why: "8 policies — the nanny's own rows",
  },
  "public.current_parent_id()": {
    via: "policy",
    why: "8 policies — the parent's own rows",
  },
  "public.user_has_child_access(uuid)": {
    via: "policy",
    why: "12 policies — the child-linking read gate",
  },
  // ── reached from a NON-definer trigger body, which runs as the invoking role (3j's rule, client side) ────
  "public.is_privileged_writer()": {
    via: "trigger-callee",
    why: "the column guards on children, user_profiles, feed_posts, inbox_messages, subscribe_invites and admin_notifications are invoker triggers, so an authenticated write evaluates it as itself (0000 grants it for this reason)",
  },
  // ── ★ reached from a VIEW BODY, which is the fifth surface and the one this unit learned by breaking ─────
  //
  // All nine views in `public` are `security_invoker = off`, so their *table* reads are checked as the view
  // owner — but a function named inside a view body is still checked against the **querying** role. Owner
  // substitution applies to relations, not to EXECUTE. The first draft of `0035` revoked both of these and
  // `int.rls` / `int.rls-isolation-conjunction` went red with `permission denied` from an `anon` read of
  // `nanny_public`. 07 §5.7's four surfaces are four surfaces seen from the retention identity; from the
  // client side there is a fifth.
  "public.nanny_visible(boolean, verification_level)": {
    anon: true,
    via: "view",
    why: "named in `nanny_public`'s body, and `nanny_public` is readable by anon — it is the public nanny pool. Also named by `nannies_matching_idx`'s predicate, which consults no privilege because the function is the inlinable `sql IMMUTABLE` shape (3j's D-4) — true, but never the reason it has to stay",
  },
  "public.family_access_reason(uuid)": {
    via: "view",
    why: "named in `family_access`'s body, which is readable by authenticated and not by anon — so this entry is authenticated-only, and `int.rls`'s H1 case drives the refusal it still makes about another family",
  },
  // ── reached as a named RPC, with the scope the call is made at ───────────────────────────────────────────
  "public.claim_verification_processing()": {
    via: "rpc",
    why: "boot/db-verification-store.ts, session scope — it acts for auth.uid() and refuses without a session",
  },
  "public.create_child_invite(uuid, invite_direction, text)": {
    via: "rpc",
    why: "modules/app/child-linking/lib/db-child-linking-store.ts, session scope — the invite is created for auth.uid()",
  },
  "public.create_parent_profile(text, text, text)": {
    via: "rpc",
    why: "boot/db-parent-profile-store.ts, session scope — it writes the signed-in parent's own profile",
  },
  "public.get_invite_preview(text)": {
    anon: true,
    via: "rpc",
    why: "lib/actions/bapp/child-invites.ts uses the user-scoped client deliberately so the JWT — or its absence — reaches the definer's own auth.uid() redaction gate. **anon is the whole point**: a signed-out visitor opening an invite link",
  },
  "public.get_pending_invites_for_recipient()": {
    via: "rpc",
    why: "modules/app/child-linking/lib/db-child-linking-store.ts, session scope — it answers for auth.uid() and for nobody else",
  },
  "public.lift_nanny_isolation()": {
    via: "rpc",
    why: 'boot/db-nanny-account-store.ts, session scope (ADR-152) — it takes no user id and acts for auth.uid(), so a service-scope call would mean "no session" and be refused',
  },
  "public.revoke_child_invite(uuid, invite_revoked_reason)": {
    via: "rpc",
    why: "modules/app/child-linking/lib/db-child-linking-store.ts, session scope — it answers for auth.uid() and for nobody else",
  },
  "public.save_verification_contact()": {
    via: "rpc",
    why: "boot/db-verification-store.ts, session scope — the nanny saves her own contact details",
  },
  "public.submit_verification_evidence(uuid, verification_section, text, text, vetting_submission_status, jsonb)":
    {
      via: "rpc",
      why: "boot/db-vetting-store.ts — the nanny submits evidence against her own verification, keyed on auth.uid()",
    },
  "public.update_nanny_profile(jsonb, jsonb)": {
    via: "rpc",
    why: 'boot/db-nanny-account-store.ts, session scope (ADR-152) — it takes no user id and acts for auth.uid(), so a service-scope call would mean "no session" and be refused',
  },
};

/**
 * ★ What `0035` takes away, each with the measurement that says it is safe. Written down rather than implied,
 * because "we removed eight things" is not reviewable and "we removed these eight, and here is the caller
 * search for each" is.
 */
const REVOKED: Readonly<Record<string, string>> = {
  "public.nanny_is_visible(uuid)":
    "**REVIEW-4 L-2.** An anon-reachable SECURITY DEFINER over a FORCE RLS table with no caller anywhere — not in src/, not in a policy, not in another body",
  "public.child_has_family_access(uuid)":
    "no caller anywhere either — not in src/, not in a policy, not in another body",
  "public.family_has_access(uuid)":
    "called only by child_has_family_access(), a postgres-owned definer, and named in no view body — so the client never evaluates it",
  "public.nanny_profile_columns(jsonb)":
    "called only by create_nanny_account() and update_nanny_profile(), both postgres-owned definers",
  "public.verification_submission_columns(verification_section, jsonb)":
    "called only by submit_verification_evidence(), a postgres-owned definer",
  "public.is_safeguarding_retention_job()":
    "the safeguarding guards' predicate. The three tables that carry those guards have SELECT-only policies for authenticated and none for anon, so no client write path can ever reach it",
};

let db: Client;

/** Effective, not direct — `3i`'s D-3: a grant can arrive through PUBLIC or through role membership. */
async function reachableBy(role: string): Promise<string[]> {
  const { rows } = await db.query<{ sig: string }>(
    // ★ argument **types**, not the identity string: `pg_get_function_identity_arguments` prints parameter
    // names, so renaming an argument would silently change what this gate compares. Types are what a
    // signature is, and what `has_function_privilege` takes.
    `select 'public.' || p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')' as sig
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and has_function_privilege($1, p.oid, 'EXECUTE')
      order by 1`,
    [role],
  );
  return rows.map((r) => r.sig);
}

beforeAll(async () => {
  db = await connect();
  await db.query("begin");
});

afterAll(async () => {
  await db?.query("rollback");
  await db?.end();
});

describe("int.client-functions — the surface is exactly what is enumerated", () => {
  it("★ `authenticated` reaches the enumerated set and nothing else", async () => {
    expect(await reachableBy("authenticated")).toEqual(
      Object.keys(CLIENT_SURFACE).sort(),
    );
  });

  it("★ `anon` reaches only the entries that say so", async () => {
    expect(await reachableBy("anon")).toEqual(
      Object.keys(CLIENT_SURFACE)
        .filter((k) => CLIENT_SURFACE[k]!.anon)
        .sort(),
    );
  });

  it("★ and every one of `0035`'s eight revocations really is gone, from both roles", async () => {
    for (const [sig, why] of Object.entries(REVOKED)) {
      expect(why.length, sig).toBeGreaterThan(30);
      const { rows } = await db.query<{ a: boolean; b: boolean }>(
        `select has_function_privilege('anon', $1, 'EXECUTE') as a,
                has_function_privilege('authenticated', $1, 'EXECUTE') as b`,
        [sig],
      );
      expect(rows[0], sig).toEqual({ a: false, b: false });
    }
  });

  it("★ every entry carries a reason and a `from where` — ADR-186's field, not decoration", () => {
    for (const [sig, entry] of Object.entries(CLIENT_SURFACE)) {
      expect(entry.why.length, sig).toBeGreaterThan(20);
      expect(["policy", "trigger-callee", "view", "rpc"], sig).toContain(
        entry.via,
      );
    }
  });

  it("★ the migration's revoke block and this list name the same functions, so neither drifts alone", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const start = sql.indexOf("CLIENT SURFACE — START");
    const end = sql.indexOf("CLIENT SURFACE — END");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = sql.slice(start, end);
    const named = new Set<string>();
    for (const match of block.matchAll(
      /^revoke execute on function (public\.[a-z_]+\([^)]*\))/gms,
    )) {
      named.add(match[1]!.replace(/\s+/g, " "));
    }
    expect([...named].sort()).toEqual(Object.keys(REVOKED).sort());
  });
});

describe("int.client-functions — the roads a direct-ACL read cannot see", () => {
  it("★ nothing in `public` is PUBLIC-executable — the route that reaches every role without naming one", async () => {
    const { rows } = await db.query<{ sig: string }>(
      `select p.proname as sig
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
              lateral aclexplode(p.proacl) a
        where n.nspname = 'public' and a.grantee = 0 and a.privilege_type = 'EXECUTE'`,
    );
    expect(rows.map((r) => r.sig)).toEqual([]);
  });

  it("★ no EXECUTE in `public` is grantable — a client role cannot hand the surface on", async () => {
    const { rows } = await db.query<{ sig: string }>(
      `select p.proname as sig
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
              lateral aclexplode(p.proacl) a
        where n.nspname = 'public' and a.is_grantable and a.privilege_type = 'EXECUTE'`,
    );
    expect(rows.map((r) => r.sig)).toEqual([]);
  });

  it("★ membership is one-directional — no client role inherits another's grants", async () => {
    // `authenticator` is a member of anon / authenticated / service_role, which is Supabase's design and the
    // reason PostgREST can switch roles. What must not exist is the other direction.
    const { rows } = await db.query<{ member: string; of: string }>(
      `select g.rolname as member, r.rolname as "of"
         from pg_auth_members am
         join pg_roles r on r.oid = am.roleid
         join pg_roles g on g.oid = am.member
        where g.rolname in ('anon','authenticated')
        order by 1, 2`,
    );
    expect(rows.map((r) => `${r.member} in ${r.of}`)).toEqual([]);
  });

  it("★ no default privilege WE OWN hands a client role EXECUTE on a future function", async () => {
    // ⚠️ Measured, and it is the opposite of reassuring. `0000`'s `alter default privileges … revoke execute
    // on functions from public, anon, authenticated` does NOT suppress the world default: the row it wrote is
    // correct (`{postgres=X, service_role=X}`) and a function created afterwards still comes out with `=X`
    // (PUBLIC) merged in — driven in the last block of this file. So the PUBLIC case above is what holds the
    // line, and this case is about the *named* half.
    const { rows } = await db.query<{ role: string; acl: string }>(
      `select defaclrole::regrole::text as role, defaclacl::text as acl
         from pg_default_acl
        where defaclobjtype = 'f' and defaclnamespace = 'public'::regnamespace
        order by 1`,
    );
    for (const row of rows.filter((r) => r.role !== "supabase_admin")) {
      expect(row.acl, `${row.role}'s default`).not.toMatch(
        /\banon=|authenticated=/,
      );
    }
  });

  it("★ and the one default we CANNOT close is named, with the thing that actually catches it", async () => {
    // ADR-180's rule: state the limit rather than imply the control is absolute. `supabase_admin`'s default
    // for functions in `public` grants `anon` and `authenticated` EXECUTE, and `postgres` is not a superuser
    // here — `alter default privileges for role supabase_admin …` answers "permission denied to change
    // default privileges", driven. It does not bite because nothing in this tree is created as that role,
    // which is the second half of this case; and if something ever were, the enumerated-surface case at the
    // top of this file is what would fail on the next run.
    const { rows } = await db.query<{ acl: string }>(
      `select defaclacl::text as acl from pg_default_acl
        where defaclobjtype = 'f' and defaclnamespace = 'public'::regnamespace
          and defaclrole = 'supabase_admin'::regrole`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.acl).toMatch(/anon=X/);

    const { rows: owned } = await db.query<{ n: string }>(
      `select count(*)::text as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and pg_get_userbyid(p.proowner) = 'supabase_admin'`,
    );
    expect(owned[0]!.n).toBe("0");
  });

  it("★ ★ every function named in a view body is on the surface — the fifth half", async () => {
    // The scan that would have caught `0035`'s first draft before CI did. A view's body is evaluated by the
    // querying role as far as EXECUTE is concerned, so a function it names is on the client surface whether
    // or not anybody wrote it down.
    const { rows } = await db.query<{ view: string; fn: string }>(
      `select c.relname as view, p.proname as fn
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         join pg_proc p on true
         join pg_namespace pn on pn.oid = p.pronamespace
        where n.nspname = 'public' and c.relkind in ('v','m')
          and pn.nspname = 'public'
          and pg_get_viewdef(c.oid) like '%' || p.proname || '(%'
        order by 1, 2`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const readableByAnon = await db.query<{ ok: boolean }>(
        `select has_table_privilege('anon', 'public.' || $1, 'SELECT') as ok`,
        [row.view],
      );
      const needed = readableByAnon.rows[0]!.ok ? "anon" : "authenticated";
      const { rows: priv } = await db.query<{ ok: boolean }>(
        `select bool_or(has_function_privilege($2, p.oid, 'EXECUTE')) as ok
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = $1`,
        [row.fn, needed],
      );
      expect(
        priv[0]!.ok,
        `${row.view} names ${row.fn}, reachable by ${needed}`,
      ).toBe(true);
    }
  });

  it("★ `nanny_visible` really is the inlinable shape, so the index predicate needs no grant (3j's D-4)", async () => {
    const { rows } = await db.query<{ lang: string; volatility: string }>(
      `select l.lanname as lang, p.provolatile as volatility
         from pg_proc p join pg_language l on l.oid = p.prolang
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'nanny_visible'`,
    );
    expect(rows[0]).toMatchObject({ lang: "sql", volatility: "i" });
  });
});

describe("int.client-functions — driven the other way", () => {
  async function asRole(
    role: string,
    sql: string,
  ): Promise<{ raised: boolean; code?: string }> {
    await db.query("savepoint probe");
    try {
      await db.query(`set local role ${role}`);
      await db.query(sql);
      await db.query("reset role");
      await db.query("rollback to savepoint probe");
      return { raised: false };
    } catch (error) {
      await db.query("rollback to savepoint probe");
      await db.query("reset role");
      return { raised: true, code: (error as { code?: string }).code };
    }
  }

  it.each([
    ["anon", "select public.nanny_is_visible(gen_random_uuid())"],
    ["authenticated", "select public.nanny_is_visible(gen_random_uuid())"],
    [
      "authenticated",
      "select public.child_has_family_access(gen_random_uuid())",
    ],
    ["authenticated", "select public.family_has_access(gen_random_uuid())"],
    ["authenticated", "select public.nanny_profile_columns('{}'::jsonb)"],
    ["anon", "select public.is_safeguarding_retention_job()"],
    ["authenticated", "select public.is_safeguarding_retention_job()"],
  ])("★ %s is refused `%s`", async (role, sql) => {
    expect(await asRole(role, sql)).toMatchObject({
      raised: true,
      code: "42501",
    });
  });

  it("★ a blanket re-grant fails this gate — the shape a later migration would take", async () => {
    await db.query("savepoint probe");
    await db.query(
      `grant execute on all functions in schema public to authenticated`,
    );
    const reachable = await reachableBy("authenticated");
    expect(reachable.length).toBeGreaterThan(
      Object.keys(CLIENT_SURFACE).length,
    );
    await db.query("rollback to savepoint probe");
  });

  it("★ a new function created the ordinary way fails it too — the default is PUBLIC, measured", async () => {
    await db.query("savepoint probe");
    await db.query(
      `create function public.client_surface_probe() returns int language sql immutable as $f$ select 1 $f$`,
    );
    const { rows } = await db.query<{ acl: string | null }>(
      `select proacl::text as acl from pg_proc where proname = 'client_surface_probe'`,
    );
    expect(rows[0]!.acl ?? "").toContain("=X/");
    expect(await reachableBy("authenticated")).toContain(
      "public.client_surface_probe()",
    );
    await db.query("rollback to savepoint probe");
  });

  it("★ and a grant routed through PUBLIC fails it, which a direct-ACL read would have missed", async () => {
    await db.query("savepoint probe");
    await db.query(
      `grant execute on function public.nanny_is_visible(uuid) to public`,
    );
    const { rows } = await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', 'public.nanny_is_visible(uuid)', 'EXECUTE') as ok`,
    );
    expect(rows[0]!.ok).toBe(true);
    expect(await reachableBy("anon")).toContain(
      "public.nanny_is_visible(uuid)",
    );
    await db.query("rollback to savepoint probe");
  });
});
