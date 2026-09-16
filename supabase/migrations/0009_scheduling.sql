-- 0009_scheduling.sql — the ordered migration set (02-data-model.md §6 row 0009)
--
-- Creates: `calendars` (+ the ADR-076 seed row and its Mon-Fri rules), `availability_rules`,
-- `availability_blocks`, `bookings` (02 §4.4), the `book_slot()` definer (02 §7) and the
-- **`nanny_positions.call_booking_id` foreign key** that 0006 deliberately left off.
--
-- Forced by: lead_contacts.booking_id (0014), admin_notifications.subject_id (0011).
-- Rollback twin: supabase/rollbacks/0009_scheduling.rollback.sql
--
-- @adr ADR-074 — one live admin calendar; multi-calendar, assigned_to, external sync, video links,
--   SMS reminders, buffers, recurring blocks, a bank-holiday feed and waitlists are all out (02 §5 row 14).
-- @adr ADR-076 — the seed values: 30-minute slots, 09:00-19:00 Europe/London, Mon-Fri, 14 days
--   ahead, 120 minutes' notice, a 5-minute hold. All admin-editable at runtime; the row below is
--   the runtime copy, seeded from config/scheduling.ts (SCHEDULING).
-- @adr ADR-077 — a block over an existing booking **flags**, never cancels (I-8 / I-4).
-- R-1 / R5 — this table *is* the call record. Call type and outcome live here; the position mirrors
--   only call_state / call_type / call_requested_at / call_booking_id. `no-answer` is terminal for
--   the row: the call returns to awaiting-slot and a retry is a new booking.
-- 02 §5 row 9 — there is no `slot_holds` table and no stored `slots`: a hold **is** a bookings row
--   at status `held` with `hold_expires_at`, and slots are computed (rules ∪ open − blocked − active).
--
-- === Two foundations conflicts this file had to resolve. ===
--  (1) `availability_rules.weekday`: 02 §4.4 says "0-6, **Mon = 0**"; config/scheduling.ts says
--      `weekdays: [1,2,3,4,5] // Mon-Fri (0 = Sunday)` — the JS convention. Both mean Mon-Fri but
--      with different integers, so seeding straight from the config array under 02's convention
--      would silently produce **Tue-Sat**. **Ruled by the coordinator 2026-09-16: 02 §4.4 is
--      authoritative, Mon = 0**, and `config/scheduling.ts` is the side that gets corrected in a
--      later unit. So Mon-Fri is 0,1,2,3,4 here, and the slot generator must read it that way.
--  (2) `calendars.id`: 02 C-2 says every entity table has a uuid PK; 03 §3.2 types
--      `CalendarId = 'default'`. The column is a uuid (C-2 is the DDL rule) and the connector maps
--      its single literal to the single row — I-5 ("calendarId <> 'default' -> CALENDAR_UNKNOWN")
--      is unaffected because there is exactly one row.

-- ---------------------------------------------------------------------------
-- 1. `calendars` (02 §4.4 row 1)
-- ---------------------------------------------------------------------------

create table if not exists public.calendars (
  id                   uuid        primary key default gen_random_uuid(),
  owner_user_id        uuid        references auth.users (id) on delete set null,
  name                 text        not null,
  timezone             text        not null,
  slot_minutes         integer     not null,
  booking_horizon_days integer     not null,
  lead_time_minutes    integer     not null,
  hold_minutes         integer     not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint calendars_slot_minutes_check         check (slot_minutes between 5 and 240),
  constraint calendars_horizon_check              check (booking_horizon_days between 1 and 365),
  constraint calendars_lead_time_check            check (lead_time_minutes >= 0),
  constraint calendars_hold_minutes_check         check (hold_minutes between 1 and 120)
);

comment on table public.calendars is
  '02 §4.4 row 1 / ADR-074: one row, day one. Seeded from config/scheduling.ts with the ADR-076 values and editable by the admin thereafter (ADR-076). SELECT ... FOR UPDATE on this row is what serialises book() and reschedule().';
