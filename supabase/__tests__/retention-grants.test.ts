// `int.retention-grants` — **ADR-185's gate.** The retention identity holds privilege on the tables its
// enumerated set names, and on nothing else.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS LIVES IN `integration` AND NOT IN `config-gates`
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// ADR-185 asks for "a gate asserting the retention role holds no privilege on any table its enumerated set does
// not name". The only place that fact exists is `pg_class.relacl` / `pg_attribute.attacl` on a database with
// every migration applied, so the gate needs a database and `config-gates` has none. It runs in `integration`,
// which starts a stack in the runner and applies `0000`→ from empty — so what this file reads is the schema CI
// will actually ship, not a file somebody remembered to update.
//
// **And it has to be here rather than only in `0032`'s verify block.** A verify block runs at its own migration's
// apply time and can say nothing about `0033`. This suite runs after the whole set, so a future
// `grant ... on all tables in schema public to bbldn_retention` fails CI here even though `0032` applied
// cleanly. That is the hole ADR-185 exists to keep shut; `0032`'s verify block is the belt, this is the braces.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// HOW TO CHANGE IT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// Adding a row to `ENUMERATED` below is a privilege change and is reviewed as one. **The default for a new table
// is nothing** — `0032`'s header says so and `pg_default_acl` carries no entry for this role, so a table created
// tomorrow reaches this role only if somebody writes it down in two places on purpose: `0032`'s grant block and
// this list. The last case in this file asserts the two agree, so neither can drift alone.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db-client";

const MIGRATIONS = [
  resolve(__dirname, "../migrations/0032_retention-grants-enumerated.sql"),
  // `0034` adds B-49's two release grants in its own `ENUMERATED SET` block. Read together, because a grant
  // written in a later migration is exactly as real as one written in `0032` and must be just as enumerated.
  resolve(
    __dirname,
    "../migrations/0034_purge-releases-its-own-references.sql",
  ),
];

/** A table-level privilege the enumerated set grants, or a column list where the grant is per column. */
type Grant = {
  /** `select` / `insert` / `update` / `delete`, table-wide. */
  readonly table: readonly string[];
  /** columns carrying `UPDATE` where the table-level `UPDATE` is deliberately withheld. */
  readonly updateColumns?: readonly string[];
  /** why this table is in the set at all — the job, and what it does there. */
  readonly why: string;
};

/**
 * ★ The enumerated set. One entry per table, each with the reason it is there, derived from what the three
 * retention jobs actually touch — `0028`'s erasure, `0030`'s purge, `0031`'s sweep. A table no job touches has
 * no entry, and therefore no privilege.
 */
