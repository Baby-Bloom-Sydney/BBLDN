-- 0018_call-mirror.sql — the ordered migration set (02-data-model.md §6 row 0018)
--
-- Creates: `position_call_mirror` (02 §4.2) + its RLS; `availability_blocks.revoked_at` (02 §4.4
-- row 3) + the partial index the `unblock` read needs.
--
-- Forced by: nothing later — like `0017`, every object here is **additive** over `0000`–`0017`.
-- Nothing drops, renames or narrows anything an earlier migration created, so the set still applies
-- forwards from an empty database in one pass.
-- Rollback twin: supabase/rollbacks/0018_call-mirror.rollback.sql
--
-- WHY THIS TABLE EXISTS, AND WHY IT IS NOT A `calls` TABLE.
--   02 R-1 is unchanged and is the reason this file is small: there is **no `CallId`** and **no
--   `calls` table**. A matchmaking / onboarding call's *state* stays where `0006` put it —
--   `nanny_positions.call_state · call_type · call_requested_at · call_booking_id`, guarded by the
--   D-3 biconditional CHECK — and its canonical record stays the `bookings` row (`0009`). Neither of
--   those holds the call's **own detail**: the outcome an admin recorded (C-3 / C-4), the note that
--   came with it, how many times the call went unanswered (C-5 / R5), and the nanny a trigger-(c) or
--   path-E call is about (04 §3.3). Until this migration those four facts lived only in
--   `memoryCallMirrorStore`, so they were lost on a cold start and — the consequence `1f` hit —
--   03 §3.6's "awaiting-slot calls come from `call-layer`" had nothing behind it, leaving the
--   awaiting-slot half of the admin call queue (S-A-03) unimplementable.
--   The row is keyed by `position_id` and cannot exist without its position, so it adds no new
--   identity to the model; it is the mirror's detail, not a second copy of its state (02 §4.2).
--
-- @adr ADR-073 — the call is a state on the position, not an entity. Preserved: this table stores
--      no `call_state`, no `call_type` and no booking pointer. A reader composes the `CallMirror`
--      from `nanny_positions` (state) + this row (detail); there is exactly one writer of each
--      column and therefore nothing to drift.
-- @adr ADR-070 — `outcome` is the `call_outcome` enum (0000), never text.
-- 07 §5.1 rule 4 — the mirror takes **no client write at all**: `call-layer` writes it inside the C
--      rows at service scope, the way `events` is written. A parent may read her own call's detail
--      (the call page says "we'll try again" after a no-answer, 04 §6.2 S-P-01), so SELECT is
--      policy-gated through the position's `parent_id`; `anon` gets nothing.
--
-- `availability_blocks.revoked_at` — 03 §3.2 gives `scheduling` an `unblock`, 03 §1.4's `Query` has
--      no `delete`, and the block row had no column that could take it out of force. `1f` pinned
--      `unblock` `it.fails` rather than flip `kind` to `'open'`, because precedence is
--      blocked > open > rule, so an `open` row *adds* availability instead of removing a block.
--      The column is the fix `1f` named for `0018`; the partial index is what keeps the
--      slot-generation read (which now filters `revoked_at is null`) from scanning revoked rows.

-- ---------------------------------------------------------------------------
-- 1. `position_call_mirror` (02 §4.2)
-- ---------------------------------------------------------------------------

create table if not exists public.position_call_mirror (
  position_id      uuid        primary key
                               references public.nanny_positions (id) on delete cascade,
  outcome          public.call_outcome,
  notes            text,
  no_answer_count  integer     not null default 0,
  about_nanny      text,
  version          integer     not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- R5 / C-5: only a no-answer bumps the count, and it never goes backwards.
  constraint position_call_mirror_no_answer_count_check
    check (no_answer_count >= 0),
  -- The CALL's own version, not the position's. `nanny_positions.version` counts the position's
  -- stage moves (P rows); a C row moves the call without moving the position, so the two counters
  -- cannot be the same column — `StateAfter.version` for a C row is this one.
  constraint position_call_mirror_version_check
    check (version >= 1),
  -- 03 §2.7: a note is a note *about an outcome*. A note with no outcome is an admin write that
  -- never reached C-3 / C-4, which is the shape a half-applied transaction leaves behind.
  constraint position_call_mirror_notes_need_outcome_check
    check (notes is null or outcome is not null)
);

comment on table public.position_call_mirror is
  '02 §4.2: the call mirror''s own detail. R-1 is unchanged - the call''s STATE is nanny_positions.call_* and its record is the bookings row; this table holds only what neither holds. No CallId, no calls table.';
comment on column public.position_call_mirror.no_answer_count is
  'R5 / C-5: bumped when an admin records no-answer. The booking row ends no-answer and the call returns to awaiting-slot; the retry is a NEW booking.';
comment on column public.position_call_mirror.about_nanny is
  '04 §3.3 trigger (c) / path E: the nanny this call is about, by the first name already released to this parent through nanny_public (07 §5.2). Never a surname, never an id a parent has not been given.';

