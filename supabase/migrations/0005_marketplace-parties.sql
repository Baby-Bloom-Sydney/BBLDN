-- 0005_marketplace-parties.sql — the ordered migration set (02-data-model.md §6 row 0005)
--
-- Creates: `nannies` and `parents` (02 §4.2 rows 2-3) — the two marketplace parties — plus the two
-- remaining RLS helpers `current_parent_id()` / `current_nanny_id()` (07 §5.1 rule 2), which could
-- not be written in 0002 because they read these tables.
--
-- Deliberately **not** here (02 §6 row 0005): `current_placement_id` on either table (0007, it FKs
-- nanny_placements) and the `lead_id` foreign key (0014). The `lead_id` *column* exists from here so
-- 0014 only adds the constraint.
--
-- Forced by: nanny_positions.parent_id (0006), verifications.nanny_id (0008).
-- Rollback twin: supabase/rollbacks/0005_marketplace-parties.rollback.sql
--
-- R-7 — no mobile, area or date_of_birth on either table: `user_profiles` (0002) owns contact and
--       location, and matching joins nannies -> user_profiles for the district.
-- R-5 — no `stripe_customer_id` on `parents`: it lives on the spine only (0010).
-- R-8 — `nannies.verification_level` is a denormalised read model with a single writer
--       (`syncNannyVerificationState`); `matching` and browse read it, never `verifications`.
-- @adr ADR-017 / ADR-058 — `is_isolated`: a nanny created by a child invite is out of every
--       candidate set, browse, profile and jobs board until she applies from the portal (I-5).
-- @adr ADR-103 / 07 §2.7(a) — `is_vaccinated` is Art 9 health data. It is created nullable and
--       may be written **only** where a `vaccination-status` consent row exists for that user;
--       declining leaves it null and the parent filter reads null as "not stated".
-- @adr ADR-022 / fix D-13 — `commission_pitch_opted_in_at` (renamed from `bonus_programme_*` so
--       nothing in the schema resembles the removed `bonus_program*` family, N-2 / ADR-099).

-- ---------------------------------------------------------------------------
-- 1. `nannies` (02 §4.2 row 3) — created first: `parents` points at it twice.
-- ---------------------------------------------------------------------------

create table if not exists public.nannies (
  id                          uuid        primary key default gen_random_uuid(),
  user_id                     uuid        not null unique references auth.users (id) on delete cascade,
  bio                         text,
  years_experience            integer,
  qualification               text,
  certificates                text[]      not null default '{}',
  languages                   text[]      not null default '{}',
  has_car                     boolean,
  has_driving_licence         boolean,
  is_non_smoker               boolean,
  comfortable_with_pets       boolean,
  is_vaccinated               boolean,
  hourly_rate_min_pence       integer,
  availability                jsonb,
  available_from              date,
  profile_visible             boolean     not null default false,
  is_isolated                 boolean     not null default true,
  isolation_lifted_at         timestamptz,
  verification_level          public.verification_level not null default 'L0_SIGNED_UP',
  verification_synced_at      timestamptz,
  suspended_at                timestamptz,
  commission_pitch_opted_in_at timestamptz,
  lead_id                     uuid,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  constraint nannies_years_experience_check check (years_experience is null or years_experience between 0 and 60),
  -- C-5: money is GBP minor units, integer, never a float or a formatted string
  constraint nannies_hourly_rate_min_pence_check check (hourly_rate_min_pence is null or hourly_rate_min_pence > 0),
  constraint nannies_isolation_lifted_check check (isolation_lifted_at is null or not is_isolated)
);

comment on table public.nannies is
  '02 §4.2 row 3: the nanny as a marketplace party. Contact and location live on user_profiles (R-7).';
comment on column public.nannies.is_isolated is
  'ADR-017 / ADR-058, I-5. Defaults **true**: a row created without an explicit value is invisible rather than accidentally public. The flag flips only by apply-from-portal.';
comment on column public.nannies.profile_visible is
  'Defaults false for the same reason: visibility is something onboarding turns on, never something a missing value grants.';
comment on column public.nannies.is_vaccinated is
  'ADR-103 / 07 §2.7(a): Art 9 health data, nullable. Written only behind a `vaccination-status` consent record (enforced by the guard trigger below) and excluded from the `nanny_public` view (0016).';
comment on column public.nannies.verification_level is
  'R-8: denormalised read model. Single writer syncNannyVerificationState; never written by the nanny, never read by matching from `verifications`.';
comment on column public.nannies.lead_id is
  'Column now, FK in 0014 (nanny_leads does not exist yet). Every nanny is a lead; an invited nanny has none until apply-from-portal creates one with source = portal (T-1.9).';

-- D-9: the matching hot query. Paired with user_profiles (district) from 0002.
create index if not exists nannies_matching_idx
  on public.nannies (verification_level)
  where profile_visible and not is_isolated;