const ENUMERATED: Readonly<Record<string, Grant>> = {
  // ── the erasure's own ledger and the tombstone it writes ──────────────────────────────────────────────────
  "public.account_erasure_requests": {
    table: ["SELECT", "UPDATE"],
    why: "0028 reads the request and marks it refused or completed; 0030 stamps it purged; 0031's consent arm reads completed_at as its anchor",
  },
  "public.user_profiles": {
    table: ["SELECT", "UPDATE"],
    why: "0028 step 5: the name, email and phone become the tombstone",
  },
  // ── the erasure's pseudonymising updates (07 §6.1 step 3) ─────────────────────────────────────────────────
  "public.nanny_positions": {
    table: ["SELECT", "UPDATE"],
    why: "0028 nulls the free text a parent wrote into her own position",
  },
  "public.connection_requests": {
    table: ["SELECT", "UPDATE"],
    why: "0028 nulls the message, the slots and the meeting bracket",
  },
  "public.bookings": {
    table: ["SELECT", "UPDATE"],
    why: "0028 nulls the call note and the notes on the erased party's bookings",
  },
  "public.child_client": {
    table: ["SELECT", "UPDATE"],
    why: "0028 ends the link rather than deleting the other party's record of it (ADR-181)",
  },
  "public.nanny_placements": {
    table: ["SELECT", "UPDATE", "DELETE"],
    why: "0028 nulls the notes and the roster; 0031's `placements` class deletes the row six years after it ended",
  },
  // ── the erasure's deletes ────────────────────────────────────────────────────────────────────────────────
  "public.position_children": {
    table: ["SELECT", "DELETE"],
    why: "0028: a child's row on the erased parent's own position",
  },
  "public.position_schedule": {
    table: ["SELECT", "DELETE"],
    why: "0028: the schedule of the erased parent's own position",
  },
  "public.children": {
    table: ["SELECT", "DELETE"],
    why: "0028: the erased parent's children",
  },
  "public.bloombot": {
    table: ["SELECT", "DELETE"],
    why: "0028: the subject's assistant and everything cascading from it",
  },
  "public.chat_draft_locks": {
    table: ["SELECT", "DELETE"],
    why: "0028: the subject's draft locks",
  },
  "public.inbox_messages": {
    table: ["SELECT", "DELETE"],
    why: "0028: the subject's inbox",
  },
  "public.lead_notes": {
    table: ["SELECT", "DELETE"],
    why: "0028: the operator's notes about the erased nanny",
  },
  "public.lead_contacts": {
    table: ["SELECT", "DELETE"],
    why: "0028: the operator's contact attempts on the erased nanny",
  },
  "public.nanny_contact_state": {
    table: ["SELECT", "DELETE"],
    why: "0028: the CRM contact state of the erased nanny",
  },
  "public.parents": {
    table: ["SELECT", "DELETE"],
    why: "0028 step 3: the party row goes last, so the `set null` keys fire over rows already scrubbed",
  },
  "public.nannies": {
    table: ["SELECT", "DELETE"],
    updateColumns: ["id"],
    why: "0028 step 3, and the delete that fires 0027's pseudonymiser. `update (id)` is the `for update nowait` probe, not a write — Postgres charges a row lock to UPDATE and DELETE does not satisfy it (0032 §2h)",
  },
  "public.file_retention_log": {
    table: ["SELECT", "INSERT"],
    why: "0028 records each removed object inside the transaction; the log is append-only to this role",
  },
  // ── the purge's preconditions (07 §6.1 step 6) ───────────────────────────────────────────────────────────
  "public.consent_records": {
    table: ["SELECT", "DELETE"],
    why: "0030 counts the rows a window still holds; 0031's `consent` class removes them six years after the erasure completed",
  },
  "public.biometric_consent_records": {
    table: ["SELECT", "DELETE"],
    why: "as consent_records — the same window, the same class",
  },
  "public.parent_subscriptions": {
    table: ["SELECT", "DELETE"],
    why: "0028 refuses an erasure while one is live; 0031's `money` class removes it six years after the last transaction",
  },
  "public.payment_events": {
    table: ["SELECT", "DELETE"],
    why: "0030 counts them; 0031's `money` class removes them, re-asserting the window per subject",
  },
  "public.refund_requests": {
    table: ["SELECT", "DELETE"],
    why: "as payment_events — the same class",
  },
  "public.guarantee_events": {
    table: ["SELECT", "DELETE"],
    why: "as payment_events — the same class",
  },
  // ── the sweep's own classes (07 §6.2) ────────────────────────────────────────────────────────────────────
  "public.cookie_consent_records": {
    table: ["SELECT", "DELETE"],
    updateColumns: ["id", "user_id"],
    why: "0031's two cookie classes — superseded at 30 days, the rest at 13 months; `update (id)` is the arm's row lock (0032 §2h); `update (user_id)` is B-49's release, because the `on delete set null` cascade runs as postgres and the append-only guard refuses it (0034)",
  },
  "public.admin_notifications": {
    table: ["SELECT", "DELETE"],
    updateColumns: ["id"],
    why: "0031's `admin-notifications` class, 12 months after acknowledgement; `update (id)` is the arm's row lock (0032 §2h)",
  },
  "public.email_logs": {
    table: ["SELECT", "DELETE"],
    updateColumns: ["body_html", "body_text", "recipient_email", "subject"],
    why: "0031 nulls the body at 90 days and deletes the row at 24 months; 0028 tombstones recipient_email. The table-level UPDATE is withheld so no arm can rewrite a send's status or its timestamps",
  },
  "public.events": {
    table: ["SELECT"],
    updateColumns: ["attribution", "request_id", "visitor_id"],
    why: "0031's `events-identifiers` class nulls three columns at 25 months. No DELETE: §6.2 row 14's delete half is ★ and deferred, so the privilege that would carry it is not granted",
  },
  // ── safeguarding: ADR-170 allows the subject to be pseudonymised and allows nothing else ──────────────────
  "public.verifications": {
    table: ["SELECT"],
    updateColumns: [
      "cross_check_note",
      "date_of_birth",
      "dbs_ai_reasoning",
      "dbs_certificate_number",
      "dbs_certificate_ref",
      "dbs_extracted",
      "dbs_provider_ref",
      "dbs_rejection_reason",
      "dbs_user_guidance",
      "given_names",
      "identity_ai_issues",
      "identity_ai_reasoning",
      "identity_document_ref",
      "identity_extracted",
      "identity_provider_ref",
      "identity_rejection_reason",
      "identity_selfie_ref",
      "identity_user_guidance",
      "nanny_id",
      "nationality",
      "rtw_document_ref",
      "rtw_extracted",
      "rtw_provider_ref",
      "rtw_rejection_reason",
      "rtw_share_code",
      "rtw_user_guidance",
      "subject_pseudonym",
      "surname",
    ],
    why: "0027's pseudonymiser and 0028 step 3, by column, exactly 0031's list. No INSERT (a retention job never creates a vetting record), no DELETE, no table-level UPDATE",
  },
  "public.vetting_submissions": {
    table: ["SELECT"],
    updateColumns: ["nanny_id", "raw_response", "subject_pseudonym"],
    why: "0027's pseudonymiser and 0031's `provider-responses` class. No INSERT, no DELETE, no table-level UPDATE — the decision, its date and its author are unreachable",
  },
  "public.nanny_suspension_lifts": {
    table: ["SELECT"],
    updateColumns: ["nanny_id", "subject_pseudonym"],
    why: "0027's pseudonymiser writes exactly these two; 0030 counts the rows. Who lifted the bar, when and why is unreachable — ADR-170's rule applied to the third table, which 0031's brief did not name",
  },
  // ── B-49's release (0034) ────────────────────────────────────────────────────────────────────────────────
  "public.katie_prompt_edits": {
    table: ["SELECT"],
    updateColumns: ["applied_by"],
    why: "B-49 (0034): the purge nulls `applied_by` itself, because the `on delete set null` cascade runs as postgres and prevent_row_modification() refuses it. SELECT because the release's `for update nowait` reads the key it is about to null; no table-level UPDATE, so what a prompt edit actually said is unreachable; no DELETE at all",
  },
  // ── storage ──────────────────────────────────────────────────────────────────────────────────────────────
  "storage.objects": {
    table: ["SELECT"],
    why: "0028's collect_erasure_objects() reads the subject's paths by prefix; removal is an HTTP call outside the transaction (0015 refuses a direct DELETE to every role)",
  },
};

