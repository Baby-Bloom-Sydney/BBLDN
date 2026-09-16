-- 0008_verification.sql — the ordered migration set (02-data-model.md §6 row 0008)
--
-- Creates: `verifications` (one row per nanny — the source of truth for evidence and per-section
-- status) and `vetting_submissions` (the provider-side ledger behind the swappable connector).
-- 02 §4.3.
--
-- Forced by: nothing later; `nannies.verification_level` (0005) is the sync target and already exists.
-- Rollback twin: supabase/rollbacks/0008_verification.rollback.sql
--
-- @adr ADR-026 — verification is London's own; the provider is swappable (P-7), which is exactly why
--   `vetting_submissions` exists: a provider swap changes that table and `verifications.*_provider_*`
--   and nothing else.
-- @adr ADR-071 — **parent verification is removed, not deferred**: no `parent_verifications`, no
--   `parents.verification_level`, no parent biometric consent (02 §5 row 6).
-- N-4 / 02 §5 row 4 — no WWCC, no OCG, no `trg_sync_nanny_from_ocg`: that is NSW, not England.
--
-- I-V2 a nanny cannot self-verify · I-V6 refs are write-once per attempt (a new attempt is a new
-- uuid object, 07 §5.3 rule 2) · **I-V7 no bytes and no URLs are stored** — every `*_ref` is a
-- storage object path, enforced below. 07 §5.2: the nanny never reads this table directly; she
-- reads the `verification_status` view (0016), which omits `*_extracted`, `*_ai_reasoning` and
-- `dbs_outcome`. The base table is admin-only.
--
-- Deferred with its research (02 §9 item 20, Phase 2): the `dbs_certificate_number` format CHECK
-- (its regex is `config` and does not exist yet), and whether right-to-work gates the level.

create table if not exists public.verifications (
  -- keys
  id                       uuid        primary key default gen_random_uuid(),
  nanny_id                 uuid        not null unique references public.nannies (id) on delete cascade,

  -- overall
  level                    public.verification_level not null default 'L0_SIGNED_UP',
  level_changed_at         timestamptz,
  suspended_at             timestamptz,
  biometric_consent_id     uuid        references public.consent_records (id) on delete set null,

  -- identity
  identity_status          public.section_status not null default 'not_started',
  identity_status_at       timestamptz,
  identity_evidence_type   public.identity_evidence_type,
  identity_document_ref    text,
  identity_selfie_ref      text,
  identity_document_expiry date,
  identity_extracted       jsonb,
  identity_checked_by      public.checked_by not null default 'none',
  identity_checked_at      timestamptz,
  identity_provider_key    text,
  identity_provider_ref    text,
  identity_ai_reasoning    text,
  identity_ai_issues       jsonb,
  identity_user_guidance   jsonb,
  identity_rejection_reason text,
  identity_attempts        integer     not null default 0,

  -- declared (cross-checked against the extracted identity fields)
  surname                  text,
  given_names              text,
  date_of_birth            date,
  nationality              text,

  -- DBS (Art 10 criminal-offence data — 07 §2.5; APD is launch gate E6)
  dbs_status               public.section_status not null default 'not_started',
  dbs_status_at            timestamptz,
  dbs_certificate_ref      text,
  dbs_certificate_number   text,
  dbs_issue_date           date,
  dbs_disclosure_level     text,
  dbs_extracted            jsonb,
  dbs_outcome              public.dbs_outcome not null default 'unset',
  dbs_update_service_consent_at       timestamptz,
  dbs_update_service_subscribed       boolean,
  dbs_update_service_last_checked_at  timestamptz,
  dbs_update_service_last_result      public.update_service_result,
  dbs_update_service_checked_by       uuid references auth.users (id) on delete set null,
  dbs_checked_by           public.checked_by not null default 'none',
  dbs_provider_key         text,
  dbs_provider_ref         text,
  dbs_ai_reasoning         text,
  dbs_user_guidance        jsonb,
  dbs_rejection_reason     text,
  dbs_expires_at           timestamptz,

  -- right to work
  rtw_status               public.section_status not null default 'not_started',
  rtw_status_at            timestamptz,
  rtw_evidence_type        public.rtw_evidence_type,
  rtw_share_code           text,
  rtw_document_ref         text,
  rtw_extracted            jsonb,
  rtw_check_date           date,
  rtw_expires_at           timestamptz,
  rtw_checked_by           public.checked_by not null default 'none',
  rtw_checked_at           timestamptz,
  rtw_provider_key         text,
  rtw_provider_ref         text,
  rtw_user_guidance        jsonb,
  rtw_rejection_reason     text,

  -- contact (values live on user_profiles — R-7; this keeps status only)
  contact_status           public.section_status not null default 'not_started',
  contact_saved_at         timestamptz,

  -- cross-check
  cross_check_status       public.cross_check_status not null default 'not_started',
  cross_check_at           timestamptz,
  cross_check_note         text,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint verifications_identity_attempts_check check (identity_attempts >= 0),
  -- I-V5: barred ⇒ L0 + suspended
  constraint verifications_barred_is_suspended_check
    check (dbs_outcome <> 'barred' or (level = 'L0_SIGNED_UP' and suspended_at is not null)),
  -- I-V7: object paths, never URLs and never bytes
  constraint verifications_refs_are_object_paths_check check (
    coalesce(identity_document_ref, '') !~ '^[a-z]+://'
    and coalesce(identity_selfie_ref, '') !~ '^[a-z]+://'
    and coalesce(dbs_certificate_ref, '') !~ '^[a-z]+://'
    and coalesce(rtw_document_ref, '') !~ '^[a-z]+://'
  ),
  -- I-V3: identity cannot leave not_started without the AGR-04 biometric consent row
  constraint verifications_identity_needs_biometric_consent_check
    check (identity_status = 'not_started' or biometric_consent_id is not null)
);

