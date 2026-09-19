// `int.retention-execute` — **ADR-185 applied one layer over: the function surface.** The retention identity
// holds `EXECUTE` on the functions its enumerated set names, and on nothing else.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS, AND WHY IT IS NOT A TIDY-UP
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// `0032` (`3i`) revoked `0016:288`'s blanket **table** grant and replaced it with 33 enumerated relations.
// `0016:291` is the same statement one layer over —
//
//     grant execute on all functions in schema public to bbldn_retention;
//
// — and it outranks `0032` completely. The six functions the three retention jobs run through are
// `SECURITY DEFINER` **owned by `bbldn_retention`**, so a line added inside any of them calls out with that
// identity; on `main` that identity could execute **38 SECURITY DEFINER functions, 33 of them owned by
// `postgres`**. One `perform public.open_dfy_access(...)` inside `erase_account` would therefore run as
// `postgres` and reach every table `0032` had just put out of reach — and no table grant can close that,
// because the privilege being used is not the caller's.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE TWO HALVES, AND WHY BOTH ARE NEEDED
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
//
//   1. **The privilege half** — `bbldn_retention` can execute exactly `ENUMERATED_FUNCTIONS` and nothing else,
//      asked as an *effective* privilege (`has_function_privilege`), which follows role membership, `PUBLIC`
//      and ownership. `3i`'s D-3: the ACL is a record of intent, the effective privilege is the fact.
//   2. **The body half** — no function owned by `bbldn_retention` may *reference* a `public` function outside
//      that set. The privilege half stops the call at run time; the body half stops it at review time, which
//      is the only place a reviewer reading a diff will see it.
//
// ★ The body half is sound rather than a heuristic **because every definer in `public` pins `search_path=""`**
// (asserted already by `db.constraints`, "every SECURITY DEFINER in public pins search_path"). With an empty
// search path an unqualified call cannot resolve, so every call a body makes has to be written
// `schema.function(` — and a scan for that pattern is exhaustive. A case below re-asserts the pin for the six
// retention-owned functions specifically, because it is this suite's own precondition and a suite that depends
// on another file's invariant should say so out loud.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// HOW TO CHANGE IT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// Adding a row to `ENUMERATED_FUNCTIONS` is a privilege change and is reviewed as one, exactly as adding a row
// to `ENUMERATED` in `retention-grants.test.ts` is. **The default for a new function is nothing** — and unlike
// tables, that is not what Postgres does on its own: a new function defaults to `EXECUTE TO PUBLIC`, which is
// why `0033` revokes it from `PUBLIC` and why a case below asserts no `public` function is PUBLIC-executable.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";

const MIGRATION = resolve(
  __dirname,
  "../migrations/0033_retention-execute-enumerated.sql",
);

type Enumerated = {
  /** why this function is reachable by the retention identity at all. */
  readonly why: string;
  /** how it is reached: a body call, a guard trigger's callee, or ownership. */
  readonly via: "body" | "trigger-callee" | "owner";
};

/**
 * ★ The enumerated set: `schema.name(identity arguments)` exactly as `pg_get_function_identity_arguments`
 * renders it, so an overload cannot be admitted by accident.
 *
 * Derived from what the three retention jobs actually exercise, in two layers:
 *
 *   · **`via: "body"`** — the function appears, schema-qualified, in the body of a `bbldn_retention`-owned
 *     function. With `search_path=""` that scan is exhaustive.
 *   · **`via: "trigger-callee"`** — the function is called by a **non-`SECURITY DEFINER`** trigger function
 *     that fires on one of `0032`'s 33 tables. The trigger function itself needs no EXECUTE (measured — a
 *     firing trigger does not check it), but a non-definer trigger body runs as the invoking role, so what it
 *     calls does.
 *   · **`via: "owner"`** — owned by `bbldn_retention`. Revoking EXECUTE from the owner of a function is
 *     theatre: the owner can re-grant at will. These are listed rather than hidden, which is ADR-180's rule
 *     about stating a limit instead of implying the control is absolute.
 */