/** Tables the enumerated set names, `schema.table`. */
const NAMED = Object.keys(ENUMERATED).sort();

type AclRow = { readonly rel: string; readonly privs: string };
type ColRow = {
  readonly rel: string;
  readonly col: string;
  readonly privs: string;
};

/**
 * ★ The **effective** privilege — what the database would actually allow, not what was written down.
 *
 * `database-reviewer` HIGH, demonstrated live: reading `aclexplode(relacl) where grantee = 'bbldn_retention'`
 * sees only grants made to that role **by name**. Two routes go round it, and the reviewer drove both — the
 * role could `SELECT` from `rate_limit_buckets`, a table with no enumerated privilege, while this suite's
 * relation count stayed at 33:
 *
 *   (a) `grant ... on all tables ... to some_helper_role; grant some_helper_role to bbldn_retention;`
 *   (b) `grant ... on all tables in schema public to PUBLIC;`
 *
 * Neither is a far-fetched attack — (a) is what a future unit adding a helper role for an unrelated feature
 * does "for convenience", which is a much more likely mistake than somebody retyping `0016:288`. So the gate
 * asks `has_table_privilege` / `has_any_column_privilege`, which follow role membership, `PUBLIC` and
 * ownership, and the direct-ACL cases below stay as well: the ACL query says *where* a stray grant was written,
 * the effective query says *whether the role can do it at all*, and a hole needs to pass both.
 */
type EffectiveRow = {
  readonly rel: string;
  /** table-level privileges only — `has_table_privilege` does not count a column grant. */
  readonly effective: string;
  /** true if any column of the relation is reachable for SELECT / INSERT / UPDATE / REFERENCES. */
  readonly anyColumn: boolean;
};

const PRIVILEGES = [
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "REFERENCES",
  "TRIGGER",
] as const;

let db: Client;
let tableAcl: readonly AclRow[];
let columnAcl: readonly ColRow[];
let effective: readonly EffectiveRow[];
let memberships: readonly string[];

