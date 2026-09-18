-- 0025_suspension-is-terminal.sql — the ordered migration set (02-data-model.md §6 row 0025; **ADR-168**)
--
-- Creates: `nanny_suspension_lifts` (the durable record of who lifted a bar and why) and
-- `lift_nanny_suspension()` (`service_role`, a validated decider). Re-creates: `sync_nanny_verification_state()`
-- with one clause changed — it may SET a bar and may never CLEAR one.
--
-- Rollback twin: supabase/rollbacks/0025_suspension-is-terminal.rollback.sql
--
-- ★ SECURITY CLAUSE, FORWARD-ONLY (ADR-165 (1)). **The bar-cannot-be-cleared clause of
--   `sync_nanny_verification_state()` is a security clause and the twin does not undo it.** Named here so the
--   twin can name it back: `suspended_at` is derived in neither UPDATE; a nanny suspended before a rollback of
--   this file is still suspended after it. The twin drops what this file ADDS (the table, the function) and
--   leaves the narrowing in place, because rolling back a safeguarding control is not a rollback, it is an
--   incident. `supabase/__tests__/rollback-security-clauses.test.ts` applies forward → twin → and asserts the
--   hole is still shut, which is ADR-165 (3).
--
-- WHY (REVIEW-4 C-2, measured, not argued).
--   `0023:301, 308` derived the suspension from the outcome alone — `suspended_at = case when v_suspend then
--   coalesce(…, now()) else null end` — and `record_vetting_decision`'s else-branch resets `dbs_outcome` to
--   `unset` for every rejection whose reason is not the exact string `adverse`. There is no already-decided
--   guard. So re-deciding the SAME submission with reason `mismatch` walked the pair back:
--
--     after `adverse`   → level L0_SIGNED_UP · suspended **t** · dbs_outcome `barred`
--     after `mismatch`  → level L0_SIGNED_UP · suspended **f** · dbs_outcome `unset`
--
--   An adverse-DBS bar came off with one more click on the screen whose purpose is recording a decision, and
--   nothing anywhere recorded that it had been lifted — `decided_by` is overwritten on the same row.
--   `verifications_barred_is_suspended_check` constrains only ENTERING barred, never leaving it.
--
-- THE RULING (ADR-168). A bar is terminal for the road that set it; lifting one is its own act.
--   (a) The sync may set a bar and may never clear one. Every derivation path that could write `null` into
--       `suspended_at` is gone, so no later decision — on this submission or another, on this section or
--       another — lifts a bar as a side effect. M-12's "universal un-suspender" goes with it: the day an
--       admin-suspend button or a safeguarding suspension writes that column, the next verification event of
--       any kind no longer silently lifts it.
--   (b) Lifting is an explicit admin act with its own definer, its own validated decider, its own audit row and
--       its own comms — the same shape as every other authority write, because "a bar was lifted" is exactly
--       the fact a regulator asks who authorised.
--   (c) An adverse DBS outcome is never re-derivable to safe. A correction to the EVIDENCE is a new submission,
--       not a re-decision — which is why the lift puts the DBS section back to `unset` and leaves her to
--       resubmit, rather than restoring a cleared outcome she never earned.
--
-- WHAT THE LIFT DELIBERATELY DOES NOT DO.
--   It does not write a level. ADR-157 (1) names `sync_nanny_verification_state()` the ONE writer of
--   `verifications.level` / `nannies.verification_level`, and this file does not make a second one. I-V5 has
--   already pinned her at L0; after the lift she stays there until her next decision runs the sync through the
--   one writer with the caller's `p_required`. That errs low — it can leave a level stale-by-under-granting for
--   the window between the lift and her next submission, and never stale-by-over-granting, which is the only
--   direction that matters for a nanny who was barred an hour ago.
--
-- Forced by: `0023` (the function it re-creates), `0008` (`verifications`), `0021` (`nannies`), `0004`
-- (`user_roles`, for the decider check). Additive over `0000`–`0024`: one table, one function, one function
-- re-created with the same signature. The set still applies forwards from an empty database in one pass.

-- ---------------------------------------------------------------------------
-- 1. `nanny_suspension_lifts` — the durable record ADR-168 (b) asks for
-- ---------------------------------------------------------------------------
-- A row per lift, never updated and never deleted by any road in the application: `decided_by` is a real
-- `auth.users` id validated against `user_roles` inside the definer, so an unattributable lift is not recorded
-- at all — it refuses. Reading is admin-only and writing is the definer's; no client policy grants either.

