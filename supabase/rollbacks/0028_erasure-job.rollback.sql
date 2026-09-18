-- 0028_erasure-job.rollback.sql — the twin of supabase/migrations/0028_erasure-job.sql (06 §4.2).
--
-- ⚠️ **WHAT THIS FILE DELIBERATELY DOES NOT UNDO** — ADR-165 (1), as ADR-177 generalised it: a rollback that
-- would re-open a **hole** refuses; one that destroys **data** completes and announces the loss. Both of
-- `0028`'s security clauses are kept, and each is named here so a reader can check the claim:
--
--  1. ★ **The six person→history keys stay off `cascade`, and the six columns stay nullable.** Handing the
--     cascades back would mean that the next `delete from parents` destroys the nanny's record of a placement
--     she worked and the hire record the Limitation Act says we keep for six years — silently, with nothing
--     saying it happened. That is not a rollback, it is the incident `0028` exists to end. The columns stay
--     nullable because it is the keys that made them so, and a NOT NULL restored over a row whose party has
--     already been erased would fail to apply anyway.
--
--  2. ★ **`file_retention_log` and `account_erasure_requests` stay, with their guards attached, and neither is
--     handed back to a client role.** These are evidence, not machinery: one records that an object was deleted
--     (Art 5(2)) and the other records that a person asked to be erased and what we answered (Art 12). Dropping
--     them would destroy the proof that a right was exercised, which is the one thing a rollback must never be
--     able to do quietly — and re-granting `service_role` the ability to rewrite a request row would hand back
--     exactly the hole the database pass found (HIGH-3). `prevent_erasure_request_modification()` therefore stays
--     too, and so do the revokes. Nothing before `0028` references either table, so keeping them costs the
--     reverted code nothing.
--
-- ⚠️ **WHAT IS LOST, stated rather than hidden.**
--
-- **The job itself.** `erase_account()`, `collect_erasure_objects()` and `scrub_auth_user()` are dropped, so
-- after this twin **no erasure can run at all** — a request lands in `account_erasure_requests` and stays
-- `requested` for ever, with nothing to process it. If an Art 17 request is outstanding when you run this, it is
-- outstanding afterwards too and the clock does not stop. **The recovery is roll-forward**, not re-writing the
-- job by hand.
--
-- **`is_privileged_writer()` narrows back.** `0028` added `bbldn_retention` to it because `0002:96` already named
-- the retention jobs as writers a column guard lets through and the predicate did not admit the role they run
-- as. Narrowing is the safe direction — the predicate still admits `service_role`, `postgres` and
-- `supabase_admin` — and with the job gone there is no retention caller left to refuse.
--
-- Nothing later references any of these objects (`0028` is the last migration), so this always succeeds on a
-- database `0028` applied to. One transaction: a rollback that fails midway must not leave half the objects
-- standing.

begin;

-- ---------------------------------------------------------------------------
-- 1. The job
-- ---------------------------------------------------------------------------

drop function if exists public.erase_account(uuid, uuid, jsonb);
drop function if exists public.collect_erasure_objects(uuid);
drop function if exists public.scrub_auth_user(uuid);

-- `prevent_erasure_request_modification()` is NOT dropped — it is clause (2), and a guard function dropped out
-- from under an attached trigger would take the trigger with it.

-- ---------------------------------------------------------------------------
-- 2. `is_privileged_writer()` back to its `0000` body
-- ---------------------------------------------------------------------------

create or replace function public.is_privileged_writer()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user in ('service_role', 'postgres', 'supabase_admin');
$$;

-- ---------------------------------------------------------------------------
-- 3. The privileges `0028` granted for a job that no longer exists
-- ---------------------------------------------------------------------------
--
-- The two evidence tables keep theirs: nothing writes them once the job is gone, and revoking SELECT on
-- `file_retention_log` from the identity that wrote it would make the evidence unreadable to the only role that
-- is supposed to be able to read it out of band.