comment on column public.calendars.owner_user_id is
  'Nullable at seed: the London admin account does not exist when this migration runs (auth.users is empty on a fresh project). The admin claims the row at first login.';
comment on column public.calendars.timezone is
  'C-3: stored, never a DDL literal. Seeded from LOCALE.timezone via config/scheduling.ts.';

drop trigger if exists calendars_set_updated_at on public.calendars;
create trigger calendars_set_updated_at
  before update on public.calendars
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. `availability_rules` (02 §4.4 row 2) — recurring weekly openings.
-- ---------------------------------------------------------------------------

create table if not exists public.availability_rules (
  id             uuid        primary key default gen_random_uuid(),
  calendar_id    uuid        not null references public.calendars (id) on delete cascade,
  weekday        smallint    not null,
  start_time     time        not null,
  end_time       time        not null,
  effective_from date,
  effective_to   date,
  created_by     uuid        references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),

  constraint availability_rules_weekday_check check (weekday between 0 and 6),
  constraint availability_rules_time_order_check check (start_time < end_time),
  constraint availability_rules_effective_order_check
    check (effective_to is null or effective_from is null or effective_to >= effective_from)
);

comment on column public.availability_rules.weekday is
  '02 §4.4 row 2: 0-6 with **Monday = 0**. See this file''s header conflict note (1): config/scheduling.ts uses the JS convention where 0 = Sunday.';
comment on column public.availability_rules.start_time is
  'C-3: local wall-clock in the calendar''s zone, materialised per date so DST days are 23 / 25 h (03 I-6).';

create index if not exists availability_rules_calendar_weekday_idx
  on public.availability_rules (calendar_id, weekday);

-- ---------------------------------------------------------------------------
-- 3. `availability_blocks` (02 §4.4 row 3) — one-off ranges, admin-set.
-- ---------------------------------------------------------------------------

create table if not exists public.availability_blocks (
  id          uuid        primary key default gen_random_uuid(),
  calendar_id uuid        not null references public.calendars (id) on delete cascade,
  kind        public.block_kind not null,
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  reason      text,
  created_by  uuid        references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint availability_blocks_range_check check (start_at < end_at)
);

comment on table public.availability_blocks is
  '02 §4.4 row 3 / ADR-077: precedence blocked > open > rule. Bank holidays are hand-entered blocked rows (no feed - 02 §5 row 14). A blocked range over an active booking FLAGS it (needs_attention + attention_reason = blocked-over), never cancels it.';

create index if not exists availability_blocks_calendar_range_idx
  on public.availability_blocks (calendar_id, start_at, end_at);

-- ---------------------------------------------------------------------------
-- 4. `bookings` (02 §4.4 row 4) — the call record.
-- ---------------------------------------------------------------------------

