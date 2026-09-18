-- 0024_connection-hold-write.rollback.sql — the twin of supabase/migrations/0024_connection-hold-write.sql (06 §4.2).
--
-- Restores `upsert_connection()` to its `0019` body, character for character: the create branch's INSERT loses
-- `held_for_verification` and `held_at` again. Nothing later references anything here (0024 is the last
-- migration), so this always succeeds on a database 0024 applied to. One transaction.
--
-- WHAT IS LOST, stated rather than hidden.
--
-- **New connections stop being held.** After this file a K-1 / K-2 / K-3 row for a nanny below L4 is written
-- with `held_for_verification = false` (0007's column default), so `0016`'s parent SELECT policy no longer hides
-- it and the family is notified about a nanny who is not fully verified. That is exactly the state every
-- environment was in before 0024 — the ADR-158 (2) feature is undone, and undoing a feature is what a twin is
-- for. **Rows already held stay held**: nothing here clears the pair, and `sync_nanny_verification_state()`
-- still releases them at L4.
--
-- **ADR-165, and why this twin is a clean inverse.** The rule is that a migration's *security clause* is
-- forward-only: a twin restores a feature and never a hole. 0024 carries no security clause — it changes no
-- grant, no policy, no predicate and no `search_path`; `upsert_connection()` is `service_role`-only and
-- `SECURITY DEFINER` with `search_path` pinned on both sides of this file, and 0007's
-- `connection_requests_held_at_check` is untouched throughout. The hold is a **product** rule (who is shown to
-- whom and when, ADR-158), not a measured security fix, and the state this file returns to is the one REVIEW-3
-- and 2c both measured without finding a hole in it. So there is nothing here to keep forward-only, and no
-- `RAISE EXCEPTION` gate is owed. The forward file's own verify block is what proves the pair is written; this
-- file's proves it is not.

begin;

create or replace function public.upsert_connection(
  p_id               uuid,
  p_position_id      uuid,
  p_parent_id        uuid,
  p_nanny_id         uuid,
  p_stage            public.connection_stage,
  p_origin           public.connection_origin,
  p_columns          jsonb,
  p_expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.connection_requests;
  v_in       public.connection_requests;
  v_patch    jsonb;
  v_created  timestamptz;
  v_expected integer := coalesce(p_expected_version, 0);
  v_version  integer;
begin
  v_patch := coalesce(p_columns, '{}'::jsonb)
             - 'id' - 'position_id' - 'parent_id' - 'nanny_id'
             - 'stage' - 'origin' - 'version' - 'created_at' - 'updated_at';

  if v_expected = 0 then
    if exists (select 1 from public.connection_requests cr where cr.id = p_id) then
      raise exception 'CONNECTION_EXISTS' using errcode = 'unique_violation';
    end if;
    v_in     := jsonb_populate_record(null::public.connection_requests, v_patch);
    v_created := coalesce((p_columns ->> 'created_at')::timestamptz, now());
  else
    select * into v_existing from public.connection_requests cr where cr.id = p_id for update;
    if not found then
      raise exception 'NOT_FOUND' using errcode = 'no_data_found';
    end if;
    if v_existing.version <> v_expected then
      raise exception 'VERSION_MISMATCH' using errcode = 'serialization_failure';
    end if;
    v_in     := jsonb_populate_record(v_existing, v_patch);
    v_created := v_existing.created_at;
  end if;

  -- 02 §4.2 row 7: <= 1 live connection per (position, nanny).
  --
  -- The nine terminal stages are written out as a literal list, twice, rather than held in a variable.
  -- Two reasons. They are named rather than derived from the enum's order for `0007`'s own stated
  -- reason: the branch values sort after ACTIVE because C-1 is add-only, so any `>=` form would quietly
  -- pull the terminal stages in. And they are a **literal** (fix: database-reviewer M-4) because a
  -- PL/pgSQL array variable is opaque to the planner, which then cannot match this predicate to
  -- `connection_requests_one_live_per_pair_idx`'s static partial-index WHERE clause and falls back to
  -- `connection_requests_nanny_stage_idx` plus an in-memory filter. The list here is character-for-
  -- character `0007`'s index predicate; if one ever changes, so must the other.
  if p_stage not in ('REQUEST_EXPIRED', 'DECLINED', 'REQUEST_CANCELLED', 'SCHEDULE_EXPIRED',
                     'NOT_HIRED', 'NOT_SELECTED', 'FINISHED',
                     'CANCELLED_BY_PARENT', 'CANCELLED_BY_NANNY')
     and exists (
       select 1 from public.connection_requests cr
        where cr.position_id = p_position_id
          and cr.nanny_id = p_nanny_id
          and cr.id <> p_id
          and cr.stage not in ('REQUEST_EXPIRED', 'DECLINED', 'REQUEST_CANCELLED', 'SCHEDULE_EXPIRED',
                               'NOT_HIRED', 'NOT_SELECTED', 'FINISHED',
                               'CANCELLED_BY_PARENT', 'CANCELLED_BY_NANNY')
     ) then
    raise exception 'CONNECTION_ALREADY_LIVE' using errcode = 'unique_violation';
  end if;

  -- 02 §4.2 row 7: <= 1 connection per position at OFFERED / CONFIRMED / ACTIVE.
  if p_stage in ('OFFERED', 'CONFIRMED', 'ACTIVE')
     and exists (
       select 1 from public.connection_requests cr
        where cr.position_id = p_position_id
          and cr.id <> p_id
          and cr.stage in ('OFFERED', 'CONFIRMED', 'ACTIVE')
     ) then
    raise exception 'POSITION_ALREADY_OFFERED' using errcode = 'unique_violation';
  end if;

  if v_expected = 0 then
    insert into public.connection_requests (
      id, position_id, parent_id, nanny_id, stage, origin, version, created_at,
      expires_at, meeting_at, meeting_set_by, meeting_outcome, trial_date, fill_initiated_by
    ) values (
      p_id, p_position_id, p_parent_id, p_nanny_id, p_stage, p_origin, 1, v_created,
      v_in.expires_at, v_in.meeting_at, v_in.meeting_set_by, v_in.meeting_outcome,
      v_in.trial_date, v_in.fill_initiated_by
    )
    returning version into v_version;
  else
    update public.connection_requests cr set
      position_id       = p_position_id,
      parent_id         = p_parent_id,
      nanny_id          = p_nanny_id,
      stage             = p_stage,
      origin            = p_origin,
      expires_at        = v_in.expires_at,
      meeting_at        = v_in.meeting_at,
      meeting_set_by    = v_in.meeting_set_by,
      meeting_outcome   = v_in.meeting_outcome,
      trial_date        = v_in.trial_date,
      fill_initiated_by = v_in.fill_initiated_by
    where cr.id = p_id and cr.version = v_expected
    returning cr.version into v_version;

    if v_version is null then
      raise exception 'VERSION_MISMATCH' using errcode = 'serialization_failure';
    end if;
  end if;

  return v_version;
end
$$;

comment on function public.upsert_connection(uuid, uuid, uuid, uuid, public.connection_stage,
  public.connection_origin, jsonb, integer) is
  '02 §7 / ADR-127: the K rows'' one write on connection_requests, with the C-9 compare-and-set and 02 §4.2 row 7''s two uniques raised by name. service_role only.';

revoke all on function public.upsert_connection(uuid, uuid, uuid, uuid, public.connection_stage,
  public.connection_origin, jsonb, integer) from public;
revoke all on function public.upsert_connection(uuid, uuid, uuid, uuid, public.connection_stage,
  public.connection_origin, jsonb, integer) from anon, authenticated;
grant execute on function public.upsert_connection(uuid, uuid, uuid, uuid, public.connection_stage,
  public.connection_origin, jsonb, integer) to service_role;


-- ---------------------------------------------------------------------------
-- Verify block — the inverse, read back from the live catalogue.
-- ---------------------------------------------------------------------------
do $$
declare
  v_oid oid;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'upsert_connection';
  if v_oid is null then
    raise exception '0024 rollback: upsert_connection() is missing';
  end if;

  -- the feature is gone
  if exists (select 1 from pg_proc p where p.oid = v_oid and p.prosrc ~ 'held_for_verification') then
    raise exception '0024 rollback: upsert_connection() must no longer name the held pair';
  end if;

  -- ADR-165: nothing about the security clause moved on the way back
  if has_function_privilege('authenticated', v_oid, 'execute')
     or has_function_privilege('anon', v_oid, 'execute') then
    raise exception '0024 rollback: upsert_connection() must not be executable by a client role';
  end if;
  if not has_function_privilege('service_role', v_oid, 'execute') then
    raise exception '0024 rollback: service_role must execute upsert_connection()';
  end if;
  if not exists (
    select 1 from pg_proc p
     where p.oid = v_oid and p.prosecdef
       and array_to_string(coalesce(p.proconfig, '{}'), ',') like '%search_path=%'
  ) then
    raise exception '0024 rollback: upsert_connection() must stay SECURITY DEFINER with search_path pinned';
  end if;
  if not exists (
    select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid
     where t.relname = 'connection_requests'
       and c.conname = 'connection_requests_held_at_check'
  ) then
    raise exception '0024 rollback: connection_requests_held_at_check is missing (0007 R-14)';
  end if;
end
$$;

commit;