drop trigger if exists nannies_set_updated_at on public.nannies;
create trigger nannies_set_updated_at
  before update on public.nannies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. `parents` (02 §4.2 row 2)
-- ---------------------------------------------------------------------------

create table if not exists public.parents (
  id                   uuid        primary key default gen_random_uuid(),
  user_id              uuid        not null unique references auth.users (id) on delete cascade,
  signup_source        public.signup_source not null,
  invited_by_nanny_id  uuid        references public.nannies (id) on delete set null,
  current_nanny_id     uuid        references public.nannies (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- 02 §4.2 row 2: signup_source = invite ⇒ invited_by_nanny_id
  constraint parents_invite_has_inviter_check
    check (signup_source <> 'invite' or invited_by_nanny_id is not null)
);

comment on table public.parents is
  '02 §4.2 row 2: the family as a marketplace party. No mobile or area (R-7), no stripe_customer_id (R-5). current_placement_id is added in 0007 once nanny_placements exists.';

-- ON DELETE SET NULL FKs need a covering index or every nanny delete seq-scans
-- `parents` (database-reviewer M-3).
create index if not exists parents_current_nanny_idx
  on public.parents (current_nanny_id) where current_nanny_id is not null;

create index if not exists parents_invited_by_nanny_idx
  on public.parents (invited_by_nanny_id)
  where invited_by_nanny_id is not null;

drop trigger if exists parents_set_updated_at on public.parents;
create trigger parents_set_updated_at
  before update on public.parents
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Party helpers (07 §5.1 rule 2) — the `current_*_id()` half of the helper
--    set, deferred here from 0002 because they read these two tables.
-- ---------------------------------------------------------------------------

create or replace function public.current_parent_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.parents p where p.user_id = auth.uid();
$$;

create or replace function public.current_nanny_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select n.id from public.nannies n where n.user_id = auth.uid();
$$;

-- The board predicate (fix: security-reviewer C1). `is_nanny()` is true for a nanny
-- created by a child invite (is_isolated defaults true), for one never verified, and
-- for one suspended - and 05 §4.2 `int.rls` states the opposite in terms: an isolated
-- nanny is absent from browse, profile, matching, autofire, **board** and team
-- (AC-N-22..26, AC-X-25). I-5 says the same. So the jobs-board policies read this, not
-- `is_nanny()`.
create or replace function public.is_active_nanny()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.nannies n
    where n.user_id = auth.uid() and not n.is_isolated and n.suspended_at is null
  );
$$;

comment on function public.is_active_nanny() is
  'I-5 / AC-N-22..26: a nanny who may see the marketplace at all - not isolated, not suspended. The jobs-board policies of 0006 use this; `is_nanny()` answers a different question (which role is this) and is not an access test on its own.';

revoke all on function public.is_active_nanny() from public;
grant execute on function public.is_active_nanny() to authenticated, service_role;

revoke all on function public.current_parent_id() from public;
revoke all on function public.current_nanny_id() from public;
grant execute on function public.current_parent_id() to authenticated, service_role;
grant execute on function public.current_nanny_id() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. The `is_vaccinated` consent gate (ADR-103; 07 §2.7(a)).
--    07 puts this gate in the profile action. It is repeated here because Art 9
--    health data is exactly the kind of column where "the action always does it"
--    is not a control a reviewer can verify — the database can.
-- ---------------------------------------------------------------------------

create or replace function public.guard_nanny_vaccination_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_vaccinated is null then
    return new;   -- withdrawal always passes: nulling the field is how consent is honoured
  end if;
  if tg_op = 'UPDATE' and new.is_vaccinated is not distinct from old.is_vaccinated then
    return new;
  end if;
  -- The LATEST row, not any row (fix: both reviewers, measured). consent_records is
  -- append-only and 02 §4.1 row 5 makes a withdrawal *a new row with consent_given =
  -- false*, so `exists (... and consent_given)` would find the original true row for
  -- ever and keep the column writable after the Art 9(2)(a) basis was withdrawn.
  if coalesce((
        select c.consent_given
        from public.consent_records c
        where c.user_id = new.user_id and c.agreement_id = 'vaccination-status'
        order by c.created_at desc, c.id desc
        limit 1
      ), false) is not true then
    raise exception
      'nannies.is_vaccinated needs a current vaccination-status consent for this user (ADR-103; 07 §2.7(a))'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

comment on function public.guard_nanny_vaccination_consent() is
  'ADR-103 / 07 §2.7(a): Art 9(2)(a) explicit consent is a precondition for storing health data, so the precondition lives next to the column. Withdrawal nulls the field, which this trigger always permits.';

