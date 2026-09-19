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
// search path an unqualified call cannot resolve, so every call written into a body has to be written
// `schema.function(` — and a scan for that pattern is exhaustive **for statically written calls**. A case
// below re-asserts the pin for the six retention-owned functions specifically, because it is this suite's own
// precondition and a suite that depends on another file's invariant should say so out loud.
//
// ⚠️ **And `search_path` does nothing about dynamic SQL**, which is the one construct that evades the scan: a
// name assembled at run time is not in `prosrc` to be found. The first draft of this file claimed
// exhaustiveness without that qualification and was wrong — `purge_scrubbed_user` contains an
// `execute format(...)`. So the dynamic SQL is **enumerated too**, in `KNOWN_DYNAMIC_SQL` at the foot of the
// body-half block, with the same rule: a new one fails CI and is read by a person.
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
  /**
   * ★ **For a `via: "body"` entry, the *only* functions whose bodies may name it** (security pass, HIGH).
   *
   * The first draft enumerated *who* may call and never *from where*, and a reviewer showed what that costs.
   * The migration's own threat model is a line added inside a retention-owned definer; the enumeration closes
   * that for the 76 functions it revoked and leaves it wide open for the 12 it kept. Two of those 12 —
   * `scrub_auth_user` and `purge_auth_user` — are account destruction with **no precondition inside the
   * function**: every gate lives in the intended caller.
   *
   * Driven: one line added to the existing body of `retention_sweep_class` — no new function, no new grant,
   * `create or replace` preserving owner and `search_path=""` — deleted an arbitrary `auth.users` row (an
   * admin) and cascaded `public.user_roles` away with it, a table `has_table_privilege` says this role cannot
   * DELETE and which is not among `0032`'s 33 relations at all. **Both halves stayed green**: the body half
   * because the callee is allowed, the privilege half because the privilege is granted, and the migration's
   * verify block because it counts rather than scopes.
   *
   * So the pair is the unit, not the grantee. The information was already here, in prose, in `why`; it simply
   * was not checked.
   */
  readonly callableFrom?: readonly string[];
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
    callableFrom: ["public.erase_account"],
    why: "erase_account step 5: auth's privileges are not re-grantable, so the tombstone and ban are their own narrow definer (ADR-183). It carries no precondition of its own — every gate is in erase_account — which is why the caller is pinned and not merely described",
  },
  "public.purge_auth_user(p_user_id uuid)": {
    via: "body",
    callableFrom: ["public.purge_scrubbed_user"],
    why: "purge_scrubbed_user: 07 §6.1 step 6's hard delete. ⚠️ NOT narrow — `delete from auth.users` fans out over 13 CASCADE and ~30 SET NULL keys, reaching tables 0032 denies this role outright (user_roles, development_images, child_invites). It is an unconditional account destruction whose only gate is its caller, so the caller is pinned",
  },
  "public.auth_user_purge_state(p_user_id uuid)": {
    via: "body",
    callableFrom: ["public.purge_scrubbed_user"],
    why: "purge_scrubbed_user reads whether the row is already scrubbed and banned before it purges; it takes the row lock the purge then holds",
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
  "public.erase_account(p_user_id uuid, p_request_id uuid, p_deleted_objects jsonb)":
    {
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

  // ★ The first draft of this case asked `aclexplode(proacl) where grantee = 'bbldn_retention'` — a
  // **direct-ACL read**, the exact method this file's own preamble condemns. A reviewer showed it vacuous: all
  // four `auth` functions are effectively reachable *via `PUBLIC`*, so the query returned zero rows and would
  // have stayed green through a fifth, or a `SECURITY DEFINER` one.
  //
  // What actually contains the role is **schema USAGE** — `select auth.uid()` answers
  // `42501 permission denied for schema auth` — and that fact was asserted nowhere in the tree, even though
  // ADR-183's entire premise rests on it. It has a line now, and the general form is below it: a function in a
  // schema the role cannot enter is unreachable whatever its ACL says, which is why the schema list is the
  // cheap and total form of the reach question.
  it("★ cannot enter the `auth` schema at all — the control ADR-183 actually rests on, asserted for the first time", async () => {
    const { rows } = await db.query<{ usage: boolean }>(
      `select has_schema_privilege('bbldn_retention', 'auth', 'USAGE') as usage`,
    );
    expect(rows[0]!.usage).toBe(false);
  });

  it("★ holds USAGE on `public` and `storage` and on no other schema — so a definer created in `0034`'s new schema cannot be the way round this list", async () => {
    const { rows } = await db.query<{ nspname: string }>(
      `select n.nspname
         from pg_namespace n
        where n.nspname not in ('pg_catalog', 'information_schema')
          and n.nspname not like 'pg\\_%'
          and has_schema_privilege('bbldn_retention', n.oid, 'USAGE')
        order by 1`,
    );
    expect(rows.map((r) => r.nspname)).toEqual(["public", "storage"]);
  });
});

