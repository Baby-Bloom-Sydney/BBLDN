-- 0004_consent.sql — the ordered migration set (02-data-model.md §6 row 0004)
--
-- Creates: `consent_records`, `biometric_consent_records`, `cookie_consent_records`
-- (02 §4.1 rows 5-7) with their immutability triggers, uniques, indexes and RLS.
--
-- Forced by: verifications.biometric_consent_id (0008), development_images.consent_record_id (0012).
-- Rollback twin: supabase/rollbacks/0004_consent.rollback.sql
--
-- These three tables are the accountability evidence for UK GDPR Art 7(1) and PECR. They are
-- append-only in the strongest sense the database can express: no updated_at, no UPDATE or DELETE
-- policy for any client role, and prevent_row_modification() (0000) refusing every caller except
-- the two security-definer retention jobs (C-4, fix: D-2; 07 §6.2 rows 11-12). A decline is a new
-- row, never an edit. Retention: 6 years after account scrub, subject pseudonymised (ADR-105).
--
-- @adr ADR-055 — `cookie_consent_records.marketing_enabled` is the one gate on the Meta pixel + CAPI.
-- @adr ADR-071 — parents have no biometric processing; `biometric_consent_records` is nanny-only.
-- @adr ADR-103 / 07 §2.7(a) — the `vaccination-status` consent is one of these rows (its own
--      agreement_id + checkpoint_id), which is what licenses `nannies.is_vaccinated` in 0005.
--      02 §4.1 gives this table no `purpose` column; 07 §2.7(a) calls the same thing a "purpose".
--      The schema follows 02 (agreement_id + checkpoint_id carry it); recorded in PROGRESS.
-- 02 §5 row 12 — Sydney's INSERT `WITH CHECK (true)` and the `user_type` client/professional
--      vocabulary are **not** carried; `party` is the `user_role` enum (07 §5.1 rule 3).

-- ---------------------------------------------------------------------------
-- 1. `consent_records` (02 §4.1 row 5) — the immutable consent event log.
-- ---------------------------------------------------------------------------

