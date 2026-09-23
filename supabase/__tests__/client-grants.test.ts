// `int.client-grants` — **ADR-185/186, the fourth instance.** `anon` and `authenticated` may touch the
// relations the enumerated set names, at the privileges it names, and nothing else.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS, AND WHY IT IS A SUITE RATHER THAN ONLY A VERIFY BLOCK
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// `int.retention-grants` enumerated what the retention identity may touch, `int.retention-execute` what it
// may call, `int.client-functions` what a client role may call. Nobody had enumerated what a client role may
// **touch**: on `main` at `0035`, `anon` held a write privilege on **58** relations in `public` and
// `authenticated` on **66**, and **54** of those carried a client write grant with **no write policy of any
// kind**.
//
// `0036`'s verify block runs at `0036`'s apply time and can say nothing about `0037`. This suite runs after
// the whole migration set, so it is the only thing in the tree that can catch the *next* blanket grant —
// which, for relations, does not even have to be typed: see the default-privilege case below. Belt in the
// migration, braces here.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE RULE, SO THE LIST BELOW CAN BE DERIVED RATHER THAN MEMORISED
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// **A client role gets a privilege if and only if a policy permits the corresponding action for that role.**
// The policy is the declaration of intent — it is in the repo, it was reviewed, and it is what actually
// decides whether the operation can succeed. A grant beyond it is unreachable by construction, and one of
// the cases below asserts the rule directly, so it still holds when a later migration adds a policy and
// fails when one adds a grant without.
//
// Views are the exception and the reason this is a unit: a view carries no policy, has no RLS, and every one
// of ours is owned by `postgres` (BYPASSRLS) with `security_invoker = off` — so a write routed through an
// auto-updatable view reaches its base table with RLS *not applied*. Proved, not argued: see the driven
// block at the end. The nine are therefore listed by name and are **read only**.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// HOW TO CHANGE IT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// Adding a row to `CLIENT_RELATIONS` is a privilege change and is reviewed as one. Each entry carries **why**
// and, per ADR-186, **from where** — the policy that makes it reachable, or the surface that reads it. "The
// app might need it" is not an entry.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";

const MIGRATION = resolve(
  __dirname,
  "../migrations/0036_client-relation-surface-enumerated.sql",
);

type Priv = "SELECT" | "INSERT" | "UPDATE" | "DELETE";

type Entry = {
  /** what `authenticated` holds. `[]` means the relation is not on its surface at all. */
  readonly authenticated: readonly Priv[];
  /** what `anon` holds. Absent means nothing. */
  readonly anon?: readonly Priv[];
  /** how it is reached — ADR-186's field: the policy, or the surface that reads it. */
  readonly via: "policy" | "view";
  /** why it is on the surface at all. */
  readonly why: string;
};

const R = (
  why: string,
  authenticated: readonly Priv[] = ["SELECT"],
  extra: Partial<Entry> = {},
): Entry => ({ authenticated, via: "policy", why, ...extra });

/**
 * ★ The client relation surface. Read-only entries are the 56 tables carrying a SELECT policy for
 * `authenticated` or `public`; the write entries name exactly the commands their own policies name.
 */