const ENUMERATED_FUNCTIONS: Readonly<Record<string, Enumerated>> = {
  // ── the erasure's and the purge's own escalations (ADR-183) ───────────────────────────────────────────────
  "public.scrub_auth_user(p_user_id uuid)": {
    via: "body",
    why: "erase_account step 5: auth's privileges are not re-grantable, so the tombstone and ban are their own narrow definer (ADR-183)",
  },
  "public.purge_auth_user(p_user_id uuid)": {
    via: "body",
    why: "purge_scrubbed_user: the 30-day hard delete of the auth.users row, 07 §6.1 step 6",
  },
  "public.auth_user_purge_state(p_user_id uuid)": {
    via: "body",
    why: "purge_scrubbed_user reads whether the row is already scrubbed and banned before it purges",
  },
  // ── the sweep's own helper ────────────────────────────────────────────────────────────────────────────────
  "public.money_last_activity_at(p_user_id uuid)": {
    via: "owner",
    why: "retention_sweep_class's money class anchors on it; owned by bbldn_retention and called from inside its own definer",
  },
  // ── what the guard triggers on 0032's 33 tables call, running as this role ────────────────────────────────
  "public.is_retention_job()": {
    via: "trigger-callee",
    why: "prevent_row_modification, prevent_erasure_request_modification and prevent_cookie_consent_modification are not SECURITY DEFINER, so their call to this predicate runs as bbldn_retention — the append-only exemption ADR-180 narrowed",
  },
  "public.is_safeguarding_retention_job()": {
    via: "trigger-callee",
    why: "prevent_safeguarding_row_modification and prevent_safeguarding_record_loss, the same shape, on the three ADR-170 tables",
  },
  "public.is_privileged_writer()": {
    via: "trigger-callee",
    why: "the four guard_* column guards (children, user_profiles, inbox_messages, admin_notifications) and prevent_cookie_consent_modification call it while running as the deleting role",
  },
  // ── the three jobs' own entry points, owned by this role ──────────────────────────────────────────────────
  "public.erase_account(p_user_id uuid, p_request_id uuid, p_deleted_objects jsonb)": {
    via: "owner",
    why: "0028's entry point; invoked by service_role, runs as bbldn_retention",
  },
  "public.collect_erasure_objects(p_user_id uuid)": {
    via: "owner",
    why: "0028 reads the subject's storage paths by prefix",
  },
  "public.purge_scrubbed_user(p_user_id uuid, p_windows jsonb)": {
    via: "owner",
    why: "0030's entry point: the 30-day hard delete, gated on no money or consent row still inside its window",
  },
  "public.retention_sweep_class(p_class text, p_spec jsonb, p_limit integer)": {
    via: "owner",
    why: "0031's entry point, one class per bounded batch per transaction",
  },
  "public.pseudonymise_safeguarding_subject()": {
    via: "owner",
    why: "0027's BEFORE DELETE trigger on nannies; a firing trigger checks no EXECUTE, so this entry is ownership and nothing else",
  },
};

const NAMED = Object.keys(ENUMERATED_FUNCTIONS).sort();

/** Functions whose bodies the body half inspects: everything `bbldn_retention` owns. */
type BodyRow = {
  readonly fn: string;
  readonly src: string;
  readonly config: string[] | null;
  readonly secdef: boolean;
};

type FnRow = {
  readonly fn: string;
  readonly owner: string;
  readonly secdef: boolean;
  readonly reachable: boolean;
  readonly toPublic: boolean;
};

let db: Client;
let functions: readonly FnRow[];
let bodies: readonly BodyRow[];

beforeAll(async () => {
  db = await connect();

  const all = await db.query<FnRow>(
    `select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as fn,
            pg_get_userbyid(p.proowner) as owner,
            p.prosecdef as secdef,
            has_function_privilege('bbldn_retention', p.oid, 'EXECUTE') as reachable,
            exists (select 1 from aclexplode(p.proacl) a
                     where a.grantee = 0 and a.privilege_type = 'EXECUTE') as "toPublic"
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
      order by 1`,
  );
  functions = all.rows;

  const owned = await db.query<BodyRow>(
    `select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as fn,
            p.prosrc as src, p.proconfig as config, p.prosecdef as secdef
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and pg_get_userbyid(p.proowner) = 'bbldn_retention'
      order by 1`,
  );
  bodies = owned.rows;
});

