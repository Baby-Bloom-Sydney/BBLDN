-- 0014_leads.sql — the ordered migration set (02-data-model.md §6 row 0014)
--
-- Creates: `nanny_leads`, `parent_leads`, `nanny_contact_state`, `lead_contacts`, `lead_notes`
-- (02 §4.7), and the **`nannies.lead_id` foreign key** that 0005 deliberately left off.
--
-- Rollback twin: supabase/rollbacks/0014_leads.rollback.sql
--
-- These are the operator's CRM. 07 §5.2's last row is explicit and slightly counter-intuitive:
-- **a nanny never reads her own lead row** - it is the operator's record of the relationship, not
-- the nanny's profile. So not one of these five tables carries a policy for a customer role; the
-- admin reads them, and the funnel writes them through the service role.
--
-- @adr ADR-041 — a parent who drops before the call page is recoverable, which is why
--   `parent_leads` keeps `form_data` and the three converted columns move together.
-- 02 §5 row 5 — no `sydney_resident`, no AU 4-digit postcode: `residency` carries a London
--   `district` (FK to areas) and `lives_in_service_area`.
-- N-9 — Indeed is kept as a `source` value; the Recruitment Agent writes positions, not leads.

create table if not exists public.nanny_leads (
  id                uuid        primary key default gen_random_uuid(),
  first_name        text,
  last_name         text,
  email             extensions.citext not null unique,
  phone             text,
  identity          jsonb,
  experience        jsonb,
  qualifications    jsonb,
  preferences       jsonb,
  availability      jsonb,
  salary            jsonb,
  matching          jsonb,
  about_you         jsonb,
  district          text        references public.areas (district),
  area              text,
  lives_in_service_area boolean,
  right_to_work_status  public.lead_rtw_status not null default 'unknown',
  right_to_work_evidence_type text,
  right_to_work_expires_on    date,
  ai_bio            text,
  ai_content        jsonb,
  ai_model          text,
  lead_status       public.nanny_lead_status not null default 'applied',
  funnel_step       text,
  lead_signals      jsonb,
  source            text,
  last_active_at    timestamptz,
  converted_at      timestamptz,
  terms_accepted_at timestamptz,
  auth_user_id      uuid        references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- C-7 / ADR-102: the same UK E.164 shape as user_profiles.mobile
  constraint nanny_leads_phone_e164_gb_check
    check (phone is null or phone ~ '^\+44[1-9][0-9]{8,9}$'),
  constraint nanny_leads_converted_pair_check
    check ((lead_status = 'converted') = (converted_at is not null))
);

comment on table public.nanny_leads is
  '02 §4.7 row 1: the /apply funnel row until conversion. An unconverted lead is overwritten in place; an invited nanny has no lead at all until apply-from-portal creates one with source = portal (T-1.9).';
comment on column public.nanny_leads.district is
  '02 §5 row 5: the `residency` object of 02 §4.7 is flattened to its two queryable fields - district (FK to areas, so a lead in an unknown district cannot be saved) and lives_in_service_area. Nothing Sydney: no sydney_resident, no 4-digit postcode.';

create index if not exists nanny_leads_status_idx on public.nanny_leads (lead_status, created_at desc);
create index if not exists nanny_leads_district_idx on public.nanny_leads (district)
  where district is not null;
create index if not exists nanny_leads_auth_user_idx on public.nanny_leads (auth_user_id)
  where auth_user_id is not null;

drop trigger if exists nanny_leads_set_updated_at on public.nanny_leads;
create trigger nanny_leads_set_updated_at
  before update on public.nanny_leads
  for each row execute function public.set_updated_at();

-- The FK 0005 left off (02 §6 row 0014).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nannies_lead_id_fkey') then
    alter table public.nannies
      add constraint nannies_lead_id_fkey
      foreign key (lead_id) references public.nanny_leads (id) on delete set null;
  end if;
end
$$;

create index if not exists nannies_lead_idx on public.nannies (lead_id) where lead_id is not null;