create table if not exists public.consent_records (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users (id) on delete cascade,
  party             public.user_role not null,
  agreement_id      text        not null,
  checkpoint_id     text        not null,
  checkpoint_text   text        not null,
  document_id       text,
  document_version  integer,
  consent_given     boolean     not null,
  ip_address        inet,
  user_agent        text,
  session_id        text,
  related_entity_id uuid,
  created_at        timestamptz not null default now(),

  -- consent is given by a customer, never by an admin on their own behalf (02 §4.1 row 5)
  constraint consent_records_party_is_customer_check check (party <> 'admin'),
  -- AGR-nn (02 §4.1 row 5); informed actions reuse the same shape
  constraint consent_records_agreement_id_shape_check check (agreement_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$'),
  -- the document pair travels together or not at all (nullable for informed actions)
  constraint consent_records_document_pair_check
    check ((document_id is null) = (document_version is null)),
  constraint consent_records_document_fkey
    foreign key (document_id, document_version)
    references public.legal_documents (document_id, version)
);

comment on table public.consent_records is
  '02 §4.1 row 5 / UK GDPR Art 7(1): append-only. A decline is a new row with consent_given = false; nothing is ever edited. document_version is the latest at write, checked in the action.';
comment on column public.consent_records.related_entity_id is
  'The child for a per-child consent (parent-app-consent, AGR-14); null otherwise.';

create index if not exists consent_records_user_agreement_idx
  on public.consent_records (user_id, agreement_id, created_at desc);
create index if not exists consent_records_agreement_idx
  on public.consent_records (agreement_id);
create index if not exists consent_records_related_entity_idx
  on public.consent_records (related_entity_id)
  where related_entity_id is not null;
-- the access path for audit-consent-expiry ("who accepted version N") and the covering
-- index the composite FK otherwise lacks (database-reviewer M-3)
create index if not exists consent_records_document_idx
  on public.consent_records (document_id, document_version)
  where document_id is not null;

drop trigger if exists consent_records_append_only on public.consent_records;
create trigger consent_records_append_only
  before update or delete on public.consent_records
  for each row execute function public.prevent_row_modification();

-- ---------------------------------------------------------------------------
-- 2. `biometric_consent_records` (02 §4.1 row 6) — Art 9(2)(a) evidence for the
--    nanny biometric notice, taken before the AI ID check (AGR-04, I-V3).
-- ---------------------------------------------------------------------------

create table if not exists public.biometric_consent_records (
  id                            uuid        primary key default gen_random_uuid(),
  user_id                       uuid        not null references auth.users (id) on delete cascade,
  notice_version                integer     not null,
  -- a fixed column so the (document_id, version) pair can actually be a foreign key:
  -- the notice is always `biometric-notice` (02 §4.1 row 6), and this makes that a
  -- database fact rather than an application convention.
  notice_document_id            text        not null generated always as ('biometric-notice') stored,
  notice_opened_at              timestamptz not null,
  notice_scroll_completed_at    timestamptz not null,
  checkboxes_enabled_at         timestamptz not null,
  notice_time_spent_seconds     integer     not null,
  checkbox_timestamps           jsonb       not null,
  ai_provider_disclosed         text        not null,
  processing_location_disclosed text        not null,
  created_at                    timestamptz not null default now(),

  -- re-consent on a new notice version is a new row, never an edit (02 §4.1 row 6)
  constraint biometric_consent_records_user_version_key unique (user_id, notice_version),
  -- the scroll cannot finish before the notice opened, and the checkboxes cannot
  -- enable before the scroll finished: this is what makes the evidence evidence
  constraint biometric_consent_records_scroll_order_check
    check (notice_scroll_completed_at >= notice_opened_at
           and checkboxes_enabled_at >= notice_scroll_completed_at),
  constraint biometric_consent_records_time_spent_check check (notice_time_spent_seconds >= 0),
  constraint biometric_consent_records_notice_fkey
    foreign key (notice_document_id, notice_version)
    references public.legal_documents (document_id, version)
);

comment on table public.biometric_consent_records is
  '02 §4.1 row 6 / 07 §2.6: Art 9(2)(a) explicit consent for the identity selfie + document photo. verifications.identity_status cannot leave not_started without a row for the current notice version (I-V3). Parents have none (ADR-071).';
comment on column public.biometric_consent_records.ai_provider_disclosed is
  'L4: the provider name shown in the notice, written from config - never a DDL default (02 §5 row 12 struck Sydney''s literal ''OpenAI GPT-4o'').';

create index if not exists biometric_consent_records_notice_idx
  on public.biometric_consent_records (notice_document_id, notice_version);

drop trigger if exists biometric_consent_records_append_only on public.biometric_consent_records;
create trigger biometric_consent_records_append_only
  before update or delete on public.biometric_consent_records
  for each row execute function public.prevent_row_modification();

-- ---------------------------------------------------------------------------
-- 3. `cookie_consent_records` (02 §4.1 row 7) — PECR choice per visitor.
--    The one append-only table with a permitted UPDATE: `superseded_by`, and
--    only that column, and only from a service-role / definer caller (02 §7).
-- ---------------------------------------------------------------------------

create table if not exists public.cookie_consent_records (
  id                uuid        primary key default gen_random_uuid(),
  visitor_id        text        not null,
  user_id           uuid        references auth.users (id) on delete set null,
  consent_choice    public.cookie_choice not null,
  analytics_enabled boolean     not null,
  marketing_enabled boolean     not null,
  ip_address        inet,
  user_agent        text,
  expiry_date       timestamptz not null,
  superseded_by     uuid        references public.cookie_consent_records (id) on delete set null,
  created_at        timestamptz not null default now(),

  constraint cookie_consent_records_not_self_superseding_check check (superseded_by is distinct from id),
  -- reject_non_essential can never carry a true flag; accept_all can never carry a false one
  constraint cookie_consent_records_choice_flags_check check (
    (consent_choice = 'accept_all'           and analytics_enabled and marketing_enabled)
    or (consent_choice = 'reject_non_essential' and not analytics_enabled and not marketing_enabled)
    or consent_choice = 'custom'
  )
);

comment on table public.cookie_consent_records is
  '02 §4.1 row 7 / ADR-055: append-only. A change inserts a new row and stamps superseded_by on the old one - the current choice is the newest row with superseded_by IS NULL. expiry_date comes from config/security.ts (SECURITY.retention.cookieExpiryDays), never a DDL default (C-3 / L4).';
comment on column public.cookie_consent_records.visitor_id is
  '07 §2.9: the analytics-consent-gated first-party cookie. Never a rate-limit or fraud key (fix: S-6).';

create index if not exists cookie_consent_records_visitor_idx
  on public.cookie_consent_records (visitor_id, created_at desc);
-- Unique, not merely indexed: 02 §4.1 row 7 defines the current choice as "the newest
-- row with superseded_by IS NULL", and a visitor with two such rows has no current
-- choice at all. Making it structural costs nothing (database-reviewer L-5).
create unique index if not exists cookie_consent_records_current_idx
  on public.cookie_consent_records (visitor_id)
  where superseded_by is null;

-- The table-specific immutability rule (02 §7): DELETE always refused outside the
-- retention jobs; UPDATE refused unless the *only* change is superseded_by and the
-- caller has no auth.uid() (i.e. service role or a SECURITY DEFINER wrapper).
create or replace function public.prevent_cookie_consent_modification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_retention_job() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'TRUNCATE' then
    raise exception 'cookie_consent_records is append-only: TRUNCATE refused (02 C-4)'
      using errcode = 'restrict_violation';
  end if;

  if tg_op = 'DELETE' then
    raise exception 'cookie_consent_records is append-only: DELETE refused (02 C-4)'
      using errcode = 'restrict_violation';
  end if;

  if not public.is_privileged_writer() then
    raise exception 'cookie_consent_records is written by the rate-limited consent route only (02 §4.1 row 7)'
      using errcode = 'insufficient_privilege';
  end if;

  if (to_jsonb(new) - 'superseded_by') is distinct from (to_jsonb(old) - 'superseded_by') then
    raise exception 'cookie_consent_records permits an UPDATE of superseded_by only (02 §7)'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

comment on function public.prevent_cookie_consent_modification() is
  '02 §7: the one permitted UPDATE on an append-only table - superseded_by, service role only. Everything else, and every DELETE, is refused outside the two retention jobs.';

-- fix: database-reviewer M-3. Both FKs are ON DELETE SET NULL / CASCADE, so without
-- these every account deletion seq-scans what will be the highest-volume table here.
create index if not exists cookie_consent_records_user_idx
  on public.cookie_consent_records (user_id) where user_id is not null;
create index if not exists cookie_consent_records_superseded_by_idx
  on public.cookie_consent_records (superseded_by) where superseded_by is not null;

drop trigger if exists cookie_consent_records_append_only on public.cookie_consent_records;
create trigger cookie_consent_records_append_only
  before update or delete on public.cookie_consent_records
  for each row execute function public.prevent_cookie_consent_modification();

-- ---------------------------------------------------------------------------
-- 3b. What a client may author on its own consent row (fix: security-reviewer C2,
--     database-reviewer M-7).
--     07 §5.2 grants the subject a direct INSERT and puts "document_version = current"
--     in the action. But `authenticated` reaches this table straight through PostgREST,
--     so the action is not a control: every other column - checkpoint_text,
--     consent_given, document_version, ip_address, user_agent, related_entity_id and
--     `created_at`, whose DEFAULT is a default and not a floor - was attacker-chosen.
--     That matters beyond self-harm, because this table is read as *proof* by other
--     gates (the vaccination gate in 0005; AGR-14 and parent-app-consent later), and
--     because evidence a data subject can author is not Art 7(1) evidence.
--     The policy shape 07 asks for is kept; the caller-controlled columns are pinned.
-- ---------------------------------------------------------------------------

create or replace function public.guard_consent_record_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
  v_current integer;
begin
  if public.is_privileged_writer() then
    return new;
  end if;

  -- server-observed values are not the client's to supply
  new.created_at := now();
  new.ip_address := null;
  new.user_agent := null;

  select r.role into v_role from public.user_roles r where r.user_id = new.user_id;
  if v_role is null or new.party <> v_role then
    raise exception 'consent_records.party must be the subject''s own role (02 §4.1 row 5)'
      using errcode = 'insufficient_privilege';
  end if;

  if new.document_id is not null then
    select max(d.version) into v_current
    from public.legal_documents d where d.document_id = new.document_id;
    if new.document_version is distinct from v_current then
      raise exception
        'consent_records.document_version must be the current version of % (07 §5.2)', new.document_id
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.guard_consent_record_insert() is
  '07 §5.2 / Art 7(1): a consent row a subject can backdate, re-address or point at a superseded document version is not evidence. SECURITY DEFINER because it reads user_roles and legal_documents, both FORCE RLS.';

drop trigger if exists consent_records_guard_insert on public.consent_records;
create trigger consent_records_guard_insert
  before insert on public.consent_records
  for each row execute function public.guard_consent_record_insert();

create or replace function public.guard_biometric_consent_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current integer;
begin
  if public.is_privileged_writer() then
    return new;
  end if;
  new.created_at := now();
  select max(d.version) into v_current
  from public.legal_documents d where d.document_id = 'biometric-notice';
  if new.notice_version is distinct from v_current then
    raise exception
      'biometric_consent_records.notice_version must be the current biometric-notice version (I-V3)'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

comment on function public.guard_biometric_consent_insert() is
  'Pins the version and the timestamp. The scroll / dwell evidence above it is browser telemetry and stays client-supplied by nature - the CHECK on it proves only internal consistency, not that the notice was rendered. Moving that capture server-side is recorded as an open item in this unit''s PROGRESS.';

drop trigger if exists biometric_consent_records_guard_insert on public.biometric_consent_records;
create trigger biometric_consent_records_guard_insert
  before insert on public.biometric_consent_records
  for each row execute function public.guard_biometric_consent_insert();

-- TRUNCATE backstops (security-reviewer H3) - see 0003 for the reasoning.
drop trigger if exists consent_records_no_truncate on public.consent_records;
create trigger consent_records_no_truncate
  before truncate on public.consent_records
  for each statement execute function public.prevent_row_modification();

drop trigger if exists biometric_consent_records_no_truncate on public.biometric_consent_records;
create trigger biometric_consent_records_no_truncate
  before truncate on public.biometric_consent_records
  for each statement execute function public.prevent_row_modification();

drop trigger if exists cookie_consent_records_no_truncate on public.cookie_consent_records;
create trigger cookie_consent_records_no_truncate
  before truncate on public.cookie_consent_records
  for each statement execute function public.prevent_cookie_consent_modification();

-- ---------------------------------------------------------------------------
-- 4. RLS (02 C-10; 07 §5.2 rows `consent_records` / `biometric_consent_records`
--    / `cookie_consent_records`).
-- ---------------------------------------------------------------------------

alter table public.consent_records enable row level security;
alter table public.consent_records force row level security;

drop policy if exists consent_records_self_insert on public.consent_records;
create policy consent_records_self_insert on public.consent_records
  for insert to authenticated
  with check (user_id = (select auth.uid()) and party <> 'admin');

drop policy if exists consent_records_self_select on public.consent_records;
create policy consent_records_self_select on public.consent_records
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists consent_records_admin_select on public.consent_records;
create policy consent_records_admin_select on public.consent_records
  for select to authenticated
  using ((select public.is_admin()));

alter table public.biometric_consent_records enable row level security;
alter table public.biometric_consent_records force row level security;

drop policy if exists biometric_consent_records_self_insert on public.biometric_consent_records;
create policy biometric_consent_records_self_insert on public.biometric_consent_records
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_nanny()));