const CLIENT_RELATIONS: Readonly<Record<string, Entry>> = {
  // ── anon: signed out. Two tables and one view, read only. There is no `anon` write policy anywhere in
  //    this schema, so there is no `anon` write entry here.
  "public.areas": {
    authenticated: ["SELECT"],
    anon: ["SELECT"],
    via: "policy",
    why: "areas_anon_select (is_active) — the area picker on the public site, from src/modules/areas",
  },
  "public.legal_documents": {
    authenticated: ["SELECT"],
    anon: ["SELECT"],
    via: "policy",
    why: "legal_documents_anon_select (true) — the signed-out /legal/* pages read the published set",
  },
  "public.nanny_public": {
    authenticated: ["SELECT"],
    anon: ["SELECT"],
    via: "view",
    why: "signed-out browse; the sole anon surface 0035 kept, whose body names nanny_visible()",
  },

  // ── authenticated: write. Twelve tables, each exactly the commands its own policies name.
  "public.admin_notifications": R(
    "admin_notifications_admin_update — an admin acknowledges an alert from the admin console",
    ["SELECT", "UPDATE"],
  ),
  "public.biometric_consent_records": R(
    "biometric_consent_records_self_insert — the subject records their own Art 9 consent",
    ["SELECT", "INSERT"],
  ),
  "public.children": R(
    "children_parent_insert / _nanny_insert / _access_update / _parent_delete — the family's own children",
    ["SELECT", "INSERT", "UPDATE", "DELETE"],
  ),
  "public.consent_records": R(
    "consent_records_self_insert — the subject records their own consent; append-only to every role",
    ["SELECT", "INSERT"],
  ),
  "public.contact_messages": R(
    "contact_messages_admin_update — an admin marks a message replied; the insert is service-scope",
    ["SELECT", "UPDATE"],
  ),
  "public.feed_posts": R(
    "feed_posts_access_insert / _author_update / _parent_hide — the activity feed the family writes",
    ["SELECT", "INSERT", "UPDATE"],
  ),
  "public.guarantee_events": R(
    "guarantee_events_admin_insert / _admin_update — an admin records a guarantee decision",
    ["SELECT", "INSERT", "UPDATE"],
  ),
  "public.inbox_messages": R(
    "inbox_messages_owner_update — the owner marks their own message read, from src/lib/actions/inbox.ts",
    ["SELECT", "UPDATE"],
  ),
  "public.katie_proposals": R(
    "katie_proposals_admin_update — an admin accepts or rejects a proposal, from the admin console",
    ["SELECT", "UPDATE"],
  ),
  "public.refund_requests": R(
    "refund_requests_admin_insert / _admin_update — an admin records a refund; ADR's no-self-serve rule",
    ["SELECT", "INSERT", "UPDATE"],
  ),
  "public.subscribe_invites": R(
    "subscribe_invites_nanny_insert / _nanny_update — a nanny issues and revokes her own invite",
    ["SELECT", "INSERT", "UPDATE"],
  ),
  "public.user_profiles": R(
    "user_profiles_self_update — the signed-in user edits their own profile, from src/lib/actions/parent.ts",
    ["SELECT", "UPDATE"],
  ),

  // ── authenticated: read only. Every remaining table carrying a SELECT policy for `authenticated` or
  //    `public`. The policy name is the from-where; the reason is what the surface reads it for.
  "public.account_erasure_requests": R(
    "account_erasure_requests_own_select — the subject follows their own Art 17 request",
  ),
  "public.agent_memory": R(
    "agent_memory's own select policy — Katie's per-user memory",
  ),
  "public.availability_blocks": R(
    "the nanny's own calendar blocks, read by the scheduling surface",
  ),
  "public.availability_rules": R(
    "the nanny's own recurring availability, same surface",
  ),
  "public.bloombot": R("the family's own Bloombot state"),
  "public.bookings": R(
    "the parties to a booking read it; the writes are service-scope",
  ),
  "public.calendars": R("the nanny's own calendar rows"),
  "public.chat_cost_daily": R(
    "an admin reads the chat cost roll-up in the console",
  ),
  "public.chat_messages": R(
    "the parties to a conversation read it; the writes go through the API route",
  ),
  "public.chat_summaries": R("the same conversation's summaries"),
  "public.child_client": R(
    "the family and the linked nanny read the link; the RPCs are the only writer",
  ),
  "public.child_invites": R(
    "the issuing parent and the invited nanny read it; the RPCs are the writer",
  ),
  "public.connection_requests": R(
    "the parties to a connection read it; the stage model is the writer",
  ),
  "public.cookie_consent_records": R(
    "the subject reads their own cookie consent",
  ),
  "public.development_images": R("the family reads their own child's images"),
  "public.email_logs": R("an admin reads the send log in the console"),
  "public.file_retention_log": R(
    "file_retention_log_admin_select — an admin reads the retention evidence",
  ),
  "public.katie_prompt": R("an admin reads the live prompt"),
  "public.katie_prompt_edits": R("an admin reads the prompt's edit history"),
  "public.katie_prompt_version": R(
    "an admin reads the prompt's version pointer",
  ),
  "public.lead_contacts": R("an admin reads a lead's contacts in the console"),
  "public.lead_notes": R("an admin reads a lead's notes in the console"),
  "public.milestones": R("the family reads the milestone catalogue"),
  "public.nannies": R(
    "the connected parties read the base row; nanny_public is the browse surface",
  ),
  "public.nanny_contact_state": R(
    "an admin reads a nanny's contact state; no row is visible to a family",
  ),
  "public.nanny_placements": R("the parties to a placement read it"),
  "public.nanny_positions": R(
    "the parent's own position and the board an active nanny sees",
  ),
  "public.nanny_suspension_lifts": R(
    "an admin reads the safeguarding lift record",
  ),
  "public.parent_subscriptions": R(
    "the family reads its own subscription; the spine's writes are service",
  ),
  "public.parents": R(
    "the connected nanny and the parent themselves read the row",
  ),
  "public.payment_events": R("the family reads its own payment history"),
  "public.pipeline_snapshots": R("an admin reads the pipeline roll-up"),
  "public.position_call_mirror": R(
    "the parent reads their own call detail; upsert_call_mirror is the writer",
  ),
  "public.position_children": R(
    "the position's children, read by the parent and the board",
  ),
  "public.position_schedule": R("the position's schedule, same surface"),
  "public.precheck_notifications": R("an admin reads the precheck log"),
  "public.proactive_schedules": R("the family reads its own Katie schedule"),
  "public.progress_history": R(
    "the family reads its own child's progress history",
  ),
  "public.progress_scores": R(
    "the family reads its own child's progress scores",
  ),
  "public.user_roles": R(
    "the signed-in user reads their own role; signUp is the only writer",
  ),
  "public.verifications": R(
    "the nanny reads her own verification, and an admin reads all of them",
  ),
  "public.vetting_submissions": R(
    "the nanny reads her own submission, and an admin reads all of them",
  ),

  // ── authenticated: read only, views. Nine, and read only — the header is the whole reason.
  "public.booking_events": {
    authenticated: ["SELECT"],
    via: "view",
    why: "the admin console's booking timeline; its body gates on is_admin()",
  },
  "public.child_client_events": {
    authenticated: ["SELECT"],
    via: "view",
    why: "the family's own child-link timeline — the one view a non-admin's session can satisfy",
  },
  "public.connection_events": {
    authenticated: ["SELECT"],
    via: "view",
    why: "the admin console's connection timeline; its body gates on is_admin()",
  },
  "public.connection_party_contact": {
    authenticated: ["SELECT"],
    via: "view",
    why: "the contact detail a connected party may see, computed rather than joined at the client",
  },
  "public.family_access": {
    authenticated: ["SELECT"],
    via: "view",
    why: "who may see a child; its body names family_access_reason(), which 0035 kept for that reason",
  },
  "public.page_visits": {
    authenticated: ["SELECT"],
    via: "view",
    why: "the admin console's visit list; its body gates on is_admin()",
  },
  "public.verification_events": {
    authenticated: ["SELECT"],
    via: "view",
    why: "the admin console's verification timeline; its body gates on is_admin()",
  },
  "public.verification_status": {
    authenticated: ["SELECT"],
    via: "view",
    why: "the nanny's own verification status — the only road to it, the base table being admin-only",
  },
};