beforeAll(async () => {
  db = await connect();

  const tables = await db.query<AclRow>(
    `select c.relnamespace::regnamespace::text || '.' || c.relname as rel,
            string_agg(a.privilege_type, ',' order by a.privilege_type) as privs
       from pg_class c, lateral aclexplode(c.relacl) a
      where c.relkind in ('r','p','v','m','f')
        and a.grantee = 'bbldn_retention'::regrole
      group by 1
      order by 1`,
  );
  tableAcl = tables.rows;

  const columns = await db.query<ColRow>(
    `select c.relnamespace::regnamespace::text || '.' || c.relname as rel,
            at.attname as col,
            string_agg(a.privilege_type, ',' order by a.privilege_type) as privs
       from pg_attribute at
       join pg_class c on c.oid = at.attrelid,
            lateral aclexplode(at.attacl) a
      where a.grantee = 'bbldn_retention'::regrole
      group by 1, 2
      order by 1, 2`,
  );
  columnAcl = columns.rows;

  const reachable = await db.query<EffectiveRow>(
    `select c.relnamespace::regnamespace::text || '.' || c.relname as rel,
            coalesce(
              string_agg(p.priv, ',' order by p.priv)
                filter (where has_table_privilege('bbldn_retention', c.oid, p.priv)),
              '') as effective,
            bool_or(has_any_column_privilege('bbldn_retention', c.oid, p.priv))
              filter (where p.priv in ('SELECT','INSERT','UPDATE','REFERENCES')) as "anyColumn"
       from pg_class c
       cross join unnest($1::text[]) as p(priv)
      where c.relkind in ('r','p','v','m','f')
        and c.relnamespace::regnamespace::text in ('public','storage')
      group by 1
      order by 1`,
    [[...PRIVILEGES]],
  );
  effective = reachable.rows;

  const member = await db.query<{ role: string }>(
    `select r.rolname as role
       from pg_auth_members m
       join pg_roles r on r.oid = m.roleid
      where m.member = 'bbldn_retention'::regrole
      order by 1`,
  );
  memberships = member.rows.map((r) => r.role);
});

afterAll(async () => {
  await db?.end();
});

describe("int.retention-grants — what the role can actually do (effective privilege)", () => {
  it("★ can reach exactly the relations the enumerated set names, by any route — membership, PUBLIC or ownership included", () => {
    const reachable = effective
      .filter((r) => r.effective !== "" || r.anyColumn)
      .map((r) => r.rel)
      .sort();
    expect(reachable).toEqual(NAMED);
  });

  it("★ holds exactly the table-level privileges the set lists, per relation, effectively", () => {
    const actual: Record<string, string[]> = {};
    for (const row of effective) {
      if (row.effective === "") continue;
      actual[row.rel] = row.effective.split(",").sort();
    }
    const expected: Record<string, string[]> = {};
    for (const rel of NAMED) expected[rel] = [...ENUMERATED[rel]!.table].sort();
    expect(actual).toEqual(expected);
  });

  it("★ is a member of no other role — the route round a direct-grant check (database pass, HIGH)", () => {
    expect(memberships).toEqual([]);
  });

  it("★ and no role but the migration owner is a member of IT — the same route, reversed (security pass, HIGH)", async () => {
    const { rows } = await db.query<{ member: string }>(
      `select r.rolname as member
         from pg_auth_members m
         join pg_roles r on r.oid = m.member
        where m.roleid = 'bbldn_retention'::regrole
          and r.rolname <> current_user
        order by 1`,
    );
    expect(rows.map((r) => r.member)).toEqual([]);
  });

  it("★ holds no grantable privilege — it cannot widen itself (security pass, MEDIUM)", async () => {
    const { rows } = await db.query(
      `select 1 from pg_class c, lateral aclexplode(c.relacl) a
        where a.grantee = 'bbldn_retention'::regrole and a.is_grantable`,
    );
    expect(rows).toEqual([]);
  });

  it("★ is named by no default-privilege rule — the grant invisible today that applies to every table added tomorrow (security pass, MEDIUM)", async () => {
    const { rows } = await db.query(
      `select 1 from pg_default_acl d, lateral aclexplode(d.defaclacl) a
        where a.grantee = 'bbldn_retention'::regrole`,
    );
    expect(rows).toEqual([]);
  });

  it("★ reaches no column of a relation the set does not name", () => {
    const withColumns = effective
      .filter((r) => r.anyColumn)
      .map((r) => r.rel)
      .sort();
    for (const rel of withColumns) {
      expect(
        NAMED,
        `${rel} is reachable per column and is not in the set`,
      ).toContain(rel);
    }
  });
});