comment on table public.verifications is
  '02 §4.3: one row per nanny, created at account creation with every section not_started (I-V1). A nanny cannot self-verify (I-V2): no client write reaches *_status = verified, *_checked_by, dbs_outcome, the Update Service columns, cross_check or level. The single writer of nannies.verification_level is syncNannyVerificationState (R-8).';
comment on column public.verifications.dbs_extracted is
  '07 §2.5 / §6 row 4: barred-list lines. Nulled with the certificate object by retention-sweep; never exposed through the verification_status view (0016).';
comment on column public.verifications.rtw_share_code is
  '07 §6 row 5: the structured record keeps a **hash** of the share code after the object is deleted; the plain code lives only while the check is open.';
comment on constraint verifications_refs_are_object_paths_check on public.verifications is
  'I-V7: no bytes, no URLs. A signed URL is minted server-side per read (07 §5.3 rule 1) and never stored.';

create index if not exists verifications_level_idx on public.verifications (level);
create index if not exists verifications_identity_status_idx
  on public.verifications (identity_status)
  where identity_status in ('pending', 'processing', 'review');
create index if not exists verifications_dbs_status_idx
  on public.verifications (dbs_status)
  where dbs_status in ('pending', 'processing', 'review');

drop trigger if exists verifications_set_updated_at on public.verifications;
create trigger verifications_set_updated_at
  before update on public.verifications
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- `vetting_submissions` (02 §4.3 row 2)
-- ---------------------------------------------------------------------------

create table if not exists public.vetting_submissions (
  id              uuid        primary key default gen_random_uuid(),
  verification_id uuid        not null references public.verifications (id) on delete cascade,
  nanny_id        uuid        not null references public.nannies (id) on delete cascade,
  section         public.verification_section not null,
  evidence_type   text        not null,
  provider_key    text        not null,
  provider_ref    text,
  status          public.vetting_submission_status not null default 'pending',
  raw_response    jsonb,
  submitted_at    timestamptz not null default now(),
  checked_at      timestamptz,
  created_at      timestamptz not null default now(),

  -- 02 §4.3 row 2: the accepted evidence set is config (VETTING.acceptedEvidence, config/vetting.ts)
  constraint vetting_submissions_evidence_type_check check (evidence_type in (
    'identity-document', 'selfie', 'dbs-certificate', 'dbs-update-service',
    'right-to-work-passport', 'right-to-work-share-code', 'right-to-work-document'
  ))
);

