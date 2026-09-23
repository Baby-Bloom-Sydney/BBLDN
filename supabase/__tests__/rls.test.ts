// `int.rls` (05 §4.2, §9 stage 5) — the policies, exercised per role against the applied
// migrations. Positive and negative, per 07 §10.2.
//
// Covers AC-N-22…26 / AC-X-25 (an isolated nanny is absent from every marketplace surface),
// AC-X-37 (append-only tables refuse a plain service-role write and every user role), the
// escalation target 07 §5.4 row 3 (`user_roles` has no client write), and the cross-party reads
// 07 §5.2 grants and withholds.
//
// Everything runs inside one transaction that is rolled back in `afterAll`, so the suite is
// re-runnable without a `supabase db reset`.
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";
import { asRole, refusedAs, seedFixtures, type Fixtures } from "./rls-fixtures";

let db: Client;
let f: Fixtures;

beforeAll(async () => {
  db = await connect();
  await db.query("begin");
  f = await seedFixtures(db);
});

afterAll(async () => {
  await db?.query("rollback");
  await db?.end();
});

describe("int.rls — the escalation target (07 §5.4 row 3)", () => {
  it("a parent reads only their own user_roles row", async () => {
    const rows = await asRole(
      db,
      f.parentA,
      "select user_id from public.user_roles",
    );
    expect(rows).toHaveLength(1);
  });

  it("no client role can insert or update user_roles — this is what makes signUp sufficient", async () => {
    for (const actor of [f.parentA, f.nannyVisible, f.admin]) {
      const insert = await refusedAs(
        db,
        actor,
        `insert into public.user_roles (user_id, role) values ($1, 'admin')`,
        [actor],
      );
      expect(insert).not.toBe("NO_ERROR");
      // Until `0036` this was RLS refusing *quietly*: with no UPDATE policy the `USING` is false, so
      // the statement matched zero rows and raised nothing. `0036` revoked the surplus UPDATE grant —
      // there is no UPDATE policy on this table for any client role, so the grant was never reachable —
      // and the refusal now arrives one layer earlier and loudly. The claim is unchanged and better
      // evidenced: `42501` is a refusal no caller can mistake for "there was nothing to change".
      const update = await refusedAs(
        db,
        actor,
        `update public.user_roles set role = 'admin' where user_id = $1 returning user_id`,
        [actor],
      );
      expect(update).toBe("42501");
    }
    const { rows } = await db.query<{ role: string }>(
      "select role::text as role from public.user_roles where user_id = $1",
      [f.parentA],
    );
    expect(rows[0].role).toBe("parent");
  });

  it("anon reaches user_roles and user_profiles not at all", async () => {
    // "Not at all" was evidenced by an empty result: `anon` held SELECT on both by default privilege and
    // no policy named it. `0036` revoked every `anon` grant outside `areas`, `legal_documents` and
    // `nanny_public`, so both reads are now refused outright. The title's claim is the stronger of the
    // two readings and this is it.
    expect(await refusedAs(db, null, "select 1 from public.user_roles")).toBe(
      "42501",
    );
    expect(
      await refusedAs(db, null, "select 1 from public.user_profiles"),
    ).toBe("42501");
  });
});

describe("int.rls — the isolated nanny is absent from every marketplace surface (I-5, AC-X-25)", () => {
  it("nanny_public shows the visible nanny and not the isolated one", async () => {
    const rows = await asRole<{ nanny_id: string }>(
      db,
      null,
      "select nanny_id from public.nanny_public",
    );
    const ids = rows.map((r) => r.nanny_id);
    expect(ids).toContain(f.nannyVisibleId);
    expect(ids).not.toContain(f.nannyIsolatedId);
  });

  it("an isolated nanny gets no jobs board, and no child care-needs text with it", async () => {
    expect(
      await asRole(
        db,
        f.nannyIsolated,
        "select id from public.nanny_positions",
      ),
    ).toHaveLength(0);
    expect(
      await asRole(
        db,
        f.nannyIsolated,
        "select id from public.position_children",
      ),
    ).toHaveLength(0);
  });

  it("an active nanny does get the board", async () => {
    const rows = await asRole<{ id: string }>(
      db,
      f.nannyVisible,
      "select id from public.nanny_positions",
    );
    expect(rows.map((r) => r.id)).toContain(f.positionA);
  });

  it("nobody reads another family's position", async () => {
    expect(
      await asRole(db, f.parentB, "select id from public.nanny_positions"),
    ).toHaveLength(0);
  });
});

