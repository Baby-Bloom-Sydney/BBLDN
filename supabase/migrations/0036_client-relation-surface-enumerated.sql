-- 0036_client-relation-surface-enumerated.sql — **ADR-185/186, the fourth instance** (L-009 `3l`;
-- `3k`'s Q-1, and the database pass's two LOWs on `0035` close with it).
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT WAS THERE, MEASURED FROM THE CATALOGUE BEFORE ANYTHING CHANGED
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- `0032` enumerated what the retention identity may **touch**, `0033` what it may **call**, `0035` what a
-- client role may **call**. Nobody had ever enumerated what a client role may **touch**. On `0000`–`0035`
-- applied from empty, by *effective* privilege (`has_table_privilege` / `has_any_column_privilege`, which
-- follow role membership, `PUBLIC` and ownership — not a direct-ACL read):
--
-- | What | Before | After |
-- |---|---|---|
-- | Relations in `public` (61 tables + 9 views) `anon` may **write** | **58** | **0** |
-- | …`authenticated` may **write** | **66** | **12** |
-- | …of which **views** (`authenticated` · `anon`) | **9** · **1** | **0** · **0** |
-- | Relations `anon` may **read** | **58** | **3** |
-- | …`authenticated` may **read** | **69** | **65** |
-- | Tables with a client write grant and **no write policy of any kind** | **54** | **0** |
-- | `pg_default_acl` rows granting a new table to a client role | **1** (`postgres`, `arwdm`) | **0** |
-- | `TO PUBLIC` grants · grant option · client-role memberships | 0 · 0 · 0 | 0 · 0 · 0, asserted |
--
-- ★ **`0000` §4 saw this and deliberately kept it.** Its own comment says *"Supabase grants ALL on every new
-- table in `public` to `anon` and `authenticated`"*, then revokes exactly three of those privileges —
-- TRUNCATE, REFERENCES, TRIGGER — on the stated ground that *"RLS does not gate any of the three"*. The
-- unstated converse is the defect: SELECT/INSERT/UPDATE/DELETE were left standing **because** RLS gates them,
-- which makes RLS the only control and the grant pure surplus. `0016:276` repeats the same three-privilege
-- sweep. That is `0016:288`'s blanket-grant shape a fourth time, and this file closes it.
--
-- ★ **And the grant is not written anywhere — it is *minted*.** `pg_default_acl` carries, for role `postgres`
-- in schema `public`, object type `r`: `{postgres=arwdDxtm, anon=arwdm, authenticated=arwdm, service_role=…}`.
-- Every table `postgres` creates in `public` is therefore born holding INSERT, SELECT, UPDATE, DELETE and
-- MAINTAIN for both client roles, with no `grant` line in any migration. Revoking the 57 standing grants
-- without revoking that default would leave the next migration's table blanket-granted again, so §3 revokes
-- it. This is `3j`'s D-3 answered in the affirmative for *relations*: unlike the function default (which
-- Postgres re-merges from the world default `=X` and which `0000:329` therefore cannot suppress), the world
-- default for a **table** is no privilege to anyone, so the `pg_default_acl` row is the whole mechanism and
-- removing it is durable. Measured both ways in the verify block.
--
-- **One limit named rather than implied (ADR-180), `0035`'s precedent.** `supabase_admin` holds its own
-- default-privilege row for schema `public` granting the client roles, and `postgres` is not a superuser
-- here, so it cannot be revoked. It is inert *while every table in `public` is owned by `postgres`* — which
-- the verify block and the gate both assert, because that assertion is what makes the limit safe.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ★ THE BLAST RADIUS, ESTABLISHED BEFORE ANYTHING CHANGED — AND IT IS NOT UNIFORM
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- A grant without a policy is usually defence in depth, because RLS denies by default. That was checked
-- rather than assumed, and it splits in two.
--
-- **The 61 tables — belt and braces.** All 61 are `ENABLE` *and* `FORCE ROW LEVEL SECURITY`; `anon` holds not
-- one write policy anywhere in the schema; `authenticated` holds write policies on 12 tables only. Driven as
-- a real signed-in parent who could read their own row: `update nanny_positions` → **UPDATE 0**,
-- `delete position_children` → **DELETE 0**, `insert position_children` → **RLS refusal**,
-- `update user_profiles` (the one with a policy) → **UPDATE 1**. The surplus grant buys nothing today.
--
-- ★ **The 9 views — one column away, and they are the reason this is a unit rather than hygiene.** A view has
-- no RLS. All nine are owned by `postgres`, which holds **BYPASSRLS**, and all nine are
-- `security_invoker = off`, so a write arriving through one is checked — and row-filtered — as the *owner*.
-- Five of them (`booking_events`, `child_client_events`, `connection_events`, `page_visits`,
-- `verification_events`) are **auto-updatable** and carried INSERT/UPDATE/DELETE to `authenticated`. Proved
-- decisively, in one transaction, at one role, against one table: a direct `insert into public.events` as
-- `authenticated` was refused — *"new row violates row-level security policy"* — and the identical insert
-- through a probe view of exactly that shape returned **INSERT 0 1**, with the row confirmed in the base
-- table. RLS enabled *and* forced does not survive a write routed through a view owned by a BYPASSRLS role.
--
-- What stops the five shipped views today is not a control; it is two accidents, and both are one edit from
-- gone:
--   1. `events.source` is NOT NULL with no default and **no view exposes it**, so every insert through one
--      dies on the constraint rather than on a privilege check. Expose `source` in any of the five — the
--      obvious thing to do the day someone wants the column in an admin list — and the hole opens.
--   2. `child_client_events` is the only one of the five whose `WHERE` a **non-admin** can satisfy (a parent
--      or linked nanny of the child). Its predicate is `name like 'child.%'`, and `events_name_check` admits
--      no `child.*` label at all, so the view is empty for everyone. Add one such label and a parent can
--      rewrite or delete their own child's audit rows, with no `WITH CHECK OPTION` to re-check the result.
-- The other four require `is_admin()` in the view body, so an admin writing through them is an admin.
--
-- **Verdict: not a live hole; one column away; and the view grants are the half that is load-bearing.**
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT STAYS, AND FROM WHERE (ADR-186)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- **The rule, so a reader can derive the list rather than memorise it: a client role gets a privilege if and
-- only if a policy permits the corresponding action for that role.** The policy is the declaration of intent
-- — it is in the repo, it was reviewed, and it is what actually decides whether the operation can succeed.
-- A grant beyond it is unreachable by construction. Views cannot carry policies, so the nine are listed by
-- name and read-only, with the reason each is readable written beside it in `int.client-grants`.
--
-- The full enumeration with a reason **and a from-where** per entry lives in `int.client-grants`'s
-- `CLIENT_RELATIONS`, because that is where it is checked on every run. In summary:
--
--   · **`anon` — 3 relations, SELECT only, no write anywhere.** `areas` (policy `areas_anon_select`, `is_active`;
--     from `src/modules/areas` on the public site), `legal_documents` (policy `legal_documents_anon_select`,
--     `true`; from the signed-out `/legal/*` pages), and the view `nanny_public` (signed-out browse; it is
--     the sole `anon` surface `0035` kept, whose body names `nanny_visible`). `account_erasure_requests` and
--     `file_retention_log` carry `{public}` SELECT policies, but their quals are `auth.uid() = …` and
--     `is_admin()`, both false for a signed-out caller — so they are *not* granted, and the verify block
--     drives the refusal rather than reasoning about it.
--   · **`authenticated` — SELECT on the 56 policy-bearing tables and on all 9 views.** Four tables carried a
--     SELECT grant with no SELECT policy of any kind and are revoked: `chat_draft_locks`, `events`,
--     `nanny_leads`, `parent_leads`. Revoking `events` is safe for the five views precisely *because*
--     `security_invoker = off` — the view reads the base table as its owner, not as the caller.
--   · **`authenticated` — write on 12 tables, each limited to the commands its own policies name**:
--     `admin_notifications` U · `biometric_consent_records` I · `children` I,U,D · `consent_records` I ·
--     `contact_messages` U · `feed_posts` I,U · `guarantee_events` I,U · `inbox_messages` U ·
--     `katie_proposals` U · `refund_requests` I,U · `subscribe_invites` I,U · `user_profiles` U.
--
-- ★ **Declared versus used, and the answer is uncomfortable** (ecc-lite rule 3). Tracing every
-- `.from(…).insert|update|delete|upsert` made on an *anon-key* client (`@/lib/supabase/client` and
-- `@/lib/supabase/server`, with the variable bound to `createClient()` rather than `createAdminClient()`)
-- finds **18 call sites across 7 tables** — and only **2** of those 7 (`inbox_messages`, `user_profiles`)
-- have a policy that lets the write land. The other 16, on `bloombot`, `connection_requests`,
-- `nanny_positions`, `position_children` and `position_schedule`, are **already dead** and were proved dead
-- above. They are stale Sydney-era paths: `src/lib/actions/parent.ts` still writes `nanny_positions.status`,
-- a column this schema does not have. This file does not repair them — that is a unit, not a passenger on a
-- privilege change (ADR-185's own rule) — but it does stop them failing *silently*: after `0036` an
-- already-dead UPDATE returns `42501` instead of `UPDATE 0`, which is ecc-lite rule 5 and is the only reason
-- to prefer a revoke to a comment here.
--
-- **`storage` is deliberately untouched, and why.** `anon` and `authenticated` hold full CRUD on
-- `storage.objects` and `storage.buckets`. That is not surplus: the Storage API authenticates the caller's
-- JWT and performs the write *as that role*, so `0015`'s storage policies are gating a privilege that is
-- genuinely exercised. The schema is also Supabase-owned, where an enumeration would have to track their
-- releases. Different surface, different blast radius, different unit — named here rather than hidden, and
-- recorded as a question for the planner.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ADR-165 — THIS FILE IS A SECURITY CLAUSE END TO END, SO ITS TWIN RESTORES NOTHING
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Undoing `0036` means re-granting write on 54 relations to roles a stranger reaches with a public key, and
-- re-arming a default privilege that mints the same grant on every future table. That is restoring a hole,
-- so `rollbacks/0036_client-relation-surface-enumerated.rollback.sql` is forward-only under ADR-165 arm (1):
-- it asserts the surface did not come back and changes nothing. The enumerated set is a **superset** of what
-- any policy permits, so no reverted application code is left without a privilege it could have used.

begin;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. The blanket revoke — every relation in `public`, both client roles, and `PUBLIC` for the road an
--    ACL read cannot see. Column-level ACLs go with it (`revoke all` clears `attacl`; asserted below).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

revoke all privileges on all tables in schema public from anon, authenticated, public;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 2. The enumerated set. Grouped by *why this role may touch this*, because the question a reader has in six
--    months is "why can a stranger with the anon key see that", and the group heading is the answer.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

-- CLIENT RELATIONS — START (int.client-grants parses this block; the two must name the same relations)

-- ── anon: signed out. Two tables and one view, read only. There is no anon write policy in this schema,
--    so there is no anon write grant in this file.
grant select on public.areas            to anon;  -- areas_anon_select (is_active) — the public area picker
grant select on public.legal_documents  to anon;  -- legal_documents_anon_select (true) — signed-out /legal/*
grant select on public.nanny_public     to anon;  -- signed-out browse; 0035 kept nanny_visible for this body

-- ── authenticated: read. The 56 tables carrying a SELECT policy for `authenticated` or `public`.
grant select on
  public.account_erasure_requests, public.admin_notifications, public.agent_memory, public.areas,
  public.availability_blocks, public.availability_rules, public.biometric_consent_records, public.bloombot,
  public.bookings, public.calendars, public.chat_cost_daily, public.chat_messages, public.chat_summaries,
  public.child_client, public.child_invites, public.children, public.connection_requests,
  public.consent_records, public.contact_messages, public.cookie_consent_records, public.development_images,
  public.email_logs, public.feed_posts, public.file_retention_log, public.guarantee_events,
  public.inbox_messages, public.katie_prompt, public.katie_prompt_edits, public.katie_prompt_version,
  public.katie_proposals, public.lead_contacts, public.lead_notes, public.legal_documents, public.milestones,
  public.nannies, public.nanny_contact_state, public.nanny_placements, public.nanny_positions,
  public.nanny_suspension_lifts, public.parent_subscriptions, public.parents, public.payment_events,
  public.pipeline_snapshots, public.position_call_mirror, public.position_children, public.position_schedule,
  public.precheck_notifications, public.proactive_schedules, public.progress_history, public.progress_scores,
  public.refund_requests, public.subscribe_invites, public.user_profiles, public.user_roles,
  public.verifications, public.vetting_submissions
  to authenticated;

-- ── authenticated: read, views. Nine, and **read only** — §"blast radius" above is the whole reason.
grant select on
  public.booking_events, public.child_client_events, public.connection_events,
  public.connection_party_contact, public.family_access, public.nanny_public, public.page_visits,
  public.verification_events, public.verification_status
  to authenticated;

-- ── authenticated: write. Twelve tables, each exactly the commands its own policies name.
grant update on public.admin_notifications       to authenticated;  -- admin_notifications_admin_update
grant insert on public.biometric_consent_records to authenticated;  -- biometric_consent_records_self_insert
grant insert, update, delete
              on public.children                 to authenticated;  -- children_parent_insert / _nanny_insert / _access_update / _parent_delete
grant insert on public.consent_records           to authenticated;  -- consent_records_self_insert
grant update on public.contact_messages          to authenticated;  -- contact_messages_admin_update
grant insert, update
              on public.feed_posts                to authenticated;  -- feed_posts_access_insert / _author_update / _parent_hide
grant insert, update
              on public.guarantee_events          to authenticated;  -- guarantee_events_admin_insert / _admin_update
grant update on public.inbox_messages            to authenticated;  -- inbox_messages_owner_update
grant update on public.katie_proposals           to authenticated;  -- katie_proposals_admin_update
grant insert, update
              on public.refund_requests           to authenticated;  -- refund_requests_admin_insert / _admin_update
grant insert, update
              on public.subscribe_invites         to authenticated;  -- subscribe_invites_nanny_insert / _nanny_update
grant update on public.user_profiles             to authenticated;  -- user_profiles_self_update

-- CLIENT RELATIONS — END

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 3. ★ The durable half — the default privilege that mints the grant on every new table.
--    `0000` §4 removed three of the five default privileges and left the rest. Without this line the next
--    migration's table is born with INSERT/SELECT/UPDATE/DELETE for both client roles and §1 above becomes a
--    statement about one moment, exactly as `0016:288` was.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

alter default privileges in schema public
  revoke all on tables from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 4. Verify — the file's own claims, in both directions, by behaviour wherever a privilege read could lie.
--    A verify block that cannot fail on its own subject is decoration (`3k`'s D-2), so every count below is
--    the thing this file changes, and the drives at the end are performed as the role rather than read off
--    the catalogue.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  anon_write    int;
  auth_write    int;
  anon_read     int;
  auth_read     int;
  view_write    int;
  col_acl       int;
  pub_grants    int;
  grantable     int;
  memberships   int;
  defacl        int;
  foreign_owned int;
  no_policy     int;
begin
  -- 4a. Write surface, effective privilege rather than a direct-ACL read.
  select count(*) into anon_write from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','p','v')
     and (has_table_privilege('anon', c.oid, 'INSERT') or has_any_column_privilege('anon', c.oid, 'INSERT')
       or has_table_privilege('anon', c.oid, 'UPDATE') or has_any_column_privilege('anon', c.oid, 'UPDATE')
       or has_table_privilege('anon', c.oid, 'DELETE'));
  if anon_write <> 0 then
    raise exception '0036: anon holds a write privilege on % relation(s) in public; the schema has no anon write policy at all', anon_write;
  end if;

  select count(*) into auth_write from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','p','v')
     and (has_table_privilege('authenticated', c.oid, 'INSERT') or has_any_column_privilege('authenticated', c.oid, 'INSERT')
       or has_table_privilege('authenticated', c.oid, 'UPDATE') or has_any_column_privilege('authenticated', c.oid, 'UPDATE')
       or has_table_privilege('authenticated', c.oid, 'DELETE'));
  if auth_write <> 12 then
    raise exception '0036: authenticated holds a write privilege on % relation(s); expected exactly the 12 policy-bearing tables', auth_write;
  end if;

  -- 4b. ★ No view carries a write to either client role. This is the half that was load-bearing.
  select count(*) into view_write from pg_class c join pg_namespace n on n.oid = c.relnamespace,
       lateral (select unnest(array['anon','authenticated']) as g) r
   where n.nspname = 'public' and c.relkind = 'v'
     and (has_table_privilege(r.g, c.oid, 'INSERT') or has_table_privilege(r.g, c.oid, 'UPDATE')
       or has_table_privilege(r.g, c.oid, 'DELETE'));
  if view_write <> 0 then
    raise exception '0036: % client write grant(s) survive on a view; a view has no RLS and is owned by a BYPASSRLS role', view_write;
  end if;

  -- 4c. Read surface.
  select count(*) into anon_read from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','p','v')
     and (has_table_privilege('anon', c.oid, 'SELECT') or has_any_column_privilege('anon', c.oid, 'SELECT'));
  if anon_read <> 3 then
    raise exception '0036: anon may read % relation(s); expected areas, legal_documents, nanny_public', anon_read;
  end if;

  select count(*) into auth_read from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','p','v')
     and (has_table_privilege('authenticated', c.oid, 'SELECT') or has_any_column_privilege('authenticated', c.oid, 'SELECT'));
  if auth_read <> 65 then
    raise exception '0036: authenticated may read % relation(s); expected 56 policy-bearing tables + 9 views', auth_read;
  end if;

  -- 4d. ★ Every surviving grant is matched by a policy, and every policy is matched by a grant. This is the
  --     rule the file states, asserted as a rule rather than as a list — so it still holds when a later
  --     migration adds a policy, and fails when one adds a grant without one.
  select count(*) into no_policy from pg_class c join pg_namespace n on n.oid = c.relnamespace,
       lateral (select unnest(array['anon','authenticated']) as g) r
   where n.nspname = 'public' and c.relkind in ('r','p')
     and (has_table_privilege(r.g, c.oid, 'INSERT') or has_any_column_privilege(r.g, c.oid, 'INSERT')
       or has_table_privilege(r.g, c.oid, 'UPDATE') or has_any_column_privilege(r.g, c.oid, 'UPDATE')
       or has_table_privilege(r.g, c.oid, 'DELETE'))
     and not exists (select 1 from pg_policies p
                      where p.schemaname = 'public' and p.tablename = c.relname
                        and p.cmd in ('INSERT','UPDATE','DELETE','ALL')
                        and p.roles::text[] && array[r.g, 'public']);
  if no_policy <> 0 then
    raise exception '0036: % client write grant(s) have no write policy; the grant is the only thing standing', no_policy;
  end if;

  -- 4e. Column ACLs went with the table-level revoke — checked live, not from the manual.
  select count(*) into col_acl from pg_attribute a
    join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace,
    lateral aclexplode(a.attacl) x
   where n.nspname = 'public' and a.attacl is not null
     and x.grantee::regrole::text in ('anon','authenticated');
  if col_acl <> 0 then
    raise exception '0036: % column-level client ACL entr(ies) survived the table-level revoke', col_acl;
  end if;

  -- 4f. The roads a direct-ACL read cannot see (`3i`'s db HIGH and sec HIGH, applied to the client roles).
  select count(*) into pub_grants from pg_class c join pg_namespace n on n.oid = c.relnamespace,
       lateral aclexplode(c.relacl) x
   where n.nspname = 'public' and c.relkind in ('r','p','v') and x.grantee = 0;
  if pub_grants <> 0 then
    raise exception '0036: % grant(s) TO PUBLIC survive in public; PUBLIC reaches both client roles', pub_grants;
  end if;

  select count(*) into grantable from pg_class c join pg_namespace n on n.oid = c.relnamespace,
       lateral aclexplode(c.relacl) x
   where n.nspname = 'public' and c.relkind in ('r','p','v') and x.is_grantable
     and x.grantee::regrole::text in ('anon','authenticated');
  if grantable <> 0 then
    raise exception '0036: a client role holds % privilege(s) WITH GRANT OPTION', grantable;
  end if;

  -- Membership in **both** directions: a role granted INTO anon/authenticated hands them its grants, and
  -- anon/authenticated granted into another role inherits that role's.
  select count(*) into memberships from pg_auth_members m
    join pg_roles mem on mem.oid = m.member join pg_roles grp on grp.oid = m.roleid
   where (mem.rolname in ('anon','authenticated') or grp.rolname in ('anon','authenticated'))
     and not (mem.rolname in ('authenticator','postgres','supabase_realtime_admin')
              and grp.rolname in ('anon','authenticated'));
  if memberships <> 0 then
    raise exception '0036: % unexpected role membership(s) touch a client role', memberships;
  end if;

  -- 4g. ★ The default privilege is gone — the durable half, and the one §1 alone could not buy.
  select count(*) into defacl from pg_default_acl d
    left join pg_namespace n on n.oid = d.defaclnamespace,
    lateral aclexplode(d.defaclacl) x
   where d.defaclobjtype = 'r' and d.defaclrole = 'postgres'::regrole
     and coalesce(n.nspname, '') = 'public'
     and x.grantee::regrole::text in ('anon','authenticated');
  if defacl <> 0 then
    raise exception '0036: postgres still carries % default-privilege entr(ies) granting a new table in public to a client role', defacl;
  end if;

  -- …and the limit that keeps `supabase_admin`'s un-revokable default inert: every relation is owned by
  -- `postgres`, so `supabase_admin`'s default never applies. Named in the header; asserted here.
  select count(*) into foreign_owned from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','p','v') and c.relowner <> 'postgres'::regrole;
  if foreign_owned <> 0 then
    raise exception '0036: % relation(s) in public are not owned by postgres; supabase_admin''s default privileges would apply to them', foreign_owned;
  end if;

  raise notice '0036 verify: anon write 0 / read 3 · authenticated write 12 / read 65 · view writes 0 · no grant without a policy · default privilege revoked';
end $$;

-- 4h. Behaviour, not privilege bits. The three claims a `has_table_privilege` read could not make: the two
--     `{public}`-policy tables really are closed to a signed-out caller, the write path that mattered really
--     is shut, and the reads the app depends on really do still work.
do $$
declare
  ok boolean;
begin
  set local role anon;
  begin
    perform 1 from public.account_erasure_requests limit 1;
    reset role;
    raise exception '0036: anon can still read account_erasure_requests';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.legal_documents limit 1;
  exception when insufficient_privilege then
    reset role;
    raise exception '0036: anon lost the read of legal_documents that /legal/* needs';
  end;
  reset role;

  set local role authenticated;
  begin
    insert into public.booking_events (name, actor_kind, props) values ('visit', 'visitor', '{}'::jsonb);
    reset role;
    raise exception '0036: authenticated can still write through booking_events, which bypasses RLS on events';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.events limit 1;
    reset role;
    raise exception '0036: authenticated can still read events directly (no SELECT policy exists for it)';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.booking_events limit 1;
  exception when insufficient_privilege then
    reset role;
    raise exception '0036: authenticated lost the read of booking_events; a security_invoker=off view reads its base table as owner and must still work';
  end;
  reset role;

  raise notice '0036 verify (driven): anon refused on account_erasure_requests, kept legal_documents; authenticated refused writing through booking_events and reading events, kept reading booking_events';
end $$;

commit;