create table if not exists public.bookings (
  id                     uuid        primary key default gen_random_uuid(),
  calendar_id            uuid        not null references public.calendars (id) on delete restrict,
  kind                   public.call_type not null,
  booked_by_role         public.actor_role not null,
  booked_by_user_id      uuid        references auth.users (id) on delete set null,
  subject_type           public.booking_subject_type not null,
  subject_id             uuid        not null,
  start_at               timestamptz not null,
  end_at                 timestamptz not null,
  status                 public.booking_status not null,
  priority               smallint    not null,
  hold_expires_at        timestamptz,
  idempotency_key        text,
  rescheduled_from_at    timestamptz,
  rescheduled_at         timestamptz,
  displaced_by_booking_id uuid       references public.bookings (id) on delete set null,
  displaced_from_at      timestamptz,
  displaced_at           timestamptz,
  displacement_count     integer     not null default 0,
  displacement_count_day date,
  needs_attention        boolean     not null default false,
  attention_reason       public.attention_reason,
  next_attempt_at        timestamptz,
  cancel_reason          public.booking_cancel_reason,
  call_outcome           public.call_outcome,
  call_note              text,
  done_by                uuid        references auth.users (id) on delete set null,
  done_at                timestamptz,
  notes                  text,
  version                integer     not null default 1,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint bookings_range_check check (end_at > start_at),
  constraint bookings_version_check check (version >= 1),
  -- 02 §4.4 row 4: parent kinds 2, nanny-commission 1
  constraint bookings_priority_matches_kind_check
    check (priority = case when kind = 'nanny-commission' then 1 else 2 end),
  constraint bookings_held_has_expiry_check
    check ((status = 'held') = (hold_expires_at is not null)),
  constraint bookings_rescheduled_has_provenance_check
    check (status <> 'rescheduled'
           or (rescheduled_from_at is not null and rescheduled_at is not null)),
  -- The displacement is written in two steps - move the occupant, then insert the booking that
  -- displaced it and back-fill the pointer - because the pointer's target does not exist until the
  -- insert. A CHECK is immediate and cannot be deferred, so requiring all three columns together
  -- made every displacement abort before the insert was reached (database-reviewer C-1, measured):
  -- I-2 and I-3 were unreachable code. What is actually invariant is that the two timestamps travel
  -- together and the pointer never appears without them.
  constraint bookings_displaced_pair_check
    check ((displaced_from_at is null) = (displaced_at is null)
           and (displaced_by_booking_id is null or displaced_from_at is not null)),
  -- I-13 (fix: database-reviewer H-2): the cap counts displacements, and a displacement overwrites
  -- the same row, so the count has to live on the row.
  constraint bookings_displacement_count_check
    check (displacement_count >= 0 and (displacement_count = 0) = (displacement_count_day is null)),
  constraint bookings_done_has_outcome_check
    check (status <> 'done' or (call_outcome is not null and done_by is not null and done_at is not null)),
  constraint bookings_cancelled_has_reason_check
    check (status <> 'cancelled' or cancel_reason is not null),
  constraint bookings_attention_reason_check
    check (needs_attention = (attention_reason is not null))
);

comment on table public.bookings is
  '02 §4.4 row 4 / R-1: the call record AND the only stored slot-shaped thing. No reminder columns - reminder state is email_logs.dedupe_key (03 §3.2). No callId: the subject is the key (fix A-4 / R1).';
comment on column public.bookings.subject_id is
  'A position id or a nanny id per subject_type. Deliberately **not** a foreign key: one column cannot reference two tables, and 02 §4.4 names the pair as the key. The connector is the one writer (03 §3.2).';
comment on column public.bookings.rescheduled_from_at is
  '03 Booking.rescheduledFrom - the **same row** moves; a reschedule never creates a second row.';
comment on column public.bookings.next_attempt_at is
  '03 markNoAnswer: admin intent recorded on a terminal no-answer row. The retry itself is a new booking (R5).';

-- AC-X-31 / fix D-1 / R6: no overlap, and `rescheduled` occupies a slot just like `booked`.
create unique index if not exists bookings_active_slot_unique_idx
  on public.bookings (calendar_id, start_at)
  where status in ('held', 'booked', 'rescheduled');

-- AC-X-32 / fix D-4 / R6 / 03 I-10: one active booking per subject.
create unique index if not exists bookings_active_subject_unique_idx
  on public.bookings (subject_type, subject_id)
  where status in ('held', 'booked', 'rescheduled');

-- 03 I-11: idempotent writes.
create unique index if not exists bookings_idempotency_key_unique_idx
  on public.bookings (idempotency_key)
  where idempotency_key is not null;

comment on column public.bookings.displacement_count is
  '03 I-13 (fix: S-9): how many times THIS booking has been displaced today. A displacement moves the same row, so counting rows would always answer 1 and the cap would never bind (database-reviewer H-2). The day is the calendar''s London day, not the session''s.';

