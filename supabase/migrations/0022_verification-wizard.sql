-- 0022_verification-wizard.sql — the ordered migration set (02-data-model.md §6 row 0022; ADR-154)
--
-- Creates: `vetting_submissions.evidence_id` (03 §4.2's idempotency key, which had no column) and the wizard's
-- four `SECURITY DEFINER` writes (02 §7): `submit_verification_evidence()` · `save_verification_contact()` ·
-- `claim_verification_processing()` · `apply_vetting_check_result()`, plus the IMMUTABLE per-section column
-- filter `verification_submission_columns()`.
--
-- Forced by: nothing later — every object here is **additive** over `0000`–`0021`: one column on a table that is
-- empty in every environment (nothing verifies before this unit), five functions; no policy, no drop, no
-- rename, no narrowing. The set still applies forwards from an empty database in one pass.
-- Rollback twin: supabase/rollbacks/0022_verification-wizard.rollback.sql
--
-- WHY THESE FUNCTIONS EXIST.
--   `0008` gives `verifications` an admin SELECT policy and nothing else (I-V2: a nanny cannot self-verify; her
--   own read is the `verification_status` view of `0016`), and `vetting_submissions` is service-role only. So the
--   wizard could read the schema and not write it — the same shape `0019` and `0021` closed for the parent chain
--   and the nanny's party row. 07 §4.15 / §5.2 rule 3 say the submission columns are written by a definer that
--   writes a **named column set**; that set is `verification_submission_columns()` below, one static list per
--   section, so a key naming a status, a decision, the level or another section is dropped, never honoured.
--
-- WHO MAY EXECUTE WHAT (the same split as `0019` vs `0021`, for the same reason).
--   The three wizard writes act for `auth.uid()` — she submits her own evidence, stamps her own contact step,
--   claims her own processing — so `authenticated` executes them and a null session is refused. The provider-side
--   write (`apply_vetting_check_result`) moves a section on the strength of a check the nanny did not make, so it
--   is `service_role` only: the boot adapter behind `vetting-providers` calls it at service scope, named in that
--   module's README (07 §5.1 rule 5).
--
-- WHAT IS DELIBERATELY NOT HERE (2c's).
--   `level` and `level_changed_at` (`deriveLevel` → `syncNannyVerificationState`, the single writer of
--   `nannies.verification_level`), `dbs_outcome`, the cross-check, and the sweep-owned Update Service columns
--   (`dbs_update_service_subscribed · _last_checked_at · _last_result · _checked_by`) — the one Update Service
--   column written here is `dbs_update_service_consent_at`, the nanny's OWN consent stamp (04 §4.1 row 11), which
--   is a submission column, not a check result (database-reviewer M2). The admin `record`, the stale-`processing`
--   sweep and the expiry sweep are 2c's too. The verify block asserts none of the sweep-owned columns and none of
--   the level columns is named by any function here.

-- ---------------------------------------------------------------------------
-- 1. `vetting_submissions.evidence_id` — the idempotency key (03 §4.2 "same evidenceId twice → the existing
--    Submission"; 07 §4.20). The table is empty in every environment; a row without the key is refused
--    rather than backfilled.
-- ---------------------------------------------------------------------------

alter table public.vetting_submissions add column if not exists evidence_id uuid;
-- database-reviewer M1: the premise is asserted, not assumed. A row that exists with no evidence id is a
-- submission this migration cannot attribute; minting one would mask a duplicate rather than surface it
-- (0017's own rule for its consent backfill).
do $$
begin
  if exists (select 1 from public.vetting_submissions s where s.evidence_id is null limit 1) then
    raise exception '0022: vetting_submissions carries rows with no evidence_id; attribute them by hand before applying (03 §4.2)';
  end if;
end
$$;
alter table public.vetting_submissions alter column evidence_id set not null;
create unique index if not exists vetting_submissions_evidence_id_key
  on public.vetting_submissions (evidence_id);

comment on column public.vetting_submissions.evidence_id is
  '02 §4.3 row 2 / 03 §4.2 (ADR-154): the evidence id the wizard minted for one attempt. Unique, so a replayed submit answers the row that exists and writes nothing (07 §4.20).';

-- ---------------------------------------------------------------------------
-- 2. `verification_submission_columns()` — the static per-section list, in one place (0021's pattern).
--    Not a road: a pure jsonb filter, IMMUTABLE, executable by authenticated because the definer that reads it
--    runs as its owner anyway.
-- ---------------------------------------------------------------------------

create or replace function public.verification_submission_columns(
  p_section public.verification_section,
  p_columns jsonb
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce((
    select jsonb_object_agg(e.key, e.value)
    from jsonb_each(coalesce(p_columns, '{}'::jsonb)) e
    where e.key = any (
      case p_section
        when 'identity' then array[
          'identity_evidence_type', 'identity_document_ref', 'identity_selfie_ref',
          'surname', 'given_names', 'date_of_birth', 'biometric_consent_id'
        ]
        when 'dbs' then array[
          'dbs_certificate_ref', 'dbs_certificate_number', 'dbs_issue_date',
          'dbs_update_service_consent_at'
        ]
        when 'right_to_work' then array[
          'rtw_evidence_type', 'rtw_share_code', 'rtw_document_ref'
        ]
        else array[]::text[]
      end
    )
  ), '{}'::jsonb);
$$;

comment on function public.verification_submission_columns(public.verification_section, jsonb) is
  'ADR-154: the submission columns a nanny may write per section (02 §4.3 "UPDATE own limited to submission columns"). Every status, decision, provider, extracted, Update Service, cross-check and level key is guarded by not being here.';

revoke all on function public.verification_submission_columns(public.verification_section, jsonb) from public, anon;
grant execute on function public.verification_submission_columns(public.verification_section, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. `submit_verification_evidence()` — one write per submission (ADR-154 (2)).
-- ---------------------------------------------------------------------------

create or replace function public.submit_verification_evidence(
  p_evidence_id   uuid,
  p_section       public.verification_section,
  p_evidence_type text,
  p_provider_key  text,
  p_status        public.vetting_submission_status,
  p_columns       jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id         uuid := auth.uid();
  v_nanny_id        uuid;
  v_verification_id uuid;
  v_row             public.verifications;
  v_new             public.verifications;
  v_existing        public.vetting_submissions;
  v_submission_id   uuid;
  v_section_status  public.section_status;
  v_consent_id      uuid;
begin
  if v_user_id is null then
    raise exception 'submit_verification_evidence: no session (07 §4)' using errcode = '42501';
  end if;

  if p_section not in ('identity', 'dbs', 'right_to_work') then
    raise exception 'submit_verification_evidence: % is not an evidence section (02 §4.3)', p_section
      using errcode = '22023';
  end if;

  -- database-reviewer M3: the evidence type belongs to the section it is submitted under (03 §4.2 / 03 §4.3's
  -- four submit calls); 0008's CHECK knows the flat set only.
  if not (
    (p_section = 'identity'      and p_evidence_type in ('identity-document', 'selfie'))
    or (p_section = 'dbs'        and p_evidence_type in ('dbs-certificate', 'dbs-update-service'))
    or (p_section = 'right_to_work' and p_evidence_type in
          ('right-to-work-passport', 'right-to-work-share-code', 'right-to-work-document'))
  ) then
    raise exception 'submit_verification_evidence: % is not %-section evidence (03 §4.2)',
      p_evidence_type, p_section using errcode = '22023';
  end if;

  select n.id into v_nanny_id from public.nannies n where n.user_id = v_user_id;
  if v_nanny_id is null then
    raise exception 'submit_verification_evidence: no nannies row for this session (02 §4.2)'
      using errcode = 'P0002';
  end if;

  -- 03 §4.2 idempotency: a known evidence id answers the row that exists. Another nanny's id is refused before
  -- it is described (07 §4.20; one refusal line for every way it fails).
  select * into v_existing from public.vetting_submissions s where s.evidence_id = p_evidence_id;
  if found then
    if v_existing.nanny_id <> v_nanny_id then
      raise exception 'submit_verification_evidence: evidence belongs to another nanny (07 §4)'
        using errcode = '42501';
    end if;
    return jsonb_build_object(
      'submission_id', v_existing.id,
      'verification_id', v_existing.verification_id,
      'existing', true
    );
  end if;

  -- I-V1 (amended, ADR-154): the row is created at account creation or on the first wizard write.
  insert into public.verifications (nanny_id) values (v_nanny_id)
  on conflict (nanny_id) do nothing;

  select * into v_row from public.verifications v where v.nanny_id = v_nanny_id for update;

  if v_row.suspended_at is not null then
    raise exception 'SUSPENDED' using errcode = '42501';
  end if;

  v_section_status := case p_section
    when 'identity'      then v_row.identity_status
    when 'dbs'           then v_row.dbs_status
    when 'right_to_work' then v_row.rtw_status
  end;
  if v_section_status in ('verified', 'processing') then
    raise exception 'SECTION_NOT_OPEN' using errcode = '55006';
  end if;

  -- An omitted key keeps its value; a present key is cast through the column's own type; a key outside the
  -- section's list is dropped (0021's shape).
  v_new := jsonb_populate_record(v_row, public.verification_submission_columns(p_section, p_columns));

  -- I-V3: identity cannot leave not_started without the caller's OWN biometric-notice consent row (AGR-04).
  -- Checked here as well as by the CHECK constraint, so the refusal names the reason rather than the table.
  if p_section = 'identity' then
    v_consent_id := v_new.biometric_consent_id;
    if v_consent_id is null or not exists (
      select 1 from public.consent_records c
      where c.id = v_consent_id
        and c.user_id = v_user_id
        and c.purpose = 'biometric-notice'
        and c.consent_given
    ) then
      raise exception 'BIOMETRIC_CONSENT_REQUIRED' using errcode = '23514';
    end if;
  end if;

  -- database-reviewer H2: the select above is a fast path, not the guarantee. Two retries of the same evidence
  -- id can both pass it; ON CONFLICT DO NOTHING makes the loser block on the winner's row, write nothing, and
  -- answer the committed submission (0019's create_child_invite idiom).
  insert into public.vetting_submissions
    (verification_id, nanny_id, evidence_id, section, evidence_type, provider_key, status)
  values
    (v_row.id, v_nanny_id, p_evidence_id, p_section, p_evidence_type, p_provider_key, p_status)
  on conflict (evidence_id) do nothing
  returning id into v_submission_id;

  if v_submission_id is null then
    select * into v_existing from public.vetting_submissions s where s.evidence_id = p_evidence_id;
    if not found then
      raise exception 'SUBMISSION_RACE' using errcode = 'serialization_failure';
    end if;
    if v_existing.nanny_id <> v_nanny_id then
      raise exception 'submit_verification_evidence: evidence belongs to another nanny (07 §4)'
        using errcode = '42501';
    end if;
    return jsonb_build_object(
      'submission_id', v_existing.id,
      'verification_id', v_existing.verification_id,
      'existing', true
    );
  end if;

  update public.verifications v
     set identity_evidence_type = v_new.identity_evidence_type,
         identity_document_ref  = v_new.identity_document_ref,
         identity_selfie_ref    = v_new.identity_selfie_ref,
         surname                = v_new.surname,
         given_names            = v_new.given_names,
         date_of_birth          = v_new.date_of_birth,
         biometric_consent_id   = v_new.biometric_consent_id,
         dbs_certificate_ref    = v_new.dbs_certificate_ref,
         dbs_certificate_number = v_new.dbs_certificate_number,
         dbs_issue_date         = v_new.dbs_issue_date,
         dbs_update_service_consent_at = v_new.dbs_update_service_consent_at,
         rtw_evidence_type      = v_new.rtw_evidence_type,
         rtw_share_code         = v_new.rtw_share_code,
         rtw_document_ref       = v_new.rtw_document_ref,
         identity_status        = case when p_section = 'identity'      then 'pending'::public.section_status else v.identity_status end,
         identity_status_at     = case when p_section = 'identity'      then now() else v.identity_status_at end,
         -- one attempt = one document; the selfie that travels with it (03 §4.3 "identity-document + selfie") is
         -- not a second attempt
         identity_attempts      = case when p_evidence_type = 'identity-document' then v.identity_attempts + 1 else v.identity_attempts end,
         dbs_status             = case when p_section = 'dbs'           then 'pending'::public.section_status else v.dbs_status end,
         dbs_status_at          = case when p_section = 'dbs'           then now() else v.dbs_status_at end,
         rtw_status             = case when p_section = 'right_to_work' then 'pending'::public.section_status else v.rtw_status end,
         rtw_status_at          = case when p_section = 'right_to_work' then now() else v.rtw_status_at end
   where v.id = v_row.id;

  return jsonb_build_object(
    'submission_id', v_submission_id,
    'verification_id', v_row.id,
    'existing', false
  );
end
$$;

comment on function public.submit_verification_evidence(uuid, public.verification_section, text, text, public.vetting_submission_status, jsonb) is
  'ADR-154 (2): the wizard''s one write per submission for auth.uid() — the vetting_submissions row with the provider''s initial status plus the section''s submission columns from verification_submission_columns(), section status -> pending, in one transaction (ADR-127). Idempotent on evidence_id. Refuses a suspended row, a section at verified/processing, and identity without the caller''s own biometric-notice consent (I-V3).';

revoke all on function public.submit_verification_evidence(uuid, public.verification_section, text, text, public.vetting_submission_status, jsonb) from public, anon;
grant execute on function public.submit_verification_evidence(uuid, public.verification_section, text, text, public.vetting_submission_status, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. `save_verification_contact()` — contact "saved" is the verified value with its stamp (ADR-154 (3)).
-- ---------------------------------------------------------------------------

create or replace function public.save_verification_contact()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id  uuid := auth.uid();
  v_nanny_id uuid;
begin
  if v_user_id is null then
    raise exception 'save_verification_contact: no session (07 §4)' using errcode = '42501';
  end if;

  select n.id into v_nanny_id from public.nannies n where n.user_id = v_user_id;
  if v_nanny_id is null then
    raise exception 'save_verification_contact: no nannies row for this session (02 §4.2)'
      using errcode = 'P0002';
  end if;

  -- R-7: the values live on user_profiles and reach it through update_nanny_profile(p_contact) first; the stamp
  -- is honest only once both are there.
  if not exists (
    select 1 from public.user_profiles p
    where p.user_id = v_user_id and p.mobile is not null and p.district is not null
  ) then
    raise exception 'CONTACT_INCOMPLETE' using errcode = '23514';
  end if;

  insert into public.verifications (nanny_id) values (v_nanny_id)
  on conflict (nanny_id) do nothing;

  update public.verifications v
     set contact_status   = 'verified',
         contact_saved_at = now()
   where v.nanny_id = v_nanny_id;

  return true;
end
$$;

comment on function public.save_verification_contact() is
  'ADR-154 (3): S-N-04''s stamp for auth.uid() — contact_status = verified (04''s "saved"; section_status has no saved value) + contact_saved_at, once user_profiles carries the mobile and the district (R-7). Creates the verifications row if absent (I-V1).';

revoke all on function public.save_verification_contact() from public, anon;
grant execute on function public.save_verification_contact() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. `claim_verification_processing()` — I-V4's atomic claim (ADR-154 (4)).
-- ---------------------------------------------------------------------------

create or replace function public.claim_verification_processing()
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id  uuid := auth.uid();
  v_nanny_id uuid;
  v_row      public.verifications;
  v_claimed  text[] := '{}';
begin
  if v_user_id is null then
    raise exception 'claim_verification_processing: no session (07 §4)' using errcode = '42501';
  end if;

  select n.id into v_nanny_id from public.nannies n where n.user_id = v_user_id;
  if v_nanny_id is null then
    raise exception 'claim_verification_processing: no nannies row for this session (02 §4.2)'
      using errcode = 'P0002';
  end if;

  select * into v_row from public.verifications v where v.nanny_id = v_nanny_id for update;
  if not found then
    return v_claimed;
  end if;

  -- array_append, not `||`: `text[] || 'identity'` resolves the untyped literal as an array literal (measured:
  -- "malformed array literal" in int.rpc-0022's first run).
  if v_row.identity_status = 'pending' then v_claimed := array_append(v_claimed, 'identity'); end if;
  if v_row.dbs_status = 'pending'      then v_claimed := array_append(v_claimed, 'dbs'); end if;
  if v_row.rtw_status = 'pending'      then v_claimed := array_append(v_claimed, 'right_to_work'); end if;

  update public.verifications v
     set identity_status    = case when v.identity_status = 'pending' then 'processing'::public.section_status else v.identity_status end,
         identity_status_at = case when v.identity_status = 'pending' then now() else v.identity_status_at end,
         dbs_status         = case when v.dbs_status = 'pending' then 'processing'::public.section_status else v.dbs_status end,
         dbs_status_at      = case when v.dbs_status = 'pending' then now() else v.dbs_status_at end,
         rtw_status         = case when v.rtw_status = 'pending' then 'processing'::public.section_status else v.rtw_status end,
         rtw_status_at      = case when v.rtw_status = 'pending' then now() else v.rtw_status_at end
   where v.id = v_row.id
     and (v.identity_status = 'pending' or v.dbs_status = 'pending' or v.rtw_status = 'pending');

  return v_claimed;
end
$$;

comment on function public.claim_verification_processing() is
  'ADR-154 (4) / I-V4: moves every pending section of auth.uid()''s verification to processing in one statement and names them, so the processing step checks exactly what it claimed. One-shot: a second call answers an empty list. The stale-processing sweep is 2c''s named job.';

revoke all on function public.claim_verification_processing() from public, anon;
grant execute on function public.claim_verification_processing() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. `apply_vetting_check_result()` — the provider-side write, service_role only (ADR-154 (5)).
-- ---------------------------------------------------------------------------

create or replace function public.apply_vetting_check_result(
  p_submission_id uuid,
  p_status        text,
  p_reject_reason text default null,
  p_guidance_key  text default null,
  p_extracted     jsonb default null,
  p_checked_by    public.checked_by default 'none',
  p_expires_at    timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub            public.vetting_submissions;
  v_ledger_status  public.vetting_submission_status;
  v_section_status public.section_status;
  v_guidance       jsonb;
begin
  select * into v_sub from public.vetting_submissions s where s.id = p_submission_id for update;
  if not found then
    raise exception 'apply_vetting_check_result: unknown submission %', p_submission_id
      using errcode = 'P0002';
  end if;

  -- 03 §4.2 CheckStatus.kind -> the two enums. Anything else is a caller defect, not a state.
  case p_status
    when 'pending'     then v_ledger_status := 'pending';     v_section_status := 'pending';
    when 'verified'    then v_ledger_status := 'passed';      v_section_status := 'verified';
    when 'rejected'    then v_ledger_status := 'failed';      v_section_status := 'rejected';
    when 'needs-admin' then v_ledger_status := 'needs_admin'; v_section_status := 'review';
    else
      raise exception 'apply_vetting_check_result: % is not a CheckStatus kind (03 §4.2)', p_status
        using errcode = '22023';
  end case;

  -- database-reviewer H3: 0008 says the LATEST row per (verification, section) is the section's provider state.
  -- A check result for an older attempt must not overwrite a newer one; identity carries a document row and a
  -- selfie row per attempt, so recency is judged within the evidence type.
  if exists (
    select 1 from public.vetting_submissions later
    where later.verification_id = v_sub.verification_id
      and later.section = v_sub.section
      and later.evidence_type = v_sub.evidence_type
      and later.submitted_at > v_sub.submitted_at
  ) then
    raise exception 'STALE_SUBMISSION' using errcode = '55006';
  end if;

  v_guidance := case when p_guidance_key is null then null else jsonb_build_object('key', p_guidance_key) end;

  update public.vetting_submissions s
     set status       = v_ledger_status,
         checked_at   = now(),
         raw_response = jsonb_strip_nulls(jsonb_build_object(
                          'status', p_status,
                          'reject_reason', p_reject_reason,
                          'guidance_key', p_guidance_key,
                          'extracted', p_extracted))
   where s.id = v_sub.id;

  -- The section's provider-side columns (02 §4.3 "vetting-providers: status, extracted, provider refs,
  -- guidance"). Never level, dbs_outcome, the cross-check or the Update Service columns (2c).
  if v_sub.section = 'identity' then
    update public.verifications v
       set identity_status           = v_section_status,
           identity_status_at        = now(),
           identity_checked_by       = p_checked_by,
           identity_checked_at       = now(),
           identity_provider_key     = v_sub.provider_key,
           identity_provider_ref     = v_sub.id::text,
           identity_extracted        = coalesce(p_extracted, v.identity_extracted),
           identity_rejection_reason = p_reject_reason,
           identity_user_guidance    = v_guidance,
           -- the document's expiry is a calendar date; taken in UTC so the session's zone cannot move it (L2)
           identity_document_expiry  = coalesce((p_expires_at at time zone 'UTC')::date, v.identity_document_expiry)
     where v.id = v_sub.verification_id;
  elsif v_sub.section = 'dbs' then
    update public.verifications v
       set dbs_status           = v_section_status,
           dbs_status_at        = now(),
           dbs_checked_by       = p_checked_by,
           dbs_provider_key     = v_sub.provider_key,
           dbs_provider_ref     = v_sub.id::text,
           dbs_extracted        = coalesce(p_extracted, v.dbs_extracted),
           dbs_rejection_reason = p_reject_reason,
           dbs_user_guidance    = v_guidance,
           dbs_expires_at       = coalesce(p_expires_at, v.dbs_expires_at)
     where v.id = v_sub.verification_id;
  elsif v_sub.section = 'right_to_work' then
    update public.verifications v
       set rtw_status           = v_section_status,
           rtw_status_at        = now(),
           rtw_checked_by       = p_checked_by,
           rtw_checked_at       = now(),
           rtw_provider_key     = v_sub.provider_key,
           rtw_provider_ref     = v_sub.id::text,
           rtw_extracted        = coalesce(p_extracted, v.rtw_extracted),
           rtw_rejection_reason = p_reject_reason,
           rtw_user_guidance    = v_guidance,
           rtw_check_date       = current_date,
           rtw_expires_at       = coalesce(p_expires_at, v.rtw_expires_at)
     where v.id = v_sub.verification_id;
  else
    raise exception 'apply_vetting_check_result: submission % is on section %, which carries no evidence',
      v_sub.id, v_sub.section using errcode = '22023';
  end if;

  return jsonb_build_object('section', v_sub.section::text, 'status', v_section_status::text);
end
$$;

comment on function public.apply_vetting_check_result(uuid, text, text, text, jsonb, public.checked_by, timestamptz) is
  'ADR-154 (5) / 03 §4.3: the provider-side write behind check / record — the ledger row''s status, checked_at and raw_response, then the section''s status (needs-admin -> review · verified · rejected + reason + guidance · pending) with its checked_by / checked_at / provider key + ref / extracted / expiry. Never level, dbs_outcome, the cross-check or the Update Service columns (2c). service_role only.';

revoke all on function public.apply_vetting_check_result(uuid, text, text, text, jsonb, public.checked_by, timestamptz) from public, anon, authenticated;
grant execute on function public.apply_vetting_check_result(uuid, text, text, text, jsonb, public.checked_by, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Verify — metadata only, on purpose. The behavioural claims live in `int.rpc-0022`.
-- ---------------------------------------------------------------------------

do $$
declare
  v_fn  text;
  v_oid oid;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vetting_submissions'
      and column_name = 'evidence_id' and is_nullable = 'NO'
  ) then
    raise exception '0022: vetting_submissions.evidence_id must exist and be NOT NULL (03 §4.2)';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'vetting_submissions'
      and indexname = 'vetting_submissions_evidence_id_key' and indexdef ilike 'create unique index%'
  ) then
    raise exception '0022: vetting_submissions_evidence_id_key must be a unique index';
  end if;

  foreach v_fn in array array['submit_verification_evidence', 'save_verification_contact',
                              'claim_verification_processing', 'apply_vetting_check_result',
                              'verification_submission_columns'] loop
    select p.oid into v_oid
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn;
    if v_oid is null then
      raise exception '0022: public.%() is missing', v_fn;
    end if;
    if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = v_fn) <> 1 then
      raise exception '0022: public.%() must have exactly one overload', v_fn;
    end if;
    -- the exact value, not a wildcard (database-reviewer H1): `search_path=public` would pass a LIKE
    if not exists (
      select 1 from pg_proc p where p.oid = v_oid
        and (p.prosecdef or v_fn = 'verification_submission_columns')
        and p.proconfig is not null and 'search_path=""' = any(p.proconfig)
    ) then
      raise exception '0022: public.%() must be SECURITY DEFINER with search_path pinned to '''' (02 §7)', v_fn;
    end if;
    if has_function_privilege('anon', v_oid, 'execute') then
      raise exception '0022: anon must not execute public.%()', v_fn;
    end if;
    -- database-reviewer H4 (0019's own check): a definer over a FORCE RLS table writes only because its owner
    -- has BYPASSRLS; if ownership ever differed these would write nothing, silently.
    if v_fn <> 'verification_submission_columns' and exists (
      select 1 from pg_proc p join pg_roles r on r.oid = p.proowner
      where p.oid = v_oid and not (r.rolbypassrls or r.rolsuper)
    ) then
      raise exception '0022: public.%() is owned by a role without BYPASSRLS; FORCE RLS would make it write nothing, silently', v_fn;
    end if;
  end loop;

  -- The split: the three wizard writes are the session's; the provider-side write is the service's.
  foreach v_fn in array array['submit_verification_evidence', 'save_verification_contact',
                              'claim_verification_processing'] loop
    select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn;
    if not has_function_privilege('authenticated', v_oid, 'execute') then
      raise exception '0022: authenticated must execute public.%() (the authority is the session)', v_fn;
    end if;
  end loop;
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'apply_vetting_check_result';
  if has_function_privilege('authenticated', v_oid, 'execute') then
    raise exception '0022: authenticated must not execute apply_vetting_check_result() (I-V2)';
  end if;
  if not has_function_privilege('service_role', v_oid, 'execute') then
    raise exception '0022: service_role must execute apply_vetting_check_result()';
  end if;

  -- 0008's rule still holds: this migration added no client policy to either table.
  if exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename in ('verifications', 'vetting_submissions') and cmd <> 'SELECT'
  ) then
    raise exception '0022: verifications / vetting_submissions must stay SELECT-only for client roles (I-V2)';
  end if;

  -- Nothing here writes the level: the source of every function is free of the column names 2c owns.
  foreach v_fn in array array['submit_verification_evidence', 'save_verification_contact',
                              'claim_verification_processing', 'apply_vetting_check_result'] loop
    if exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = v_fn
         and (p.prosrc ~ '\ylevel\s*=' or p.prosrc ~ 'level_changed_at\s*=' or p.prosrc ~ 'dbs_outcome\s*='
              or p.prosrc ~ 'cross_check_status\s*=' or p.prosrc ~ 'dbs_update_service_subscribed\s*='
              or p.prosrc ~ 'dbs_update_service_last_checked_at\s*=' or p.prosrc ~ 'dbs_update_service_last_result\s*='
              or p.prosrc ~ 'dbs_update_service_checked_by\s*=')
    ) then
      raise exception '0022: public.%() must not write level / level_changed_at / dbs_outcome / the cross-check / the sweep-owned Update Service columns (2c)', v_fn;
    end if;
  end loop;
end
$$;