create table if not exists public.nanny_suspension_lifts (
  id              uuid        primary key default gen_random_uuid(),
  nanny_id        uuid        not null references public.nannies (id) on delete cascade,
  -- Why the bar came off, in the admin's own words. NOT NULL and non-blank (the definer trims and refuses an
  -- empty one): "a bar was lifted" without a reason answers the regulator's question with half an answer.
  reason          text        not null,
  decided_by      uuid        not null references auth.users (id) on delete restrict,
  decided_at      timestamptz not null default now(),
  -- What the lift walked back, captured at the moment it ran so the row stays readable after the columns move.
  previous_dbs_outcome public.dbs_outcome not null,
  suspended_since timestamptz not null,

  constraint nanny_suspension_lifts_reason_not_blank_check
    check (length(btrim(reason)) > 0)
);

comment on table public.nanny_suspension_lifts is
  'ADR-168 (b): one row per explicit lift of a nanny suspension — who authorised it, why, what it walked back and how long she had been suspended. Written ONLY by lift_nanny_suspension(); no client policy writes it and none updates or deletes it. on delete restrict on decided_by, because an audit row whose author can be deleted is not an audit row.';

create index if not exists nanny_suspension_lifts_nanny_idx
  on public.nanny_suspension_lifts (nanny_id, decided_at desc);
-- The FK index the RESTRICT check needs, so deleting an `auth.users` row does not seq-scan this table.
create index if not exists nanny_suspension_lifts_decided_by_idx
  on public.nanny_suspension_lifts (decided_by);

alter table public.nanny_suspension_lifts enable row level security;
alter table public.nanny_suspension_lifts force row level security;

-- 07 §5.2 shape: admin SELECT only. No INSERT / UPDATE / DELETE policy exists for any client role, so the
-- definer (which runs as the owner, and the owner is BYPASSRLS) is the only writer there is.
drop policy if exists nanny_suspension_lifts_admin_select on public.nanny_suspension_lifts;
create policy nanny_suspension_lifts_admin_select on public.nanny_suspension_lifts
  for select to authenticated using ((select public.is_admin()));

-- ★ `service_role` is revoked too, and that is not belt-and-braces (database-reviewer M-4, driven — the verify
-- block below refused the first apply). Supabase's default privileges grant ALL on a new public table to
-- `service_role`, so a `grant select, insert` on top of them grants nothing new and leaves UPDATE and DELETE
-- exactly where they were: an audit table whose rows the application could rewrite. The revoke is what makes
-- this table append-only; the grant merely says which two verbs come back.
revoke all on table public.nanny_suspension_lifts from public, anon, authenticated, service_role;
grant select on table public.nanny_suspension_lifts to authenticated;
grant select, insert on table public.nanny_suspension_lifts to service_role;

-- ---------------------------------------------------------------------------
-- 2. `sync_nanny_verification_state()` — re-created; the bar is terminal here
-- ---------------------------------------------------------------------------
-- The function BODY is byte-for-byte `0023`'s except for the two `suspended_at` assignments and the note above
-- them; it is restated rather than patched because `create or replace function` has no other form, and a reader
-- comparing the two files should be able to diff them. Outside the body one line is deliberately not identical:
-- the `revoke all` below names `anon` and `authenticated` explicitly where `0023` named only `public`. That is
-- the same privilege set either way (neither role holds a separate explicit grant), stated rather than left for
-- someone to discover while checking the claim above.

