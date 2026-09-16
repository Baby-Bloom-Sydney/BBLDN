-- 0016_rls.sql — the ordered migration set (02-data-model.md §6 row 0016), the last file.
--
-- Creates: the **three predicate views** of 07 §5.2 — `nanny_public`, `verification_status`,
-- `connection_party_contact` (02 §7 as amended by A12; HANDOFF §13 item 8) — and every remaining
-- policy of the 07 §5.2 matrix: the cross-party reads that could not exist before the tables they
-- join (0005-0008) did.
--
-- Rollback twin: supabase/rollbacks/0016_rls.rollback.sql
-- Paired change in the same PR: `supabase gen types typescript` regenerated into
-- `src/modules/shared-types/database.types.ts` (C-12; CI `types-drift`).
--
-- Why these three are views and not policies. 07 §5.1 rule 4 is the rule: a **column**-level
-- restriction is not expressible in a policy, so it is expressed by an object that selects the
-- columns. A parent may see a visible nanny's bio, not her `is_vaccinated` (ADR-103, Art 9). A
-- nanny may see her own verification's *status*, not the extracted fields, the AI reasoning or
-- `dbs_outcome` (Art 10, 07 §2.5). A nanny may see the parent's contact details only once the
-- introduction is scheduled. Each view is `security_invoker = off` with the predicate inside it and
-- a GRANT to exactly the roles 07 §5.2 lists - which is what 07 §5.1 rule 6 means by "views that
-- exist to widen".

-- ---------------------------------------------------------------------------
-- 1. `nanny_public` (07 §5.2; 02 §7)
--    The marketplace-safe projection. `anon` gets it (browse and the public
--    profile are anonymous surfaces), and so does every authenticated role.
--    The level floor is MATCHING.minVerificationLevel (config/matching.ts = 3,
--    i.e. L3_PROVISIONALLY_VERIFIED, 03 §4.3). 02 §7 says to bake the predicate
--    into the view, so the value is here; like the D-6 CHECKs it is regenerated
--    when the config changes, and it is the only place it appears.
-- ---------------------------------------------------------------------------

create or replace view public.nanny_public
with (security_invoker = off, security_barrier = true) as
  select
    n.id                       as nanny_id,
    n.bio,
    n.years_experience,
    n.qualification,
    n.certificates,
    n.languages,
    n.has_car,
    n.has_driving_licence,
    n.is_non_smoker,
    n.comfortable_with_pets,
    n.hourly_rate_min_pence,
    n.availability,
    n.available_from,
    n.verification_level,
    up.first_name,
    up.district,
    up.area,
    -- The object leaf only. `profile_picture_path` is `<role>/<user_id>/<uuid>.<ext>`, pinned to
    -- that shape by user_profiles_picture_path_owned_check, so shipping the whole path handed every
    -- anonymous browser a stable `auth.users.id` per nanny - the same identifier every auth.uid()
    -- predicate and every storage prefix keys on (security-reviewer M1). The read model rebuilds
    -- the prefix server-side, where it already knows the nanny.
    split_part(up.profile_picture_path, '/', 3) as profile_picture_object
  from public.nannies n
  join public.user_profiles up on up.user_id = n.user_id
  where n.profile_visible
    and not n.is_isolated
    and n.suspended_at is null
    and up.deactivated_at is null
    -- Membership, not an ordinal comparison: C-1 puts ">=" reads in shared-types, and `>=` on an
    -- add-only enum means whatever the next value's position makes it mean (database-reviewer M-14).
    -- The list is MATCHING.minVerificationLevel (= 3, L3) and above.
    and n.verification_level in ('L3_PROVISIONALLY_VERIFIED', 'L4_FULLY_VERIFIED');

comment on view public.nanny_public is
  '07 §5.2 / 02 §7: the only road from a parent or a visitor to a nanny row. **Excludes is_vaccinated** (ADR-103: Art 9 health data, visible to a parent only on a connected position where vaccination_required is set, and then through the module, not this view). Excludes last_name, mobile, date_of_birth and every pointer. The predicate - visible, not isolated, not suspended, level >= MATCHING.minVerificationLevel - is I-5 made structural.';