drop trigger if exists set_updated_at on public.position_call_mirror;
create trigger set_updated_at
  before update on public.position_call_mirror
  for each row execute function public.set_updated_at();

-- D-12's sibling: the admin call queue reads every position whose call is not finished (0006's
-- `nanny_positions_open_call_idx`) and then decorates it from here, one row at a time by PK. No
-- second index is needed on this table - the PK is the access path.

alter table public.position_call_mirror enable row level security;
alter table public.position_call_mirror force row level security;

-- 07 §5.1 rule 4: SELECT only, and only the parent whose position it is. No INSERT / UPDATE /
-- DELETE policy exists for any client role, so `call-layer` at service scope is the one writer.
drop policy if exists position_call_mirror_select_own on public.position_call_mirror;
create policy position_call_mirror_select_own
  on public.position_call_mirror
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.nanny_positions p
        join public.parents pa on pa.id = p.parent_id
       where p.id = position_call_mirror.position_id
         and pa.user_id = (select auth.uid())
    )
  );

drop policy if exists position_call_mirror_select_admin on public.position_call_mirror;
create policy position_call_mirror_select_admin
  on public.position_call_mirror
  for select
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. `upsert_call_mirror()` — the one write, because it is two tables (ADR-127)
--
--    A C row moves the call's STATE (`nanny_positions.call_*`) and its DETAIL
--    (`position_call_mirror`) together. ADR-127 settled that one unit of work is
--    one RPC, so two `update`s through 03 §1.4's `Query` would be two
--    transactions: a crash between them leaves `call_state = 'slot-chosen'` with
--    no recorded outcome, or an outcome on a call the mirror still calls open.
--    One definer, one transaction, both rows.
--
--    It is deliberately NOT an upsert of the position: `nanny_positions` must
--    already exist (C-a's precondition is "position live"), so a missing row is
--    an error the caller must see, not a row this function invents.
-- ---------------------------------------------------------------------------

create or replace function public.upsert_call_mirror(
  p_position_id       uuid,
  p_call_state        public.call_state,
  p_no_answer_count   integer,
  p_version           integer,
  -- The nullable half carries `default null` so the generated `Args` type marks each one
  -- optional: 03 §1.4's `Query.rpc` is typed from `database.types.ts`, and the generator has
  -- no way to say "this argument may be null", so a required argument would force every
  -- caller to pass a `null` the type rejects. Omitting the argument IS the null.
  p_call_type         public.call_type   default null,
  p_call_requested_at timestamptz        default null,
  p_call_booking_id   uuid               default null,
  p_outcome           public.call_outcome default null,
  p_notes             text               default null,
  p_about_nanny       text               default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
begin
  update public.nanny_positions
     set call_state        = p_call_state,
         call_type         = p_call_type,
         call_requested_at = p_call_requested_at,
         call_booking_id   = p_call_booking_id
   where id = p_position_id;

  if not found then
    raise exception 'upsert_call_mirror: no position %', p_position_id
      using errcode = 'no_data_found';
  end if;

  insert into public.position_call_mirror as m
    (position_id, outcome, notes, no_answer_count, about_nanny, version)
  values
    (p_position_id, p_outcome, p_notes, coalesce(p_no_answer_count, 0), p_about_nanny,
     greatest(coalesce(p_version, 1), 1))
  on conflict (position_id) do update
    set outcome         = excluded.outcome,
        notes           = excluded.notes,
        no_answer_count = excluded.no_answer_count,
        about_nanny     = excluded.about_nanny,
        -- the caller computes the next version from the one it read; a caller that
        -- hands back a stale number must not be able to wind the counter backwards
        version         = greatest(excluded.version, m.version + 1)
  returning m.version into v_version;

  return v_version;
end;
$$;

comment on function public.upsert_call_mirror is
  '03 §2.7 / ADR-127: the C rows'' one write. Moves the call state on nanny_positions and the call detail on position_call_mirror in a single transaction, because 03 §1.4 Query cannot make two updates atomic. service_role only.';

revoke all on function public.upsert_call_mirror(
  uuid, public.call_state, integer, integer, public.call_type, timestamptz,
  uuid, public.call_outcome, text, text) from public;
revoke all on function public.upsert_call_mirror(
  uuid, public.call_state, integer, integer, public.call_type, timestamptz,
  uuid, public.call_outcome, text, text) from anon, authenticated;
grant execute on function public.upsert_call_mirror(
  uuid, public.call_state, integer, integer, public.call_type, timestamptz,
  uuid, public.call_outcome, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. `availability_blocks.revoked_at` (02 §4.4 row 3; 03 §3.2 `unblock`)
-- ---------------------------------------------------------------------------

alter table public.availability_blocks
  add column if not exists revoked_at timestamptz;

comment on column public.availability_blocks.revoked_at is
  '03 §3.2 unblock: the block is out of force from this instant. Set, never deleted - I-4 block-flags-never-cancels means the bookings a block flagged stay auditable after the block is lifted.';

-- The slot read filters `revoked_at is null`; the index keeps that filter off the revoked rows.
create index if not exists availability_blocks_in_force_idx
  on public.availability_blocks (calendar_id, start_at, end_at)
  where revoked_at is null;

-- ---------------------------------------------------------------------------
-- 4. Verify — the migration asserts its own result (02 §6; 0017's pattern)
-- ---------------------------------------------------------------------------

do $$
declare
  v_bad integer;
begin
  if to_regclass('public.position_call_mirror') is null then
    raise exception '0018: position_call_mirror missing';
  end if;

  -- C-10: every table is ENABLE + FORCE RLS.
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'position_call_mirror'
      and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception '0018: position_call_mirror must be ENABLE + FORCE ROW LEVEL SECURITY (C-10)';
  end if;

  -- 07 §5.1 rule 4: no client write policy of any kind, and nothing for anon.
  select count(*) into v_bad
    from pg_policies
   where schemaname = 'public' and tablename = 'position_call_mirror'
     and (cmd <> 'SELECT' or 'anon' = any(roles));
  if v_bad <> 0 then
    raise exception '0018: position_call_mirror carries % non-SELECT or anon policy/policies (07 §5.1 rule 4)', v_bad;
  end if;

  if (select count(*) from pg_policies
       where schemaname = 'public' and tablename = 'position_call_mirror') <> 2 then
    raise exception '0018: expected exactly 2 SELECT policies on position_call_mirror (own + admin)';
  end if;

  -- R-1 stays true: the mirror's detail table holds none of the call's state.
  select count(*) into v_bad
    from information_schema.columns
   where table_schema = 'public' and table_name = 'position_call_mirror'
     and column_name in ('call_state', 'call_type', 'call_booking_id', 'call_requested_at',
                         'state', 'booking_id', 'parent_id');
  if v_bad <> 0 then
    raise exception '0018: position_call_mirror must not duplicate the call state R-1 puts on nanny_positions (% offending column(s))', v_bad;
  end if;

  if to_regclass('public.position_call_mirror_pkey') is null then
    raise exception '0018: position_call_mirror must be keyed by position_id alone (no CallId - R-1)';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'position_call_mirror_no_answer_count_check'
  ) then
    raise exception '0018: position_call_mirror_no_answer_count_check missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'position_call_mirror_notes_need_outcome_check'
  ) then
    raise exception '0018: position_call_mirror_notes_need_outcome_check missing';
  end if;

  -- the cascade is what makes the row incapable of outliving its position
  if not exists (
    select 1 from pg_constraint
    where conname = 'position_call_mirror_position_id_fkey' and confdeltype = 'c'
  ) then
    raise exception '0018: position_call_mirror.position_id must be ON DELETE CASCADE';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.position_call_mirror'::regclass and tgname = 'set_updated_at'
  ) then
    raise exception '0018: position_call_mirror needs the set_updated_at trigger (02 §2)';
  end if;

  -- the one write, and only the service role may make it (07 §5.1 rule 5)
  if to_regprocedure('public.upsert_call_mirror(uuid, public.call_state, integer, integer, public.call_type, timestamptz, uuid, public.call_outcome, text, text)') is null then
    raise exception '0018: upsert_call_mirror() missing';
  end if;

  select count(*) into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'upsert_call_mirror';
  if v_bad <> 1 then
    raise exception '0018: expected exactly 1 upsert_call_mirror overload, found % (a leftover overload is a definer nobody granted on purpose)', v_bad;
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'upsert_call_mirror'
      and p.prosecdef and p.proconfig is not null and 'search_path=""' = any(p.proconfig)
  ) then
    raise exception '0018: upsert_call_mirror() must be SECURITY DEFINER with search_path pinned (02 §7)';
  end if;

  -- 0017's database-reviewer M-1: a definer over a FORCE RLS table reaches it only because the owner
  -- has BYPASSRLS. If ownership ever differed this function would write nothing, silently.
  if exists (
    select 1 from pg_proc p join pg_roles r on r.oid = p.proowner
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'upsert_call_mirror'
      and not (r.rolbypassrls or r.rolsuper)
  ) then
    raise exception '0018: upsert_call_mirror() is owned by a role without BYPASSRLS; FORCE RLS would make it write nothing, silently (0002''s rule)';
  end if;

  if has_function_privilege('anon', 'public.upsert_call_mirror(uuid, public.call_state, integer, integer, public.call_type, timestamptz, uuid, public.call_outcome, text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.upsert_call_mirror(uuid, public.call_state, integer, integer, public.call_type, timestamptz, uuid, public.call_outcome, text, text)', 'execute') then
    raise exception '0018: upsert_call_mirror() must be service_role only (07 §5.1 rule 5)';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'availability_blocks'
      and column_name = 'revoked_at'
  ) then
    raise exception '0018: availability_blocks.revoked_at missing';
  end if;

  if to_regclass('public.availability_blocks_in_force_idx') is null then
    raise exception '0018: availability_blocks_in_force_idx missing';
  end if;
end
$$;