drop policy if exists biometric_consent_records_self_select on public.biometric_consent_records;
create policy biometric_consent_records_self_select on public.biometric_consent_records
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists biometric_consent_records_admin_select on public.biometric_consent_records;
create policy biometric_consent_records_admin_select on public.biometric_consent_records
  for select to authenticated
  using ((select public.is_admin()));

alter table public.cookie_consent_records enable row level security;
alter table public.cookie_consent_records force row level security;

-- 07 §5.2 tables `anon | INSERT` with the parenthetical "(rate-limited route, service
-- role in practice)", and 07 §5.1 rule 5 names `platform/consent.recordCookieConsent`
-- as one of the day-one **service-role** uses. This file takes the service-role reading
-- and grants no client INSERT, because the direct-INSERT reading is exploitable and was
-- measured as such (security-reviewer M1): the policy can constrain only `user_id`, so
-- any visitor could post a harvested `visitor_id` with `consent_choice = 'accept_all'`
-- and turn the Meta pixel and CAPI on for someone else - ADR-055 names marketing_enabled
-- as the *one* gate - while also forging that person's PECR record and setting
-- `expiry_date`, `ip_address` and `user_agent` freely. The route is server-side either
-- way, so nothing is lost; recorded in this unit's PROGRESS for the 07 owner.
drop policy if exists cookie_consent_records_anon_insert on public.cookie_consent_records;
drop policy if exists cookie_consent_records_authenticated_insert on public.cookie_consent_records;