grant select on public.nanny_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. `verification_status` (07 §5.2; 02 §7)
--    What a nanny may see of her own verification: where each section stands and
--    what to do next. Never the extracted fields, never the AI reasoning, never
--    dbs_outcome - those are Art 9 / Art 10 content that only an admin reads
--    (07 §2.5, §5.2).
-- ---------------------------------------------------------------------------

create or replace view public.verification_status
with (security_invoker = off, security_barrier = true) as
  select
    v.nanny_id,
    v.level,
    v.level_changed_at,
    v.suspended_at is not null   as is_suspended,
    v.identity_status,
    v.identity_status_at,
    v.identity_evidence_type,
    v.identity_document_expiry,
    v.identity_user_guidance,
    v.identity_rejection_reason,
    v.identity_attempts,
    v.dbs_status,
    v.dbs_status_at,
    v.dbs_issue_date,
    v.dbs_expires_at,
    v.dbs_update_service_subscribed,
    v.dbs_user_guidance,
    v.dbs_rejection_reason,
    v.rtw_status,
    v.rtw_status_at,
    v.rtw_evidence_type,
    v.rtw_expires_at,
    v.rtw_user_guidance,
    v.rtw_rejection_reason,
    v.contact_status,
    v.cross_check_status
  from public.verifications v
  join public.nannies n on n.id = v.nanny_id
  where n.user_id = (select auth.uid()) or (select public.is_admin());

comment on view public.verification_status is
  '07 §5.2: the nanny''s own read. The base table has no policy for her at all - this is the whole surface. Omits *_extracted, *_ai_reasoning, *_provider_ref, dbs_outcome, dbs_certificate_number, the declared identity fields and every object ref.';

-- `grant ... to authenticated` does not exclude `anon`, which already holds SELECT from Supabase's
-- default privileges (security-reviewer M5). The revoke is what makes the grant mean what it reads.
revoke all on public.verification_status from anon;
grant select on public.verification_status to authenticated;

-- ---------------------------------------------------------------------------
-- 3. `connection_party_contact` (07 §5.2; 02 §7)
--    The parent's contact details, released to the nanny at INTRO_SCHEDULED and
--    not before (02 §4.2 row 7; the phone-exchange copy appears at
--    meeting.scheduled). Symmetric for the parent, whose road to the nanny is
--    otherwise nanny_public and carries no contact details at all.
-- ---------------------------------------------------------------------------

create or replace view public.connection_party_contact
with (security_invoker = off, security_barrier = true) as
  select
    c.id                 as connection_id,
    c.position_id,
    c.nanny_id,
    c.parent_id,
    c.stage,
    c.meeting_at,
    pp.first_name        as parent_first_name,
    pp.mobile            as parent_mobile,
    np.first_name        as nanny_first_name,
    np.mobile            as nanny_mobile
  from public.connection_requests c
  join public.parents  p  on p.id  = c.parent_id
  join public.nannies  n  on n.id  = c.nanny_id
  join public.user_profiles pp on pp.user_id = p.user_id
  join public.user_profiles np on np.user_id = n.user_id
  where c.stage in ('INTRO_SCHEDULED', 'INTRO_COMPLETE', 'TRIAL_ARRANGED', 'TRIAL_COMPLETE',
                    'OFFERED', 'CONFIRMED', 'ACTIVE')
    and not c.held_for_verification
    and (n.user_id = (select auth.uid()) or p.user_id = (select auth.uid())
         or (select public.is_admin()))

  union all

  -- 07 §5.2's `user_profiles` row releases the parent to a nanny "through a live connection >=
  -- INTRO_SCHEDULED **or a non-ended placement**". An invite_shell placement has no connection at
  -- all, so without this branch an invite-linked nanny could never see the family's number
  -- (database-reviewer M-15).
  select
    null::uuid           as connection_id,
    pl.position_id,
    pl.nanny_id,
    pl.parent_id,
    null::public.connection_stage as stage,
    null::timestamptz    as meeting_at,
    pp.first_name        as parent_first_name,
    pp.mobile            as parent_mobile,
    np.first_name        as nanny_first_name,
    np.mobile            as nanny_mobile
  from public.nanny_placements pl
  join public.parents  p  on p.id  = pl.parent_id
  join public.nannies  n  on n.id  = pl.nanny_id
  join public.user_profiles pp on pp.user_id = p.user_id
  join public.user_profiles np on np.user_id = n.user_id
  where pl.state <> 'ENDED'
    and (n.user_id = (select auth.uid()) or p.user_id = (select auth.uid())
         or (select public.is_admin()));