/** The five auto-updatable views. A write through one of these is the finding this file exists for. */
const AUTO_UPDATABLE_VIEWS = [
  "booking_events",
  "child_client_events",
  "connection_events",
  "page_visits",
  "verification_events",
] as const;

const PRIVS: readonly Priv[] = ["SELECT", "INSERT", "UPDATE", "DELETE"];

let db: Client;

beforeAll(async () => {
  db = await connect();
});
afterAll(async () => {
  await db?.end();
});

/**
 * Effective privilege, not a direct-ACL read: `has_table_privilege` follows role membership, `PUBLIC` and
 * ownership, which is `3i`'s db HIGH — a gate that filters `relacl` on the role's own name sees a grant made
 * by name and nothing else. `has_any_column_privilege` catches the column-level half.
 */
async function held(role: string): Promise<Record<string, Priv[]>> {
  const { rows } = await db.query<{ rel: string; privs: string[] }>(
    `select n.nspname || '.' || c.relname as rel,
            array_remove(array[
              case when has_table_privilege($1, c.oid, 'SELECT')
                     or has_any_column_privilege($1, c.oid, 'SELECT') then 'SELECT' end,
              case when has_table_privilege($1, c.oid, 'INSERT')
                     or has_any_column_privilege($1, c.oid, 'INSERT') then 'INSERT' end,
              case when has_table_privilege($1, c.oid, 'UPDATE')
                     or has_any_column_privilege($1, c.oid, 'UPDATE') then 'UPDATE' end,
              case when has_table_privilege($1, c.oid, 'DELETE') then 'DELETE' end
            ], null) as privs
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r','p','v')
      order by 1`,
    [role],
  );
  const out: Record<string, Priv[]> = {};
  for (const r of rows) if (r.privs.length > 0) out[r.rel] = r.privs as Priv[];
  return out;
}

