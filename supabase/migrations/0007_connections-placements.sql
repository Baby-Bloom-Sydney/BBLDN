-- 0007_connections-placements.sql — the ordered migration set (02-data-model.md §6 row 0007)
--
-- Creates: `connection_requests`, `precheck_notifications`, `nanny_placements` (02 §4.2 rows 7-9),
-- the I-3 deferred constraint trigger (D-7), and the two `current_placement_id` columns on
-- `parents` / `nannies` — added here rather than in 0005 because they FK `nanny_placements`, and
-- putting them here is what breaks the parties <-> placements cycle (02 §6 row 0007).
--
-- Forced by: child_client.placement_id (0012).
-- Rollback twin: supabase/rollbacks/0007_connections-placements.rollback.sql
--
-- @adr ADR-012 — the pre-check has no tiers; `precheck_notifications` is the fragment's
--   `dfy_match_notifications` renamed (02 §5 row 9; the glossary says pre-check, never DFY).
-- R-14 — the silent hold is an attribute of the connection (`held_for_verification` + `held_at`),
--   never a stage; released or cancelled through the connections connector on
--   `verification.level-changed`. Held rows withhold parent notification until L4.
-- D-7 / I-3 — CONFIRMED or ACTIVE placement <=> the position is ACTIVE and exactly one connection
--   is at CONFIRMED/ACTIVE. Both rows move inside one `advance()` unit of work, so the backstop is
--   a DEFERRABLE INITIALLY DEFERRED constraint trigger checked at commit, not a row-level CHECK.
--
-- **Recorded judgement (see this unit's PROGRESS entry).** 02 §4.2 row 7 requires "<= 1 live per
-- (position_id, nanny_id)" but neither 02 §3, 03 §2 nor `shared-types/stage-model.ts` enumerates
-- which `connection_stage` values are *live*. This file takes "live = not terminal" with the nine
-- terminal branches named below, and treats NANNY_APPLIED, AWAITING_RESPONSE and INTRO_INCOMPLETE
-- as live (each can still move forward). If the stage-model owner rules otherwise the fix is one
-- new migration that replaces the two partial indexes.

-- ---------------------------------------------------------------------------
-- 1. `connection_requests` (02 §4.2 row 7) — the only connection entity.
--    Never "interview request" (02 §5 row 10).
-- ---------------------------------------------------------------------------

create table if not exists public.connection_requests (
  id                          uuid        primary key default gen_random_uuid(),
  position_id                 uuid        not null references public.nanny_positions (id) on delete cascade,
  nanny_id                    uuid        not null references public.nannies (id) on delete cascade,
  parent_id                   uuid        not null references public.parents (id) on delete cascade,
  stage                       public.connection_stage not null,
  origin                      public.connection_origin not null,
  message                     text,
  expires_at                  timestamptz,
  availability_slots          jsonb,
  meeting_at                  timestamptz,
  meeting_bracket             text,
  meeting_set_by              public.actor_role,
  meeting_outcome             public.meeting_outcome,
  meeting_outcome_reported_at timestamptz,
  meeting_outcome_reported_by uuid        references auth.users (id) on delete set null,
  trial_date                  date,
  trial_reported_at           timestamptz,
  fill_initiated_by           public.actor_role,
  agreed_start_date           date,
  phone_exchanged_at          timestamptz,
  held_for_verification       boolean     not null default false,
  held_at                     timestamptz,
  version                     integer     not null default 1,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  constraint connection_requests_version_check check (version >= 1),
  constraint connection_requests_held_at_check
    check (held_for_verification = (held_at is not null)),
  -- 02 §4.2 row 7: from INTRO_SCHEDULED onward the meeting time exists.
  -- Named explicitly rather than by enum ordinal: the branch values sort after
  -- ACTIVE in the enum (C-1 is add-only), so `stage >= 'INTRO_SCHEDULED'` would
  -- silently pull DECLINED and CANCELLED_BY_NANNY into the rule.
  constraint connection_requests_meeting_at_check check (
    stage not in ('INTRO_SCHEDULED', 'INTRO_COMPLETE', 'TRIAL_ARRANGED',
                  'TRIAL_COMPLETE', 'OFFERED', 'CONFIRMED', 'ACTIVE')
    or meeting_at is not null
  ),
  constraint connection_requests_trial_date_check
    check (stage <> 'TRIAL_ARRANGED' or trial_date is not null),
  constraint connection_requests_offered_has_initiator_check
    check (stage <> 'OFFERED' or fill_initiated_by is not null)
);

comment on table public.connection_requests is
  '02 §4.2 row 7: one nanny''s candidacy on one position. Writes go through connections.advance() (K-1..K-26) and amend(); admin-on-behalf goes through the same connector.';
comment on column public.connection_requests.held_for_verification is
  'R-14: the silent hold, an attribute and never a stage. A held row withholds parent notification until L4 (ADR-071 era verification rules).';
comment on column public.connection_requests.parent_id is
  'Denormalised from the position so the nanny hub and the parent hub can each be served by one index. Kept consistent by connections.advance(), which writes both rows in one unit of work.';

-- 02 §4.2 row 7: <= 1 live connection per (position, nanny).
create unique index if not exists connection_requests_one_live_per_pair_idx
  on public.connection_requests (position_id, nanny_id)
  where stage not in ('REQUEST_EXPIRED', 'DECLINED', 'REQUEST_CANCELLED', 'SCHEDULE_EXPIRED',
                      'NOT_HIRED', 'NOT_SELECTED', 'FINISHED',
                      'CANCELLED_BY_PARENT', 'CANCELLED_BY_NANNY');

-- 02 §4.2 row 7: <= 1 connection per position at OFFERED / CONFIRMED / ACTIVE.
create unique index if not exists connection_requests_one_offer_per_position_idx
  on public.connection_requests (position_id)
  where stage in ('OFFERED', 'CONFIRMED', 'ACTIVE');

-- D-11: the nanny hub and the live-connection exclusion in candidate selection.
create index if not exists connection_requests_nanny_stage_idx
  on public.connection_requests (nanny_id, stage);

create index if not exists connection_requests_parent_idx
  on public.connection_requests (parent_id);
create index if not exists connection_requests_outcome_reporter_idx
  on public.connection_requests (meeting_outcome_reported_by)
  where meeting_outcome_reported_by is not null;

drop trigger if exists connection_requests_set_updated_at on public.connection_requests;
create trigger connection_requests_set_updated_at
  before update on public.connection_requests
  for each row execute function public.set_updated_at();

-- C-9 (fix: database-reviewer M-1) — see 0006 for the reasoning.
drop trigger if exists connection_requests_bump_version on public.connection_requests;
create trigger connection_requests_bump_version
  before update on public.connection_requests
  for each row execute function public.bump_version();

-- ---------------------------------------------------------------------------
-- 2. `precheck_notifications` (02 §4.2 row 8)
-- ---------------------------------------------------------------------------

create table if not exists public.precheck_notifications (
  id                  uuid        primary key default gen_random_uuid(),
  position_id         uuid        not null references public.nanny_positions (id) on delete cascade,
  nanny_id            uuid        not null references public.nannies (id) on delete cascade,
  wave                integer     not null default 1,
  score_at_fire       numeric(5, 2),
  status              public.precheck_status not null default 'notified',
  notified_at         timestamptz not null default now(),
  viewed_at           timestamptz,
  responded_at        timestamptz,
  expires_at          timestamptz,
  selected_time_slots jsonb,
  connection_id       uuid        references public.connection_requests (id) on delete set null,
  created_at          timestamptz not null default now(),

  constraint precheck_notifications_position_nanny_key unique (position_id, nanny_id),
  constraint precheck_notifications_wave_check check (wave >= 1),
  -- 02 §4.2 row 8: interested <=> connection_id (K-2 creates the ACCEPTED connection)
  constraint precheck_notifications_interested_has_connection_check
    check ((status = 'interested') = (connection_id is not null))
);

comment on table public.precheck_notifications is
  '02 §4.2 row 8 / ADR-012: one row per nanny notified per position. The response is the "pre-checked" signal the call delivers. Written by `matching` (autofire on P-2, waves and expiry jobs) and by `connections` on K-2.';

create index if not exists precheck_notifications_nanny_idx
  on public.precheck_notifications (nanny_id, status);
create index if not exists precheck_notifications_position_idx
  on public.precheck_notifications (position_id, status);
create index if not exists precheck_notifications_connection_idx
  on public.precheck_notifications (connection_id) where connection_id is not null;

-- ---------------------------------------------------------------------------
-- 3. `nanny_placements` (02 §4.2 row 9) — the confirmed hire.
-- ---------------------------------------------------------------------------

create table if not exists public.nanny_placements (
  id                uuid        primary key default gen_random_uuid(),
  position_id       uuid        not null references public.nanny_positions (id) on delete cascade,
  connection_id     uuid        unique references public.connection_requests (id) on delete set null,
  nanny_id          uuid        not null references public.nannies (id) on delete cascade,
  parent_id         uuid        not null references public.parents (id) on delete cascade,
  source            public.placement_source not null,
  state             public.placement_state not null,
  weekly_hours      numeric(5, 1),
  hourly_rate_pence integer,
  confirmed_at      timestamptz,
  confirmed_by_role public.actor_role,
  confirmed_by_id   uuid        references auth.users (id) on delete set null,
  start_date        date,
  started_at        timestamptz,
  ended_at          timestamptz,
  end_reason        public.end_reason,
  end_notes         text,
  ended_by_role     public.actor_role,
  ended_by_id       uuid        references auth.users (id) on delete set null,
  roster            jsonb,
  nanny_notes       text,
  parent_notes      text,
  version           integer     not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint nanny_placements_version_check check (version >= 1),
  -- 02 §4.2 row 9: connection_id NOT NULL for source = connection
  constraint nanny_placements_connection_source_check
    check (source <> 'connection' or connection_id is not null),
  -- hours and rate are NOT NULL at CONFIRMED (and stay so through ACTIVE / ENDED)
  -- Hours and rate are NOT NULL at CONFIRMED - for a *hire*. The `invite_shell` placement
  -- (02 §4.6 `child_client`; stage-model O-3) exists so I-3 / I-4 mean something for a family
  -- that arrived by invite and was never matched; it has no agreed terms because there was no
  -- negotiation, and requiring them made ensure_placement - and therefore every invite claim -
  -- fail (database-reviewer C-3, measured).
  constraint nanny_placements_confirmed_terms_check
    check (source = 'invite_shell'
           or state not in ('CONFIRMED', 'ACTIVE')
           or (weekly_hours is not null and hourly_rate_pence is not null)),
  -- hours are recorded in half-hour steps (02 §4.2 row 9)
  constraint nanny_placements_weekly_hours_step_check
    check (weekly_hours is null or (weekly_hours > 0 and weekly_hours <= 168
                                    and (weekly_hours * 2) = floor(weekly_hours * 2))),
  constraint nanny_placements_hourly_rate_pence_check
    check (hourly_rate_pence is null or hourly_rate_pence > 0),
  constraint nanny_placements_ended_check
    check (state <> 'ENDED' or (end_reason is not null and ended_at is not null))
);

comment on table public.nanny_placements is
  '02 §4.2 row 9: the confirmed hire - hours, rate, start, end. started_at (L-1b) is the anchor for done-for-you access, the 30-day satisfaction window and the bill due a week later (ADR-093 / 094; 0010 reads it).';
comment on column public.nanny_placements.source is
  'stage-model O-3: `connection` for a matched hire, `invite_shell` for the shell placement ensure_placement() mints when an invite-arrived family was never matched (0012).';

-- 02 §4.2 row 9: <= 1 non-ended placement per position and per parent.
create unique index if not exists nanny_placements_one_live_per_position_idx
  on public.nanny_placements (position_id)
  where state <> 'ENDED';

create unique index if not exists nanny_placements_one_live_per_parent_idx
  on public.nanny_placements (parent_id)
  where state <> 'ENDED';

create index if not exists nanny_placements_nanny_idx
  on public.nanny_placements (nanny_id, state);
create index if not exists nanny_placements_confirmed_by_idx
  on public.nanny_placements (confirmed_by_id) where confirmed_by_id is not null;
create index if not exists nanny_placements_ended_by_idx
  on public.nanny_placements (ended_by_id) where ended_by_id is not null;

drop trigger if exists nanny_placements_set_updated_at on public.nanny_placements;
create trigger nanny_placements_set_updated_at
  before update on public.nanny_placements
  for each row execute function public.set_updated_at();

drop trigger if exists nanny_placements_bump_version on public.nanny_placements;
create trigger nanny_placements_bump_version
  before update on public.nanny_placements
  for each row execute function public.bump_version();

-- ---------------------------------------------------------------------------
-- 4. I-3 backstop (fix: D-7).
--    Deferred to commit so `advance()` may move the placement and the position
--    in either order inside one unit of work, and still be caught if it moves
--    only one of them.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_placement_position_active()
returns trigger
security definer
language plpgsql
set search_path = ''
as $$
declare
  v_cur   public.nanny_placements;
  v_stage public.position_stage;
  v_connections int;
begin
  -- A DEFERRABLE INITIALLY DEFERRED constraint trigger fires at COMMIT with the row image from the
  -- statement that queued it. Inside one advance() a placement may go CONFIRMED -> ENDED, or be
  -- deleted outright; judging the stale image would reject a legitimately closed position
  -- (database-reviewer M-1). Re-read, and judge what the transaction is actually committing.
  select * into v_cur from public.nanny_placements where id = new.id;
  if not found or v_cur.state not in ('CONFIRMED', 'ACTIVE') then
    return null;  -- AFTER trigger: the return value is ignored
  end if;

  select p.stage into v_stage
  from public.nanny_positions p where p.id = v_cur.position_id;

  if v_stage is distinct from 'ACTIVE' then
    raise exception
      'I-3: placement % is % but position % is % (expected ACTIVE) [02 §4.2 row 9, fix D-7]',
      v_cur.id, v_cur.state, v_cur.position_id, coalesce(v_stage::text, 'missing')
      using errcode = 'integrity_constraint_violation';
  end if;

  -- The shell placement an invite-arrived family gets (02 §4.2 `child_client`,
  -- stage-model O-3) has no connection by construction - nobody was ever matched.
  -- I-3's *position* half still applies to it, which is the half that makes the
  -- shell worth minting; its connection half does not.
  if v_cur.source = 'invite_shell' then
    return null;
  end if;

  select count(*) into v_connections
  from public.connection_requests c
  where c.position_id = v_cur.position_id and c.stage in ('CONFIRMED', 'ACTIVE');

  if v_connections <> 1 then
    raise exception
      'I-3: position % has % connection(s) at CONFIRMED/ACTIVE, expected exactly 1 [02 §4.2 row 9, fix D-7]',
      v_cur.position_id, v_connections
      using errcode = 'integrity_constraint_violation';
  end if;

  if v_cur.connection_id is not null and not exists (
    select 1 from public.connection_requests c
    where c.id = v_cur.connection_id and c.stage in ('CONFIRMED', 'ACTIVE')
  ) then
    raise exception
      'I-3: placement % does not point at the position''s CONFIRMED/ACTIVE connection [fix D-7]', v_cur.id
      using errcode = 'integrity_constraint_violation';
  end if;

  return null;
end;
$$;

comment on function public.enforce_placement_position_active() is
  '02 §4.2 row 9 / fix D-7: the I-3 backstop, checked at COMMIT so both rows may move in either order inside one advance() unit of work.';

drop trigger if exists nanny_placements_enforce_i3 on public.nanny_placements;
create constraint trigger nanny_placements_enforce_i3
  after insert or update on public.nanny_placements
  deferrable initially deferred
  for each row execute function public.enforce_placement_position_active();

-- ---------------------------------------------------------------------------
-- 5. The two pointers (02 §6 row 0007) — the cycle-breaking ALTERs.
-- ---------------------------------------------------------------------------

alter table public.parents
  add column if not exists current_placement_id uuid;
alter table public.nannies
  add column if not exists current_placement_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'parents_current_placement_id_fkey') then
    alter table public.parents
      add constraint parents_current_placement_id_fkey
      foreign key (current_placement_id) references public.nanny_placements (id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nannies_current_placement_id_fkey') then
    alter table public.nannies
      add constraint nannies_current_placement_id_fkey
      foreign key (current_placement_id) references public.nanny_placements (id) on delete set null;
  end if;
end
$$;

-- ON DELETE SET NULL FKs: without these every placement delete seq-scans both party tables,
-- and the placements module's pointer reads have no index either (database-reviewer M-21).
create index if not exists parents_current_placement_idx
  on public.parents (current_placement_id) where current_placement_id is not null;
create index if not exists nannies_current_placement_idx
  on public.nannies (current_placement_id) where current_placement_id is not null;

comment on column public.parents.current_placement_id is
  '02 §4.2 row 2: set <=> exactly one non-ended placement (L-1 / L-2 only). Written by `placements`, never by the parent.';
comment on column public.nannies.current_placement_id is
  '02 §4.2 row 3: the most recent non-ended placement. A nanny may hold several placements; this is the pointer the hub reads.';

-- ---------------------------------------------------------------------------
-- 6. RLS (02 C-10; 07 §5.2 rows `precheck_notifications`, `connection_requests`,
--    `nanny_placements`). SELECT-only for client roles: every write is an
--    `advance()` / `amend()` / `respond()` definer (07 §5.1 rule 4), and
--    placements' end columns are service role (07 §5.2).
--    Held rows are hidden from the parent until released (07 §5.2, R-14).
--    The nanny's access to the *parent's* contact columns is the
--    `connection_party_contact` view in 0016, not a policy here.
-- ---------------------------------------------------------------------------

alter table public.connection_requests enable row level security;
alter table public.connection_requests force row level security;

drop policy if exists connection_requests_parent_select on public.connection_requests;
create policy connection_requests_parent_select on public.connection_requests
  for select to authenticated
  using (parent_id = (select public.current_parent_id()) and not held_for_verification);

drop policy if exists connection_requests_nanny_select on public.connection_requests;
create policy connection_requests_nanny_select on public.connection_requests
  for select to authenticated
  using (nanny_id = (select public.current_nanny_id()));

drop policy if exists connection_requests_admin_select on public.connection_requests;
create policy connection_requests_admin_select on public.connection_requests
  for select to authenticated
  using ((select public.is_admin()));

alter table public.precheck_notifications enable row level security;
alter table public.precheck_notifications force row level security;

drop policy if exists precheck_notifications_nanny_select on public.precheck_notifications;
create policy precheck_notifications_nanny_select on public.precheck_notifications
  for select to authenticated
  using (nanny_id = (select public.current_nanny_id()));

drop policy if exists precheck_notifications_parent_select on public.precheck_notifications;
create policy precheck_notifications_parent_select on public.precheck_notifications
  for select to authenticated
  using (exists (
    select 1 from public.nanny_positions p
    where p.id = precheck_notifications.position_id and p.parent_id = (select public.current_parent_id())
  ));

drop policy if exists precheck_notifications_admin_select on public.precheck_notifications;
create policy precheck_notifications_admin_select on public.precheck_notifications
  for select to authenticated
  using ((select public.is_admin()));

alter table public.nanny_placements enable row level security;
alter table public.nanny_placements force row level security;

drop policy if exists nanny_placements_parent_select on public.nanny_placements;
create policy nanny_placements_parent_select on public.nanny_placements
  for select to authenticated
  using (parent_id = (select public.current_parent_id()));

drop policy if exists nanny_placements_nanny_select on public.nanny_placements;
create policy nanny_placements_nanny_select on public.nanny_placements
  for select to authenticated
  using (nanny_id = (select public.current_nanny_id()));

drop policy if exists nanny_placements_admin_select on public.nanny_placements;
create policy nanny_placements_admin_select on public.nanny_placements
  for select to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- 7. Verify
-- ---------------------------------------------------------------------------

do $$
declare
  v_t text;
  v_bad int;
begin
  foreach v_t in array array['connection_requests', 'precheck_notifications', 'nanny_placements'] loop
    if to_regclass('public.' || v_t) is null then
      raise exception '0007: public.% missing', v_t;
    end if;
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_t and c.relrowsecurity and c.relforcerowsecurity
    ) then
      raise exception '0007: public.% must ENABLE and FORCE row level security (02 C-10)', v_t;
    end if;
    select count(*) into v_bad
    from pg_policies where schemaname = 'public' and tablename = v_t and cmd <> 'SELECT';
    if v_bad <> 0 then
      raise exception '0007: public.% must be SELECT-only for client roles (07 §5.1 rule 4)', v_t;
    end if;
  end loop;

  foreach v_t in array array[
    'connection_requests_one_live_per_pair_idx',
    'connection_requests_one_offer_per_position_idx',
    'connection_requests_nanny_stage_idx',
    'nanny_placements_one_live_per_position_idx',
    'nanny_placements_one_live_per_parent_idx'
  ] loop
    if to_regclass('public.' || v_t) is null then
      raise exception '0007: index % missing (02 §4.2 rows 7 and 9; D-11)', v_t;
    end if;
  end loop;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'nanny_placements_enforce_i3' and tgconstraint <> 0 and tgdeferrable and tginitdeferred
  ) then
    raise exception '0007: the I-3 backstop must be a DEFERRABLE INITIALLY DEFERRED constraint trigger (fix D-7)';
  end if;

  -- the deferred trigger reads two FORCE-RLS tables as a definer (database-reviewer H-3)
  if not exists (
    select 1 from pg_proc p join pg_roles r on r.oid = p.proowner
    where p.oid = 'public.enforce_placement_position_active()'::regprocedure
      and (r.rolbypassrls or r.rolsuper)
  ) then
    raise exception '0007: enforce_placement_position_active() must be owned by a role with BYPASSRLS';
  end if;

  foreach v_t in array array['parents', 'nannies'] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = v_t and column_name = 'current_placement_id'
    ) then
      raise exception '0007: %.current_placement_id missing (02 §6 row 0007)', v_t;
    end if;
    if not exists (select 1 from pg_constraint where conname = v_t || '_current_placement_id_fkey') then
      raise exception '0007: the %.current_placement_id FK is missing', v_t;
    end if;
  end loop;

  -- 02 §5 row 10: the interview vocabulary and its columns are not carried
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'nanny_placements'
      and column_name in ('interview_request_id', 'babysitting_request_id', 'placement_duration_days')
  ) then
    raise exception '0007: a Sydney interview / babysitting column survived (02 §5 rows 1 and 10)';
  end if;
end
$$;