drop trigger if exists nannies_guard_vaccination_consent on public.nannies;
create trigger nannies_guard_vaccination_consent
  before insert or update of is_vaccinated on public.nannies
  for each row execute function public.guard_nanny_vaccination_consent();

-- ---------------------------------------------------------------------------
-- 5. RLS (02 C-10; 07 §5.2 rows `parents` / `nannies`).
--    Both tables are **SELECT-only for client roles**, per 07 §5.1 rule 4: the
--    columns a nanny may not write (is_isolated, verification_level,
--    suspended_at, the pointers, lead_id) are held by a SECURITY DEFINER action
--    that writes a named column set, not by a column grant — so there is no
--    client UPDATE policy here at all. The owning module (F-b) ships that
--    definer; until it does, nanny profile edits go through the service role.
--    Cross-party reads (a parent seeing a nanny, a nanny seeing a connected
--    parent) arrive in 0016 with `nanny_public`, whose predicate needs 0016's
--    config-derived level floor.
-- ---------------------------------------------------------------------------

alter table public.nannies enable row level security;
alter table public.nannies force row level security;

drop policy if exists nannies_self_select on public.nannies;
create policy nannies_self_select on public.nannies
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists nannies_admin_select on public.nannies;
create policy nannies_admin_select on public.nannies
  for select to authenticated
  using ((select public.is_admin()));

alter table public.parents enable row level security;
alter table public.parents force row level security;

drop policy if exists parents_self_select on public.parents;
create policy parents_self_select on public.parents
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists parents_admin_select on public.parents;
create policy parents_admin_select on public.parents
  for select to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- 6. Verify
-- ---------------------------------------------------------------------------

do $$
declare
  v_t text;
  v_bad int;
begin
  foreach v_t in array array['nannies', 'parents'] loop
    if to_regclass('public.' || v_t) is null then
      raise exception '0005: public.% missing', v_t;
    end if;
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_t and c.relrowsecurity and c.relforcerowsecurity
    ) then
      raise exception '0005: public.% must ENABLE and FORCE row level security (02 C-10)', v_t;
    end if;
    select count(*) into v_bad
    from pg_policies where schemaname = 'public' and tablename = v_t and cmd <> 'SELECT';
    if v_bad <> 0 then
      raise exception '0005: public.% must be SELECT-only for client roles (07 §5.1 rule 4), found % write policy(ies)', v_t, v_bad;
    end if;
  end loop;

  -- R-7: neither party table may duplicate contact or location
  select count(*) into v_bad
  from information_schema.columns
  where table_schema = 'public' and table_name in ('nannies', 'parents')
    and column_name in ('mobile', 'area', 'district', 'date_of_birth', 'stripe_customer_id');
  if v_bad <> 0 then
    raise exception '0005: % contact/location/Stripe column(s) duplicated on a party table (R-5, R-7)', v_bad;
  end if;

  -- 02 §6 row 0005: these two arrive later, and arriving early would hide a cycle
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name in ('nannies', 'parents')
      and column_name = 'current_placement_id'
  ) then
    raise exception '0005: current_placement_id belongs to 0007 (it FKs nanny_placements)';
  end if;
  if exists (select 1 from pg_constraint where conname = 'nannies_lead_id_fkey') then
    raise exception '0005: the lead_id FK belongs to 0014 (nanny_leads does not exist yet)';
  end if;

  if to_regclass('public.nannies_matching_idx') is null then
    raise exception '0005: the D-9 partial index nannies_matching_idx is missing';
  end if;
  if to_regprocedure('public.current_parent_id()') is null
     or to_regprocedure('public.current_nanny_id()') is null
     or to_regprocedure('public.is_active_nanny()') is null then
    raise exception '0005: a party helper is missing (07 §5.1 rule 2)';
  end if;
  -- H-3 again: FORCE RLS makes a non-BYPASSRLS owner answer false for everyone
  foreach v_t in array array['current_parent_id', 'current_nanny_id', 'is_active_nanny',
                             'guard_nanny_vaccination_consent'] loop
    if not exists (
      select 1 from pg_proc p join pg_roles r on r.oid = p.proowner
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_t and (r.rolbypassrls or r.rolsuper)
    ) then
      raise exception '0005: public.%() must be owned by a role with BYPASSRLS (it reads FORCE-RLS tables)', v_t;
    end if;
  end loop;
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relname = 'nannies' and t.tgname = 'nannies_guard_vaccination_consent'
  ) then
    raise exception '0005: the ADR-103 vaccination-consent guard is missing';
  end if;
  -- ADR-103: the column exists and is nullable (B-16 closed "keep", not "drop")
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'nannies'
      and column_name = 'is_vaccinated' and is_nullable = 'YES'
  ) then
    raise exception '0005: nannies.is_vaccinated must exist and be nullable (ADR-103)';
  end if;
end
$$;
