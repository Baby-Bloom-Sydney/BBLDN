-- 0019_write-definers.sql — the ordered migration set (02-data-model.md §6 row 0019)
--
-- Creates: `upsert_position()`, `upsert_connection()`, `upsert_placement()` (02 §7) — the three
-- `SECURITY DEFINER` writes ADR-127 leaves owed under `positions`, `connections` and `placements`.
--
-- Forced by: nothing later — like `0017` and `0018`, every object here is **additive** over
-- `0000`–`0018`. No table, column, policy, index or constraint is created, dropped, renamed or
-- narrowed, so the set still applies forwards from an empty database in one pass.
-- Rollback twin: supabase/rollbacks/0019_write-definers.rollback.sql
--
-- WHY THESE THREE FUNCTIONS EXIST.
--   ADR-127 settled that one unit of work is one RPC: 03 §1.4's `Query` is PostgREST-shaped, so two
--   statements are two transactions and nothing a caller groups can be atomic unless the database
--   groups it. The port enforces exactly that — `guard-unit-of-work-query.ts` replaces `insert` and
--   `update` with a refusal (`write-outside-rpc`) for every table reached under a `{ uow }`, and lets
--   exactly one `rpc()` through.
--   `0006` and `0007` then gave `nanny_positions`, `position_schedule`, `connection_requests` and
--   `nanny_placements` SELECT-only client policies (07 §5.1 rule 4 — "every write is `advance()` or
--   `amend()`") and **no definer to call instead**. Every position, connection and placement write
--   runs inside the caller's unit of work, so with both halves in force the parent chain could read
--   the schema and could not write it. P1-STORES measured that on the real wired port and pinned it
--   `it.fails` in `boot.test.ts` rather than guessing at a fix; this migration is the fix it named.
--
-- WHY `service_role` AND NOT `authenticated` (recorded, because the S5c brief asked for the opposite).
--   Each function takes the row's **stage** as an argument, and `0006` §4's own header says a parent
--   "may never touch `stage`, `call_*` or `precheck_*`". Granting `authenticated` EXECUTE on a definer
--   that writes `stage` would hand a signed-in parent precisely the power the policy set withholds —
--   she could drive her own position to `ACTIVE` without the stage model ever running. The precedent
--   is unambiguous in the same direction: `book_slot()` (`0009`) is the one definer 07 §5.1 rule 5
--   calls a user-session road, and `0009` grants it to `service_role` alone.
--   `auth.uid()` is also the wrong authority test here: every caller of these three — the P/K/L cascade
--   handlers running as `{ kind: 'system' }`, the `matching.autofire` job, the admin-on-behalf road
--   through the same connector — has no session at all, so `auth.uid()` is null for all of them.
--   **fix: database-reviewer H-1. There is no in-function authority check, and that is deliberate.**
--   These functions were first written with `if not public.is_privileged_writer() then raise` at the top,
--   described as a second layer that would hold "if EXECUTE is ever widened by mistake". That claim was
--   false and the review proved it: `is_privileged_writer()` reads `current_user`, and inside a
--   SECURITY DEFINER `current_user` is the function's **owner** — which this file's own verify block
--   requires to have BYPASSRLS. So the branch could never fire for any caller, from any role. It was the
--   same bug this migration diagnoses two hundred lines below for `children_stamp_creator`, and the
--   reasoning simply had not been carried back up. The checks are gone rather than left as false
--   comfort, which is also `upsert_call_mirror()`'s (`0018`) shape: **the grant IS the defence**, and it
--   is asserted three times — in this file's verify block, in `db.constraints`, and in `int.rpc-0019`,
--   which tries each function as a signed-in parent and as an anonymous visitor and expects 42501.
--
-- @adr ADR-127 — the transaction opener is the database function boundary. `upsert_position()` writes
--      `nanny_positions` AND `position_schedule` in one call for exactly this reason: the caller is
--      allowed one RPC per unit of work, so the roster cannot be a second statement.
-- @adr ADR-131 (1) — the keyed read these stores use to find the row they are about to write.
-- 02 §2 C-9 — the optimistic lock. The `bump_version` triggers (`0006` / `0007`) own every number
--      after the first; these functions do the compare-and-set the connectors already send, under a
--      `FOR UPDATE` lock so two concurrent writers cannot both read the same version and both win.
-- 02 §4.2 rows 4 / 7 / 9 — the stage-model uniqueness (I-1; the two K uniques; the two L uniques) is
--      raised **inside** each function, by name, before the partial unique index can answer with a
--      bare 23505 a caller cannot tell from any other duplicate. The indexes stay the real backstop;
--      this is the message, not the mechanism.
--
-- HOW `p_columns` WORKS, AND WHY IT IS NOT DYNAMIC SQL.
--   Each function takes the row's identity and stage as typed arguments and the rest of the columns
--   its one writer sends as a single `jsonb`. That `jsonb` is merged with `jsonb_populate_record()`
--   **over the stored row** on an update and over an empty row on a create, so an omitted key keeps
--   the value it had — which is the semantics the stores already have, where an `undefined` field is
--   left out of the patch entirely. `jsonb_populate_record` casts every value through the table's own
--   column types, so a malformed date or a bad enum is refused by the schema rather than by a second
--   copy of the rule in here, and the write itself is a **static, explicitly named column list**: no
--   dynamic SQL, no identifier interpolation, and the list is the audit of what this writer owns.
--   Reserved keys are stripped from the patch before the merge: `id`, `parent_id`, `source`, `stage`,
--   `version`, `created_at`, `updated_at` and `details` are arguments or triggers, and — on
--   `nanny_positions` — every `call_*` key is stripped too, so `upsert_call_mirror()` (`0018`) stays
--   the one writer of the call's state and the two cannot drift.

-- ---------------------------------------------------------------------------
-- 1. `upsert_position()` — the one write every P row makes (02 §7).
--
--    It is an upsert of the position and its roster, and deliberately NOT of the
--    parent: `parents` must already exist (the `parent_id` FK says so), so a
--    missing parent is an error the caller must see, not a row this function
--    invents. Same rule `upsert_call_mirror()` states for its position.
-- ---------------------------------------------------------------------------

create or replace function public.upsert_position(
  p_id               uuid,
  p_parent_id        uuid,
  p_source           public.position_source,
  p_stage            public.position_stage,
  p_columns          jsonb,
  p_details          jsonb,
  p_schedule         jsonb,
  p_expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.nanny_positions;
  v_in       public.nanny_positions;
  v_patch    jsonb;
  v_details  jsonb;
  v_created  timestamptz;
  v_expected integer := coalesce(p_expected_version, 0);
  v_version  integer;
begin
  v_patch := coalesce(p_columns, '{}'::jsonb)
             - 'id' - 'parent_id' - 'source' - 'stage' - 'version'
             - 'created_at' - 'updated_at' - 'details'
             - 'call_state' - 'call_type' - 'call_requested_at' - 'call_booking_id';

  if v_expected = 0 then
    if exists (select 1 from public.nanny_positions np where np.id = p_id) then
      raise exception 'POSITION_EXISTS' using errcode = 'unique_violation';
    end if;
    v_in      := jsonb_populate_record(null::public.nanny_positions, v_patch);
    v_details := p_details;
    v_created := coalesce((p_columns ->> 'created_at')::timestamptz, now());
  else
    -- FOR UPDATE is what makes the compare-and-set below a lock and not a race: without it two
    -- writers read the same version, both find it equal to what they expect, and both write.
    select * into v_existing from public.nanny_positions np where np.id = p_id for update;
    if not found then
      raise exception 'NOT_FOUND' using errcode = 'no_data_found';
    end if;
    if v_existing.version <> v_expected then
      raise exception 'VERSION_MISMATCH' using errcode = 'serialization_failure';
    end if;
    v_in      := jsonb_populate_record(v_existing, v_patch);
    v_details := coalesce(p_details, v_existing.details);
    v_created := v_existing.created_at;
  end if;

  -- I-1 / 02 §4.2 row 4: one live position per parent. Raised here so the caller gets a name; the
  -- partial unique index `nanny_positions_one_live_per_parent_idx` remains the thing that makes it
  -- true under concurrency.
  if p_stage in ('DRAFT', 'OPEN', 'CONNECTING', 'ACTIVE')
     and exists (
       select 1 from public.nanny_positions np
        where np.parent_id = p_parent_id
          and np.id <> p_id
          and np.stage in ('DRAFT', 'OPEN', 'CONNECTING', 'ACTIVE')
     ) then
    raise exception 'POSITION_ALREADY_LIVE' using errcode = 'unique_violation';
  end if;

  if v_expected = 0 then
    insert into public.nanny_positions (
      id, parent_id, source, stage, version, created_at, details,
      area, district, schedule_type,
      car_required, driving_licence_required, non_smoker_required, pets_ok_required,
      vaccination_required, minimum_nanny_age, language_preference, years_experience_min,
      start_date, activated_at, filled_by_nanny_id,
      end_reason, ended_at, close_reason, closed_at,
      precheck_fired_at, precheck_expires_at, precheck_wave_sent
    ) values (
      p_id, p_parent_id, p_source, p_stage, 1, v_created, v_details,
      v_in.area, v_in.district, v_in.schedule_type,
      v_in.car_required, v_in.driving_licence_required, v_in.non_smoker_required, v_in.pets_ok_required,
      v_in.vaccination_required, v_in.minimum_nanny_age,
      coalesce(v_in.language_preference, '{}'), v_in.years_experience_min,
      v_in.start_date, v_in.activated_at, v_in.filled_by_nanny_id,
      v_in.end_reason, v_in.ended_at, v_in.close_reason, v_in.closed_at,
      v_in.precheck_fired_at, v_in.precheck_expires_at, coalesce(v_in.precheck_wave_sent, 0)
    )
    returning version into v_version;
  else
    update public.nanny_positions np set
      source                   = p_source,
      stage                    = p_stage,
      details                  = v_details,
      area                     = v_in.area,
      district                 = v_in.district,
      schedule_type            = v_in.schedule_type,
      car_required             = v_in.car_required,
      driving_licence_required = v_in.driving_licence_required,
      non_smoker_required      = v_in.non_smoker_required,
      pets_ok_required         = v_in.pets_ok_required,
      vaccination_required     = v_in.vaccination_required,
      minimum_nanny_age        = v_in.minimum_nanny_age,
      language_preference      = coalesce(v_in.language_preference, '{}'),
      years_experience_min     = v_in.years_experience_min,
      start_date               = v_in.start_date,
      activated_at             = v_in.activated_at,
      filled_by_nanny_id       = v_in.filled_by_nanny_id,
      end_reason               = v_in.end_reason,
      ended_at                 = v_in.ended_at,
      close_reason             = v_in.close_reason,
      closed_at                = v_in.closed_at,
      precheck_fired_at        = v_in.precheck_fired_at,
      precheck_expires_at      = v_in.precheck_expires_at,
      precheck_wave_sent       = coalesce(v_in.precheck_wave_sent, 0)
    -- the version predicate is carried as well as checked above: the row is locked, so this can only
    -- fail if something inside this transaction moved it, and then failing is right (02 C-9).
    where np.id = p_id and np.version = v_expected
    returning np.version into v_version;

    if v_version is null then
      raise exception 'VERSION_MISMATCH' using errcode = 'serialization_failure';
    end if;
  end if;

  -- 02 §4.2 row 6: the roster is keyed on the position, so it is a delete-free upsert of one row.
  -- A null `p_schedule` means "the record carries no roster", which 02 §4.2 row 6 reads as flexible /
  -- full marks — the absence of a row, not an empty one. It therefore does NOT delete an existing
  -- roster: `Query` has no delete and the module has never asked for one, so inventing a destructive
  -- path here would be a rule this migration made up.
  if p_schedule is not null then
    insert into public.position_schedule (position_id, schedule)
    values (p_id, p_schedule)
    on conflict (position_id) do update set schedule = excluded.schedule;
  end if;

  return v_version;
end
$$;

comment on function public.upsert_position(uuid, uuid, public.position_source, public.position_stage,
  jsonb, jsonb, jsonb, integer) is
  '02 §7 / ADR-127: the P rows'' one write. nanny_positions + position_schedule in a single transaction, with the C-9 compare-and-set on version and I-1 raised by name. service_role only - it takes `stage`, which 0006 §4 says a parent may never touch.';

revoke all on function public.upsert_position(uuid, uuid, public.position_source, public.position_stage,
  jsonb, jsonb, jsonb, integer) from public;
revoke all on function public.upsert_position(uuid, uuid, public.position_source, public.position_stage,
  jsonb, jsonb, jsonb, integer) from anon, authenticated;
grant execute on function public.upsert_position(uuid, uuid, public.position_source, public.position_stage,
  jsonb, jsonb, jsonb, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 2. `upsert_connection()` — the one write every K row makes (02 §7).
--
--    `connection_requests.parent_id` is denormalised from the position (`0007`'s
--    own comment) and is kept consistent "by connections.advance(), which writes
--    both rows in one unit of work" — so it is an argument here rather than a
--    `p_columns` key, and the caller cannot omit it into staleness.
-- ---------------------------------------------------------------------------

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
-- 3. `upsert_placement()` — the one write every L row makes (02 §7).
--
--    `p_connection_id` is an argument rather than a `p_columns` key because it is
--    the unique FK `nanny_placements_connection_source_check` reads, and because
--    the store that sends it reads a missing connection back as the empty string
--    (`row.connection_id ?? ''`). An empty string is the absent connection and is
--    written as NULL here as well as in the store, so neither half can put a value
--    into a uuid column that a uuid column cannot hold.
--
--    The I-3 backstop `enforce_placement_position_active()` (`0007`) is unchanged
--    and is DEFERRABLE INITIALLY DEFERRED, so it fires at COMMIT — after this
--    function returns. That is what lets an L-1 be written in the same transaction
--    as the P-5 that activates its position, and nothing here may pre-empt it.
-- ---------------------------------------------------------------------------

create or replace function public.upsert_placement(
  p_id               uuid,
  p_position_id      uuid,
  p_parent_id        uuid,
  p_nanny_id         uuid,
  p_source           public.placement_source,
  p_state            public.placement_state,
  p_columns          jsonb,
  -- `default null` for the same reason `0018` gives: `Query.rpc` is typed from `database.types.ts`,
  -- and the generator has no way to say "this argument may be null", so a required `p_connection_id`
  -- would be spelled `string` and force every caller of an `invite_shell` placement to pass a `null`
  -- the type rejects. Omitting the argument IS the null. `p_expected_version` takes a default only
  -- because a defaulted argument may not precede a non-defaulted one; `0` is what a create sends.
  p_connection_id    uuid    default null,
  p_expected_version integer default 0
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.nanny_placements;
  v_in       public.nanny_placements;
  v_patch    jsonb;
  v_created  timestamptz;
  v_expected integer := coalesce(p_expected_version, 0);
  v_version  integer;
begin
  v_patch := coalesce(p_columns, '{}'::jsonb)
             - 'id' - 'position_id' - 'parent_id' - 'nanny_id' - 'connection_id'
             - 'source' - 'state' - 'version' - 'created_at' - 'updated_at';

  if v_expected = 0 then
    if exists (select 1 from public.nanny_placements np where np.id = p_id) then
      raise exception 'PLACEMENT_EXISTS' using errcode = 'unique_violation';
    end if;
    v_in     := jsonb_populate_record(null::public.nanny_placements, v_patch);
    v_created := coalesce((p_columns ->> 'created_at')::timestamptz, now());
  else
    select * into v_existing from public.nanny_placements np where np.id = p_id for update;
    if not found then
      raise exception 'NOT_FOUND' using errcode = 'no_data_found';
    end if;
    if v_existing.version <> v_expected then
      raise exception 'VERSION_MISMATCH' using errcode = 'serialization_failure';
    end if;
    v_in     := jsonb_populate_record(v_existing, v_patch);
    v_created := v_existing.created_at;
  end if;

  -- 02 §4.2 row 9: <= 1 non-ENDED placement per position, and <= 1 per parent.
  if p_state <> 'ENDED' then
    if exists (
      select 1 from public.nanny_placements np
       where np.position_id = p_position_id and np.id <> p_id and np.state <> 'ENDED'
    ) then
      raise exception 'PLACEMENT_ALREADY_LIVE' using errcode = 'unique_violation';
    end if;
    if exists (
      select 1 from public.nanny_placements np
       where np.parent_id = p_parent_id and np.id <> p_id and np.state <> 'ENDED'
    ) then
      raise exception 'PARENT_ALREADY_PLACED' using errcode = 'unique_violation';
    end if;
  end if;

  if v_expected = 0 then
    insert into public.nanny_placements (
      id, position_id, parent_id, nanny_id, connection_id, source, state, version, created_at,
      weekly_hours, hourly_rate_pence, start_date, started_at, ended_at, end_reason, end_notes
    ) values (
      p_id, p_position_id, p_parent_id, p_nanny_id, p_connection_id, p_source, p_state, 1, v_created,
      v_in.weekly_hours, v_in.hourly_rate_pence, v_in.start_date,
      v_in.started_at, v_in.ended_at, v_in.end_reason, v_in.end_notes
    )
    returning version into v_version;
  else
    update public.nanny_placements np set
      position_id       = p_position_id,
      parent_id         = p_parent_id,
      nanny_id          = p_nanny_id,
      connection_id     = p_connection_id,
      source            = p_source,
      state             = p_state,
      weekly_hours      = v_in.weekly_hours,
      hourly_rate_pence = v_in.hourly_rate_pence,
      start_date        = v_in.start_date,
      started_at        = v_in.started_at,
      ended_at          = v_in.ended_at,
      end_reason        = v_in.end_reason,
      end_notes         = v_in.end_notes
    where np.id = p_id and np.version = v_expected
    returning np.version into v_version;

    if v_version is null then
      raise exception 'VERSION_MISMATCH' using errcode = 'serialization_failure';
    end if;
  end if;

  return v_version;
end
$$;

comment on function public.upsert_placement(uuid, uuid, uuid, uuid, public.placement_source,
  public.placement_state, jsonb, uuid, integer) is
  '02 §7 / ADR-127: the L rows'' one write on nanny_placements, with the C-9 compare-and-set and 02 §4.2 row 9''s two uniques raised by name. The I-3 deferred constraint trigger still fires at COMMIT. service_role only.';

revoke all on function public.upsert_placement(uuid, uuid, uuid, uuid, public.placement_source,
  public.placement_state, jsonb, uuid, integer) from public;
revoke all on function public.upsert_placement(uuid, uuid, uuid, uuid, public.placement_source,
  public.placement_state, jsonb, uuid, integer) from anon, authenticated;
grant execute on function public.upsert_placement(uuid, uuid, uuid, uuid, public.placement_source,
  public.placement_state, jsonb, uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 4. `children.created_by_user_id`, and the fourth arm `user_has_child_access()` owes it.
--
--    04 §4.4 c1 has a nanny add an existing client's child and mint a
--    `nanny_to_parent` token for that family. `1i` stopped on it rather than
--    guessing: `children` has **no creator column**, and `user_has_child_access()`
--    (`0012`) admits only the child's parent, an actively linked nanny, or an
--    admin — so the nanny cannot read back the row she has just inserted, let
--    alone prove it is hers. `1i` pinned it `it.fails` and named 02 §4.6 as the
--    owner. Both halves land here, because either alone is useless: the column
--    records who created the row, and the arm is what lets her read it.
--
--    **The arm is deliberately narrow: the creator of an UNCLAIMED child.** Once
--    `parent_user_id` is set the child belongs to a family, and the creator needs
--    an active `child_client` link like any other nanny — which is exactly the
--    third arm. A creator arm without the `parent_user_id is null` clause would
--    give whoever first typed a child's name a permanent read on that family's
--    record, which 07 §5.2's "`user_has_child_access` on every read and write"
--    exists to prevent.
--
--    **The column is stamped by a trigger, not trusted from the caller.**
--    `0012`'s `children_nanny_insert` policy lets any nanny insert a row with
--    `parent_user_id is null`; if the creator column were merely writable, a
--    nanny could name somebody else as the creator and hand a stranger the read
--    this arm grants. A BEFORE INSERT trigger stamps `auth.uid()` for every
--    non-privileged caller instead, so the column cannot be spoofed and no
--    existing policy has to be narrowed (which would break every parent's
--    child-create, since none of them sends the column).
--    `guard_children_protected_columns()` (`0012`) is a whitelist of the columns
--    a client may UPDATE and does not list this one, so it is write-once by
--    construction — no new guard is needed and none is added.
-- ---------------------------------------------------------------------------

alter table public.children
  add column if not exists created_by_user_id uuid
    references auth.users (id) on delete set null;

comment on column public.children.created_by_user_id is
  '04 §4.4 c1 / L-007 1i: who inserted this row. Stamped from the session by children_stamp_creator, never trusted from the caller. Reads back through user_has_child_access() only while the child is unclaimed (parent_user_id is null).';

-- `0006`'s database-reviewer M-3, same rule: an ON DELETE SET NULL FK without a covering index makes every
-- `auth.users` delete a sequential scan of this table.
create index if not exists children_created_by_idx
  on public.children (created_by_user_id)
  where created_by_user_id is not null;

-- **SECURITY INVOKER, deliberately — and found by invoking it, not by reading it.** Written first as a
-- definer, this trigger stamped nothing: `0000`'s own comment says `is_privileged_writer()` is true for
-- "any SECURITY DEFINER owned by" the schema owner, so inside a definer trigger it is ALWAYS true and the
-- branch below never ran. The nanny's INSERT then succeeded with a null creator and her `RETURNING id`
-- was refused by `children_access_select`, which is the exact symptom `1i` pinned. `0012`'s own column
-- guards (`guard_children_protected_columns`, `guard_subscribe_invite_columns`) are invoker for the same
-- reason; this one now matches them, and the verify block asserts it rather than trusting the next editor.
create or replace function public.children_stamp_creator()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- A privileged writer (the module at service scope, a definer, a migration) keeps whatever it sent: it is
  -- the one caller that can legitimately create a child on somebody else's behalf, and `auth.uid()` is null
  -- for it anyway (0000's note on `is_privileged_writer()`).
  if not public.is_privileged_writer() then
    new.created_by_user_id := auth.uid();
  end if;
  return new;
end;
$$;

comment on function public.children_stamp_creator is
  '04 §4.4 c1: the creator is the session, not an argument. Without this, 0012 children_nanny_insert would let a nanny name a stranger as creator and hand them the read user_has_child_access grants an unclaimed child.';

-- `0000` §3's discipline, applied without exception: PUBLIC keeps EXECUTE on a new function by default.
-- A trigger function is not reachable through PostgREST, so this is hygiene rather than a hole - and 0000
-- makes the same revoke for the same reason on every one of its own trigger functions.
revoke all on function public.children_stamp_creator() from public;

drop trigger if exists children_stamp_creator on public.children;
create trigger children_stamp_creator
  before insert on public.children
  for each row execute function public.children_stamp_creator();

-- The fourth arm. Replaced whole rather than patched, because `0012` wrote it as one `select` and a
-- policy that reads it must keep reading one object. **The first three arms are `0012`'s, behaviour for
-- behaviour, including its `p_child_id is not null` guard** — restored after database-reviewer M-1
-- measured that dropping it changed the answer for an admin caller with a null argument from `false` to
-- `true`. Nothing passes a null today (`development_images_access_select`, the one policy over a
-- nullable `child_id`, guards it itself), which is exactly why the guard has to be kept rather than
-- reasoned away: the next policy that forgets its own guard is the one that would find out.
create or replace function public.user_has_child_access(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_child_id is not null and (
    (select public.is_admin())
    or exists (
      select 1 from public.children c
       where c.id = p_child_id and c.parent_user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.child_client cc
       where cc.child_id = p_child_id
         and cc.state = 'active'
         and ((select auth.uid()) in (cc.nanny_user_id, cc.parent_user_id))
    )
    -- 04 §4.4 c1 (0019): the creator of a child no family has claimed yet.
    or exists (
      select 1 from public.children c
       where c.id = p_child_id
         and c.parent_user_id is null
         and c.created_by_user_id = (select auth.uid())
    )
  );
$$;

comment on function public.user_has_child_access is
  '0012 + 0019: the one RLS predicate for every app table. Admin, the child''s parent, an actively linked party, and - since 0019 - the creator of a child that is still unclaimed (04 §4.4 c1).';

revoke all on function public.user_has_child_access(uuid) from public;
grant execute on function public.user_has_child_access(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. `create_child_invite()` and `revoke_child_invite()` — 07 §5.2's missing halves.
--
--    07 §5.2 row `children · child_client · child_invites` ends "links and
--    invites written only by the RPCs", and `0012` says the same in its own
--    words — yet `0012` shipped the **claim** (`connect_child_invite`) and the
--    unlinks and no mint and no revoke. `child_invites` carries exactly one
--    policy, a SELECT, so there is no legal client road to either write; `1i`
--    made both service-scoped and pinned the gap, noting that
--    `invite-authorisation.ts` is then the **only** gate and nothing in Postgres
--    stands behind it. These two put the same two rules in SQL.
--
--    **These two ARE the user-session road, and their `EXECUTE` says so.** Unlike
--    §§1-3, the authority here is genuinely the caller's: a parent mints for her
--    own child, a nanny for a child she created or is linked to, an admin for
--    either. `auth.uid()` is therefore the right test and a null one is refused
--    outright, so a service-scope call fails loudly instead of quietly minting
--    with no authority. **Consequence the wiring owes:** the module's store calls
--    both writes at `{ scope: "service" }` today; moving them onto these
--    functions means moving them to session scope.
--
--    **The token is the caller's, and the reason is one owner per rule.**
--    `1i` proposed `create_child_invite(p_child_id, p_direction)` with the
--    function minting. It takes `p_token` instead: the alphabet
--    (`invite-token-alphabet.ts`, Crockford's 32 minus I/L/O/U) and the
--    collision retry already live in one place that can retry, and a second
--    generator in DDL is a second place for them to drift. The shape is still
--    refused twice - here, and by `0012`'s own
--    `child_invites_token_shape_check`. **No rotation:** there is no argument
--    that replaces a pending token, because a pending invite is returned as it
--    stands; revoke is the only invalidation path, which is `0012`'s own
--    assertion ("child_invites has no expiry column").
-- ---------------------------------------------------------------------------

create or replace function public.create_child_invite(
  p_child_id  uuid,
  p_direction public.invite_direction,
  p_token     text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := auth.uid();
  v_child  public.children;
  v_id     uuid;
begin
  if v_actor is null then
    raise exception 'INVITE_NO_SESSION' using errcode = '42501';
  end if;

  -- fix: database-reviewer L-1. The row is read but a missing one is NOT a refusal of its own: a
  -- separate `INVITE_CHILD_NOT_FOUND` would let any signed-in caller probe whether an arbitrary uuid is
  -- a `children.id`, which is the enumeration oracle 07 §4 forbids. "No such child" falls through the
  -- authorisation below and comes back as `INVITE_NOT_YOURS`, the same line as every other failure.
  select * into v_child from public.children c where c.id = p_child_id;

  -- `invite-authorisation.ts` `mayMint`, in SQL. One refusal for every way it can fail, so a caller
  -- cannot tell "not your child" from "wrong direction for your role" from "no such child" (07 §4).
  if v_child.id is null or not (
    (select public.is_admin())
    or (p_direction = 'parent_to_nanny' and v_child.parent_user_id = v_actor)
    or (
      p_direction = 'nanny_to_parent'
      and (select public.is_nanny())
      and v_child.parent_user_id is null
      and (
        v_child.created_by_user_id = v_actor
        or exists (
          select 1 from public.child_client cc
           where cc.child_id = p_child_id and cc.state = 'active' and cc.nanny_user_id = v_actor
        )
      )
    )
  ) then
    raise exception 'INVITE_NOT_YOURS' using errcode = 'insufficient_privilege';
  end if;

  if p_token !~ '^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$' then
    raise exception 'INVITE_TOKEN_MALFORMED' using errcode = 'invalid_parameter_value';
  end if;

  -- Idempotent through `child_invites_one_pending_per_direction_idx` rather than beside it: the pending
  -- invite for this (child, direction) IS the answer, and a caller that asks twice gets the same token
  -- rather than a second one that would invalidate the link already passed to a family.
  --
  -- fix: database-reviewer M-3. This was a `select`-then-`insert`, which two concurrent mints can both
  -- pass before either commits — the loser then got a bare 23505 instead of the winner's id, so the
  -- idempotency the comment promised was true single-threaded and false under load. `ON CONFLICT … DO
  -- NOTHING` is what closes it: the loser **blocks** on the winner's row until it commits, writes
  -- nothing, and the read below therefore sees a committed row rather than a snapshot that predates it.
  insert into public.child_invites (child_id, token, direction, created_by_user_id)
  values (p_child_id, p_token, p_direction, v_actor)
  on conflict (child_id, direction) where status = 'pending' do nothing
  returning id into v_id;

  if v_id is null then
    select i.id into v_id
      from public.child_invites i
     where i.child_id = p_child_id and i.direction = p_direction and i.status = 'pending';
    if not found then
      -- The conflict was real and the row is gone again: the pending invite was revoked between the
      -- insert and this read. Refused rather than retried, because a retry loop here is a lock held
      -- open on a row somebody else is actively changing.
      raise exception 'INVITE_MINT_RACE' using errcode = 'serialization_failure';
    end if;
  end if;

  return v_id;
end;
$$;

comment on function public.create_child_invite is
  '07 §5.2 / 02 §7 (0019): the mint 0012 never shipped. mayMint asserted in SQL, the token minted by the caller and shape-checked here and by 0012''s CHECK, idempotent on the one pending invite per (child, direction). authenticated only - the authority is the session.';

create or replace function public.revoke_child_invite(
  p_invite_id uuid,
  p_reason    public.invite_revoked_reason
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := auth.uid();
  v_invite public.child_invites;
begin
  if v_actor is null then
    raise exception 'INVITE_NO_SESSION' using errcode = '42501';
  end if;

  select * into v_invite from public.child_invites i where i.id = p_invite_id for update;
  if not found then
    raise exception 'INVITE_NOT_FOUND' using errcode = 'no_data_found';
  end if;

  -- `mayRevoke`: the creator, or an admin. Same one refusal either way.
  if not ((select public.is_admin()) or v_invite.created_by_user_id = v_actor) then
    raise exception 'INVITE_NOT_YOURS' using errcode = 'insufficient_privilege';
  end if;

  -- A terminal invite is returned unchanged, never un-revoked and never re-revoked: `connected` is a claim
  -- that already happened, and `revoked` already carries the reason and the instant it was revoked at.
  if v_invite.status <> 'pending' then
    return false;
  end if;

  update public.child_invites i
     set status = 'revoked', revoked_at = now(), revoked_reason = p_reason
   where i.id = p_invite_id;

  return true;
end;
$$;

comment on function public.revoke_child_invite is
  '07 §5.2 / 02 §7 (0019): the revoke 0012 never shipped, and the ONLY invalidation path for a token - there is no rotation and no expiry (0012''s own assertion). mayRevoke asserted in SQL. authenticated only.';

revoke all on function public.create_child_invite(uuid, public.invite_direction, text) from public, anon;
revoke all on function public.revoke_child_invite(uuid, public.invite_revoked_reason) from public, anon;
grant execute on function public.create_child_invite(uuid, public.invite_direction, text) to authenticated;
grant execute on function public.revoke_child_invite(uuid, public.invite_revoked_reason) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. `apply_payment_event()` — the webhook's two writes, made one (ADR-127).
--
--    `1h` shipped `handleWebhook` as 03 §5.4.3's ordered spine and wrote the gap
--    into the file rather than hiding it: "this spine is a ledger **insert** then
--    a spine **update** — two table writes... Making it atomic means a new
--    SECURITY DEFINER function and therefore a migration, which this unit may not
--    write." This is that function.
--
--    **What it does NOT take over.** The signature verification (07 §10.1), the
--    family resolution and the transition table (`dispatch-purchase-event.ts`)
--    stay in TypeScript, where they are pure and tested. The function is handed a
--    decided patch and applies it; it decides nothing about money.
--
--    **The ordering rule survives, in a better form.** `1h` inserted the ledger
--    row first so that a crash left a *visible unprocessed delivery* rather than
--    a lost one, and reconciled from `payment_events.processed_at IS NULL`
--    (`0010` §2). Inside one transaction the failure mode changes and improves:
--    a failure rolls the ledger row back too, so the delivery is neither applied
--    nor recorded, and the provider retries it. The unprocessed-delivery index
--    still earns its place — the `unresolved` outcome below commits a ledger row
--    with its `processing_error` and no spine write, which is exactly the row the
--    runbook wants to see.
--
--    **Idempotency is unchanged and is the table's.** `ON CONFLICT ON CONSTRAINT
--    payment_events_provider_event_key DO NOTHING` returning nothing IS the
--    duplicate, so a replay costs one statement and touches no money.
--
--    `p_access_age_years` is a required-when-used number rather than a SQL
--    default, for `0010`'s stated reason: `PRICES.accessAgeYears` is config and
--    L4 forbids a product literal outside `config/`.
-- ---------------------------------------------------------------------------

create or replace function public.apply_payment_event(
  p_provider          text,
  p_provider_event_id text,
  p_event_type        text,
  p_payload           jsonb,
  p_received_at       timestamptz,
  p_parent_user_id    uuid    default null,
  p_spine_patch       jsonb   default null,
  p_access_age_years  integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id     uuid;
  v_spine        public.parent_subscriptions;
  v_in           public.parent_subscriptions;
  v_patch        jsonb;
  v_access_until timestamptz;
begin
  insert into public.payment_events
    (provider, provider_event_id, event_type, payload, received_at)
  values
    (p_provider, p_provider_event_id, p_event_type, p_payload,
     coalesce(p_received_at, now()))
  on conflict on constraint payment_events_provider_event_key do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return jsonb_build_object('outcome', 'duplicate', 'event_id', null);
  end if;

  if p_parent_user_id is null then
    update public.payment_events e
       set processing_error = 'E_EVENT_UNRESOLVED'
     where e.id = v_event_id;
    return jsonb_build_object('outcome', 'unresolved', 'event_id', v_event_id);
  end if;

  if p_spine_patch is not null then
    select * into v_spine
      from public.parent_subscriptions s
     where s.parent_user_id = p_parent_user_id
       for update;
    if not found then
      -- I-M1: the spine row is minted before a purchase can be dispatched against it. A missing one is
      -- the same shape `set_access_window` refuses on, and it is recorded rather than invented.
      update public.payment_events e
         set processing_error = 'E_SPINE_MISSING', parent_user_id = p_parent_user_id
       where e.id = v_event_id;
      return jsonb_build_object('outcome', 'unresolved', 'event_id', v_event_id);
    end if;

    v_patch := p_spine_patch
               - 'id' - 'parent_user_id' - 'created_at' - 'updated_at'
               -- `access_until` is `set_access_window()`'s alone (`0010`; ADR-083 / 084), and this
               -- function calls it below rather than letting a patch reach the column directly.
               - 'access_until';
    v_in := jsonb_populate_record(v_spine, v_patch);

    update public.parent_subscriptions s set
      status                 = v_in.status,
      plan_shape             = v_in.plan_shape,
      purchase_path          = v_in.purchase_path,
      purchased_at           = v_in.purchased_at,
      instalments_total      = v_in.instalments_total,
      instalments_paid       = v_in.instalments_paid,
      price_pence            = v_in.price_pence,
      price_preset           = v_in.price_preset,
      deposit_pence          = v_in.deposit_pence,
      deposit_paid_at        = v_in.deposit_paid_at,
      deposit_refunded_at    = v_in.deposit_refunded_at,
      current_period_ends_at = v_in.current_period_ends_at,
      past_due_grace_ends_at = v_in.past_due_grace_ends_at,
      cancelled_at           = v_in.cancelled_at
    where s.id = v_spine.id;

    -- ADR-083 / 084, and the same condition `handleWebhook` applies: the window is recomputed on a
    -- transition that moved the status, and only then. In this transaction, so a paid delivery cannot
    -- leave a spine that says `paid_in_full` beside a window that was never opened.
    if p_spine_patch ? 'status' and p_access_age_years is not null then
      v_access_until := public.set_access_window(p_parent_user_id, p_access_age_years);
    end if;
  end if;

  update public.payment_events e
     set processed_at = now(), parent_user_id = p_parent_user_id
   where e.id = v_event_id;

  return jsonb_build_object(
    'outcome', 'applied',
    'event_id', v_event_id,
    'access_until', v_access_until
  );
end;
$$;

comment on function public.apply_payment_event is
  '03 §5.4.3 / ADR-127 (0019): the webhook''s ledger insert, spine update and processed_at stamp in one transaction - the fold 1h named and could not write. Decides nothing about money: the signature check, the family resolution and the transition table stay in TypeScript. service_role only.';

revoke all on function public.apply_payment_event(
  text, text, text, jsonb, timestamptz, uuid, jsonb, integer) from public;
revoke all on function public.apply_payment_event(
  text, text, text, jsonb, timestamptz, uuid, jsonb, integer) from anon, authenticated;
grant execute on function public.apply_payment_event(
  text, text, text, jsonb, timestamptz, uuid, jsonb, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Verify — the migration asserts its own result (02 §6; `0017` / `0018`'s pattern).
--
--    Metadata only, and it says so: S5b's lesson on `0017` was that 151 metadata
--    assertions passed over a function that could not insert a row. What follows
--    proves the three objects exist with the right security properties and the
--    right grants; that they can actually write is `int.rpc-0019`'s job, and that
--    suite is what a reviewer should ask for, not more of this.
-- ---------------------------------------------------------------------------

do $$
declare
  v_fn        text;
  v_sig       text;
  v_sigs      text[] := array[
    'public.upsert_position(uuid, uuid, public.position_source, public.position_stage, jsonb, jsonb, jsonb, integer)',
    'public.upsert_connection(uuid, uuid, uuid, uuid, public.connection_stage, public.connection_origin, jsonb, integer)',
    'public.upsert_placement(uuid, uuid, uuid, uuid, public.placement_source, public.placement_state, jsonb, uuid, integer)'
  ];
  v_names     text[] := array['upsert_position', 'upsert_connection', 'upsert_placement'];
  v_i         integer;
  v_count     integer;
begin
  for v_i in 1 .. array_length(v_sigs, 1) loop
    v_sig := v_sigs[v_i];
    v_fn  := v_names[v_i];

    if to_regprocedure(v_sig) is null then
      raise exception '0019: %() missing', v_fn;
    end if;

    -- a leftover overload is a definer nobody granted on purpose (`0018`'s check)
    select count(*) into v_count
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn;
    if v_count <> 1 then
      raise exception '0019: expected exactly 1 %() overload, found %', v_fn, v_count;
    end if;

    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_fn
        and p.prosecdef and p.proconfig is not null and 'search_path=""' = any(p.proconfig)
    ) then
      raise exception '0019: %() must be SECURITY DEFINER with search_path pinned (02 §7)', v_fn;
    end if;

    -- `0017`'s database-reviewer M-1: a definer over a FORCE RLS table reaches it only because the
    -- owner has BYPASSRLS. If ownership ever differed, these would write nothing, silently.
    if exists (
      select 1 from pg_proc p join pg_roles r on r.oid = p.proowner
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_fn
        and not (r.rolbypassrls or r.rolsuper)
    ) then
      raise exception '0019: %() is owned by a role without BYPASSRLS; FORCE RLS would make it write nothing, silently (0002''s rule)', v_fn;
    end if;

    -- 07 §5.1 rule 5, and the reason recorded in this file's header: these take `stage`, and
    -- `0006` §4 says a parent may never touch it.
    if has_function_privilege('anon', v_sig, 'execute')
       or has_function_privilege('authenticated', v_sig, 'execute') then
      raise exception '0019: %() must be service_role only - it writes `stage` (0006 §4; 07 §5.1 rule 5)', v_fn;
    end if;
    if not has_function_privilege('service_role', v_sig, 'execute') then
      raise exception '0019: %() must be EXECUTE-able by service_role, which is the only caller there is', v_fn;
    end if;
  end loop;

  -- The migration is additive: it creates no table, and the four it writes are `0006` / `0007`'s.
  if to_regclass('public.nanny_positions') is null
     or to_regclass('public.position_schedule') is null
     or to_regclass('public.connection_requests') is null
     or to_regclass('public.nanny_placements') is null then
    raise exception '0019: one of the four tables 0019 writes is missing (0006 / 0007)';
  end if;

  -- The partial uniques stay the backstop behind the named refusals. If one were dropped, the
  -- functions would still raise on the read-then-check path and lose under concurrency.
  if to_regclass('public.nanny_positions_one_live_per_parent_idx') is null
     or to_regclass('public.connection_requests_one_live_per_pair_idx') is null
     or to_regclass('public.connection_requests_one_offer_per_position_idx') is null
     or to_regclass('public.nanny_placements_one_live_per_position_idx') is null
     or to_regclass('public.nanny_placements_one_live_per_parent_idx') is null then
    raise exception '0019: a stage-model partial unique index this migration raises by name is missing';
  end if;

  -- One writer per column (this file's header): `upsert_position` must not write the call mirror's
  -- state, which `upsert_call_mirror()` (0018) owns. Asserted on the source, because the stripping
  -- is a line of code and not an object anything else can see.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'upsert_position'
      and p.prosrc !~ 'call_booking_id'
  ) then
    raise exception '0019: upsert_position() must strip the call_* keys so upsert_call_mirror() stays their one writer';
  end if;

  -- §4 — the creator column, its index, its stamp trigger, and the fourth arm.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'children'
      and column_name = 'created_by_user_id' and is_nullable = 'YES'
  ) then
    raise exception '0019: children.created_by_user_id missing or NOT NULL (04 §4.4 c1) - every existing row has no creator and always will';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.children'::regclass and contype = 'f'
      and conname = 'children_created_by_user_id_fkey' and confdeltype = 'n'
  ) then
    raise exception '0019: children.created_by_user_id must be a FK to auth.users ON DELETE SET NULL';
  end if;

  if to_regclass('public.children_created_by_idx') is null then
    raise exception '0019: children_created_by_idx missing - an ON DELETE SET NULL FK with no covering index (0006''s M-3)';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.children'::regclass and tgname = 'children_stamp_creator'
  ) then
    raise exception '0019: the children_stamp_creator trigger is missing - the column would be caller-supplied and spoofable';
  end if;

  -- The one that was measured, not reasoned: as a SECURITY DEFINER this function stamps NOTHING, because
  -- `is_privileged_writer()` is true for any definer the schema owner owns (0000's own comment). The
  -- nanny's insert then lands with a null creator and her own RETURNING is refused by
  -- children_access_select - which is exactly the symptom 1i pinned this migration to fix.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'children_stamp_creator' and p.prosecdef
  ) then
    raise exception '0019: children_stamp_creator() must be SECURITY INVOKER - as a definer, is_privileged_writer() is always true and it stamps nothing';
  end if;

  if has_function_privilege('anon', 'public.children_stamp_creator()', 'execute') then
    raise exception '0019: children_stamp_creator() kept PUBLIC''s default EXECUTE (0000 §3 - the rule has no exceptions)';
  end if;

  -- The name alone is not the assertion: the arm is only safe BECAUSE of the unclaimed clause, and an edit
  -- that dropped it would give a creator a permanent read on a family's record.
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'user_has_child_access') !~ 'created_by_user_id' then
    raise exception '0019: user_has_child_access() has no creator arm (04 §4.4 c1)';
  end if;
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'user_has_child_access') !~ 'parent_user_id is null' then
    raise exception '0019: user_has_child_access()''s creator arm must be limited to an UNCLAIMED child';
  end if;

  -- §5 — the mint and the revoke, and the one thing that makes them different from §§1-3: they ARE the
  -- user-session road, so `authenticated` must have EXECUTE and `anon` must not.
  for v_i in 1 .. 2 loop
    v_sig := (array[
      'public.create_child_invite(uuid, public.invite_direction, text)',
      'public.revoke_child_invite(uuid, public.invite_revoked_reason)'
    ])[v_i];
    v_fn := (array['create_child_invite', 'revoke_child_invite'])[v_i];

    if to_regprocedure(v_sig) is null then
      raise exception '0019: %() missing (07 §5.2 - links and invites are written only by the RPCs)', v_fn;
    end if;
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_fn
        and p.prosecdef and p.proconfig is not null and 'search_path=""' = any(p.proconfig)
    ) then
      raise exception '0019: %() must be SECURITY DEFINER with search_path pinned', v_fn;
    end if;
    if not has_function_privilege('authenticated', v_sig, 'execute') then
      raise exception '0019: %() must be EXECUTE-able by authenticated - the authority IS the session', v_fn;
    end if;
    if has_function_privilege('anon', v_sig, 'execute') then
      raise exception '0019: %() must not be reachable by anon (get_invite_preview is the only anon invite road)', v_fn;
    end if;
    -- Both read `auth.uid()` and refuse a null one; without that a service-scope call would mint or revoke
    -- with no authority at all, which is the hole these functions exist to close.
    if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = v_fn) !~ 'INVITE_NO_SESSION' then
      raise exception '0019: %() must refuse a call with no session', v_fn;
    end if;

    -- fix: database-reviewer M-2. These two are the only definers here that reach the FORCE RLS
    -- `children` and `child_invites` under a real user session, so a non-BYPASSRLS owner would not make
    -- them refuse loudly - it would make every legitimate caller see "not yours" for her own child.
    if exists (
      select 1 from pg_proc p join pg_roles r on r.oid = p.proowner
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_fn
        and not (r.rolbypassrls or r.rolsuper)
    ) then
      raise exception '0019: %() is owned by a role without BYPASSRLS; FORCE RLS would make it refuse every legitimate caller', v_fn;
    end if;
  end loop;

  -- `0012`'s own rule, restated because §5 depends on it: the one pending invite per (child, direction) is
  -- what makes the mint idempotent instead of a second token racing the first.
  if to_regclass('public.child_invites_one_pending_per_direction_idx') is null then
    raise exception '0019: child_invites_one_pending_per_direction_idx is missing - create_child_invite()''s idempotency rests on it';
  end if;

  -- 0012 asserted it and 0019 depends on it: revoke is the only invalidation path.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'child_invites'
      and column_name in ('expires_at', 'expiry', 'rotated_at')
  ) then
    raise exception '0019: child_invites has gained an expiry/rotation column; revoke is the only invalidation path';
  end if;

  -- §6 — the webhook fold.
  v_sig := 'public.apply_payment_event(text, text, text, jsonb, timestamptz, uuid, jsonb, integer)';
  if to_regprocedure(v_sig) is null then
    raise exception '0019: apply_payment_event() missing (03 §5.4.3 / ADR-127)';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'apply_payment_event'
      and p.prosecdef and p.proconfig is not null and 'search_path=""' = any(p.proconfig)
  ) then
    raise exception '0019: apply_payment_event() must be SECURITY DEFINER with search_path pinned';
  end if;
  if has_function_privilege('anon', v_sig, 'execute')
     or has_function_privilege('authenticated', v_sig, 'execute') then
    raise exception '0019: apply_payment_event() must be service_role only (I-M2 - no client writes the spine)';
  end if;
  -- The idempotency is the named constraint's, not a lookup this function invents.
  if not exists (
    select 1 from pg_constraint where conname = 'payment_events_provider_event_key'
  ) then
    raise exception '0019: payment_events_provider_event_key is missing - apply_payment_event()''s replay guard rests on it';
  end if;
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'apply_payment_event') !~ 'set_access_window' then
    raise exception '0019: apply_payment_event() must recompute the access window inside its own transaction (ADR-083 / 084)';
  end if;
end
$$;