-- 03 listForSubject and the I-13 lookup both read by subject across every status.
create index if not exists bookings_subject_idx
  on public.bookings (subject_type, subject_id, start_at desc);

create index if not exists bookings_displaced_by_idx
  on public.bookings (displaced_by_booking_id) where displaced_by_booking_id is not null;
create index if not exists bookings_calendar_start_idx on public.bookings (calendar_id, start_at);
create index if not exists bookings_status_start_idx on public.bookings (status, start_at);

drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

-- C-9 (fix: database-reviewer M-1) — the database owns the bump, which is why
-- book_slot() below never writes `version` itself.
drop trigger if exists bookings_bump_version on public.bookings;
create trigger bookings_bump_version
  before update on public.bookings
  for each row execute function public.bump_version();

-- ---------------------------------------------------------------------------
-- 5. The FK 0006 left off (02 §6 row 0009).
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nanny_positions_call_booking_id_fkey') then
    alter table public.nanny_positions
      add constraint nanny_positions_call_booking_id_fkey
      foreign key (call_booking_id) references public.bookings (id) on delete set null;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 6. `book_slot()` — the one booking transaction (02 §7).
--
--    Scope, deliberately narrow (recorded in this unit's PROGRESS): this function
--    does **not** generate slots or search for the next free one. 03 §3.6 makes
--    `lib/generate-slots.ts` and `lib/next-free-slot.ts` pure TypeScript shared
--    by the real inside and `scheduling.stub.ts`; re-implementing the same
--    window, DST and grid rules in PL/pgSQL would be a second source of truth
--    for I-6 and I-7 that could drift silently. The module computes the target
--    slot and, for a displacement, where the nanny goes; this function does the
--    part only the database can do atomically: lock the calendar, honour the
--    hold, move the displaced row and insert the new one under the two partial
--    uniques — which is exactly 02 §7's reason for it ("lets the displacement
--    touch another user's row under I-1 without widening user policies").
--    Events are emitted by the caller inside the same unit of work (03 §3.6:
--    "scheduling writes the row, the caller emits"), which is also why this
--    function does not need the `events` table of 0011.
-- ---------------------------------------------------------------------------

create or replace function public.book_slot(
  p_calendar_id        uuid,
  p_kind               public.call_type,
  p_subject_type       public.booking_subject_type,
  p_subject_id         uuid,
  p_start_at           timestamptz,
  p_actor_role         public.actor_role,
  p_actor_user_id      uuid,
  p_idempotency_key    text,
  p_displacement_cap   integer,
  p_hold_id            uuid    default null,
  p_displace_to        timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot_minutes  integer;
  v_lead_minutes  integer;
  v_horizon_days  integer;
  v_timezone      text;
  v_london_day    date;
  v_priority      smallint := case when p_kind = 'nanny-commission' then 1 else 2 end;
  v_existing      public.bookings;
  v_occupant      public.bookings;
  v_displaced     public.bookings;
  v_booking       public.bookings;
  v_count         integer;
  v_constraint    text;
begin
  -- 0. The caller is who they say they are (security-reviewer H5). This function is a definer that
  --    writes another user's row by design, and 07 §5.1 rule 5 lists it as a user-session road, so
  --    every argument is treated as hostile until the caller is proven privileged. Without this,
  --    `p_kind = 'nanny-commission'` alone (priority 1) would let a nanny displace a parent, which
  --    I-2 forbids in terms, and `p_displacement_cap` would be whatever the attacker passed.
  if not public.is_privileged_writer() then
    if p_actor_user_id is distinct from auth.uid() then
      raise exception 'ACTOR_MISMATCH' using errcode = 'insufficient_privilege';
    end if;
    if p_actor_role = 'admin' and not public.is_admin() then
      raise exception 'ACTOR_MISMATCH' using errcode = 'insufficient_privilege';
    end if;
    if p_subject_type = 'nanny' then
      if p_subject_id is distinct from public.current_nanny_id() then
        raise exception 'SUBJECT_NOT_YOURS' using errcode = 'insufficient_privilege';
      end if;
    else
      if not exists (
        select 1 from public.nanny_positions np
        where np.id = p_subject_id and np.parent_id = public.current_parent_id()
      ) then
        raise exception 'SUBJECT_NOT_YOURS' using errcode = 'insufficient_privilege';
      end if;
    end if;
    -- kind and priority travel together: a nanny-commission call has a nanny subject and nothing else
    if (p_kind = 'nanny-commission') <> (p_subject_type = 'nanny') then
      raise exception 'KIND_NOT_YOURS' using errcode = 'insufficient_privilege';
    end if;
  end if;

  if p_displacement_cap is null or p_displacement_cap < 0 then
    raise exception 'book_slot: p_displacement_cap comes from SCHEDULING.maxDisplacementsPerNannyPerDay';
  end if;

  -- 1. The serialisation point (02 §4.4 row 1). Everything below runs under it, which is why the
  --    idempotency lookup is here and not before: on a pre-lock snapshot two concurrent replays
  --    both miss and the second dies on a unique index instead of returning the first result
  --    (03 I-11; database-reviewer H-4).
  select c.slot_minutes, c.lead_time_minutes, c.booking_horizon_days, c.timezone
    into v_slot_minutes, v_lead_minutes, v_horizon_days, v_timezone
  from public.calendars c where c.id = p_calendar_id for update;
  if not found then
    raise exception 'CALENDAR_UNKNOWN' using errcode = 'no_data_found';
  end if;

  v_london_day := (now() at time zone v_timezone)::date;

  if p_idempotency_key is not null then
    select * into v_existing from public.bookings b where b.idempotency_key = p_idempotency_key;
    if found then
      if not public.is_privileged_writer()
         and v_existing.booked_by_user_id is distinct from auth.uid() then
        raise exception 'NOT_FOUND' using errcode = 'no_data_found';
      end if;
      return jsonb_build_object('booking', to_jsonb(v_existing), 'displaced', null, 'replayed', true);
    end if;
  end if;

  -- 2. I-7, re-checked here because the caller computed the slot before the lock (03 I-7).
  if p_start_at < now() + make_interval(mins => v_lead_minutes)
     or p_start_at > now() + make_interval(days => v_horizon_days) then
    raise exception 'SLOT_OUTSIDE_WINDOW' using errcode = 'invalid_parameter_value';
  end if;

  -- 3. Clear a stale hold at this key before anyone looks at the slot (02 §7's own order). The
  --    first draft did this inside the p_hold_id branch and then raised, which rolled the cancel
  --    back, and left an expired hold occupying the slot for any other caller until the sweep ran
  --    (database-reviewer H-3).
  update public.bookings b
  set status = 'cancelled', cancel_reason = 'other', hold_expires_at = null
  where b.calendar_id = p_calendar_id and b.start_at = p_start_at
    and b.status = 'held' and b.hold_expires_at <= now();

  -- 4. The hold, if the caller has one (03 §3.2: a stale holdId fails, it never books elsewhere).
  if p_hold_id is not null then
    select * into v_existing from public.bookings b where b.id = p_hold_id for update;
    if not found or v_existing.status <> 'held' then
      raise exception 'HOLD_EXPIRED' using errcode = 'invalid_parameter_value';
    end if;
    if v_existing.subject_type <> p_subject_type or v_existing.subject_id <> p_subject_id
       or v_existing.start_at <> p_start_at or v_existing.calendar_id <> p_calendar_id
       or v_existing.kind <> p_kind then
      raise exception 'HOLD_NOT_YOURS' using errcode = 'insufficient_privilege';
    end if;
    update public.bookings b
    set status = 'booked', hold_expires_at = null, idempotency_key = p_idempotency_key
    where b.id = p_hold_id
    returning * into v_booking;
    return jsonb_build_object('booking', to_jsonb(v_booking), 'displaced', null, 'replayed', false);
  end if;

  -- 5. Who is on the slot already?
  select * into v_occupant
  from public.bookings b
  where b.calendar_id = p_calendar_id and b.start_at = p_start_at
    and b.status in ('held', 'booked', 'rescheduled')
  for update;

  if found then
    -- 03 I-2: a nanny never displaces; a parent never displaces a parent.
    if v_priority <= v_occupant.priority then
      raise exception 'SLOT_TAKEN' using errcode = 'exclusion_violation';
    end if;

    -- 03 I-13 (fix: S-9), counted on the row and bounded to the calendar's London day.
    v_count := case when v_occupant.displacement_count_day = v_london_day
                    then v_occupant.displacement_count else 0 end;
    if v_count >= p_displacement_cap then
      raise exception 'NOT_DISPLACEABLE' using errcode = 'exclusion_violation';
    end if;

    if p_displace_to is null then
      -- 03 I-3: the parent still succeeds; the nanny's booking is cancelled and flagged.
      update public.bookings b
      set status = 'cancelled', cancel_reason = 'displaced-no-slot', hold_expires_at = null,
          needs_attention = true, attention_reason = 'displaced',
          displaced_from_at = b.start_at, displaced_at = now(),
          displacement_count = v_count + 1, displacement_count_day = v_london_day
      where b.id = v_occupant.id
      returning * into v_displaced;
    else
      begin
        update public.bookings b
        set status = 'rescheduled', hold_expires_at = null,
            rescheduled_from_at = b.start_at, rescheduled_at = now(),
            start_at = p_displace_to,
            end_at = p_displace_to + make_interval(mins => v_slot_minutes),
            needs_attention = true, attention_reason = 'displaced',
            displaced_from_at = b.start_at, displaced_at = now(),
            displacement_count = v_count + 1, displacement_count_day = v_london_day
        where b.id = v_occupant.id
        returning * into v_displaced;
      exception
        when unique_violation then
          -- The caller computed p_displace_to before the lock and it has since been taken.
          -- 03 I-2 / I-3: the parent still succeeds, so fall back to the I-3 branch rather than
          -- failing the parent's booking (database-reviewer H-5).
          update public.bookings b
          set status = 'cancelled', cancel_reason = 'displaced-no-slot', hold_expires_at = null,
              needs_attention = true, attention_reason = 'displaced',
              displaced_from_at = b.start_at, displaced_at = now(),
              displacement_count = v_count + 1, displacement_count_day = v_london_day
          where b.id = v_occupant.id
          returning * into v_displaced;
      end;
    end if;
  end if;

  insert into public.bookings (
    calendar_id, kind, booked_by_role, booked_by_user_id, subject_type, subject_id,
    start_at, end_at, status, priority, idempotency_key
  ) values (
    p_calendar_id, p_kind, p_actor_role, p_actor_user_id, p_subject_type, p_subject_id,
    p_start_at, p_start_at + make_interval(mins => v_slot_minutes), 'booked', v_priority,
    p_idempotency_key
  )
  returning * into v_booking;

  if v_displaced.id is not null then
    update public.bookings set displaced_by_booking_id = v_booking.id where id = v_displaced.id
    returning * into v_displaced;
  end if;

  return jsonb_build_object(
    'booking', to_jsonb(v_booking),
    'displaced', case when v_displaced.id is null then null else to_jsonb(v_displaced) end,
    'replayed', false
  );
exception
  when unique_violation then
    -- Branch on the constraint NAME, never on the message text: sqlerrm is locale-dependent, and
    -- the first draft's `like '%..._idx%'` let the slot index and the idempotency index fall
    -- through as raw Postgres errors (database-reviewer M-2). The two deliberate raises above now
    -- carry `exclusion_violation`, so they no longer pass through this handler at all.
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'bookings_active_subject_unique_idx' then
      raise exception 'ALREADY_BOOKED' using errcode = 'exclusion_violation';
    elsif v_constraint = 'bookings_active_slot_unique_idx' then
      raise exception 'SLOT_TAKEN' using errcode = 'exclusion_violation';
    elsif v_constraint = 'bookings_idempotency_key_unique_idx' and p_idempotency_key is not null then
      -- 03 I-11: a concurrent replay lost the race; return what the winner wrote.
      select * into v_existing from public.bookings b where b.idempotency_key = p_idempotency_key;
      return jsonb_build_object('booking', to_jsonb(v_existing), 'displaced', null, 'replayed', true);
    end if;
    raise;
end;
$$;

comment on function public.book_slot is
  '02 §7: the one booking transaction - lock the calendar row, honour or refuse the hold, displace under I-2 / I-3 / I-13, insert. Returns { booking, displaced, replayed }. Slot generation and next-free-slot search stay in the TypeScript pure functions 03 §3.6 shares with the stub; events are emitted by the caller in the same unit of work (03 §3.6).';

revoke all on function public.book_slot(uuid, public.call_type, public.booking_subject_type, uuid,
  timestamptz, public.actor_role, uuid, text, integer, uuid, timestamptz) from public;
grant execute on function public.book_slot(uuid, public.call_type, public.booking_subject_type, uuid,
  timestamptz, public.actor_role, uuid, text, integer, uuid, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Seed — one calendar and its Mon-Fri rules (ADR-076; HANDOFF §6.3 row 2).
-- ---------------------------------------------------------------------------

do $$
declare
  v_calendar_id uuid;
begin
  if not exists (select 1 from public.calendars) then
    insert into public.calendars (name, timezone, slot_minutes, booking_horizon_days,
                                  lead_time_minutes, hold_minutes)
    values ('London calls', 'Europe/London', 30, 14, 120, 5)
    returning id into v_calendar_id;

    -- weekday 0..4 = Monday..Friday under 02 §4.4's convention (header note 1)
    insert into public.availability_rules (calendar_id, weekday, start_time, end_time)
    select v_calendar_id, d, time '09:00', time '19:00'
    from generate_series(0, 4) as d;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 8. RLS (02 C-10; 07 §5.2 rows `calendars · availability_rules ·
--    availability_blocks` and `bookings`). The calendar tables are admin-only;
--    the slot generator reads them through the service role. On `bookings`
--    there is **no client INSERT or UPDATE policy at all** — every write goes
--    through book_slot() and the scheduling definers (07 §5.2).
-- ---------------------------------------------------------------------------

alter table public.calendars enable row level security;
alter table public.calendars force row level security;
alter table public.availability_rules enable row level security;
alter table public.availability_rules force row level security;
alter table public.availability_blocks enable row level security;
alter table public.availability_blocks force row level security;

drop policy if exists calendars_admin_select on public.calendars;
create policy calendars_admin_select on public.calendars
  for select to authenticated using ((select public.is_admin()));

drop policy if exists availability_rules_admin_select on public.availability_rules;
create policy availability_rules_admin_select on public.availability_rules
  for select to authenticated using ((select public.is_admin()));

drop policy if exists availability_blocks_admin_select on public.availability_blocks;
create policy availability_blocks_admin_select on public.availability_blocks
  for select to authenticated using ((select public.is_admin()));

alter table public.bookings enable row level security;
alter table public.bookings force row level security;

drop policy if exists bookings_parent_select on public.bookings;
create policy bookings_parent_select on public.bookings
  for select to authenticated
  using (
    booked_by_user_id = (select auth.uid())
    or (subject_type = 'position' and exists (
          select 1 from public.nanny_positions p
          where p.id = bookings.subject_id and p.parent_id = (select public.current_parent_id())))
  );

drop policy if exists bookings_nanny_select on public.bookings;
create policy bookings_nanny_select on public.bookings
  for select to authenticated
  using (subject_type = 'nanny' and subject_id = (select public.current_nanny_id()));

drop policy if exists bookings_admin_select on public.bookings;
create policy bookings_admin_select on public.bookings
  for select to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- 9. Verify
-- ---------------------------------------------------------------------------

do $$
declare
  v_t text;
  v_bad int;
begin
  foreach v_t in array array['calendars', 'availability_rules', 'availability_blocks', 'bookings'] loop
    if to_regclass('public.' || v_t) is null then
      raise exception '0009: public.% missing', v_t;
    end if;
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_t and c.relrowsecurity and c.relforcerowsecurity
    ) then
      raise exception '0009: public.% must ENABLE and FORCE row level security (02 C-10)', v_t;
    end if;
    select count(*) into v_bad
    from pg_policies where schemaname = 'public' and tablename = v_t and cmd <> 'SELECT';
    if v_bad <> 0 then
      raise exception '0009: public.% must have no client write policy - book_slot() only (07 §5.2)', v_t;
    end if;
  end loop;

  -- AC-X-31 and AC-X-32, by the names db.constraints asserts
  if to_regclass('public.bookings_active_slot_unique_idx') is null then
    raise exception '0009: the D-1 overlap partial unique index is missing (AC-X-31)';
  end if;
  if to_regclass('public.bookings_active_subject_unique_idx') is null then
    raise exception '0009: the D-4 one-active-booking-per-subject index is missing (AC-X-32)';
  end if;
  if to_regclass('public.bookings_idempotency_key_unique_idx') is null then
    raise exception '0009: the I-11 idempotency index is missing';
  end if;

  -- the predicate matters as much as the columns: `rescheduled` must be inside it (R6)
  select count(*) into v_bad
  from pg_indexes
  where schemaname = 'public'
    and indexname in ('bookings_active_slot_unique_idx', 'bookings_active_subject_unique_idx')
    and indexdef like '%rescheduled%';
  if v_bad <> 2 then
    raise exception '0009: both active-status partial uniques must include rescheduled (fix D-1 / D-4, R6)';
  end if;

  if not exists (select 1 from pg_constraint where conname = 'nanny_positions_call_booking_id_fkey') then
    raise exception '0009: the nanny_positions.call_booking_id FK was not added (02 §6 row 0009)';
  end if;
  if to_regprocedure('public.book_slot(uuid, public.call_type, public.booking_subject_type, uuid, timestamptz, public.actor_role, uuid, text, integer, uuid, timestamptz)') is null then
    raise exception '0009: book_slot() missing (02 §7)';
  end if;

  -- the ADR-076 seed
  select count(*) into v_bad from public.calendars;
  if v_bad <> 1 then
    raise exception '0009: expected exactly one calendar row (ADR-074), found %', v_bad;
  end if;
  if not exists (
    select 1 from public.calendars
    where slot_minutes = 30 and booking_horizon_days = 14
      and lead_time_minutes = 120 and hold_minutes = 5 and timezone = 'Europe/London'
  ) then
    raise exception '0009: the seeded calendar does not carry the ADR-076 values';
  end if;
  select count(*) into v_bad from public.availability_rules;
  if v_bad <> 5 then
    raise exception '0009: expected 5 Mon-Fri availability rules (ADR-076), found %', v_bad;
  end if;

  -- 02 §5 row 9: no slot_holds table, no stored slots
  if to_regclass('public.slot_holds') is not null or to_regclass('public.slots') is not null then
    raise exception '0009: slot_holds / slots must not exist - a hold is a bookings row (02 §5 row 9)';
  end if;
  -- R1 / fix A-4: no calls table
  if to_regclass('public.calls') is not null then
    raise exception '0009: there is no calls table - the booking IS the call record (R-1)';
  end if;
end
$$;