const expected = (role: "anon" | "authenticated"): Record<string, Priv[]> => {
  const out: Record<string, Priv[]> = {};
  for (const [rel, e] of Object.entries(CLIENT_RELATIONS)) {
    const privs = role === "anon" ? (e.anon ?? []) : e.authenticated;
    if (privs.length > 0) out[rel] = [...privs].sort() as Priv[];
  }
  return out;
};

const sortValues = (r: Record<string, Priv[]>): Record<string, Priv[]> =>
  Object.fromEntries(
    Object.entries(r)
      .map(([k, v]): readonly [string, Priv[]] => [k, [...v].sort()])
      .sort((a, b) => a[0].localeCompare(b[0])),
  );

describe("int.client-grants — the enumerated set is the whole set", () => {
  it("★ `authenticated` holds exactly what the list says, relation by relation and privilege by privilege", async () => {
    expect(sortValues(await held("authenticated"))).toEqual(
      sortValues(expected("authenticated")),
    );
  });

  it("★ `anon` holds exactly what the list says — three relations, SELECT only", async () => {
    expect(sortValues(await held("anon"))).toEqual(
      sortValues(expected("anon")),
    );
  });

  it("★ `anon` holds no write privilege anywhere in `public` — there is no anon write policy to justify one", async () => {
    const h = await held("anon");
    const writers = Object.entries(h)
      .filter(([, privs]) => privs.some((p) => p !== "SELECT"))
      .map(([rel]) => rel);
    expect(writers).toEqual([]);
  });

  it("★ no view carries a client write — a view has no RLS and ours are owned by a BYPASSRLS role", async () => {
    const { rows } = await db.query<{ rel: string; role: string }>(
      `select c.relname as rel, r.g as role
         from pg_class c join pg_namespace n on n.oid = c.relnamespace,
              lateral (select unnest(array['anon','authenticated']) as g) r
        where n.nspname = 'public' and c.relkind = 'v'
          and (has_table_privilege(r.g, c.oid, 'INSERT')
            or has_table_privilege(r.g, c.oid, 'UPDATE')
            or has_table_privilege(r.g, c.oid, 'DELETE'))
        order by 1, 2`,
    );
    expect(rows.map((r) => `${r.role} writes ${r.rel}`)).toEqual([]);
  });

  it("★ the rule itself: every client write grant is matched by a write policy for that role", async () => {
    // Stated as a rule rather than as a list, so it still holds when a later migration adds a policy and
    // fails when one adds a grant without. This is the case that would have been red on `main`, on 54
    // relations.
    const { rows } = await db.query<{ rel: string; role: string }>(
      `select c.relname as rel, r.g as role
         from pg_class c join pg_namespace n on n.oid = c.relnamespace,
              lateral (select unnest(array['anon','authenticated']) as g) r
        where n.nspname = 'public' and c.relkind in ('r','p')
          and (has_table_privilege(r.g, c.oid, 'INSERT') or has_any_column_privilege(r.g, c.oid, 'INSERT')
            or has_table_privilege(r.g, c.oid, 'UPDATE') or has_any_column_privilege(r.g, c.oid, 'UPDATE')
            or has_table_privilege(r.g, c.oid, 'DELETE'))
          and not exists (select 1 from pg_policies p
                           where p.schemaname = 'public' and p.tablename = c.relname
                             and p.cmd in ('INSERT','UPDATE','DELETE','ALL')
                             and p.roles::text[] && array[r.g, 'public'])
        order by 1, 2`,
    );
    expect(rows.map((r) => `${r.role} writes ${r.rel} with no policy`)).toEqual(
      [],
    );
  });

  it("★ and the converse: every client write policy is matched by a grant, so no policy is dead", async () => {
    // A policy with no grant is the same defect facing the other way — it reads as a live permission in
    // review and can never fire. `3j`'s "declared versus used", applied to the half this file could break.
    const { rows } = await db.query<{ rel: string; role: string; cmd: string }>(
      // Joined on oid rather than cast from `schemaname || '.' || tablename`: the cast is evaluated
      // without regard to the `where`, and `pg_policies` carries `storage` rows too.
      `select distinct p.tablename as rel, r.g as role, p.cmd
         from pg_policies p
         join pg_namespace n on n.nspname = p.schemaname
         join pg_class c on c.relname = p.tablename and c.relnamespace = n.oid,
              lateral (select unnest(array['anon','authenticated']) as g) r
        where p.schemaname = 'public' and p.cmd in ('INSERT','UPDATE','DELETE')
          and p.roles::text[] && array[r.g, 'public']
          and not has_table_privilege(r.g, c.oid, p.cmd)
        order by 1, 2, 3`,
    );
    expect(
      rows.map((r) => `${r.rel}.${r.cmd} for ${r.role} has no grant`),
    ).toEqual([]);
  });

  it("★ every entry carries a reason and a `from where` — ADR-186's field, not decoration", () => {
    for (const [rel, entry] of Object.entries(CLIENT_RELATIONS)) {
      expect(entry.why.length, rel).toBeGreaterThan(20);
      expect(["policy", "view"], rel).toContain(entry.via);
      expect(
        entry.authenticated.length + (entry.anon?.length ?? 0),
        rel,
      ).toBeGreaterThan(0);
      for (const p of [...entry.authenticated, ...(entry.anon ?? [])])
        expect(PRIVS, rel).toContain(p);
    }
  });

  it("★ the migration's grant block and this list name the same relations, so neither drifts alone", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const start = sql.indexOf("CLIENT RELATIONS — START");
    const end = sql.indexOf("CLIENT RELATIONS — END");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = sql.slice(start, end);
    const named = new Set<string>();
    for (const match of block.matchAll(/\bpublic\.[a-z_]+/g))
      named.add(match[0]);
    expect([...named].sort()).toEqual(Object.keys(CLIENT_RELATIONS).sort());
  });
});