comment on view public.connection_party_contact is
  '07 §5.2: **first name and mobile only**, released at INTRO_SCHEDULED or on a non-ended placement. Last names and email addresses are deliberately absent: 04 rows 15 and 20 say "phone numbers exchanged" and "the family''s first name", and an email address is both a class-A identifier and a clean off-platform channel (security-reviewer H3). The stage list is written out rather than compared by enum ordinal, because the branch values of connection_stage sort after ACTIVE (C-1 is add-only) and `>= INTRO_SCHEDULED` would quietly include DECLINED and CANCELLED_BY_NANNY. A held row (R-14) is excluded until the hold is released.';

revoke all on public.connection_party_contact from anon;
grant select on public.connection_party_contact to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The remaining policies of the 07 §5.2 matrix.
-- ---------------------------------------------------------------------------

-- `subscribe_invites`: 0010 could only check that the minting nanny is the caller, because
-- `user_has_child_access()` arrives with `children` in 0012. A nanny minting a purchase link for a
-- child she is not linked to is the whole abuse this closes (security-reviewer M2).
drop policy if exists subscribe_invites_nanny_insert on public.subscribe_invites;
create policy subscribe_invites_nanny_insert on public.subscribe_invites
  for insert to authenticated
  with check (nanny_user_id = (select auth.uid()) and (select public.is_nanny())
              and status = 'pending'
              and (select public.user_has_child_access(child_id)));

-- `areas`: 0001 gave every role the active rows; the admin sees inactive ones too.
drop policy if exists areas_admin_select on public.areas;
create policy areas_admin_select on public.areas
  for select to authenticated
  using ((select public.is_admin()));

-- `parents`: "nanny SELECT via live connection / placement" (07 §5.2). The parent's
-- *contact* still comes from connection_party_contact; this is the marketplace row.
drop policy if exists parents_nanny_select on public.parents;
create policy parents_nanny_select on public.parents
  for select to authenticated
  using ((select public.is_active_nanny()) and (exists (
    select 1 from public.connection_requests c
    where c.parent_id = parents.id
      and c.nanny_id = (select public.current_nanny_id())
      and c.stage not in ('REQUEST_EXPIRED', 'DECLINED', 'REQUEST_CANCELLED', 'SCHEDULE_EXPIRED',
                          'NOT_HIRED', 'NOT_SELECTED', 'FINISHED',
                          'CANCELLED_BY_PARENT', 'CANCELLED_BY_NANNY')
  ) or exists (
    select 1 from public.nanny_placements pl
    where pl.parent_id = parents.id
      and pl.nanny_id = (select public.current_nanny_id())
      and pl.state <> 'ENDED'
  )));

-- `nanny_positions` and its two child tables: 0006 gave the nanny the jobs board
-- (OPEN / CONNECTING, and only to an active nanny). This is the other half of
-- 07 §5.2's clause - "or ones they hold a connection on" - which needs 0007.
-- Gated the same way (security-reviewer H2): a suspended nanny (I-V5 sets suspended_at on a
-- barred DBS) or an isolated one otherwise kept reading every position she ever touched,
-- including `position_children.needs_details`, which 07 §2.7(b) treats as potentially Art 9
-- child health data. And the read ends with the connection: a DECLINED row is not a licence.
drop policy if exists nanny_positions_nanny_connection_select on public.nanny_positions;
create policy nanny_positions_nanny_connection_select on public.nanny_positions
  for select to authenticated
  using ((select public.is_active_nanny()) and exists (
    select 1 from public.connection_requests c
    where c.position_id = nanny_positions.id
      and c.nanny_id = (select public.current_nanny_id())
      and c.stage not in ('REQUEST_EXPIRED', 'DECLINED', 'REQUEST_CANCELLED', 'SCHEDULE_EXPIRED',
                          'NOT_HIRED', 'NOT_SELECTED', 'FINISHED',
                          'CANCELLED_BY_PARENT', 'CANCELLED_BY_NANNY')
  ));

