-- 0006_positions.sql — the ordered migration set (02-data-model.md §6 row 0006)
--
-- Creates: `nanny_positions` (the aggregate root), `position_children`, `position_schedule`
-- (02 §4.2 rows 4-6).
--
-- Forced by: connection_requests.position_id (0007), events.position_id (0011),
--            parent_leads.position_id (0014).
-- Rollback twin: supabase/rollbacks/0006_positions.rollback.sql
--
-- R-1 / ADR-073 — the call's canonical home is the `bookings` row (0009). This table mirrors only
--   what the parent rail needs: call_state, call_type, call_requested_at, call_booking_id. The FK
--   on call_booking_id is added in 0009 (bookings does not exist yet); the D-3 CHECK is here, so
--   the invariant holds from the moment the column does.
-- @adr ADR-012 — no `dfy_tier`: the pre-check has no tiers (02 §5 row 10).
-- @adr ADR-070 — `stage` is the `position_stage` enum; there is no text `status` and no integer
--   sub-code anywhere in this file (02 §5 row 7).
-- @adr ADR-103 — `vaccination_required` is created nullable; null on a nanny's `is_vaccinated`
--   reads as "not stated" (02 §4.2 row 4).
--
-- D-6 (partly deferred, recorded in this unit's PROGRESS): 02 §9 item 21 wants a CHECK on each of
--   the four UK-vocabulary columns, generated from a config list. Only one of those lists exists
--   today — `MATCHING.qualificationLadder` (config/matching.ts) — so only
--   `qualification_requirement` carries its CHECK here. `assurances_required`,
--   `certificate_requirements` and `right_to_work_requirement` have **no config list yet**
--   (verification research, Phase 2); inventing their values in a migration would put a product
--   fact in DDL, which L4 forbids. Their CHECKs land in the follow-up migration that lands the
--   config lists, and the columns are created now so that migration is ALTER-only.

-- ---------------------------------------------------------------------------
-- 1. `nanny_positions` (02 §4.2 row 4)
-- ---------------------------------------------------------------------------

create table if not exists public.nanny_positions (
  -- identity + stage
  id                       uuid        primary key default gen_random_uuid(),
  parent_id                uuid        not null references public.parents (id) on delete cascade,
  source                   public.position_source not null,
  title                    text,
  description              text,
  stage                    public.position_stage not null default 'DRAFT',
  published_at             timestamptz,
  activated_at             timestamptz,
  ended_at                 timestamptz,
  end_reason               public.end_reason,
  closed_at                timestamptz,
  close_reason             public.close_reason,
  filled_by_nanny_id       uuid        references public.nannies (id) on delete set null,
  expires_at               timestamptz,
  version                  integer     not null default 1,

  -- requirements
  urgency                  text,
  start_date               date,
  placement_length         text,
  end_date                 date,
  schedule_type            public.schedule_type,
  hours_per_week           numeric(5, 1),
  days_required            text[]      not null default '{}',
  schedule_details         text,
  minimum_nanny_age        integer,
  years_experience_min     integer,
  language_preference      text[]      not null default '{}',
  language_preference_details text,
  qualification_requirement text,
  certificate_requirements text[]      not null default '{}',
  assurances_required      text[]      not null default '{}',
  right_to_work_requirement text,
  vaccination_required     boolean,
  driving_licence_required boolean,
  car_required             boolean,
  pets_ok_required         boolean,
  non_smoker_required      boolean,
  other_requirements       text,
  hourly_rate_pence        integer,
  pay_frequency            text[]      not null default '{}',
  reason_for_nanny         text[]      not null default '{}',
  level_of_support         text[]      not null default '{}',
  district                 text        references public.areas (district),
  area                     text,
  details                  jsonb,

  -- pre-check lever (T-1.4 level 2; ADR-012 — no tier)
  precheck_fired_at        timestamptz,
  precheck_expires_at      timestamptz,
  precheck_wave_sent       integer     not null default 0,
  precheck_cutoff_reached_at timestamptz,

  -- call mirror (R-1; ADR-073). call_booking_id gets its FK in 0009.
  call_state               public.call_state not null default 'awaiting-slot',
  call_type                public.call_type,
  call_requested_at        timestamptz,
  call_booking_id          uuid,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  -- fix: D-3 / R6 / AC-X-33 — a chosen or completed call must point at its booking.
  -- Written as the biconditional R-1 actually states ("awaiting-slot <=> no active
  -- booking for the subject, call_booking_id null - including after a no-answer, which
  -- clears it"): the one-directional form accepted `awaiting-slot` WITH a pointer, so a
  -- no-answer handler that forgot to null it left the row permanently ambiguous and the
  -- D-12 call-queue index served a row whose pointer resolved to a dead booking
  -- (database-reviewer H-4, measured). AC-X-33's three cases are unchanged: slot-chosen
  -- with a null pointer is rejected, awaiting-slot with null is accepted, and the
  -- AC-X-30 clear (awaiting-slot + null) passes.
  constraint nanny_positions_call_state_requires_booking_check
    check ((call_state = 'awaiting-slot') = (call_booking_id is null)),
  -- R-1: the position mirrors parent calls only; the nanny-commission call has no position.
  constraint nanny_positions_call_type_is_parent_call_check
    check (call_type is null or call_type in ('matchmaking', 'onboarding')),
  -- 02 §4.2 row 4: terminal stages carry their reason
  constraint nanny_positions_ended_has_reason_check
    check (stage <> 'ENDED' or (end_reason is not null and ended_at is not null)),
  constraint nanny_positions_closed_has_reason_check
    check (stage <> 'CLOSED' or (close_reason is not null and closed_at is not null)),
  constraint nanny_positions_hourly_rate_pence_check
    check (hourly_rate_pence is null or hourly_rate_pence > 0),
  constraint nanny_positions_hours_per_week_check
    check (hours_per_week is null or (hours_per_week > 0 and hours_per_week <= 168)),
  constraint nanny_positions_version_check check (version >= 1),
  constraint nanny_positions_precheck_wave_check check (precheck_wave_sent >= 0),
  constraint nanny_positions_end_after_start_check
    check (end_date is null or start_date is null or end_date >= start_date),
  -- D-6, the one list that exists today: config/matching.ts MATCHING.qualificationLadder keys.
  constraint nanny_positions_qualification_requirement_check
    check (qualification_requirement is null or qualification_requirement in
      ('none', 'other', 'level-2', 'level-3', 'level-5', 'degree'))
);

comment on table public.nanny_positions is
  '02 §4.2 row 4: the position, aggregate root. Stage moves only through positions.advance(); requirements only through amend() (03 §2).';
comment on column public.nanny_positions.call_booking_id is
  'R-1: points at the bookings row that IS the call record. FK added in 0009. Cleared on a no-answer, which returns call_state to awaiting-slot; a retry is a new booking (R5).';
comment on column public.nanny_positions.details is
  'The form snapshot. Never the source of truth for anything a column above holds.';
comment on constraint nanny_positions_qualification_requirement_check on public.nanny_positions is
  'D-6 / 02 §9 item 21: regenerated whenever MATCHING.qualificationLadder changes. The other three UK vocabularies have no config list yet and carry no CHECK - see this file''s header.';

-- I-1: one live position per parent (02 §4.2 row 4; CONNECTIONS.liveStages in config/connections.ts)
create unique index if not exists nanny_positions_one_live_per_parent_idx
  on public.nanny_positions (parent_id)
  where stage in ('DRAFT', 'OPEN', 'CONNECTING', 'ACTIVE');

-- D-12: the admin call queue reads every position whose call is not finished.
create index if not exists nanny_positions_open_call_idx
  on public.nanny_positions (call_state)
  where call_state <> 'done';

-- Not a plain index on `stage`: a six-value enum column will never be chosen over a
-- seq scan, and the query that matters is the nanny-side board, which is also the RLS
-- predicate below (database-reviewer M-4).
drop index if exists public.nanny_positions_stage_idx;
create index if not exists nanny_positions_board_idx
  on public.nanny_positions (district)
  where stage in ('OPEN', 'CONNECTING');
create index if not exists nanny_positions_district_idx on public.nanny_positions (district);
create index if not exists nanny_positions_parent_idx on public.nanny_positions (parent_id);
-- ON DELETE SET NULL FK without a covering index (database-reviewer M-3)
create index if not exists nanny_positions_filled_by_idx
  on public.nanny_positions (filled_by_nanny_id) where filled_by_nanny_id is not null;

drop trigger if exists nanny_positions_set_updated_at on public.nanny_positions;
create trigger nanny_positions_set_updated_at
  before update on public.nanny_positions
  for each row execute function public.set_updated_at();

-- C-9 (fix: database-reviewer M-1): the database bumps the optimistic-lock version, so
-- an amend() that forgets to cannot silently defeat advance()'s compare-and-set. The
-- connector still sends `where version = $expected`.
drop trigger if exists nanny_positions_bump_version on public.nanny_positions;
create trigger nanny_positions_bump_version
  before update on public.nanny_positions
  for each row execute function public.bump_version();

-- ---------------------------------------------------------------------------
-- 2. `position_children` (02 §4.2 row 5) — the 1-3 children on a position.
--    "1-3 rows" is a module check (02 §4.2 row 5); the label domain is what the
--    database can hold honestly, and it caps the count at three by construction.
-- ---------------------------------------------------------------------------

create table if not exists public.position_children (
  id            uuid        primary key default gen_random_uuid(),
  position_id   uuid        not null references public.nanny_positions (id) on delete cascade,
  child_label   text        not null,
  age_months    integer,
  gender        text,
  display_order integer     not null default 0,
  needs_details text,
  created_at    timestamptz not null default now(),

  constraint position_children_position_label_key unique (position_id, child_label),
  constraint position_children_label_check check (child_label in ('A', 'B', 'C')),
  constraint position_children_age_months_check check (age_months is null or age_months between 0 and 216)
);

comment on column public.position_children.needs_details is
  '07 §2.7(b): free text that may carry a child''s health or SEN information. Treated as potentially Art 9 - minimised by form copy, never sent to a processor, never in events.props.';

create index if not exists position_children_position_idx on public.position_children (position_id);

-- ---------------------------------------------------------------------------
-- 3. `position_schedule` (02 §4.2 row 6) — the weekly roster for schedule scoring.
-- ---------------------------------------------------------------------------

create table if not exists public.position_schedule (
  position_id uuid        primary key references public.nanny_positions (id) on delete cascade,
  schedule    jsonb       not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.position_schedule is
  '02 §4.2 row 6: monday..sunday -> blocks, Europe/London wall-clock (C-3), the same block names as nannies.availability. No row = flexible, full marks.';

drop trigger if exists position_schedule_set_updated_at on public.position_schedule;
create trigger position_schedule_set_updated_at
  before update on public.position_schedule
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. RLS (02 C-10; 07 §5.2 row `nanny_positions · position_children · position_schedule`).
--    SELECT-only for client roles (07 §5.1 rule 4): every write is `advance()` or
--    `amend()`, both SECURITY DEFINER actions that write a named column set, and
--    a parent may never touch `stage`, `call_*` or `precheck_*`. The nanny's
--    "or a position I hold a connection on" clause needs connection_requests and
--    lands in 0016; the jobs-board half is here.
-- ---------------------------------------------------------------------------

alter table public.nanny_positions enable row level security;
alter table public.nanny_positions force row level security;

drop policy if exists nanny_positions_parent_select on public.nanny_positions;
create policy nanny_positions_parent_select on public.nanny_positions
  for select to authenticated
  using (parent_id = (select public.current_parent_id()));

drop policy if exists nanny_positions_nanny_board_select on public.nanny_positions;
create policy nanny_positions_nanny_board_select on public.nanny_positions
  for select to authenticated
  using (stage in ('OPEN', 'CONNECTING') and (select public.is_active_nanny()));

drop policy if exists nanny_positions_admin_select on public.nanny_positions;
create policy nanny_positions_admin_select on public.nanny_positions
  for select to authenticated
  using ((select public.is_admin()));

alter table public.position_children enable row level security;
alter table public.position_children force row level security;

drop policy if exists position_children_parent_select on public.position_children;
create policy position_children_parent_select on public.position_children
  for select to authenticated
  using (exists (
    select 1 from public.nanny_positions p
    where p.id = position_children.position_id and p.parent_id = (select public.current_parent_id())
  ));

drop policy if exists position_children_nanny_board_select on public.position_children;
create policy position_children_nanny_board_select on public.position_children
  for select to authenticated
  using ((select public.is_active_nanny()) and exists (
    select 1 from public.nanny_positions p
    where p.id = position_children.position_id and p.stage in ('OPEN', 'CONNECTING')
  ));

drop policy if exists position_children_admin_select on public.position_children;
create policy position_children_admin_select on public.position_children
  for select to authenticated
  using ((select public.is_admin()));

alter table public.position_schedule enable row level security;
alter table public.position_schedule force row level security;

drop policy if exists position_schedule_parent_select on public.position_schedule;
create policy position_schedule_parent_select on public.position_schedule
  for select to authenticated
  using (exists (
    select 1 from public.nanny_positions p
    where p.id = position_schedule.position_id and p.parent_id = (select public.current_parent_id())
  ));

drop policy if exists position_schedule_nanny_board_select on public.position_schedule;
create policy position_schedule_nanny_board_select on public.position_schedule
  for select to authenticated
  using ((select public.is_active_nanny()) and exists (
    select 1 from public.nanny_positions p
    where p.id = position_schedule.position_id and p.stage in ('OPEN', 'CONNECTING')
  ));

drop policy if exists position_schedule_admin_select on public.position_schedule;
create policy position_schedule_admin_select on public.position_schedule
  for select to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- 5. Verify
-- ---------------------------------------------------------------------------

do $$
declare
  v_t text;
  v_bad int;
begin
  foreach v_t in array array['nanny_positions', 'position_children', 'position_schedule'] loop
    if to_regclass('public.' || v_t) is null then
      raise exception '0006: public.% missing', v_t;
    end if;
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_t and c.relrowsecurity and c.relforcerowsecurity
    ) then
      raise exception '0006: public.% must ENABLE and FORCE row level security (02 C-10)', v_t;
    end if;
    select count(*) into v_bad
    from pg_policies where schemaname = 'public' and tablename = v_t and cmd <> 'SELECT';
    if v_bad <> 0 then
      raise exception '0006: public.% must be SELECT-only for client roles (07 §5.1 rule 4)', v_t;
    end if;
  end loop;

  -- AC-X-33 / D-3, asserted by name because db.constraints asserts it by name
  if not exists (
    select 1 from pg_constraint
    where conname = 'nanny_positions_call_state_requires_booking_check'
      and conrelid = 'public.nanny_positions'::regclass
  ) then
    raise exception '0006: the D-3 call-state CHECK is missing (AC-X-33)';
  end if;
  if to_regclass('public.nanny_positions_one_live_per_parent_idx') is null then
    raise exception '0006: the I-1 one-live-position partial unique index is missing';
  end if;
  if to_regclass('public.nanny_positions_open_call_idx') is null then
    raise exception '0006: the D-12 open-call partial index is missing';
  end if;

  -- 0009 owns the FK; if it appeared here the cycle 02 §6 breaks on purpose would be hidden
  if exists (select 1 from pg_constraint where conname = 'nanny_positions_call_booking_id_fkey') then
    raise exception '0006: the call_booking_id FK belongs to 0009 (bookings does not exist yet)';
  end if;

  -- ADR-070 / 02 §5 row 7: no text status, no integer sub-code survived the copy
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'nanny_positions'
      and column_name in ('status', 'position_status', 'dfy_tier')
  ) then
    raise exception '0006: a legacy status / tier column exists (ADR-070, ADR-012, 02 §5 rows 7 and 10)';
  end if;

  -- ADR-103: created, nullable
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'nanny_positions'
      and column_name = 'vaccination_required' and is_nullable = 'YES'
  ) then
    raise exception '0006: nanny_positions.vaccination_required must exist and be nullable (ADR-103)';
  end if;
end
$$;