describe("int.retention-grants — the enumerated set is the authority (ADR-185)", () => {
  it("★ holds a table privilege on exactly the relations the enumerated set names, and on nothing else", () => {
    expect(tableAcl.map((r) => r.rel).sort()).toEqual(NAMED);
  });

  it("★ holds a column privilege only on relations the enumerated set names", () => {
    const withColumns = [...new Set(columnAcl.map((r) => r.rel))].sort();
    const expected = NAMED.filter((rel) => ENUMERATED[rel]?.updateColumns);
    expect(withColumns).toEqual(expected);
  });

  it("holds exactly the table-level privileges each entry lists, per relation", () => {
    const actual = Object.fromEntries(
      tableAcl.map((r) => [r.rel, r.privs.split(",").sort()]),
    );
    const expected = Object.fromEntries(
      NAMED.map((rel) => [rel, [...ENUMERATED[rel]!.table].sort()]),
    );
    expect(actual).toEqual(expected);
  });

  it("holds exactly the UPDATE columns each entry lists, where it lists any", () => {
    const actual: Record<string, string[]> = {};
    for (const row of columnAcl) {
      expect(row.privs).toBe("UPDATE");
      (actual[row.rel] ??= []).push(row.col);
    }
    const expected: Record<string, string[]> = {};
    for (const rel of NAMED) {
      const cols = ENUMERATED[rel]?.updateColumns;
      if (cols) expected[rel] = [...cols].sort();
    }
    for (const key of Object.keys(actual)) actual[key]!.sort();
    expect(actual).toEqual(expected);
  });

  it("★ reaches no schema but `public` and `storage`", () => {
    const schemas = [
      ...new Set(tableAcl.map((r) => r.rel.split(".")[0])),
    ].sort();
    expect(schemas).toEqual(["public", "storage"]);
  });

  it("every entry says why it is there, because a privilege without a reason is one nobody can remove", () => {
    for (const [rel, grant] of Object.entries(ENUMERATED)) {
      expect(grant.why.length, rel).toBeGreaterThan(20);
      expect(grant.table.length, rel).toBeGreaterThan(0);
    }
  });

  it("★ a table no job touches holds nothing — the two created after `0016` prove the default", () => {
    const untouched = [
      "public.rate_limit_buckets",
      "public.position_call_mirror",
    ];
    for (const rel of untouched) {
      expect(NAMED).not.toContain(rel);
      expect(tableAcl.map((r) => r.rel)).not.toContain(rel);
    }
  });

  it("★ names no view — a retention job works on rows, and a DML grant on a view is a road nobody meant to open", async () => {
    const { rows } = await db.query<{ rel: string }>(
      `select c.relnamespace::regnamespace::text || '.' || c.relname as rel
         from pg_class c, lateral aclexplode(c.relacl) a
        where c.relkind in ('v','m')
          and a.grantee = 'bbldn_retention'::regrole`,
    );
    expect(rows.map((r) => r.rel)).toEqual([]);
  });

  it("★ the migration's grant block and this list name the same tables, so neither drifts alone", () => {
    const named = new Set<string>();
    for (const migration of MIGRATIONS) {
      const sql = readFileSync(migration, "utf8");
      const start = sql.indexOf("ENUMERATED SET — START");
      const end = sql.indexOf("ENUMERATED SET — END");
      expect(start, migration).toBeGreaterThan(-1);
      expect(end, migration).toBeGreaterThan(start);
      const block = sql.slice(start, end);
      for (const match of block.matchAll(
        /^grant [^;]*? on table ((?:public|storage)\.[a-z_]+)/gms,
      )) {
        named.add(match[1]!);
      }
    }
    expect([...named].sort()).toEqual(NAMED);
  });
});