describe("int.retention-execute — the enumerated set is the authority (ADR-185, one layer over)", () => {
  it("every entry says why it is there and how it is reached", () => {
    for (const [fn, entry] of Object.entries(ENUMERATED_FUNCTIONS)) {
      expect(entry.why.length, fn).toBeGreaterThan(20);
      expect(["body", "trigger-callee", "owner"], fn).toContain(entry.via);
    }
  });

  it('★ every `via: "owner"` entry really is owned by this role, and no other entry is', () => {
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

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// ★ THE THIRD ROAD: DISPATCH. Neither the privilege half nor the body half watches it.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// A `SECURITY DEFINER` trigger function owned by `postgres` runs **as `postgres`** when a retention write
// fires it. It is invisible to the privilege half (a firing trigger checks no EXECUTE, so
// `has_function_privilege` is false) and invisible to the body half (the call is dispatch, not text). A
// reviewer drove the whole thing: a role holding neither EXECUTE on the function nor INSERT on the target
// wrote to the target, the row recording `current_user = postgres`.
//
// It is closed the way everything else here is closed — by enumeration. A foreign-owned definer trigger may
// fire on an event this role can perform only if it is named, with its reason. Two are. One of them genuinely
// fires today.
const ENUMERATED_DEFINER_TRIGGERS: Readonly<Record<string, string>> = {
  nanny_placements_enforce_i3:
    "enforce_placement_position_active on nanny_placements, AFTER INSERT/UPDATE — fires on 0028's real UPDATE (it nulls the notes and roster). The body reads nanny_positions and connection_requests and raises; it writes nothing",
  nannies_guard_vaccination_consent:
    "guard_nanny_vaccination_consent on nannies, BEFORE INSERT/UPDATE — overlaps only the `update (id)` row-lock grant, which 0032 §3's guard refuses to let become a write, and no arm updates nannies. The body reads and raises",
};

describe("int.retention-execute — the third road: a definer reached by trigger dispatch", () => {
  it("★ no foreign-owned SECURITY DEFINER trigger fires on a retention write unless it is enumerated", async () => {
    const { rows } = await db.query<{
      tgname: string;
      rel: string;
      fn: string;
      owner: string;
    }>(
      `select t.tgname,
              c.relnamespace::regnamespace::text || '.' || c.relname as rel,
              p.proname as fn,
              pg_get_userbyid(p.proowner) as owner
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_proc  p on p.oid = t.tgfoid
        where not t.tgisinternal
          and p.prosecdef
          and pg_get_userbyid(p.proowner) <> 'bbldn_retention'
          and (   ((t.tgtype::int &  4) <> 0 and has_table_privilege('bbldn_retention', c.oid, 'INSERT'))
               or ((t.tgtype::int &  8) <> 0 and has_table_privilege('bbldn_retention', c.oid, 'DELETE'))
               or ((t.tgtype::int & 16) <> 0 and (has_table_privilege('bbldn_retention', c.oid, 'UPDATE')
                                                  or has_any_column_privilege('bbldn_retention', c.oid, 'UPDATE'))))
        order by t.tgname`,
    );
    expect(rows.map((r) => r.tgname)).toEqual(
      Object.keys(ENUMERATED_DEFINER_TRIGGERS).sort(),
    );
  });

  it("★ every enumerated dispatch has a reason, and its body writes nothing — the reason it is a boundary and not a hole", async () => {
    for (const [tgname, why] of Object.entries(ENUMERATED_DEFINER_TRIGGERS)) {
      expect(why.length, tgname).toBeGreaterThan(20);
    }
    const { rows } = await db.query<{ tgname: string; src: string }>(
      `select t.tgname, p.prosrc as src
         from pg_trigger t join pg_proc p on p.oid = t.tgfoid
        where t.tgname = any($1::text[])`,
      [Object.keys(ENUMERATED_DEFINER_TRIGGERS)],
    );
    expect(rows).toHaveLength(Object.keys(ENUMERATED_DEFINER_TRIGGERS).length);
    for (const row of rows) {
      expect(
        row.src.toLowerCase(),
        `${row.tgname} writes — it is no longer merely a guard`,
      ).not.toMatch(/\b(insert\s+into|update\s+\w|delete\s+from|perform\s)\b/);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// ★ THE FOURTH ROAD: A FUNCTION THE PLANNER CALLS FOR YOU — index predicates, CHECK constraints, DEFAULTs.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// `3i` recorded that an index predicate's EXECUTE is checked; the first draft of `0033` said it is not. Both
// were right, on different function shapes, and the variable is **inlining**:
//
//   | predicate function                                  | INSERT | UPDATE | DELETE |
//   | `language sql` IMMUTABLE, not a definer (inlinable) | OK     | OK     | OK     |
//   | `language plpgsql` (not inlinable)                  | 42501  | 42501  | OK     |
//
// An inlinable SQL function is folded into the plan and never called. `nanny_visible` is exactly that shape,
// which is why `int.account-erasure` is green with `has_function_privilege` **false** for it — load-bearing,
// and invisible. Rewriting it in plpgsql, or making it a definer, would raise `42501` from a retention write
// with nothing in the diff to explain it. So the rule is asserted rather than trusted.
describe("int.retention-execute — the fourth road: a function the planner calls for you", () => {
  it("★ every function a retention-writable table's index/CHECK/DEFAULT reaches is enumerated, or still inlinable", async () => {
    const { rows } = await db.query<{
      fn: string;
      rel: string;
      via: string;
      inlinable: boolean;
      enumerated: boolean;
    }>(
      `select n.nspname || '.' || p.proname as fn,
              t.relnamespace::regnamespace::text || '.' || t.relname as rel,
              case d.classid::regclass::text
                when 'pg_class' then 'index' when 'pg_constraint' then 'check'
                when 'pg_attrdef' then 'default' else d.classid::regclass::text end as via,
              (l.lanname = 'sql' and not p.prosecdef) as inlinable,
              has_function_privilege('bbldn_retention', p.oid, 'EXECUTE') as enumerated
         from pg_depend d
         join pg_proc p on p.oid = d.refobjid
         join pg_namespace n on n.oid = p.pronamespace
         join pg_language l on l.oid = p.prolang
         join pg_class t on t.oid = coalesce(
                case d.classid::regclass::text
                  when 'pg_class'      then (select indrelid from pg_index where indexrelid = d.objid)
                  when 'pg_constraint' then (select conrelid from pg_constraint where oid = d.objid)
                  when 'pg_attrdef'    then (select adrelid  from pg_attrdef  where oid = d.objid)
                end)
        where d.refclassid = 'pg_proc'::regclass
          and d.classid::regclass::text in ('pg_class', 'pg_constraint', 'pg_attrdef')
          and (has_table_privilege('bbldn_retention', t.oid, 'INSERT')
               or has_table_privilege('bbldn_retention', t.oid, 'UPDATE')
               or has_any_column_privilege('bbldn_retention', t.oid, 'UPDATE'))
        order by 1, 2`,
    );
    const unsafe = rows
      .filter((r) => !r.enumerated && !r.inlinable)
      .map((r) => `${r.rel} ${r.via} -> ${r.fn}`);
    expect(unsafe).toEqual([]);
  });

  it("★ `nanny_visible` in particular is still the inlinable shape the erasure silently depends on", async () => {
    const { rows } = await db.query<{ lang: string; secdef: boolean }>(
      `select l.lanname as lang, p.prosecdef as secdef
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         join pg_language l on l.oid = p.prolang
        where n.nspname = 'public' and p.proname = 'nanny_visible'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.lang).toBe("sql");
    expect(rows[0]!.secdef).toBe(false);
  });
});

describe("int.retention-execute — the body half: no definer reaches outside the set", () => {
  it('★ every function owned by `bbldn_retention` pins `search_path=""` — this suite\'s own precondition', () => {
    expect(bodies.length).toBeGreaterThan(0);
    for (const row of bodies) {
      expect(row.config ?? [], row.fn).toContain('search_path=""');
    }
  });

  /**
   * ★ **Normalise before matching, because `search_path=""` forces *qualification*, not one spelling.**
   *
   * A reviewer compiled and ran five call forms inside a `security definer … set search_path=''` function,
   * every one of them valid SQL and every one invisible to the first draft's regex:
   *
   *     public."is_retention_job"()        -- quoted identifier
   *     public . is_retention_job()        -- whitespace around the dot
   *     public/*c*­/.is_retention_job()     -- a comment around the dot
   *     "public".is_retention_job()        -- quoted schema
   *
   * So the body is normalised first — comments stripped, quotes around identifiers removed, whitespace around
   * the dot collapsed — and only then scanned. The fifth form the reviewer found was dynamic SQL, which no
   * amount of normalising reaches; that is enumerated separately at the foot of this block. Each of the five
   * is driven red in the gate's own counter-drive.
   */
  function normalise(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments, including ones inside a qualified name
      .replace(/--[^\n]*/g, " ") // line comments
      .replace(/"([a-z0-9_]+)"/gi, "$1") // quoted identifiers — Postgres folds unquoted to lower anyway
      .replace(/\s*\.\s*/g, ".") // whitespace around the dot
      .replace(/\s+/g, " ");
  }

  // ★ **The caller half** (security pass, HIGH). The case below asks *whether* a callee is allowed; this one
  // asks *from where*. Without it, one line inside `retention_sweep_class` calling `public.purge_auth_user(...)`
  // passes every other assertion in this file and destroys an arbitrary account — demonstrated live by a
  // reviewer, with `public.user_roles` cascading away behind it.
  it("★ an enumerated escalation is named only by the body it belongs to — the pair is the unit, not the grantee", () => {
    const pinned = Object.entries(ENUMERATED_FUNCTIONS).filter(
      ([, e]) => e.callableFrom,
    );
    expect(pinned.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const [fn, entry] of pinned) {
      const callee = fn.slice(0, fn.indexOf("(")).toLowerCase();
      const allowedCallers = new Set(
        entry.callableFrom!.map((c) => c.toLowerCase()),
      );
      for (const row of bodies) {
        const caller = row.fn.slice(0, row.fn.indexOf("(")).toLowerCase();
        if (caller === callee) continue; // a function naming itself is recursion, not escalation
        const names = normalise(row.src).toLowerCase().includes(`${callee}(`);
        if (names && !allowedCallers.has(caller)) {
          offenders.push(`${caller} -> ${callee}`);
        }
      }
    }
    expect(offenders.sort()).toEqual([]);
  });

  it("★ …and each pinned escalation really is named by the caller it is pinned to, or the pin is protecting nothing", () => {
    for (const [fn, entry] of Object.entries(ENUMERATED_FUNCTIONS)) {
      if (!entry.callableFrom) continue;
      const callee = fn.slice(0, fn.indexOf("(")).toLowerCase();
      for (const caller of entry.callableFrom) {
        const row = bodies.find(
          (b) =>
            b.fn.slice(0, b.fn.indexOf("(")).toLowerCase() ===
            caller.toLowerCase(),
        );
        expect(
          row,
          `${caller} is not a retention-owned function`,
        ).toBeDefined();
        expect(
          normalise(row!.src).toLowerCase(),
          `${caller} does not name ${callee} — the pin is stale`,
        ).toContain(`${callee}(`);
      }
    }
  });

  it('★ every `via: "body"` entry is pinned to a caller — an escalation with no caller pin is the HIGH all over again', () => {
    for (const [fn, entry] of Object.entries(ENUMERATED_FUNCTIONS)) {
      if (entry.via !== "body") continue;
      expect(entry.callableFrom, `${fn} has no callableFrom`).toBeDefined();
      expect(entry.callableFrom!.length, fn).toBeGreaterThan(0);
    }
  });

  it("★ no retention-owned body references a `public` function outside the enumerated set", () => {
    const allowed = new Set(NAMED.map((fn) => fn.slice(0, fn.indexOf("("))));
    const relations = new Set(
      functions.map((f) => f.fn.slice(0, f.fn.indexOf("("))),
    );
    const offenders: string[] = [];
    for (const row of bodies) {
      for (const match of normalise(row.src).matchAll(
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

  /**
   * ★ The `pg_catalog` built-ins the retention bodies call, enumerated rather than the schema being waved
   * through. Widening the scan to every schema surfaced these five, and the tempting fix — "skip
   * `pg_catalog`" — is the wrong one: `pg_catalog` also holds `pg_read_file`, `lo_import` and `pg_ls_dir`.
   * Those are superuser-only by default ACL, so they are not reachable today, but a gate whose answer to a
   * whole schema is "don't look" is not a gate. Five lines cost nothing and a sixth gets read by a person.
   */
  const KNOWN_CATALOG_CALLS: Readonly<Record<string, string>> = {
    "pg_catalog.convert_to":
      "erase_account: the pseudonym digest's input encoding",
    "pg_catalog.encode": "erase_account: rendering that digest as text",
    "pg_catalog.hashtext":
      "erase_account: the advisory-lock key, derived from the subject",
    "pg_catalog.pg_advisory_xact_lock":
      "erase_account: ADR-127's one-transaction-per-subject lock, released at commit",
    "pg_catalog.sha256": "erase_account: 07 §6.1 step 5's pseudonym",
  };

  it("★ no retention-owned body reaches another schema's function outside the enumerated built-ins", async () => {
    // the sibling above filters table names out of `insert into public.x (`; this one had no such filter, so
    // an ordinary `insert into storage.objects (…)` would have been reported as a call (database pass, LOW) —
    // and the natural response to a false positive is to weaken the check
    const { rows } = await db.query<{ fn: string }>(
      `select n.nspname || '.' || p.proname as fn
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname <> 'public'`,
    );
    const otherSchemaFunctions = new Set(rows.map((r) => r.fn.toLowerCase()));
    const reached = new Set<string>();
    for (const row of bodies) {
      for (const match of normalise(row.src).matchAll(
        /(?<![a-z0-9_.])([a-z0-9_]+\.[a-z0-9_]+)\s*\(/gi,
      )) {
        const callee = match[1]!.toLowerCase();
        if (callee.startsWith("public.")) continue;
        if (!otherSchemaFunctions.has(callee)) continue;
        reached.add(callee);
      }
    }
    expect([...reached].sort()).toEqual(
      Object.keys(KNOWN_CATALOG_CALLS).sort(),
    );
  });

  it("★ every enumerated built-in has a reason and is PUBLIC-executable — the role reaches it the way every role does", async () => {
    for (const [fn, why] of Object.entries(KNOWN_CATALOG_CALLS)) {
      expect(why.length, fn).toBeGreaterThan(20);
    }
    const { rows } = await db.query<{ fn: string; toPublic: boolean }>(
      `select n.nspname || '.' || p.proname as fn,
              coalesce(bool_or(a.grantee = 0 and a.privilege_type = 'EXECUTE'), true) as "toPublic"
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         left join lateral aclexplode(p.proacl) a on true
        where n.nspname || '.' || p.proname = any($1::text[])
        group by 1`,
      [Object.keys(KNOWN_CATALOG_CALLS)],
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.toPublic, `${row.fn} is not a PUBLIC built-in`).toBe(true);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
  // ★ THE LIMIT OF THE TWO CASES ABOVE, STATED RATHER THAN GLOSSED (ADR-180's rule about naming a limit)
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
  //
  // `search_path=""` makes those scans exhaustive **for calls written into the body**. It does nothing about a
  // call assembled at run time: `execute format(...)` builds a string Postgres never sees until it executes,
  // so a regex over `prosrc` cannot see a function name that is not there yet.
  //
  // There is exactly **one** piece of dynamic SQL in a retention-owned body today, found by measuring rather
  // than by trusting the first draft of this file, which claimed exhaustiveness without qualification. It is
  // benign — a fixed `select exists` template with two `%I` identifier slots, the subject bound as `$1`, and
  // no call site anywhere in it. `%I` quotes an identifier and cannot introduce a call; `%s`, which could,
  // does not appear.
  //
  // So the control is not a better paragraph but an enumeration, the same shape as the privilege half:
  // **every `execute format(...)` in a retention-owned body must be on this list.** A new one fails CI and is
  // read by a person, which is the only place a dynamically-built escalation could be caught at all.
  const KNOWN_DYNAMIC_SQL: Readonly<Record<string, string>> = {
    "select exists (select 1 from public.%I where %I = $1)":
      "purge_scrubbed_user: the rows-outstanding precondition, over the `restrict` keys to auth.users read from the catalogue (07 §6.1 step 6). Identifiers only, subject bound as $1, no call site",
  };

  it("★ every piece of dynamic SQL in a retention-owned body is enumerated — the one thing `search_path` cannot make exhaustive", () => {
    const found: string[] = [];
    for (const row of bodies) {
      for (const match of row.src.matchAll(
        /\bexecute\s+(?:format\s*\(\s*)?'((?:[^']|'')*)'/gi,
      )) {
        found.push(match[1]!.replace(/''/g, "'"));
      }
    }
    expect([...new Set(found)].sort()).toEqual(
      Object.keys(KNOWN_DYNAMIC_SQL).sort(),
    );
  });

  // The security property is about the **slots**, not the prose around them: `%I` quotes an identifier and
  // `%L` quotes a literal, and neither can carry a function call. `%s` interpolates raw text and could carry
  // anything, which is the one thing that must never appear. The keyword check is the belt: the only `(` in
  // an enumerated template must follow a SQL keyword, never a name that might be a function.
  const SQL_KEYWORDS_BEFORE_PAREN = new Set([
    "exists",
    "in",
    "values",
    "and",
    "or",
    "not",
    "from",
    "select",
  ]);

  it("★ and no enumerated template can introduce a call — every slot is `%I`/`%L`, never `%s`", () => {
    for (const [template, why] of Object.entries(KNOWN_DYNAMIC_SQL)) {
      expect(why.length, template).toBeGreaterThan(20);
      const slots = [...template.matchAll(/%[a-zA-Z]/g)].map((m) => m[0]);
      expect(slots.length, `${template} has no slot`).toBeGreaterThan(0);
      for (const slot of slots) {
        expect(["%I", "%L"], `${template}: %s carries raw SQL`).toContain(slot);
      }
      for (const match of template.matchAll(/([a-z0-9_]+)\s*\(/gi)) {
        expect(
          SQL_KEYWORDS_BEFORE_PAREN,
          `${template}: "${match[1]}(" looks like a call`,
        ).toContain(match[1]!.toLowerCase());
      }
    }
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
  ])("★ is refused `%s` — %s", async (call) => {
    await expect(asRetention(`select ${call}`)).rejects.toMatchObject({
      code: "42501",
    });
  });

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
      asRetention(
        `update public.user_profiles set first_name = null where false`,
      ),
    ).resolves.toBeDefined();
  });

  it("★ a direct call of a guard trigger is now refused by the privilege, not by the call shape — `42501`, where `main` answered `0A000`", async () => {
    await expect(
      asRetention(`select public.prevent_row_modification()`),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("still calls what the three jobs need, proved by calling it", async () => {
    await expect(
      asRetention(`select public.is_retention_job()`),
    ).resolves.toBeDefined();
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