afterAll(async () => {
  await db?.end();
});

/** Runs one statement as `bbldn_retention` and rolls it back — `retention-grants.test.ts`'s helper. */
async function asRetention(sql: string): Promise<unknown> {
  await db.query("begin");
  try {
    await db.query("set local role bbldn_retention");
    return await db.query(sql);
  } finally {
    await db.query("rollback");
  }
}

describe("int.retention-execute — what the identity can actually call (effective privilege)", () => {
  it("★ can execute exactly the functions the enumerated set names, by any route — membership, PUBLIC or ownership included", () => {
    const reachable = functions
      .filter((f) => f.reachable)
      .map((f) => f.fn)
      .sort();
    expect(reachable).toEqual(NAMED);
  });

  // ★ The escalation path, and the honest form of the claim. Three `postgres`-owned definers stay reachable
  // **by design** — ADR-183: `auth`'s privileges are not re-grantable, so 07 §6.1 steps 5 and 6 need exactly
  // one narrow escalation each. ADR-180's conditions are what make that acceptable, and its third —
  // "a second requires an ADR" — is only true of the database if something asserts the count. This is that
  // assertion. It is written as an exact list rather than a number so a *substitution* fails it too.
  const ADR_183_ESCALATIONS = [
    "public.auth_user_purge_state(p_user_id uuid) [owner postgres]",
    "public.purge_auth_user(p_user_id uuid) [owner postgres]",
    "public.scrub_auth_user(p_user_id uuid) [owner postgres]",
  ];

  it("★ reaches exactly ADR-183's three foreign-owned definers and no fourth — the escalation path a table grant cannot close", () => {
    const foreignDefiners = functions
      .filter((f) => f.reachable && f.secdef && f.owner !== "bbldn_retention")
      .map((f) => `${f.fn} [owner ${f.owner}]`)
      .sort();
    expect(foreignDefiners).toEqual(ADR_183_ESCALATIONS);
  });

  it("★ every one of those three is in the enumerated set with a reason — an escalation nobody wrote down is one nobody can remove", () => {
    for (const entry of ADR_183_ESCALATIONS) {
      const fn = entry.slice(0, entry.indexOf(" ["));
      expect(NAMED, fn).toContain(fn);
      expect(ENUMERATED_FUNCTIONS[fn]!.via).toBe("body");
    }
  });

  it("★ no function in `public` is executable by PUBLIC — the route round any enumeration of this role", () => {
    const leaked = functions
      .filter((f) => f.toPublic)
      .map((f) => f.fn)
      .sort();
    expect(leaked).toEqual([]);
  });

  it("★ holds no grantable EXECUTE — it cannot hand its call rights to a third role", async () => {
    const { rows } = await db.query(
      `select 1 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace, lateral aclexplode(p.proacl) a
       where n.nspname = 'public'
         and a.grantee = 'bbldn_retention'::regrole
         and a.privilege_type = 'EXECUTE'
         and a.is_grantable`,
    );
    expect(rows).toEqual([]);
  });

  it("★ is named by no default-privilege rule for functions — the grant that applies to every function added tomorrow", async () => {
    const { rows } = await db.query(
      `select 1 from pg_default_acl d, lateral aclexplode(d.defaclacl) a
        where a.grantee = 'bbldn_retention'::regrole
          and d.defaclobjtype = 'f'`,
    );
    expect(rows).toEqual([]);
  });

  it("★ reaches no function in `auth` beyond the four the platform grants to PUBLIC, and none it owns", async () => {
    const { rows } = await db.query<{ fn: string }>(
      `select p.proname as fn
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace, lateral aclexplode(p.proacl) a
        where n.nspname = 'auth' and a.grantee = 'bbldn_retention'::regrole`,
    );
    expect(rows.map((r) => r.fn)).toEqual([]);
  });
});

