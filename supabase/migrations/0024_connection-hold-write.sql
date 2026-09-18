-- 0024_connection-hold-write.sql — the ordered migration set (02-data-model.md §6; ADR-158 (2))
--
-- Creates: nothing. Replaces **one function body** — `upsert_connection()` (`0019`) — so that the K rows can
-- write the silent hold's pair at creation.
--
-- WHY THIS EXISTS.
--   02 §4.2 row 7 has carried `held_for_verification` + `held_at` since `0007` (R-14: "held rows withhold parent
--   notification until L4"), `0016`'s parent SELECT policy already hides a held row from the family, and `0023`
--   built and proved the **release** — `sync_nanny_verification_state()` clears every held row for a nanny who
--   reaches L4 and counts what it released. What nothing did was **set** the flag: `0019`'s INSERT names its
--   columns one by one and the held pair is not among them, so `jsonb_populate_record` read them off `p_columns`
--   into `v_in` and then dropped them on the floor. `2c` measured exactly that and pinned it; this is the flip.
--
-- Forced by: nothing later. This is the last migration, the columns already exist, and the change is **additive
-- inside one function**: two more columns on the create branch's INSERT, nothing removed, no signature change,
-- no grant change, no policy touched. The set still applies forwards from an empty database in one pass.
-- Rollback twin: supabase/rollbacks/0024_connection-hold-write.rollback.sql
--
-- THE UPDATE BRANCH DELIBERATELY DOES NOT CARRY THE PAIR.
--   The hold is decided once, at creation, from the nanny's level; after that the only writer is the L4 release
--   in `sync_nanny_verification_state()`. If the UPDATE branch also wrote the pair, every later K row would
--   re-state a fact it does not own, and a K row that ran between the release and the next read would silently
--   put the hold back. So the UPDATE branch names neither column and Postgres leaves both as they are — which is
--   the same reason `0019` never listed them there.
--
-- WHOSE DECISION IT IS.
--   The level itself is not read here. `connections` reads the nanny's facts once, for K-1 / K-2 / K-3's
--   verification floor (I-5 and `MATCHING.minVerificationLevel`), and decides the hold from the same read — one
--   read, two decisions, no way for them to disagree. This function stays what it was: the one write every K row
--   makes, with the caller's columns applied and 02 §4.2 row 7's two uniques raised by name.

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
    -- ADR-158 (2) / 02 §4.2 row 7 — `held_for_verification` and `held_at` join the create branch (0024).
    -- `coalesce(..., false)` keeps a caller that names neither on `0007`'s NOT NULL DEFAULT false, and
    -- `0007`'s CHECK ties the flag to the instant, so it refuses any half-written pair.
    insert into public.connection_requests (
      id, position_id, parent_id, nanny_id, stage, origin, version, created_at,
      expires_at, meeting_at, meeting_set_by, meeting_outcome, trial_date, fill_initiated_by,
      held_for_verification, held_at
    ) values (
      p_id, p_position_id, p_parent_id, p_nanny_id, p_stage, p_origin, 1, v_created,
      v_in.expires_at, v_in.meeting_at, v_in.meeting_set_by, v_in.meeting_outcome,
      v_in.trial_date, v_in.fill_initiated_by,
      coalesce(v_in.held_for_verification, false), v_in.held_at
    )
    returning version into v_version;
  else
    -- The held pair is absent here on purpose (see the header): after creation the only writer is the L4
    -- release in `sync_nanny_verification_state()`, and a K row must not put a released hold back.
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
  '02 §7 / ADR-127: the K rows'' one write on connection_requests, with the C-9 compare-and-set and 02 §4.2 row 7''s two uniques raised by name. 0024 (ADR-158 (2)): the create branch also writes held_for_verification / held_at - the silent hold, decided by the K row from the nanny''s level; the update branch never touches them, because after creation the only writer is the L4 release in sync_nanny_verification_state(). service_role only.';

revoke all on function public.upsert_connection(uuid, uuid, uuid, uuid, public.connection_stage,
  public.connection_origin, jsonb, integer) from public;
revoke all on function public.upsert_connection(uuid, uuid, uuid, uuid, public.connection_stage,
  public.connection_origin, jsonb, integer) from anon, authenticated;
grant execute on function public.upsert_connection(uuid, uuid, uuid, uuid, public.connection_stage,
  public.connection_origin, jsonb, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Verify block — read back from the live catalogue, never argued.
-- ---------------------------------------------------------------------------
do $$
declare
  v_oid oid;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'upsert_connection';
  if v_oid is null then
    raise exception '0024: upsert_connection() is missing';
  end if;

  -- the create branch writes the pair (ADR-158 (2))
  if not exists (
    select 1 from pg_proc p
     where p.oid = v_oid
       and p.prosrc ~ 'held_for_verification, held_at'
       and p.prosrc ~ 'coalesce\(v_in\.held_for_verification, false\), v_in\.held_at'
  ) then
    raise exception '0024: upsert_connection() must insert held_for_verification / held_at (ADR-158 (2))';
  end if;

  -- the update branch does not (the release at L4 is the only other writer)
  if exists (
    select 1 from pg_proc p
     where p.oid = v_oid
       and p.prosrc ~ 'held_(for_verification|at)\s*=\s*v_in\.'
  ) then
    raise exception '0024: upsert_connection() must not assign the held pair on the update branch';
  end if;

  -- 0019's security clause is unchanged: service_role only, search_path pinned, SECURITY DEFINER
  if has_function_privilege('authenticated', v_oid, 'execute')
     or has_function_privilege('anon', v_oid, 'execute') then
    raise exception '0024: upsert_connection() must not be executable by a client role';
  end if;
  if not has_function_privilege('service_role', v_oid, 'execute') then
    raise exception '0024: service_role must execute upsert_connection()';
  end if;
  if not exists (
    select 1 from pg_proc p
     where p.oid = v_oid and p.prosecdef
       and array_to_string(coalesce(p.proconfig, '{}'), ',') like '%search_path=%'
  ) then
    raise exception '0024: upsert_connection() must stay SECURITY DEFINER with search_path pinned';
  end if;

  -- 0007's CHECK is what makes a half-written pair impossible; it must still be there
  if not exists (
    select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid
     where t.relname = 'connection_requests'
       and c.conname = 'connection_requests_held_at_check'
  ) then
    raise exception '0024: connection_requests_held_at_check is missing (0007 R-14)';
  end if;
end
$$;

commit;