describe("int.client-grants — the roads a direct-ACL read cannot see", () => {
  it("★ nothing in `public` is granted TO PUBLIC — the route that reaches every role without naming one", async () => {
    const { rows } = await db.query<{ rel: string; priv: string }>(
      `select c.relname as rel, a.privilege_type as priv
         from pg_class c join pg_namespace n on n.oid = c.relnamespace,
              lateral aclexplode(c.relacl) a
        where n.nspname = 'public' and c.relkind in ('r','p','v') and a.grantee = 0
        order by 1, 2`,
    );
    expect(rows.map((r) => `${r.rel}: ${r.priv}`)).toEqual([]);
  });

  it("★ no client privilege in `public` is grantable — a client role cannot hand the surface on", async () => {
    const { rows } = await db.query<{ rel: string }>(
      `select c.relname as rel
         from pg_class c join pg_namespace n on n.oid = c.relnamespace,
              lateral aclexplode(c.relacl) a
        where n.nspname = 'public' and a.is_grantable
          and a.grantee::regrole::text in ('anon','authenticated')`,
    );
    expect(rows.map((r) => r.rel)).toEqual([]);
  });

  it("★ no column-level ACL survives for a client role", async () => {
    const { rows } = await db.query<{ rel: string; col: string }>(
      `select c.relname as rel, a.attname as col
         from pg_attribute a join pg_class c on c.oid = a.attrelid
         join pg_namespace n on n.oid = c.relnamespace, lateral aclexplode(a.attacl) x
        where n.nspname = 'public' and a.attacl is not null
          and x.grantee::regrole::text in ('anon','authenticated')
        order by 1, 2`,
    );
    expect(rows.map((r) => `${r.rel}.${r.col}`)).toEqual([]);
  });

  it("★ membership in both directions — `3i`'s two HIGHs, pointed at the client roles", async () => {
    // `authenticator`, `postgres` and `supabase_realtime_admin` being members of anon / authenticated is
    // Supabase's own design and the reason PostgREST can switch role. What must not exist is a *fourth*
    // member, or either client role becoming a member of something else and inheriting its grants.
    const { rows } = await db.query<{ member: string; grp: string }>(
      `select m.rolname as member, g.rolname as grp
         from pg_auth_members am
         join pg_roles g on g.oid = am.roleid join pg_roles m on m.oid = am.member
        where (m.rolname in ('anon','authenticated') or g.rolname in ('anon','authenticated'))
          and not (m.rolname in ('authenticator','postgres','supabase_realtime_admin')
                   and g.rolname in ('anon','authenticated'))
        order by 1, 2`,
    );
    expect(rows.map((r) => `${r.member} in ${r.grp}`)).toEqual([]);
  });

  it("★ no default privilege WE OWN grants a client role anything on a future table", async () => {
    // This is the half that `0035` could not win for functions and `0036` does win for tables. Postgres'
    // world default for a relation is *no* privilege to anyone, so the `pg_default_acl` row is the whole
    // mechanism — unlike a function, where `=X` (PUBLIC) is merged in regardless and no revoke suppresses it.
    const { rows } = await db.query<{ role: string; acl: string }>(
      `select defaclrole::regrole::text as role, defaclacl::text as acl
         from pg_default_acl
        where defaclobjtype = 'r' and defaclnamespace = 'public'::regnamespace
        order by 1`,
    );
    for (const row of rows.filter((r) => r.role !== "supabase_admin"))
      expect(row.acl, `${row.role}'s default`).not.toMatch(
        /\banon=|authenticated=/,
      );
  });

  it("★ …and `supabase_admin`'s default, which we cannot revoke, stays inert because we own every relation", async () => {
    // Named rather than implied (ADR-180), `0035`'s precedent. `postgres` is not a superuser here, so
    // `supabase_admin`'s default-privilege row cannot be revoked. It only applies to a relation
    // `supabase_admin` creates — so the assertion that keeps the limit safe is ownership, not the ACL.
    const { rows } = await db.query<{ rel: string; owner: string }>(
      `select c.relname as rel, c.relowner::regrole::text as owner
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r','p','v') and c.relowner <> 'postgres'::regrole
        order by 1`,
    );
    expect(rows.map((r) => `${r.rel} owned by ${r.owner}`)).toEqual([]);
  });

  it("★ no sequence in `public` is reachable by a client role", async () => {
    const { rows } = await db.query<{ rel: string }>(
      `select c.relname as rel
         from pg_class c join pg_namespace n on n.oid = c.relnamespace,
              lateral (select unnest(array['anon','authenticated']) as g) r
        where n.nspname = 'public' and c.relkind = 'S'
          and (has_sequence_privilege(r.g, c.oid, 'USAGE')
            or has_sequence_privilege(r.g, c.oid, 'UPDATE')
            or has_sequence_privilege(r.g, c.oid, 'SELECT'))`,
    );
    expect(rows.map((r) => r.rel)).toEqual([]);
  });

  it("★ TRUNCATE, REFERENCES and TRIGGER stay gone — `0000` §4's three, re-asserted here", async () => {
    const { rows } = await db.query<{ rel: string; priv: string }>(
      `select c.relname as rel, p.priv
         from pg_class c join pg_namespace n on n.oid = c.relnamespace,
              lateral (select unnest(array['anon','authenticated']) as g) r,
              lateral (select unnest(array['TRUNCATE','REFERENCES','TRIGGER']) as priv) p
        where n.nspname = 'public' and c.relkind in ('r','p')
          and has_table_privilege(r.g, c.oid, p.priv)
        order by 1, 2`,
    );
    expect(rows.map((r) => `${r.rel}: ${r.priv}`)).toEqual([]);
  });
});