comment on table public.vetting_submissions is
  '02 §4.3 row 2 / P-7: one row per submit attempt. The latest row per (verification_id, section) is that section''s provider state; stub-manual rows land needs_admin.';
comment on column public.vetting_submissions.raw_response is
  '02 §4.3 row 2: no document content and no PII beyond the object path. Nulled 12 months after checked_at (07 §6 row 5).';

-- the latest row per (verification, section) is the hot read
create index if not exists vetting_submissions_section_idx
  on public.vetting_submissions (verification_id, section, submitted_at desc);
create index if not exists vetting_submissions_status_idx
  on public.vetting_submissions (status)
  where status in ('pending', 'processing', 'needs_admin');

-- ---------------------------------------------------------------------------
-- RLS (02 C-10; 07 §5.2 rows `verifications` / `vetting_submissions`).
-- The nanny's own read is the `verification_status` view (0016) — deliberately
-- **not** a policy on the base table, because the base table holds the
-- extracted fields, the AI reasoning and dbs_outcome, which 07 §5.2 says she
-- must not see. Submissions are service role only, admin SELECT.
-- ---------------------------------------------------------------------------

alter table public.verifications enable row level security;
alter table public.verifications force row level security;

drop policy if exists verifications_admin_select on public.verifications;
create policy verifications_admin_select on public.verifications
  for select to authenticated
  using ((select public.is_admin()));

alter table public.vetting_submissions enable row level security;
alter table public.vetting_submissions force row level security;

drop policy if exists vetting_submissions_admin_select on public.vetting_submissions;
create policy vetting_submissions_admin_select on public.vetting_submissions
  for select to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------

do $$
declare
  v_t text;
  v_bad int;
begin
  foreach v_t in array array['verifications', 'vetting_submissions'] loop
    if to_regclass('public.' || v_t) is null then
      raise exception '0008: public.% missing', v_t;
    end if;
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_t and c.relrowsecurity and c.relforcerowsecurity
    ) then
      raise exception '0008: public.% must ENABLE and FORCE row level security (02 C-10)', v_t;
    end if;
    select count(*) into v_bad
    from pg_policies where schemaname = 'public' and tablename = v_t and cmd <> 'SELECT';
    if v_bad <> 0 then
      raise exception '0008: public.% must be SELECT-only for client roles (I-V2, 07 §5.2)', v_t;
    end if;
  end loop;

  -- 02 §5 row 4: NSW vetting must not have travelled
  select count(*) into v_bad
  from information_schema.columns
  where table_schema = 'public' and table_name = 'verifications'
    and (column_name like 'wwcc%' or column_name like 'ocg%'
         or column_name like 'extracted_wwcc%' or column_name in ('state', 'postcode', 'country',
                                                                  'address_line1', 'address_line2'));
  if v_bad <> 0 then
    raise exception '0008: % NSW / AU-address column(s) on verifications (02 §5 rows 4 and 5)', v_bad;
  end if;

  -- ADR-071: parent verification is removed, not deferred
  if to_regclass('public.parent_verifications') is not null then
    raise exception '0008: parent_verifications must not exist (ADR-071, 02 §5 row 6)';
  end if;

  foreach v_t in array array[
    'verifications_barred_is_suspended_check',
    'verifications_refs_are_object_paths_check',
    'verifications_identity_needs_biometric_consent_check'
  ] loop
    if not exists (select 1 from pg_constraint where conname = v_t) then
      raise exception '0008: constraint % missing (I-V3 / I-V5 / I-V7)', v_t;
    end if;
  end loop;
end
$$;