revoke select on table public.parent_subscriptions  from bbldn_retention;
revoke select on table storage.objects              from bbldn_retention;
revoke usage  on schema storage                     from bbldn_retention;
revoke select, update on table public.nanny_positions        from bbldn_retention;
revoke select, update on table public.connection_requests    from bbldn_retention;
revoke select, update on table public.nanny_placements       from bbldn_retention;
revoke select, update on table public.precheck_notifications from bbldn_retention;
revoke select, update on table public.bookings               from bbldn_retention;
revoke select, update on table public.child_client           from bbldn_retention;
revoke select, update on table public.user_profiles          from bbldn_retention;
revoke select, update on table public.email_logs             from bbldn_retention;
revoke select, delete on table public.position_children      from bbldn_retention;
revoke select, delete on table public.position_schedule      from bbldn_retention;
revoke select, delete on table public.children               from bbldn_retention;
revoke select, delete on table public.bloombot               from bbldn_retention;
revoke select, delete on table public.chat_draft_locks       from bbldn_retention;
revoke select, delete on table public.inbox_messages         from bbldn_retention;
revoke select, delete on table public.nanny_contact_state    from bbldn_retention;
revoke select, delete on table public.lead_contacts          from bbldn_retention;
revoke select, delete on table public.lead_notes             from bbldn_retention;
revoke select, delete on table public.parents                from bbldn_retention;
revoke select, delete on table public.nannies                from bbldn_retention;

-- ---------------------------------------------------------------------------
-- 4. Verify — ADR-165 (3): the clauses are still shut AFTER the twin
-- ---------------------------------------------------------------------------

do $$
declare
  v_pair  text[];
  v_pairs text[][] := array[
    array['nanny_positions',        'parent_id'],
    array['connection_requests',    'parent_id'],
    array['connection_requests',    'nanny_id'],
    array['nanny_placements',       'parent_id'],
    array['nanny_placements',       'nanny_id'],
    array['precheck_notifications', 'nanny_id']
  ];
  v_action text;
  v_tbl    text;
begin
  -- HALF ONE: the clauses that were KEPT.
  foreach v_pair slice 1 in array v_pairs loop
    select c.confdeltype::text into v_action
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f'
       and c.conrelid = ('public.' || v_pair[1])::regclass
       and a.attname = v_pair[2];
    if v_action = 'c' then
      raise exception '0028 twin: public.%.% was handed its cascade back — that is the incident, not a rollback',
        v_pair[1], v_pair[2];
    end if;
  end loop;

  foreach v_tbl in array array['file_retention_log', 'account_erasure_requests'] loop
    if to_regclass('public.' || v_tbl) is null then
      raise exception '0028 twin: public.% was dropped — it is evidence that a right was exercised (ADR-165 (1))', v_tbl;
    end if;
  end loop;

  if (select count(*) from pg_trigger g
       where g.tgrelid = 'public.file_retention_log'::regclass and not g.tgisinternal) <> 2 then
    raise exception '0028 twin: file_retention_log lost an append-only guard — the deletion evidence became rewritable';
  end if;
  if (select count(*) from pg_trigger g
       where g.tgrelid = 'public.account_erasure_requests'::regclass and not g.tgisinternal) <> 2 then
    raise exception '0028 twin: account_erasure_requests lost its guard — a request could be marked completed with no scrub (database pass HIGH-3)';
  end if;
  foreach v_tbl in array array['account_erasure_requests', 'file_retention_log'] loop
    if has_table_privilege('service_role', 'public.' || v_tbl, 'update') then
      raise exception '0028 twin: service_role was handed UPDATE on public.% back — that is the hole, not a rollback', v_tbl;
    end if;
  end loop;

  -- HALF TWO: what the twin DID undo, so a half-run file is loud rather than silent.
  if to_regprocedure('public.erase_account(uuid, uuid, jsonb)') is not null then
    raise exception '0028 twin: erase_account() is still there — the twin did not complete';
  end if;
  if to_regprocedure('public.scrub_auth_user(uuid)') is not null then
    raise exception '0028 twin: scrub_auth_user() is still there — the twin did not complete';
  end if;
  if exists (
    select 1 from pg_proc p
     where p.oid = to_regprocedure('public.is_privileged_writer()')
       and p.prosrc like '%bbldn_retention%'
  ) then
    raise exception '0028 twin: is_privileged_writer() still admits bbldn_retention — the twin did not complete';
  end if;
end;
$$;

commit;