drop policy if exists cookie_consent_records_admin_select on public.cookie_consent_records;
create policy cookie_consent_records_admin_select on public.cookie_consent_records
  for select to authenticated
  using ((select public.is_admin()));

-- No client SELECT for the visitor (02 §4.1 row 7): the current choice is read
-- server-side, and the cookie itself is what the browser consults.

-- ---------------------------------------------------------------------------
-- 5. Verify
-- ---------------------------------------------------------------------------

do $$
declare
  v_t text;
  v_bad int;
begin
  foreach v_t in array array['consent_records', 'biometric_consent_records', 'cookie_consent_records'] loop
    if to_regclass('public.' || v_t) is null then
      raise exception '0004: public.% missing', v_t;
    end if;
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_t and c.relrowsecurity and c.relforcerowsecurity
    ) then
      raise exception '0004: public.% must ENABLE and FORCE row level security (02 C-10)', v_t;
    end if;
    -- C-4: an append-only table has no updated_at
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = v_t and column_name = 'updated_at'
    ) then
      raise exception '0004: append-only table public.% must not carry updated_at (C-4)', v_t;
    end if;
    -- C-4 / 07 §5.2: no UPDATE or DELETE policy for any client role
    select count(*) into v_bad
    from pg_policies where schemaname = 'public' and tablename = v_t and cmd in ('UPDATE', 'DELETE');
    if v_bad <> 0 then
      raise exception '0004: public.% has % UPDATE/DELETE policy(ies); it is append-only (02 §4.1)', v_t, v_bad;
    end if;
    -- 07 §5.1 rule 3
    if exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = v_t and with_check = 'true'
    ) then
      raise exception '0004: public.% uses the banned WITH CHECK (true) (07 §5.1 rule 3, 02 §5 row 12)', v_t;
    end if;
    if not exists (
      select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
      where c.relname = v_t and t.tgname = v_t || '_append_only'
    ) then
      raise exception '0004: the C-4 immutability trigger is missing on public.%', v_t;
    end if;
  end loop;

  if not exists (
    select 1 from pg_constraint where conname = 'biometric_consent_records_user_version_key'
  ) then
    raise exception '0004: UNIQUE (user_id, notice_version) missing (02 §4.1 row 6)';
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'biometric_consent_records_notice_fkey'
  ) then
    raise exception '0004: the biometric notice FK into legal_documents is missing (02 §4.1 row 6)';
  end if;
  if to_regprocedure('public.prevent_cookie_consent_modification()') is null then
    raise exception '0004: prevent_cookie_consent_modification() missing (02 §7)';
  end if;
end
$$;
