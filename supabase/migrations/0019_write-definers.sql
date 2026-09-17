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
--   `auth.uid()` is also the wrong authority test here, and `0000`'s own comment on
--   `is_privileged_writer()` says why: a definer leaves the request's JWT claims alone, and every
--   caller of these three functions — the P/K/L cascade handlers running as `{ kind: 'system' }`, the
--   `matching.autofire` job, the admin-on-behalf road through the same connector — has no session at
--   all, so `auth.uid()` is null for all of them. The honest authority check is `is_privileged_writer()`,
--   which reads `current_user` (established by the connection, forgeable by no argument). It is
--   asserted at the top of all three functions as well as enforced by the grant, so if EXECUTE is ever
--   widened by mistake the functions still refuse rather than silently accepting a client write.
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
  if not public.is_privileged_writer() then
    raise exception 'NOT_PRIVILEGED_WRITER' using errcode = 'insufficient_privilege';
  end if;

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
  -- 02 §4.2 row 7, and the exact predicate of `connection_requests_one_live_per_pair_idx`. Named
  -- rather than derived from the enum's order, for the reason `0007`'s own CHECK gives: the branch
  -- values sort after ACTIVE because C-1 is add-only, so any `>=` form would quietly pull the
  -- terminal stages in.
  v_dead     public.connection_stage[] := array[
    'REQUEST_EXPIRED', 'DECLINED', 'REQUEST_CANCELLED', 'SCHEDULE_EXPIRED',
    'NOT_HIRED', 'NOT_SELECTED', 'FINISHED',
    'CANCELLED_BY_PARENT', 'CANCELLED_BY_NANNY'
  ]::public.connection_stage[];
begin
  if not public.is_privileged_writer() then
    raise exception 'NOT_PRIVILEGED_WRITER' using errcode = 'insufficient_privilege';
  end if;

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
  if not (p_stage = any (v_dead))
     and exists (
       select 1 from public.connection_requests cr
        where cr.position_id = p_position_id
          and cr.nanny_id = p_nanny_id
          and cr.id <> p_id
          and not (cr.stage = any (v_dead))
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
  if not public.is_privileged_writer() then
    raise exception 'NOT_PRIVILEGED_WRITER' using errcode = 'insufficient_privilege';
  end if;

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
-- 4. Verify — the migration asserts its own result (02 §6; `0017` / `0018`'s pattern).
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
end
$$;