drop policy if exists position_children_nanny_connection_select on public.position_children;
create policy position_children_nanny_connection_select on public.position_children
  for select to authenticated
  using ((select public.is_active_nanny()) and exists (
    select 1 from public.connection_requests c
    where c.position_id = position_children.position_id
      and c.nanny_id = (select public.current_nanny_id())
      and c.stage not in ('REQUEST_EXPIRED', 'DECLINED', 'REQUEST_CANCELLED', 'SCHEDULE_EXPIRED',
                          'NOT_HIRED', 'NOT_SELECTED', 'FINISHED',
                          'CANCELLED_BY_PARENT', 'CANCELLED_BY_NANNY')
  ));

drop policy if exists position_schedule_nanny_connection_select on public.position_schedule;
create policy position_schedule_nanny_connection_select on public.position_schedule
  for select to authenticated
  using ((select public.is_active_nanny()) and exists (
    select 1 from public.connection_requests c
    where c.position_id = position_schedule.position_id
      and c.nanny_id = (select public.current_nanny_id())
      and c.stage not in ('REQUEST_EXPIRED', 'DECLINED', 'REQUEST_CANCELLED', 'SCHEDULE_EXPIRED',
                          'NOT_HIRED', 'NOT_SELECTED', 'FINISHED',
                          'CANCELLED_BY_PARENT', 'CANCELLED_BY_NANNY')
  ));

-- ---------------------------------------------------------------------------
-- 5. Privileges, re-run over the finished schema (security-reviewer H3).
--    0000 sets the default so every table 0001-0016 creates lands without
--    TRUNCATE / REFERENCES / TRIGGER for the two client roles. This sweep is the
--    belt: it catches anything created by a path that did not inherit it, and it
--    is cheap to re-run.
-- ---------------------------------------------------------------------------

revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- Functions: default-deny, then grant back by name (security-reviewer C1). The sweep is what makes
-- the list closed - a definer added by a later migration is unreachable by a client until someone
-- adds it here on purpose, and the verify block below fails if one appears that is not on the list.
revoke execute on all functions in schema public from public, anon, authenticated;

-- The retention identity needs the privileges its jobs exercise (07 §6.1-§6.2 rows 3-5, 8, 11-14):
-- read everything, null columns, delete rows. It holds BYPASSRLS (0000) because every table is
-- FORCE RLS and it has no policies; it is NOLOGIN, it is not granted to `service_role`, and
-- prevent_row_modification() recognises it by identity rather than by anything a statement can set.
grant usage on schema public to bbldn_retention;
grant select, insert, update, delete on all tables in schema public to bbldn_retention;
-- and EXECUTE on the trigger functions the writes fire, or every write raises
-- "permission denied for function" before the trigger can decide anything
grant execute on all functions in schema public to bbldn_retention;

grant execute on function
  public.is_admin(), public.is_parent(), public.is_nanny(), public.is_active_nanny(),
  public.is_privileged_writer(), public.current_parent_id(), public.current_nanny_id(),
  public.user_has_child_access(uuid), public.family_has_access(uuid),
  public.family_access_reason(uuid), public.child_has_family_access(uuid),
  public.get_invite_preview(text), public.get_pending_invites_for_recipient()
  to authenticated;

-- the one anonymous road (02 §7; 07 §8 row 7 rate-limits it)
grant execute on function public.get_invite_preview(text) to anon;

-- ---------------------------------------------------------------------------
-- 6. Verify — the whole-schema assertions, run once, at the end of the set.
-- ---------------------------------------------------------------------------

do $$
declare
  v_t text;
  v_n int;
  v_missing text;