describe("int.rls — cross-party reads (07 §5.2)", () => {
  it("a nanny with no connection cannot read the parents table", async () => {
    expect(
      await asRole(db, f.nannyVisible, "select id from public.parents"),
    ).toHaveLength(0);
  });

  it("a parent cannot read the nannies base table, only nanny_public", async () => {
    expect(
      await asRole(db, f.parentA, "select id from public.nannies"),
    ).toHaveLength(0);
  });

  it("nanny_public carries no Art 9 health column and no auth uid (ADR-103; security review M1)", async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'nanny_public'`,
    );
    const cols = rows.map((r) => r.column_name);
    expect(cols).not.toContain("is_vaccinated");
    expect(cols).not.toContain("user_id");
    expect(cols).not.toContain("last_name");
    expect(cols).not.toContain("profile_picture_path");
    // `2d` (kickoff debt 2): this view is now the ONE road a nanny's name takes to a parent surface
    // (`matching.publicNannyName` → `connections.nannyNameOf` → the rail, S-P-08, the admin call drawer), so
    // 07 §5.1 rule 4's "no contact detail" is what keeps that read to a name. Held here, on the view itself,
    // rather than on the caller — a column added to the view would otherwise widen three screens at once.
    for (const contact of [
      "email",
      "mobile",
      "phone",
      "date_of_birth",
      "postcode",
    ])
      expect(cols).not.toContain(contact);
    expect(cols).toContain("first_name");
  });

  it("a nanny reads her own verification only through verification_status", async () => {
    expect(
      await asRole(
        db,
        f.nannyVisible,
        "select nanny_id from public.verifications",
      ),
    ).toHaveLength(0);
  });

  // `0036` split this claim's evidence in two, and the split is worth asserting rather than papering
  // over: a client role now holds a SELECT grant only where a SELECT policy names it. `nanny_leads` and
  // `parent_leads` have no SELECT policy for any role, so the grant was surplus and the read is refused
  // outright. `nanny_contact_state` has one for `authenticated` that matches no row here, so that read
  // keeps its grant and still returns empty — while `anon`, which no policy names, is refused.
  // Asserting the mechanism per pair is what keeps this a check: a blanket "refused or empty" would go
  // on passing however the grants drifted.
  it("the whole leads cluster is unreachable by every client role (07 §5.2 last row)", async () => {
    for (const table of ["nanny_leads", "parent_leads"]) {
      for (const actor of [null, f.parentA, f.nannyVisible, f.admin]) {
        expect(
          await refusedAs(db, actor, `select 1 from public.${table}`),
        ).toBe("42501");
      }
    }
    expect(
      await refusedAs(db, null, "select 1 from public.nanny_contact_state"),
    ).toBe("42501");
    for (const actor of [f.parentA, f.nannyVisible, f.admin]) {
      expect(
        await asRole(db, actor, "select 1 from public.nanny_contact_state"),
      ).toHaveLength(0);
    }
  });

  // `events` has no SELECT policy for any role at all, so after `0036` no client role holds the grant
  // either — including the admin, whose admin-ness is a row in `user_roles` and not a database role.
  it("events is unreachable by every client role, admin included (07 §5.2)", async () => {
    for (const actor of [null, f.parentA, f.nannyVisible, f.admin]) {
      expect(await refusedAs(db, actor, "select 1 from public.events")).toBe(
        "42501",
      );
    }
  });
});

describe("int.rls — app tables ride on user_has_child_access", () => {
  it("the parent of the child reads it; another family does not", async () => {
    expect(
      await asRole(db, f.parentA, "select id from public.children"),
    ).toHaveLength(1);
    expect(
      await asRole(db, f.parentB, "select id from public.children"),
    ).toHaveLength(0);
  });

  it("a nanny with no link reads no child", async () => {
    expect(
      await asRole(db, f.nannyVisible, "select id from public.children"),
    ).toHaveLength(0);
  });

  it("child_client and child_invites take no client write — the RPCs are the only road", async () => {
    const link = await refusedAs(
      db,
      f.parentA,
      `insert into public.child_client (child_id, nanny_user_id, parent_user_id, source, state)
       values ($1, $2, $3, 'manual', 'active')`,
      [f.childA, f.nannyVisible, f.parentA],
    );
    expect(link).not.toBe("NO_ERROR");
  });
});

// AC-X-37 (05 §2.4.3): the append-only guarantee, per role and for the service role.
describe("int.rls — append-only tables (AC-X-37, 02 C-4)", () => {
  const appendOnly = [
    "consent_records",
    "biometric_consent_records",
    "cookie_consent_records",
    "events",
    "legal_documents",
  ];

  it.each(appendOnly)(
    "%s has no UPDATE or DELETE policy for any client role",
    async (table) => {
      const { rows } = await db.query<{ cmd: string }>(
        `select cmd from pg_policies
         where schemaname = 'public' and tablename = $1 and cmd in ('UPDATE', 'DELETE')`,
        [table],
      );
      expect(rows).toEqual([]);
    },
  );

  it("a plain service-role UPDATE on an append-only row raises — no job wrapper, no exemption", async () => {
    await db.query("savepoint append_probe");
    await db.query(
      `insert into public.events (name, source, actor_kind, props)
       values ('visit', 'server', 'visitor', '{}'::jsonb)`,
    );
    await db.query("set local role service_role");
    let code = "NO_ERROR";
    try {
      await db.query(`update public.events set name = 'ui.click'`);
    } catch (error) {
      code = (error as { code?: string }).code ?? "UNKNOWN";
    }
    // rollback first: a failed statement aborts the block, so `reset role` would fail too
    await db.query("rollback to savepoint append_probe");
    await db.query("reset role");
    // restrict_violation, raised by prevent_row_modification()
    expect(code).toBe("23001");
  });

  it("setting app.job no longer buys the exemption — it is identity-based now", async () => {
    await db.query("savepoint guc_probe");
    await db.query(
      `insert into public.events (name, source, actor_kind, props)
       values ('visit', 'server', 'visitor', '{}'::jsonb)`,
    );
    await db.query(`select set_config('app.job', 'retention-sweep', true)`);
    await db.query("set local role service_role");
    let code = "NO_ERROR";
    try {
      await db.query(`delete from public.events`);
    } catch (error) {
      code = (error as { code?: string }).code ?? "UNKNOWN";
    }
    await db.query("rollback to savepoint guc_probe");
    await db.query("reset role");
    expect(code).toBe("23001");
  });

  // ★ The probe writes what §6.2 row 14 actually asks for — the identifiers nulled, the row kept — rather than
  // deleting the row. **The claim is unchanged**: ownership is the exemption, and a definer owned by
  // `bbldn_retention` is the one caller `prevent_row_modification()` lets past. What changed underneath it is
  // the *privilege*: `0032` (ADR-185) revoked `0016:288`'s blanket DML, so this identity no longer holds DELETE
  // on `events` — row 14's delete half is ★, deferred until BAI confirms the number, and `0031` has no arm for
  // it. A probe that deleted was measuring the blanket grant as much as the trigger. The case below asserts the
  // refusal, so the pair says both halves.
  it("a SECURITY DEFINER owned by bbldn_retention is the one thing that passes", async () => {
    await db.query("savepoint job_probe");
    await db.query(
      `insert into public.events (name, source, actor_kind, props, visitor_id)
       values ('visit', 'server', 'visitor', '{}'::jsonb, 'v-probe')`,
    );
    // the shape 0000's header specifies for the Phase 1 retention jobs: a SECURITY DEFINER
    // owned by bbldn_retention. Ownership is the authorisation; the job name is a log field.
    await db.query(
      `create function pg_temp.probe_sweep() returns integer
       language plpgsql security definer set search_path = ''
       as $fn$ declare n integer; begin update public.events set visitor_id = null where visitor_id is not null; get diagnostics n = row_count; return n; end $fn$`,
    );
    await db.query(
      `alter function pg_temp.probe_sweep() owner to bbldn_retention`,
    );
    const { rows } = await db.query<{ probe_sweep: number }>(
      "select pg_temp.probe_sweep()",
    );
    expect(Number(rows[0].probe_sweep)).toBeGreaterThan(0);
    await db.query("rollback to savepoint job_probe");
  });

  it("★ …and the same definer may not DELETE an event row — the control that refuses is the grant, not the trigger (ADR-185; §6.2 row 14's ★)", async () => {
    await db.query("savepoint job_delete_probe");
    await db.query(
      `create function pg_temp.probe_delete() returns integer
       language plpgsql security definer set search_path = ''
       as $fn$ declare n integer; begin delete from public.events; get diagnostics n = row_count; return n; end $fn$`,
    );
    await db.query(
      `alter function pg_temp.probe_delete() owner to bbldn_retention`,
    );
    let code = "NO_ERROR";
    try {
      await db.query("select pg_temp.probe_delete()");
    } catch (error) {
      code = (error as { code?: string }).code ?? "UNKNOWN";
    }
    await db.query("rollback to savepoint job_delete_probe");
    // 42501, not the trigger's 23001: a privilege the identity does not hold is refused before any row is read.
    expect(code).toBe("42501");
  });

  it("no client role holds TRUNCATE on an append-only table (security review H3)", async () => {
    const { rows } = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
         and (has_table_privilege('anon', c.oid, 'TRUNCATE')
              or has_table_privilege('authenticated', c.oid, 'TRUNCATE'))`,
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });
});