describe("int.retention-grants — what the identity is refused, and by which control", () => {
  it("★ is refused an INSERT into `verifications` — a retention job never creates a vetting record", async () => {
    await expect(
      asRetention(
        `insert into public.verifications (nanny_id) values (gen_random_uuid())`,
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("★ is refused an INSERT into `vetting_submissions`", async () => {
    await expect(
      asRetention(
        `insert into public.vetting_submissions (nanny_id) values (gen_random_uuid())`,
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("★ is refused an UPDATE of who lifted a safeguarding bar (ADR-170)", async () => {
    await expect(
      asRetention(
        `update public.nanny_suspension_lifts set decided_by = gen_random_uuid()`,
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("★ is refused an UPDATE of a DBS outcome", async () => {
    await expect(
      asRetention(`update public.verifications set dbs_outcome = null`),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("★ is refused a DELETE from `events` — §6.2 row 14's delete half is ★ and deferred", async () => {
    await expect(
      asRetention(`delete from public.events`),
    ).rejects.toMatchObject({ code: "42501" });
  });

  // ★ The `update (id)` grants exist so an arm can take `for update nowait`. A security pass measured that the
  // foreign keys this file first claimed would refuse the rewrite do not exist on two of the three, and
  // performed the swap. These three cases are the control that replaced the argument — the swap is attempted,
  // the way the reviewer attempted it, rather than a `has_column_privilege` answer being read.
  it.each([
    [
      "public.admin_notifications",
      "admin_notifications_refuse_key_rewrite",
      `insert into public.admin_notifications (kind, summary) values ('call_due', 'probe')`,
    ],
    [
      "public.cookie_consent_records",
      "cookie_consent_records_refuse_key_rewrite",
      `insert into public.cookie_consent_records
         (visitor_id, consent_choice, analytics_enabled, marketing_enabled, expiry_date)
       values ('probe', 'reject_non_essential', false, false, now() + interval '13 months')`,
    ],
  ])(
    "★ %s: the row-lock grant is refused when it tries to rewrite the key (%s)",
    async (table, trigger, seed) => {
      const { rows } = await db.query(
        `select 1 from pg_trigger t where not t.tgisinternal and t.tgname = $1`,
        [trigger],
      );
      expect(rows).toHaveLength(1);

      // the row has to exist or the statement touches nothing and the trigger is never consulted — which is
      // how the first draft of these cases passed for the wrong reason
      await expect(
        asRetention(`update ${table} set id = gen_random_uuid()`, seed),
      ).rejects.toMatchObject({ code: "23001" });
    },
  );

  it("★ `nannies` carries the same guard, and the lock the grants exist for still works on all three", async () => {
    const { rows } = await db.query(
      `select 1 from pg_trigger t
        where not t.tgisinternal and t.tgname = 'nannies_refuse_key_rewrite'`,
    );
    expect(rows).toHaveLength(1);

    for (const table of [
      "public.nannies",
      "public.admin_notifications",
      "public.cookie_consent_records",
    ]) {
      await expect(
        asRetention(`select 1 from ${table} for update nowait`),
      ).resolves.toBeDefined();
    }
  });

  it("★ is refused every privilege on a table no job touches", async () => {
    await expect(
      asRetention(`select 1 from public.rate_limit_buckets`),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      asRetention(`select 1 from public.contact_messages`),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("still does the work the three jobs need — one write per job shape, proved by doing it", async () => {
    await expect(
      asRetention(
        `update public.verifications set subject_pseudonym = subject_pseudonym where false`,
      ),
    ).resolves.toBeDefined();
    await expect(
      asRetention(
        `update public.nanny_suspension_lifts set subject_pseudonym = subject_pseudonym where false`,
      ),
    ).resolves.toBeDefined();
    await expect(
      asRetention(`delete from public.consent_records where false`),
    ).resolves.toBeDefined();
    await expect(
      asRetention(`update public.email_logs set body_html = null where false`),
    ).resolves.toBeDefined();
  });
});

/**
 * Runs one statement as `bbldn_retention` and rolls it back. `set local role` is how a privilege is measured
 * rather than described: `has_table_privilege` answers what the catalogue says, this answers what the database
 * does. The role is NOLOGIN, so this is reachable only from a session that is already a member — the migration
 * owner — which is exactly `0000`'s stated limit on the exemption (ADR-180).
 */
async function asRetention(sql: string, seed?: string): Promise<unknown> {
  await db.query("begin");
  try {
    // the seed runs as the migration owner, before the role is assumed — a fixture is not what is being tested
    if (seed) await db.query(seed);
    await db.query("set local role bbldn_retention");
    return await db.query(sql);
  } finally {
    await db.query("rollback");
  }
}