describe("int.retention-execute — the enumerated set is the authority (ADR-185, one layer over)", () => {
  it("every entry says why it is there and how it is reached", () => {
    for (const [fn, entry] of Object.entries(ENUMERATED_FUNCTIONS)) {
      expect(entry.why.length, fn).toBeGreaterThan(20);
      expect(["body", "trigger-callee", "owner"], fn).toContain(entry.via);
    }
  });

  it("★ every `via: \"owner\"` entry really is owned by this role, and no other entry is", () => {
    const byName = new Map(functions.map((f) => [f.fn, f]));
    for (const [fn, entry] of Object.entries(ENUMERATED_FUNCTIONS)) {
      const row = byName.get(fn);
      expect(row, `${fn} is not in the catalogue`).toBeDefined();
      expect(row!.owner === "bbldn_retention", `${fn} owner`).toBe(
        entry.via === "owner",
      );
    }
  });

  // The migration writes `public.scrub_auth_user(uuid)` (the type list SQL needs) and the catalogue renders
  // `public.scrub_auth_user(p_user_id uuid)` (the identity arguments), so the two are compared on the name —
  // which is only safe because the case below proves no name in the set is overloaded.
  it("★ the migration's grant block and this list name the same functions, so neither drifts alone", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const start = sql.indexOf("ENUMERATED FUNCTIONS — START");
    const end = sql.indexOf("ENUMERATED FUNCTIONS — END");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = sql.slice(start, end);
    const granted = new Set<string>();
    for (const match of block.matchAll(
      /^grant execute on function\s+(public\.[a-z0-9_]+)\s*\(/gms,
    )) {
      granted.add(match[1]!);
    }
    const listed = new Set(NAMED.map((fn) => fn.slice(0, fn.indexOf("("))));
    expect([...granted].sort()).toEqual([...listed].sort());
  });

  it("★ no function in the set is overloaded, so comparing the two lists by name is sound", async () => {
    const { rows } = await db.query<{ fn: string; n: string }>(
      `select n.nspname || '.' || p.proname as fn, count(*)::text as n
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
        group by 1 having count(*) > 1
        order by 1`,
    );
    const listed = new Set(NAMED.map((fn) => fn.slice(0, fn.indexOf("("))));
    expect(rows.filter((r) => listed.has(r.fn)).map((r) => r.fn)).toEqual([]);
  });
});