begin
  -- the three views exist, are views, and widen deliberately (07 §5.1 rule 6)
  foreach v_t in array array['nanny_public', 'verification_status', 'connection_party_contact'] loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_t and c.relkind = 'v'
    ) then
      raise exception '0016: public.% must exist as a view (07 §5.2; 02 §7)', v_t;
    end if;
    if exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_t
        and (c.reloptions::text like '%security_invoker=on%'
             or c.reloptions::text like '%security_invoker=true%')
    ) then
      raise exception '0016: public.% must be security_invoker = off - it exists to widen (07 §5.1 rule 6)', v_t;
    end if;
  end loop;

  -- Every widening view needs security_barrier, or the planner may push a caller's qual below the
  -- predicate that IS the access control, and a cheap error-raising qual leaks the rows it hid
  -- (database-reviewer H-12). And its owner needs BYPASSRLS, or FORCE RLS makes it return nothing.
  foreach v_t in array array['nanny_public', 'verification_status', 'connection_party_contact',
                             'family_access', 'child_client_events', 'connection_events',
                             'booking_events', 'verification_events', 'page_visits'] loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_t
        and c.reloptions::text like '%security_barrier=true%'
    ) then
      raise exception '0016: view public.% must be security_barrier = true (07 §5.1 rule 6)', v_t;
    end if;
    if not exists (
      select 1 from pg_class c join pg_roles r on r.oid = c.relowner
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_t and (r.rolbypassrls or r.rolsuper)
    ) then
      raise exception '0016: view public.% must be owned by a role with BYPASSRLS, or it returns nothing', v_t;
    end if;
  end loop;

  -- The closed list of client-executable SECURITY DEFINERs (security-reviewer C1). Anything a later
  -- migration adds is unreachable by a client unless it is added here deliberately.
  select string_agg(p.proname, ', ') into v_missing
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    and p.proname <> all (array[
      'is_admin', 'is_parent', 'is_nanny', 'is_active_nanny', 'is_privileged_writer',
      'current_parent_id', 'current_nanny_id', 'user_has_child_access',
      'family_has_access', 'family_access_reason', 'child_has_family_access',
      'get_invite_preview', 'get_pending_invites_for_recipient']);
  if v_missing is not null then
    raise exception '0016: these functions are client-executable and not on the approved list (07 §5.1 rules 4-5): %', v_missing;
  end if;

  -- **Allow-lists, not deny-lists** (security-reviewer M6). A deny-list answers "did someone add
  -- one of the columns we thought of"; these views are the access control, so the question has to
  -- be "is every column one we decided to publish". A widened view now fails here by default.
  select string_agg(column_name, ', ') into v_missing
  from information_schema.columns
  where table_schema = 'public' and table_name = 'nanny_public'
    and column_name <> all (array[
      'nanny_id', 'bio', 'years_experience', 'qualification', 'certificates', 'languages',
      'has_car', 'has_driving_licence', 'is_non_smoker', 'comfortable_with_pets',
      'hourly_rate_min_pence', 'availability', 'available_from', 'verification_level',
      'first_name', 'district', 'area', 'profile_picture_object']);
  if v_missing is not null then
    raise exception '0016: nanny_public publishes column(s) nobody approved (ADR-103 / R-7): %', v_missing;
  end if;

  select string_agg(column_name, ', ') into v_missing
  from information_schema.columns
  where table_schema = 'public' and table_name = 'verification_status'
    and column_name <> all (array[
      'nanny_id', 'level', 'level_changed_at', 'is_suspended',
      'identity_status', 'identity_status_at', 'identity_evidence_type',
      'identity_document_expiry', 'identity_user_guidance', 'identity_rejection_reason',
      'identity_attempts',
      'dbs_status', 'dbs_status_at', 'dbs_issue_date', 'dbs_expires_at',
      'dbs_update_service_subscribed', 'dbs_user_guidance', 'dbs_rejection_reason',
      'rtw_status', 'rtw_status_at', 'rtw_evidence_type', 'rtw_expires_at',
      'rtw_user_guidance', 'rtw_rejection_reason',
      'contact_status', 'cross_check_status']);
  if v_missing is not null then
    raise exception '0016: verification_status publishes Art 9 / Art 10 content (07 §2.5, §5.2): %', v_missing;
  end if;

  select string_agg(column_name, ', ') into v_missing
  from information_schema.columns
  where table_schema = 'public' and table_name = 'connection_party_contact'
    and column_name <> all (array[
      'connection_id', 'position_id', 'nanny_id', 'parent_id', 'stage', 'meeting_at',
      'parent_first_name', 'parent_mobile', 'nanny_first_name', 'nanny_mobile']);
  if v_missing is not null then
    raise exception '0016: connection_party_contact publishes more than a first name and a mobile (07 §5.2): %', v_missing;
  end if;

  -- whole-schema: 02 C-10 on every table, no exceptions
  select string_agg(c.relname, ', ') into v_missing
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and not (c.relrowsecurity and c.relforcerowsecurity);
  if v_missing is not null then
    raise exception '0016: these tables do not ENABLE + FORCE row level security (02 C-10): %', v_missing;
  end if;

  -- whole-schema: 07 §5.1 rule 3
  select string_agg(tablename || '.' || policyname, ', ') into v_missing
  from pg_policies where schemaname in ('public', 'storage') and with_check = 'true';
  if v_missing is not null then
    raise exception '0016: WITH CHECK (true) is banned (07 §5.1 rule 3): %', v_missing;
  end if;

  -- whole-schema: every SECURITY DEFINER in public pins search_path (07 §5.1 rule 2)
  select string_agg(p.proname, ', ') into v_missing
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
                    where cfg like 'search_path=%');
  if v_missing is not null then
    raise exception '0016: these SECURITY DEFINER functions do not pin search_path (07 §5.1 rule 2): %', v_missing;
  end if;

  -- whole-schema: the 02 §4 table count.
  -- **56 in `public`, 57 with auth.users.** 02 §4 ends "Table count: 56 (identity 6 + auth.users ·
  -- areas 1 · marketplace 8 · verification 2 · scheduling 4 · money 6 · app 3 + 5 + 11 · comms 3 ·
  -- analytics 2 · leads 5)" - but that list adds to 57, not 56, and every cluster heading in §4
  -- agrees with the list (§4.1 "7 tables incl. auth.users", §4.2 "9 tables" incl. areas, §4.6
  -- "24 tables"). The stated total is one out; the per-cluster numbers are right, and this file
  -- asserts those. Recorded for the 02 owner in this unit's PROGRESS entry.
  select count(*) into v_n
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r';
  if v_n <> 56 then
    raise exception '0016: expected the 56 public tables of 02 §4 (57 with auth.users), found %', v_n;
  end if;

  -- whole-schema: the 79 enums are still exactly the 79 (C-1 is add-only, and
  -- nothing between 0001 and 0016 may have added one)
  select count(*) into v_n
  from pg_type t join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public' and t.typtype = 'e';
  if v_n <> 79 then
    raise exception '0016: expected the 79 enums of 02 §3, found %', v_n;
  end if;

  -- whole-schema: the nine views of 02 §7
  select count(*) into v_n
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v';
  if v_n <> 9 then
    raise exception '0016: expected the 9 views of 02 §7, found %', v_n;
  end if;

  -- the escalation guard, restated at the end of the set: after every policy in
  -- the schema exists, user_roles still has no client write.
  select count(*) into v_n
  from pg_policies where schemaname = 'public' and tablename = 'user_roles' and cmd <> 'SELECT';
  if v_n <> 0 then
    raise exception '0016: user_roles gained a write policy somewhere in 0003-0016 (07 §5.4 row 3)';
  end if;

  -- and `events` still has none at all
  select count(*) into v_n from pg_policies where schemaname = 'public' and tablename = 'events';
  if v_n <> 0 then
    raise exception '0016: events gained a policy; no client role may reach it (07 §5.2)';
  end if;

  -- whole-schema: no client role holds TRUNCATE on anything (security-reviewer H3)
  select string_agg(c.relname, ', ') into v_missing
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and (has_table_privilege('anon', c.oid, 'TRUNCATE')
         or has_table_privilege('authenticated', c.oid, 'TRUNCATE'));
  if v_missing is not null then
    raise exception '0016: a client role still holds TRUNCATE, which bypasses RLS and fires no row trigger: %', v_missing;
  end if;
end
$$;