describe("int.client-grants — driven, because a privilege bit is not a behaviour", () => {
  it("★ a new table in `public` is born with no client privilege — the claim §3 of `0036` exists to make", async () => {
    await db.query("begin");
    try {
      await db.query("create table public.zz_default_probe (id int)");
      const { rows } = await db.query<{ acl: string | null }>(
        `select relacl::text as acl from pg_class where oid = 'public.zz_default_probe'::regclass`,
      );
      expect(rows[0]?.acl ?? "").not.toMatch(/\banon=|authenticated=/);
      const { rows: eff } = await db.query<{ n: string }>(
        `select count(*)::text as n
           from (select unnest(array['anon','authenticated']) as g) r,
                lateral (select unnest(array['SELECT','INSERT','UPDATE','DELETE']) as p) p
          where has_table_privilege(r.g, 'public.zz_default_probe'::regclass, p.p)`,
      );
      expect(eff[0]?.n).toBe("0");
    } finally {
      await db.query("rollback");
    }
  });

  it("★ a write through an auto-updatable view is refused — the half that was load-bearing", async () => {
    // Why this case is driven and not read off the catalogue. In one transaction, at one role, against one
    // table: a direct `insert into public.events` as `authenticated` was refused by RLS, and the identical
    // insert through a `postgres`-owned `security_invoker = off` view of the same shape returned
    // `INSERT 0 1`. RLS enabled *and* forced does not survive a write routed through a view owned by a
    // BYPASSRLS role. These five views were carrying exactly that grant.
    for (const view of AUTO_UPDATABLE_VIEWS) {
      await db.query("begin");
      try {
        await db.query("set local role authenticated");
        await expect(
          db.query(
            `insert into public.${view} (id) values (gen_random_uuid())`,
          ),
        ).rejects.toMatchObject({ code: "42501" });
      } finally {
        await db.query("rollback");
      }
    }
  });

  it("★ the reads the app depends on still work — a revoke that quietly broke a page would be the worse failure", async () => {
    for (const [role, rel] of [
      ["anon", "areas"],
      ["anon", "legal_documents"],
      ["anon", "nanny_public"],
      ["authenticated", "nanny_public"],
      ["authenticated", "booking_events"],
      ["authenticated", "family_access"],
      ["authenticated", "verification_status"],
      ["authenticated", "user_profiles"],
    ] as const) {
      await db.query("begin");
      try {
        await db.query(`set local role ${role}`);
        await expect(
          db.query(`select 1 from public.${rel} limit 1`),
        ).resolves.toBeDefined();
      } finally {
        await db.query("rollback");
      }
    }
  });

  it("★ and the reads that should now be refused are refused, as the role rather than from the catalogue", async () => {
    for (const [role, rel] of [
      ["anon", "user_profiles"],
      ["anon", "user_roles"],
      ["anon", "children"],
      ["anon", "account_erasure_requests"],
      ["authenticated", "events"],
      ["authenticated", "nanny_leads"],
      ["authenticated", "parent_leads"],
      ["authenticated", "chat_draft_locks"],
    ] as const) {
      await db.query("begin");
      try {
        await db.query(`set local role ${role}`);
        await expect(
          db.query(`select 1 from public.${rel} limit 1`),
        ).rejects.toMatchObject({ code: "42501" });
      } finally {
        await db.query("rollback");
      }
    }
  });
});