describe("int.rls — the money spine takes no client write (I-M2)", () => {
  it("a parent cannot insert or update parent_subscriptions", async () => {
    const insert = await refusedAs(
      db,
      f.parentA,
      `insert into public.parent_subscriptions (parent_user_id, status) values ($1, 'active')`,
      [f.parentA],
    );
    expect(insert).not.toBe("NO_ERROR");
  });

  it("the spine's write RPCs are not client-executable (security review C1)", async () => {
    for (const fn of [
      "public.set_access_window(uuid, integer)",
      "public.open_dfy_access(uuid, uuid, integer, integer)",
      "public.start_family_trial_if_first(uuid, integer, boolean)",
      "public.ensure_placement(uuid, uuid, uuid)",
      "public.connect_child_invite(text, uuid)",
      "public.book_slot(uuid, public.call_type, public.booking_subject_type, uuid, timestamptz, public.actor_role, uuid, text, integer, uuid, timestamptz)",
    ]) {
      const { rows } = await db.query<{ ok: boolean }>(
        `select has_function_privilege('authenticated', $1, 'EXECUTE')
             or has_function_privilege('anon', $1, 'EXECUTE') as ok`,
        [fn],
      );
      expect({ fn, ok: rows[0].ok }).toEqual({ fn, ok: false });
    }
  });

  it("the gate refuses to answer about another family (security review H1)", async () => {
    const rows = await asRole<{ reason: string }>(
      db,
      f.parentB,
      "select public.family_access_reason($1) as reason",
      [f.parentA],
    );
    expect(rows[0].reason).toBe("none");
  });
});