describe("int.retention-execute — the body half: no definer reaches outside the set", () => {
  it("★ every function owned by `bbldn_retention` pins `search_path=\"\"` — this suite's own precondition", () => {
    expect(bodies.length).toBeGreaterThan(0);
    for (const row of bodies) {
      expect(row.config ?? [], row.fn).toContain('search_path=""');
    }
  });

  it("★ no retention-owned body references a `public` function outside the enumerated set", () => {
    const allowed = new Set(NAMED.map((fn) => fn.slice(0, fn.indexOf("("))));
    const relations = new Set(
      functions.map((f) => f.fn.slice(0, f.fn.indexOf("("))),
    );
    const offenders: string[] = [];
    for (const row of bodies) {
      for (const match of row.src.matchAll(
        /(?<![a-z0-9_.])(public\.[a-z0-9_]+)\s*\(/gi,
      )) {
        const callee = match[1]!.toLowerCase();
        // a table or view named in `insert into public.x (` is not a call; only a real function counts
        if (!relations.has(callee)) continue;
        if (!allowed.has(callee)) offenders.push(`${row.fn} -> ${callee}`);
      }
    }
    expect([...new Set(offenders)].sort()).toEqual([]);
  });

  it("★ no retention-owned body reaches another schema's function either", () => {
    const offenders: string[] = [];
    for (const row of bodies) {
      for (const match of row.src.matchAll(
        /(?<![a-z0-9_.])((?:auth|storage|extensions|graphql|vault|pgbouncer)\.[a-z0-9_]+)\s*\(/gi,
      )) {
        offenders.push(`${row.fn} -> ${match[1]!.toLowerCase()}`);
      }
    }
    expect([...new Set(offenders)].sort()).toEqual([]);
  });
});

describe("int.retention-execute — what the identity is refused, and by which control", () => {
  it.each([
    [
      "public.open_dfy_access(gen_random_uuid(), gen_random_uuid(), 7, 14)",
      "a postgres-owned definer that opens paid access",
    ],
    [
      "public.start_family_trial_if_first(gen_random_uuid(), 14, true)",
      "a postgres-owned definer that starts a paid trial",
    ],
    [
      "public.connect_child_invite('AAAA-BBBB', gen_random_uuid())",
      "a postgres-owned definer that links a child to an account",
    ],
    [
      "public.set_access_window(gen_random_uuid(), 5)",
      "a postgres-owned definer that moves a family's access end",
    ],
    [
      "public.lift_nanny_suspension(gen_random_uuid(), 'probe', gen_random_uuid())",
      "the safeguarding decision ADR-168 makes terminal",
    ],
    [
      "public.record_vetting_decision(gen_random_uuid(), 'approved', null, null, null, '{}'::jsonb, gen_random_uuid())",
      "a DBS outcome no admin made",
    ],
  ])(
    "★ is refused `%s` — %s",
    async (call) => {
      await expect(asRetention(`select ${call}`)).rejects.toMatchObject({
        code: "42501",
      });
    },
  );

  // ★ The trigger functions every retention write fires are the whole reason `0016:291` gave for existing,
  // and the reason is false. Measured twice, and the two answers are the finding:
  //
  //   · **Before `0033`**, while the role held the blanket EXECUTE, `select public.prevent_row_modification()`
  //     answered **`0A000`** — "trigger functions can only be called as triggers". The privilege was there;
  //     the call shape was what refused.
  //   · **After `0033`** the same call answers **`42501`**. The privilege is now what refuses, and it refuses
  //     first.
  //
  // Neither of those is the claim that matters, which is that the role does not need the grant at all. That is
  // the pair below: the catalogue says the EXECUTE is gone, and the writes those triggers sit on still work.
  // Both halves, because either alone proves nothing.
  it("★ holds no EXECUTE on the guard triggers its own writes fire — and the writes still work", async () => {
    const { rows } = await db.query<{ fn: string; reachable: boolean }>(
      `select p.proname as fn,
              has_function_privilege('bbldn_retention', p.oid, 'EXECUTE') as reachable
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('prevent_row_modification', 'prevent_cookie_consent_modification',
                            'prevent_safeguarding_row_modification', 'prevent_safeguarding_record_loss',
                            'prevent_erasure_request_modification', 'refuse_primary_key_rewrite',
                            'set_updated_at', 'bump_version')
        order by 1`,
    );
    expect(rows).toHaveLength(8);
    expect(rows.filter((r) => r.reachable).map((r) => r.fn)).toEqual([]);

    // …and the writes those triggers sit on still succeed, which is the half that matters
    await expect(
      asRetention(`delete from public.consent_records where false`),
    ).resolves.toBeDefined();
    await expect(
      asRetention(`delete from public.cookie_consent_records where false`),
    ).resolves.toBeDefined();
    await expect(
      asRetention(
        `update public.verifications set subject_pseudonym = subject_pseudonym where false`,
      ),
    ).resolves.toBeDefined();
    await expect(
      asRetention(`update public.user_profiles set first_name = null where false`),
    ).resolves.toBeDefined();
  });

  it("★ a direct call of a guard trigger is now refused by the privilege, not by the call shape — `42501`, where `main` answered `0A000`", async () => {
    await expect(
      asRetention(`select public.prevent_row_modification()`),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("still calls what the three jobs need, proved by calling it", async () => {
    await expect(asRetention(`select public.is_retention_job()`)).resolves.toBeDefined();
    await expect(
      asRetention(`select public.is_safeguarding_retention_job()`),
    ).resolves.toBeDefined();
    await expect(
      asRetention(`select public.is_privileged_writer()`),
    ).resolves.toBeDefined();
    await expect(
      asRetention(`select public.auth_user_purge_state(gen_random_uuid())`),
    ).resolves.toBeDefined();
    await expect(
      asRetention(`select public.money_last_activity_at(gen_random_uuid())`),
    ).resolves.toBeDefined();
    await expect(
      asRetention(`select public.collect_erasure_objects(gen_random_uuid())`),
    ).resolves.toBeDefined();
  });
});