create or replace function public.sync_nanny_verification_state(p_nanny_id uuid, p_required jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n        public.nannies;
  v_v        public.verifications;
  v_from     public.verification_level;
  v_to       public.verification_level;
  v_suspend  boolean := false;
  v_released integer := 0;
  v_key      text;
  v_val      jsonb;
  v_s        text;
begin
  -- The list is data from config, not from a user — but it is still validated, because a definer that trusts
  -- its arguments is one bad caller away from granting L4 to everyone.
  if p_required is null or jsonb_typeof(p_required) <> 'object' then
    raise exception 'sync_nanny_verification_state: p_required must be an object of level -> sections (ADR-157)'
      using errcode = '22023';
  end if;
  for v_key, v_val in select * from jsonb_each(p_required) loop
    if v_key not in ('L0_SIGNED_UP', 'L1_REGISTERED', 'L2_ID_VERIFIED', 'L3_PROVISIONALLY_VERIFIED', 'L4_FULLY_VERIFIED') then
      raise exception 'sync_nanny_verification_state: % is not a verification_level (02 §3)', v_key
        using errcode = '22023';
    end if;
    if jsonb_typeof(v_val) <> 'array' then
      raise exception 'sync_nanny_verification_state: the sections for % must be an array', v_key
        using errcode = '22023';
    end if;
    for v_s in select jsonb_array_elements_text(v_val) loop
      if v_s not in ('identity', 'dbs', 'right_to_work') then
        raise exception 'sync_nanny_verification_state: % is not an evidence section (02 §3)', v_s
          using errcode = '22023';
      end if;
    end loop;
  end loop;
  foreach v_key in array array['L2_ID_VERIFIED', 'L3_PROVISIONALLY_VERIFIED', 'L4_FULLY_VERIFIED'] loop
    if coalesce(jsonb_array_length(p_required -> v_key), 0) = 0 then
      raise exception 'sync_nanny_verification_state: % must require at least one section (an emptied list refuses, never grants)', v_key
        using errcode = '22023';
    end if;
  end loop;

  select * into v_n from public.nannies n where n.id = p_nanny_id for update;
  if not found then
    raise exception 'sync_nanny_verification_state: unknown nanny %', p_nanny_id using errcode = 'P0002';
  end if;
  v_from := v_n.verification_level;

  select * into v_v from public.verifications v where v.nanny_id = p_nanny_id for update;
  if not found then
    -- I-V1: no row reads as every section not_started
    v_to := 'L0_SIGNED_UP';
  elsif v_v.dbs_outcome = 'barred' then
    -- I-V5
    v_to := 'L0_SIGNED_UP';
    v_suspend := true;
  elsif public.verification_sections_verified(v_v, p_required -> 'L4_FULLY_VERIFIED')
        and v_v.dbs_outcome = 'cleared'
        and v_v.cross_check_status = 'passed'
        and v_v.dbs_update_service_last_result = 'no_change'
        and v_v.dbs_update_service_checked_by is not null then
    v_to := 'L4_FULLY_VERIFIED';
  elsif public.verification_sections_verified(v_v, p_required -> 'L3_PROVISIONALLY_VERIFIED')
        and v_v.dbs_outcome = 'cleared'
        and v_v.cross_check_status = 'passed' then
    v_to := 'L3_PROVISIONALLY_VERIFIED';
  elsif public.verification_sections_verified(v_v, p_required -> 'L2_ID_VERIFIED') then
    v_to := 'L2_ID_VERIFIED';
  elsif v_v.identity_status <> 'not_started' then
    v_to := 'L1_REGISTERED';
  else
    v_to := 'L0_SIGNED_UP';
  end if;

  -- ★ ADR-168 (a) — THE ONE CHANGE FROM `0023`, in both statements below. `coalesce(x, now())` SETS a bar the
  -- first time and leaves an existing one alone; the else arm is the COLUMN ITSELF, never `null`. A derivation
  -- can therefore raise a bar and can never lower one, whatever the outcome it derives from. Clearing is
  -- `lift_nanny_suspension()`'s and nothing else's.
  if v_v.id is not null then
    update public.verifications v
       set level            = v_to,
           level_changed_at = case when v.level is distinct from v_to then now() else v.level_changed_at end,
           suspended_at     = case when v_suspend then coalesce(v.suspended_at, now()) else v.suspended_at end
     where v.id = v_v.id;
  end if;

  update public.nannies n
     set verification_level    = v_to,
         verification_synced_at = now(),
         suspended_at          = case when v_suspend then coalesce(n.suspended_at, now()) else n.suspended_at end
   where n.id = p_nanny_id;

  -- ADR-158 arm 2: the silent-hold release — every connection held for verification is released at L4.
  if v_to = 'L4_FULLY_VERIFIED' then
    update public.connection_requests c
       set held_for_verification = false, held_at = null
     where c.nanny_id = p_nanny_id and c.held_for_verification;
    get diagnostics v_released = row_count;
  end if;

  return jsonb_build_object(
    'from_level', v_from::text,
    'to_level',   v_to::text,
    'suspended',  v_suspend,
    'released',   v_released
  );
end;
$$;

comment on function public.sync_nanny_verification_state(uuid, jsonb) is
  'ADR-157 (1): the ONE writer of verifications.level / nannies.verification_level (02 §4.3, R-8). Derives the level top-down from the section statuses, dbs_outcome, the cross-check and the Update Service columns against the sections-per-level the caller hands it (validated; an emptied L2-L4 list refuses). Releases held_for_verification rows at L4 (ADR-158). ADR-168 (0025): it may SET suspended_at and may NEVER clear it - a bar is terminal for the road that set it and lift_nanny_suspension() is the only road that lifts one. Called inside the decision definers; never from a client. service_role only.';

revoke all on function public.sync_nanny_verification_state(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.sync_nanny_verification_state(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 3. `lift_nanny_suspension()` — the explicit act (ADR-168 (b))
-- ---------------------------------------------------------------------------
-- The decider first, before anything is read or written, exactly as `record_vetting_decision` does it
-- (ADR-159; 07 §5.4 row 6): an unattributable lift is not recorded at all. The nanny is the CALLER's subject
-- here rather than a submission's, because a lift is not about one piece of evidence — the admin road that
-- reaches this function reads the nanny from the queue row it already has and never from a form field.
--
-- Not idempotent on purpose. Lifting a suspension that is not there raises, so a double-submit writes one audit
-- row and refuses the second rather than recording two lifts of one bar.

create or replace function public.lift_nanny_suspension(
  p_nanny_id   uuid,
  p_reason     text,
  p_decided_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n            public.nannies;
  v_v            public.verifications;
  v_suspended_at timestamptz;
  v_outcome      public.dbs_outcome;
begin
  if p_decided_by is null
     or not exists (select 1 from public.user_roles r where r.user_id = p_decided_by and r.role = 'admin') then
    raise exception 'lift_nanny_suspension: the decider must be an admin (07 §5.4 row 6; ADR-159)'
      using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'lift_nanny_suspension: a lift needs a reason (ADR-168)'
      using errcode = '22023';
  end if;

  -- ★ LOCK ORDER: `verifications` FIRST, then `nannies` — and not the other way round, which is what this
  -- function did until `database-reviewer` drove it (H-1). The order is not the sync's internal one; it is the
  -- one every CALLER establishes. `record_vetting_decision` (`0023:412-434`), `record_update_service_check`
  -- (`0023:473`) and `expire_verification_section` (`0023:513`) all touch `verifications` before the sync ever
  -- reaches `nannies`, so verifications-then-nannies is the schema's effective global order. A lift that took
  -- them the other way round was the only writer inverting it, and two admins on the same nanny — one recording
  -- a decision, one lifting her bar — would deadlock, surfacing as a spurious 40P01 on a legitimate action.
  select * into v_v from public.verifications v where v.nanny_id = p_nanny_id for update;
  select * into v_n from public.nannies n where n.id = p_nanny_id for update;
  if not found then
    raise exception 'lift_nanny_suspension: unknown nanny %', p_nanny_id using errcode = 'P0002';
  end if;

  -- `least` rather than `coalesce`: both ignore a null side, so today (the two columns are only ever written
  -- together, inside one transaction) they answer the same thing. They differ the day something writes one of
  -- them alone — the admin-suspend button this file's header anticipates — and then the EARLIER instant is the
  -- honest answer to "how long had she been suspended", which is the question the audit row exists to answer.
  v_suspended_at := least(v_n.suspended_at, v_v.suspended_at);
  if v_suspended_at is null then
    raise exception 'lift_nanny_suspension: nanny % is not suspended', p_nanny_id
      using errcode = '55006';
  end if;
  v_outcome := coalesce(v_v.dbs_outcome, 'unset');

  -- The audit row FIRST, in the same transaction as the write it describes: if the insert refuses (a decider
  -- deleted between the check and here, a blank reason) the lift does not happen either.
  insert into public.nanny_suspension_lifts
    (nanny_id, reason, decided_by, previous_dbs_outcome, suspended_since)
  values (p_nanny_id, btrim(p_reason), p_decided_by, v_outcome, v_suspended_at);

  -- ADR-168 (c): the outcome is not restored, it is UNSET. `verifications_barred_is_suspended_check` forbids a
  -- barred row that is not suspended, so the two must move together — and the honest direction is back to "no
  -- DBS conclusion on file", which is what a correction to the evidence actually means. Her `dbs_status` is
  -- left where the rejection put it, so she resubmits exactly as after any other rejection.
  if v_v.id is not null then
    update public.verifications v
       set suspended_at       = null,
           dbs_outcome        = case when v.dbs_outcome = 'barred' then 'unset'::public.dbs_outcome
                                     else v.dbs_outcome end,
           cross_check_status = case when v.dbs_outcome = 'barred' then 'not_started'::public.cross_check_status
                                     else v.cross_check_status end,
           cross_check_at     = case when v.dbs_outcome = 'barred' then null else v.cross_check_at end,
           cross_check_note   = case when v.dbs_outcome = 'barred' then null else v.cross_check_note end
     where v.id = v_v.id;
  end if;

  update public.nannies n set suspended_at = null where n.id = p_nanny_id;

  -- No level is written here: ADR-157 (1) keeps one writer and this is not it. See the file header.
  return jsonb_build_object(
    'nanny_id',             p_nanny_id::text,
    'lifted',               true,
    'suspended_since',      v_suspended_at,
    'previous_dbs_outcome', v_outcome::text,
    'level',                v_n.verification_level::text
  );
end;
$$;

comment on function public.lift_nanny_suspension(uuid, text, uuid) is
  'ADR-168 (b): the ONE road that clears nannies.suspended_at / verifications.suspended_at. Validates the decider against user_roles (07 §5.4 row 6), refuses a blank reason, refuses a nanny who is not suspended, writes the nanny_suspension_lifts audit row in the same transaction, and unsets a barred dbs_outcome with it (the 0008 CHECK reads both). Writes no level - ADR-157 (1) keeps sync_nanny_verification_state() the one writer of that. service_role only; the person''s authority is ALSO the action''s (auth.requireRole, 07 §5.4).';

revoke all on function public.lift_nanny_suspension(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.lift_nanny_suspension(uuid, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Verify — the house standard (M-13's shape, applied to everything this file touches)
-- ---------------------------------------------------------------------------

do $$
declare
  v_fn text;
  v_n  integer;
begin
  -- 4a. Both functions: exactly one overload, SECURITY DEFINER, search_path pinned EMPTY (not `like '%search_path=%'`
  --     — M-14's defect: `search_path=public` passes that wildcard), owner BYPASSRLS, and no anon / authenticated
  --     EXECUTE.
  foreach v_fn in array array['sync_nanny_verification_state', 'lift_nanny_suspension'] loop
    select count(*) into v_n
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn;
    if v_n <> 1 then
      raise exception '0025: public.%() must have exactly one overload, found % (a second overload is a second road into the same write)', v_fn, v_n;
    end if;

    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = v_fn
         and p.prosecdef
         and 'search_path=""' = any(p.proconfig)
    ) then
      raise exception '0025: public.%() must be SECURITY DEFINER with search_path="" (07 §5.1)', v_fn;
    end if;

    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        join pg_roles r on r.oid = p.proowner
       where n.nspname = 'public' and p.proname = v_fn and r.rolbypassrls
    ) then
      raise exception '0025: public.%() must be owned by a BYPASSRLS role or the definer reads nothing', v_fn;
    end if;
  end loop;

  if has_function_privilege('anon', 'public.lift_nanny_suspension(uuid, text, uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.lift_nanny_suspension(uuid, text, uuid)', 'EXECUTE') then
    raise exception '0025: lift_nanny_suspension() must not be executable by anon or authenticated (07 §5.1 rule 5)';
  end if;
  if not has_function_privilege('service_role', 'public.lift_nanny_suspension(uuid, text, uuid)', 'EXECUTE') then
    raise exception '0025: lift_nanny_suspension() must be executable by service_role';
  end if;
  if has_function_privilege('anon', 'public.sync_nanny_verification_state(uuid, jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.sync_nanny_verification_state(uuid, jsonb)', 'EXECUTE') then
    raise exception '0025: sync_nanny_verification_state() must not be executable by anon or authenticated';
  end if;

  -- 4b. ★ The security clause itself, asserted on the SOURCE rather than on prose: neither `suspended_at`
  --     assignment in the sync may fall back to `null`. This is the clause the twin must not undo, and the
  --     assertion is what makes "forward-only" checkable by a machine rather than by a reader.
  -- ★ `~*`, not `~` (database-reviewer M-1): these four regexes are the ONE machine check protecting ADR-168's
  -- forward-only clause, and a case-sensitive check is defeated by `ELSE NULL END`. A rewrite that re-opens the
  -- hole in different casing must trip this, or the file applies "successfully" while undoing itself.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'sync_nanny_verification_state'
       and p.prosrc ~* 'suspended_at\s*=\s*case when v_suspend then[^;]*else\s+null\s+end'
  ) then
    raise exception '0025: sync_nanny_verification_state() still derives suspended_at to null — a bar it did not set (ADR-168 (a))';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'sync_nanny_verification_state'
       and p.prosrc ~* 'else v\.suspended_at end'
       and p.prosrc ~* 'else n\.suspended_at end'
  ) then
    raise exception '0025: sync_nanny_verification_state() must leave an existing suspended_at alone in BOTH statements (ADR-168 (a))';
  end if;

  -- 4b(ii). ★ The audit row is the promise, so it is asserted too (database-reviewer M-2; `0023:1138-1143` set
  --        the precedent for `record_vetting_decision`'s `decided_by`). An edit that drops the insert would
  --        otherwise leave suspensions liftable with no trail and still pass this block.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'lift_nanny_suspension'
       and p.prosrc ~* 'insert\s+into\s+public\.nanny_suspension_lifts'
       and p.prosrc ~* 'user_roles'
  ) then
    raise exception '0025: lift_nanny_suspension() must validate the decider and write the nanny_suspension_lifts row (ADR-168 (b))';
  end if;

  -- 4c. The audit table: RLS on and FORCED, admin SELECT only, and no client write policy of any kind.
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'nanny_suspension_lifts'
       and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception '0025: nanny_suspension_lifts must have RLS enabled AND forced';
  end if;
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'nanny_suspension_lifts' and cmd <> 'SELECT';
  if v_n <> 0 then
    raise exception '0025: nanny_suspension_lifts must carry no client write policy, found %', v_n;
  end if;
  if has_table_privilege('anon', 'public.nanny_suspension_lifts', 'SELECT')
     or has_table_privilege('authenticated', 'public.nanny_suspension_lifts', 'INSERT')
     or has_table_privilege('authenticated', 'public.nanny_suspension_lifts', 'UPDATE')
     or has_table_privilege('authenticated', 'public.nanny_suspension_lifts', 'DELETE') then
    raise exception '0025: nanny_suspension_lifts grants are wrong — admin SELECT through the policy only';
  end if;

  -- ★ APPEND-ONLY, asserted rather than assumed (database-reviewer M-4). The table's comment promises nothing
  --   updates or deletes a row; today that holds only because the GRANT above omits those verbs. An audit table
  --   whose append-only-ness is an accident of one line is one careless grant away from being editable.
  if has_table_privilege('service_role', 'public.nanny_suspension_lifts', 'UPDATE')
     or has_table_privilege('service_role', 'public.nanny_suspension_lifts', 'DELETE') then
    raise exception '0025: nanny_suspension_lifts must be append-only — service_role may INSERT and SELECT, never UPDATE or DELETE';
  end if;

  -- 4d. ★ The table's SHAPE, not only its posture (database-reviewer M-3). `create table if not exists` is a
  --     silent no-op against a pre-existing, differently-shaped table — one missing the non-blank reason check,
  --     or with `decided_by` cascading instead of restricting — and the migration would then apply cleanly with
  --     the actual safeguards absent. `0008:252-260` set this pattern; it is followed here.
  if not exists (
    select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public' and t.relname = 'nanny_suspension_lifts'
       and c.conname = 'nanny_suspension_lifts_reason_not_blank_check'
  ) then
    raise exception '0025: nanny_suspension_lifts is missing nanny_suspension_lifts_reason_not_blank_check — a lift with no reason is half an answer';
  end if;
  foreach v_fn in array array['decided_by:r', 'nanny_id:c'] loop
    if not exists (
      select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        join pg_attribute a on a.attrelid = t.oid and a.attnum = c.conkey[1]
       where n.nspname = 'public' and t.relname = 'nanny_suspension_lifts'
         and c.contype = 'f' and array_length(c.conkey, 1) = 1
         and a.attname = split_part(v_fn, ':', 1)
         and c.confdeltype = split_part(v_fn, ':', 2)
    ) then
      raise exception '0025: nanny_suspension_lifts.% does not carry the ON DELETE action 0025 declares (% = restrict, c = cascade)', split_part(v_fn, ':', 1), split_part(v_fn, ':', 2);
    end if;
  end loop;
end
$$;