create table if not exists public.parent_leads (
  id                  uuid        primary key,
  form_data           jsonb       not null default '{}'::jsonb,
  district            text        references public.areas (district),
  area                text,
  source              text,
  converted_at        timestamptz,
  converted_to_user_id uuid       references auth.users (id) on delete set null,
  position_id         uuid        references public.nanny_positions (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- 02 §4.7 row 2: conversion sets the three converted fields atomically
  constraint parent_leads_converted_together_check
    check (num_nulls(converted_at, converted_to_user_id, position_id) in (0, 3))
);

comment on table public.parent_leads is
  '02 §4.7 row 2 / ADR-041: the advanced-wizard answers before signup. `id` is client-minted so a drop before the call page is recoverable. position_id joins lead -> position -> call in `events`.';

create index if not exists parent_leads_position_idx on public.parent_leads (position_id)
  where position_id is not null;
create index if not exists parent_leads_district_idx on public.parent_leads (district)
  where district is not null;
create index if not exists parent_leads_unconverted_idx on public.parent_leads (created_at)
  where converted_at is null;
create index if not exists parent_leads_converted_user_idx
  on public.parent_leads (converted_to_user_id) where converted_to_user_id is not null;

drop trigger if exists parent_leads_set_updated_at on public.parent_leads;
create trigger parent_leads_set_updated_at
  before update on public.parent_leads
  for each row execute function public.set_updated_at();

create table if not exists public.nanny_contact_state (
  nanny_user_id             uuid        primary key references auth.users (id) on delete cascade,
  lead_status               public.lead_contact_status not null default 'untouched',
  last_contact_at           timestamptz,
  next_action_at            timestamptz,
  assigned_operator         text,
  responded_ever_override   boolean,
  total_contacts_manual_offset integer  not null default 0,
  is_isolated               boolean     not null default false,
  updated_at                timestamptz not null default now(),
  created_at                timestamptz not null default now()
);

comment on table public.nanny_contact_state is
  '02 §4.7 row 3: every nanny is a lead. Created at account creation with lead_status = untouched. `do_not_contact` blocks admin_contact sends - the one status with a side effect outside the worklist.';
comment on column public.nanny_contact_state.is_isolated is
  'A read-model tag mirrored from nannies.is_isolated so the worklist can filter without a join. nannies is the source of truth (R-8''s pattern).';

create index if not exists nanny_contact_state_status_idx
  on public.nanny_contact_state (lead_status, next_action_at);

drop trigger if exists nanny_contact_state_set_updated_at on public.nanny_contact_state;
create trigger nanny_contact_state_set_updated_at
  before update on public.nanny_contact_state
  for each row execute function public.set_updated_at();

create table if not exists public.lead_contacts (
  id              uuid        primary key default gen_random_uuid(),
  nanny_user_id   uuid        not null references auth.users (id) on delete cascade,
  contacted_at    timestamptz not null default now(),
  method          public.contact_method not null,
  direction       public.contact_direction not null,
  outcome         public.contact_outcome not null default 'pending',
  purpose         text,
  note            text,
  operator_handle text,
  edited_by       uuid        references auth.users (id) on delete set null,
  booking_id      uuid        references public.bookings (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on column public.lead_contacts.booking_id is
  'R-1: set when the contact IS the queued call, so the CRM log and the call record are the same fact seen twice rather than two facts that can disagree.';

create index if not exists lead_contacts_nanny_idx on public.lead_contacts (nanny_user_id, contacted_at desc);
create index if not exists lead_contacts_booking_idx on public.lead_contacts (booking_id)
  where booking_id is not null;
create index if not exists lead_contacts_edited_by_idx on public.lead_contacts (edited_by)
  where edited_by is not null;

drop trigger if exists lead_contacts_set_updated_at on public.lead_contacts;
create trigger lead_contacts_set_updated_at
  before update on public.lead_contacts
  for each row execute function public.set_updated_at();

create table if not exists public.lead_notes (
  nanny_user_id  uuid        primary key references auth.users (id) on delete cascade,
  body           text        not null,
  last_edited_by uuid        references auth.users (id) on delete set null,
  updated_at     timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

comment on table public.lead_notes is
  '02 §4.7 row 5: one pinned note per nanny - a primary key on nanny_user_id is what makes "one" structural.';

drop trigger if exists lead_notes_set_updated_at on public.lead_notes;
create trigger lead_notes_set_updated_at
  before update on public.lead_notes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (02 C-10; 07 §5.2 last row). `nanny_leads` and `parent_leads` are service
-- role only - not even the admin reads them through PostgREST, because the
-- worklist goes through the `admin/leads` connector (01 §2.3: admin reads
-- through connectors, never tables). The three CRM tables are admin SELECT.
-- **No customer role has any policy on any of these five tables.**
-- ---------------------------------------------------------------------------

alter table public.nanny_leads enable row level security;
alter table public.nanny_leads force row level security;
alter table public.parent_leads enable row level security;
alter table public.parent_leads force row level security;
alter table public.nanny_contact_state enable row level security;
alter table public.nanny_contact_state force row level security;
alter table public.lead_contacts enable row level security;
alter table public.lead_contacts force row level security;
alter table public.lead_notes enable row level security;
alter table public.lead_notes force row level security;

drop policy if exists nanny_contact_state_admin_select on public.nanny_contact_state;
create policy nanny_contact_state_admin_select on public.nanny_contact_state
  for select to authenticated using ((select public.is_admin()));

drop policy if exists lead_contacts_admin_select on public.lead_contacts;
create policy lead_contacts_admin_select on public.lead_contacts
  for select to authenticated using ((select public.is_admin()));

drop policy if exists lead_notes_admin_select on public.lead_notes;
create policy lead_notes_admin_select on public.lead_notes
  for select to authenticated using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------

do $$
declare
  v_t text;
  v_n int;
begin
  foreach v_t in array array['nanny_leads', 'parent_leads', 'nanny_contact_state',
                             'lead_contacts', 'lead_notes'] loop
    if to_regclass('public.' || v_t) is null then
      raise exception '0014: public.% missing', v_t;
    end if;
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_t and c.relrowsecurity and c.relforcerowsecurity
    ) then
      raise exception '0014: public.% must ENABLE and FORCE row level security (02 C-10)', v_t;
    end if;
    select count(*) into v_n
    from pg_policies where schemaname = 'public' and tablename = v_t and cmd <> 'SELECT';
    if v_n <> 0 then
      raise exception '0014: public.% must have no write policy - the funnel and the operator write through the service role (07 §5.2)', v_t;
    end if;
  end loop;

  -- 07 §5.2: the lead tables themselves are service role only
  foreach v_t in array array['nanny_leads', 'parent_leads'] loop
    select count(*) into v_n from pg_policies where schemaname = 'public' and tablename = v_t;
    if v_n <> 0 then
      raise exception '0014: public.% is service role only; a nanny never reads her own lead row (07 §5.2)', v_t;
    end if;
  end loop;

  if not exists (select 1 from pg_constraint where conname = 'nannies_lead_id_fkey') then
    raise exception '0014: the deferred nannies.lead_id FK was not added (02 §6 row 0014)';
  end if;

  -- 02 §5 row 5: the Sydney geography did not travel
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name in ('nanny_leads', 'parent_leads')
      and column_name in ('sydney_resident', 'postcode', 'suburb', 'state')
  ) then
    raise exception '0014: a Sydney geography column exists on a lead table (02 §5 row 5)';
  end if;
end
$$;
