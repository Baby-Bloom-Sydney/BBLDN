-- 0023_verification-decision-sync.rollback.sql — the twin of supabase/migrations/0023_verification-decision-sync.sql (06 §4.2).
--
-- Drops the six functions 0023 adds, restores `apply_payment_event()` to its 0020 body, `create_nanny_account()` to
-- its 0021 signature and grant, `submit_verification_evidence()` to its 0022 body, `is_active_nanny()`, the matching
-- index and `nanny_public` to their 0005 / 0016 definitions (the visibility predicate functions dropped), restores
-- `payment_events_unprocessed_idx` to its 0010 predicate and drops `payment_events.outcome`. Nothing later
-- references any of them (0023 is the last migration), so this always succeeds on a database 0023 applied to.
-- One transaction: a rollback that fails midway must not leave half the objects standing.
--
-- WHAT IS LOST, stated rather than hidden.
--
-- **The level's writer.** After this file nothing writes `verifications.level` or `nannies.verification_level`
-- again: every nanny keeps the level she had at rollback, and the queue's decisions answer `INTERNAL` from the
-- store rather than a silent success. The section statuses the decisions wrote stay as they are.
--
-- **The outcome column.** `payment_events.outcome` is dropped with every value in it; an `ignored` and an `applied`
-- delivery become indistinguishable again (the ADR-156 defect returns) and the unprocessed index goes back to
-- `processed_at is null`. On a database where no webhook has ever landed (every environment today) that is no
-- data at all.
--
-- **The deciding admin's id.** `vetting_submissions.decided_by` is dropped with every value in it. The event log's
-- `vetting.decision-recorded` still names the actor, but that emit is best-effort by design (03 §9), so after this
-- file the database alone cannot say which admin approved or rejected a given DBS check. **Export the column
-- before running this on any database where a real decision has been recorded.**
--
-- ⚠️ **TWO SECURITY REGRESSIONS, BOTH REFUSED** (amended by L-009 `3c` for REVIEW-4 M-3 / R-2).
--
-- 1. **REFUSED — ADR-162's level term is KEPT.** `is_active_nanny()` is restored to the `0005` shape in every
--    respect *except* the verification-level term, which stays inlined. Dropping it would re-open REVIEW-3's
--    CRITICAL C-1 (an applied, unverified nanny reading every OPEN position and every child's `needs_details` —
--    Art 9 data) in the middle of an incident, with nothing in the tree depending on the gap. A rollback undoes a
--    feature; it does not undo a measured security fix. See the note at the function itself.
--
-- 2. **REFUSED — ADR-163's narrowing is KEPT.** This file used to restore `create_nanny_account()` at `0021`'s
--    8-argument form *with EXECUTE re-granted to `authenticated`*, and asked the operator in a comment to revoke
--    it by hand if the rolled-back state outlived the incident. REVIEW-4 M-3 measured the result —
--    `authenticated=X/postgres` — and R-2 put the question: does this twin take ADR-165 (2)'s `RAISE EXCEPTION`,
--    or does the accepted-and-documented arm amend ADR-165?
--
--    **Neither. The twin was choosing between two options when there were three.** ADR-165 (2)'s refusal is for
--    a twin that *genuinely cannot proceed* without the weaker grant. This one can: the function is restored at
--    `0021`'s signature and body, and the grant simply stays narrow (`service_role` only), which is arm (1) —
--    a security clause is forward-only. The rollback completes, the escalation stays shut, and the verify block
--    at the foot of this file asserts it rather than asking anyone to remember.
--
--    **What that costs, stated rather than hidden.** Any road that calls `create_nanny_account` from a user's
--    own session refuses after this file — invited signup among them. **The recovery is roll-forward**: a new
--    migration that keeps the service-role narrowing and fixes whatever `0023` broke, with the caller moved
--    behind a server action, exactly as `0023` itself did. Do not hand the grant back by hand; a comment is not
--    a control, and the operator reading one is at 3 a.m.

begin;

-- ADR-163 undone: 0021's create_nanny_account (authenticated, auth.uid()) returns.
drop function if exists public.create_nanny_account(text, text, boolean, text, text, text, uuid, jsonb, uuid);
create or replace function public.create_nanny_account(
  p_first_name text,
  p_last_name  text,
  p_isolated   boolean,
  p_mobile     text  default null,
  p_district   text  default null,
  p_area       text  default null,
  p_lead_id    uuid  default null,
  p_profile    jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id   uuid := auth.uid();
  v_email     extensions.citext;
  v_role      public.user_role;
  v_nanny_id  uuid;
  v_lead_ok   boolean := false;
  v_lead_ref  uuid;
  v_cols      public.nannies;
begin
  if v_user_id is null then
    raise exception 'create_nanny_account: no session (07 §4)' using errcode = '42501';
  end if;

  select u.email::extensions.citext into v_email from auth.users u where u.id = v_user_id;

  -- 02 §4.1: the role row is never changed by the user, and never re-roled here. A user who already
  -- holds another role is refused rather than given a second party row.
  select r.role into v_role from public.user_roles r where r.user_id = v_user_id;
  if v_role is not null and v_role <> 'nanny' then
    raise exception 'create_nanny_account: user already holds role % (02 §4.1)', v_role
      using errcode = '42501';
  end if;
  insert into public.user_roles (user_id, role)
  values (v_user_id, 'nanny')
  on conflict (user_id) do nothing;

  -- `email` mirrors the auth email (C-8); `mobile` is checked by the table's own E.164 GB constraint and
  -- `district` by its FK to `areas`, so a bad value is refused by the schema, not by a second copy here.
  insert into public.user_profiles (user_id, first_name, last_name, email, mobile, district, area)
  values (v_user_id, p_first_name, p_last_name, v_email, p_mobile, p_district, p_area)
  on conflict (user_id) do nothing;

  -- ADR-145 (2), applied to `nanny_leads`: a lead converts only if it is unclaimed AND its captured
  -- email is the account's. Anything else is left exactly as it was and the flag below says so.
  if p_lead_id is not null then
    update public.nanny_leads l
       set lead_status  = 'converted',
           converted_at = now(),
           auth_user_id = v_user_id
     where l.id = p_lead_id
       and l.converted_at is null
       -- `search_path = ''` hides `extensions`, so a bare `=` on two citext values resolves through the
       -- implicit cast to `text` and compares case-sensitively — `int.rpc-0021` caught it. The operator is
       -- named by schema so the comparison stays the citext one 02 §4.7 promises.
       and l.email operator(extensions.=) v_email
    returning l.id into v_lead_ref;
    v_lead_ok := v_lead_ref is not null;
  end if;

  -- The profile columns arrive as one jsonb merged over an empty row through the same static list
  -- `update_nanny_profile()` writes — no dynamic SQL, every value cast through the column's own type.
  v_cols := jsonb_populate_record(null::public.nannies, public.nanny_profile_columns(p_profile));

  insert into public.nannies (
    user_id, is_isolated, lead_id,
    bio, years_experience, qualification, certificates, languages,
    has_car, has_driving_licence, is_non_smoker, comfortable_with_pets,
    hourly_rate_min_pence, availability, available_from
  )
  values (
    v_user_id, p_isolated, v_lead_ref,
    v_cols.bio, v_cols.years_experience, v_cols.qualification,
    coalesce(v_cols.certificates, '{}'), coalesce(v_cols.languages, '{}'),
    v_cols.has_car, v_cols.has_driving_licence, v_cols.is_non_smoker, v_cols.comfortable_with_pets,
    v_cols.hourly_rate_min_pence, v_cols.availability, v_cols.available_from
  )
  on conflict (user_id) do nothing
  returning id into v_nanny_id;

  -- Idempotent: a second call answers the row that already exists, and changes nothing about it.
  if v_nanny_id is null then
    select n.id into v_nanny_id from public.nannies n where n.user_id = v_user_id;
  end if;

  -- 02 §4.7 row 3: every nanny is a lead; `is_isolated` mirrored (R-8's pattern).
  insert into public.nanny_contact_state (nanny_user_id, lead_status, is_isolated)
  values (v_user_id, 'untouched', p_isolated)
  on conflict (nanny_user_id) do nothing;

  return jsonb_build_object('nanny_id', v_nanny_id, 'lead_converted', v_lead_ok);
end
$$;

-- ★ ADR-165 (1), ADR-163 kept: `authenticated` does NOT get EXECUTE back. `0021` granted it here; this twin
-- restores the function and leaves the narrowing in place. Invited signup refuses until the roll-forward lands
-- (see the header) — that is the accepted cost, and it is the cheap side of the trade.
revoke all on function public.create_nanny_account(text, text, boolean, text, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_nanny_account(text, text, boolean, text, text, text, uuid, jsonb) to service_role;

-- REVIEW-3 M-5 undone: 0022's submit_verification_evidence returns (client-authored consent instant).
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

  -- security-reviewer M1: a section already with us (`pending` · `review`) takes no second submission of the
  -- SAME evidence type in this attempt — judged on the ledger, so identity's document → selfie pair (03 §4.3)
  -- still lands, while a raced second document or a resubmit under review is refused here and not only by the
  -- app's unlocked read (`assertSectionOpen`).
  if v_section_status in ('pending', 'review') and exists (
    select 1 from public.vetting_submissions s
    where s.verification_id = v_row.id
      and s.section = p_section
      and s.evidence_type = p_evidence_type
      and s.submitted_at >= coalesce(
        case p_section
          when 'identity'      then v_row.identity_status_at
          when 'dbs'           then v_row.dbs_status_at
          when 'right_to_work' then v_row.rtw_status_at
        end, '-infinity'::timestamptz)
  ) then
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


-- ADR-162 undone: 0016's view, 0005's index and is_active_nanny() return; the predicate functions go.
create or replace view public.nanny_public
with (security_invoker = off, security_barrier = true) as
  select
    n.id                       as nanny_id,
    n.bio,
    n.years_experience,
    n.qualification,
    n.certificates,
    n.languages,
    n.has_car,
    n.has_driving_licence,
    n.is_non_smoker,
    n.comfortable_with_pets,
    n.hourly_rate_min_pence,
    n.availability,
    n.available_from,
    n.verification_level,
    up.first_name,
    up.district,
    up.area,
    -- The object leaf only. `profile_picture_path` is `<role>/<user_id>/<uuid>.<ext>`, pinned to
    -- that shape by user_profiles_picture_path_owned_check, so shipping the whole path handed every
    -- anonymous browser a stable `auth.users.id` per nanny - the same identifier every auth.uid()
    -- predicate and every storage prefix keys on (security-reviewer M1). The read model rebuilds
    -- the prefix server-side, where it already knows the nanny.
    split_part(up.profile_picture_path, '/', 3) as profile_picture_object
  from public.nannies n
  join public.user_profiles up on up.user_id = n.user_id
  where n.profile_visible
    and not n.is_isolated
    and n.suspended_at is null
    and up.deactivated_at is null
    and n.verification_level in ('L3_PROVISIONALLY_VERIFIED', 'L4_FULLY_VERIFIED');
grant select on public.nanny_public to anon, authenticated;

drop index if exists public.nannies_matching_idx;
create index if not exists nannies_matching_idx
  on public.nannies (verification_level)
  where profile_visible and not is_isolated;

-- **The level term STAYS, and that is deliberate — this file is not a bit-for-bit inverse here.**
-- REVIEW-3's C-1 measured that `0005`'s body (`not is_isolated and suspended_at is null`, no level term) lets an
-- applied nanny at `L0_SIGNED_UP` read every OPEN position and every child's `needs_details` — Art 9 child health
-- data — through the seven RLS policies keyed on this function. A rollback exists to undo *this migration's
-- feature* under incident pressure; it has no business re-opening a measured CRITICAL on the way past, and nothing
-- in the pre-`0023` tree depends on the missing term (the gap was the defect, never a behaviour). So the term is
-- inlined here — `nanny_visible()` is dropped below, so it cannot be called — and `nannies_matching_idx` and
-- `nanny_public` above keep the `0005` / `0016` forms, which already carried it. Re-applying `0023` over this is
-- safe: every object is `create or replace`.
create or replace function public.is_active_nanny()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.nannies n
    where n.user_id = auth.uid()
      and not n.is_isolated
      and n.suspended_at is null
      and n.verification_level in ('L3_PROVISIONALLY_VERIFIED', 'L4_FULLY_VERIFIED')
  );
$$;

comment on function public.is_active_nanny() is
  'I-5 / AC-N-22..26 (0005), with ADR-162''s level term kept through the 0023 rollback: a nanny who may see the marketplace at all - not isolated, not suspended AND in the pool. REVIEW-3 C-1 is not re-opened by rolling back.';

revoke all on function public.is_active_nanny() from public;
grant execute on function public.is_active_nanny() to authenticated, service_role;

drop function if exists public.nanny_is_visible(uuid);
drop function if exists public.nanny_visible(boolean, public.verification_level);

drop function if exists public.sweep_stale_verification_processing(integer);
drop function if exists public.expire_verification_section(uuid, jsonb);
drop function if exists public.record_update_service_check(uuid, public.update_service_result, boolean, uuid, jsonb);
drop function if exists public.record_vetting_decision(uuid, text, text, text, timestamptz, jsonb, uuid);
drop function if exists public.record_vetting_decision(uuid, text, text, text, timestamptz, jsonb);

-- REVIEW-3 H-3 undone: the durable attribution of every recorded decision goes with the column. See WHAT IS LOST.
drop index if exists public.vetting_submissions_decided_by_idx;
alter table public.vetting_submissions drop column if exists decided_by;
drop function if exists public.sync_nanny_verification_state(uuid, jsonb);
drop function if exists public.verification_sections_verified(public.verifications, jsonb);

-- `apply_payment_event()` as 0020 left it (the outcome writes removed; the body otherwise verbatim).
create or replace function public.apply_payment_event(
  p_provider          text,
  p_provider_event_id text,
  p_event_type        text,
  p_payload           jsonb,
  p_received_at       timestamptz,
  p_parent_user_id    uuid    default null,
  p_spine_patch       jsonb   default null,
  p_access_age_years  integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id     uuid;
  v_spine        public.parent_subscriptions;
  v_in           public.parent_subscriptions;
  v_patch        jsonb;
  v_access_until timestamptz;
begin
  insert into public.payment_events
    (provider, provider_event_id, event_type, payload, received_at)
  values
    (p_provider, p_provider_event_id, p_event_type, p_payload,
     coalesce(p_received_at, now()))
  on conflict on constraint payment_events_provider_event_key do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return jsonb_build_object('outcome', 'duplicate', 'event_id', null);
  end if;

  if p_spine_patch is null then
    update public.payment_events e
       set processed_at = now(), parent_user_id = p_parent_user_id
     where e.id = v_event_id;
    return jsonb_build_object('outcome', 'ignored', 'event_id', v_event_id);
  end if;

  if p_parent_user_id is null then
    update public.payment_events e
       set processing_error = 'E_EVENT_UNRESOLVED'
     where e.id = v_event_id;
    return jsonb_build_object('outcome', 'unresolved', 'event_id', v_event_id);
  end if;

  select * into v_spine
    from public.parent_subscriptions s
   where s.parent_user_id = p_parent_user_id
     for update;
  if not found then
    update public.payment_events e
       set processing_error = 'E_SPINE_MISSING', parent_user_id = p_parent_user_id
     where e.id = v_event_id;
    return jsonb_build_object('outcome', 'unresolved', 'event_id', v_event_id);
  end if;

  v_patch := p_spine_patch
             - 'id' - 'parent_user_id' - 'created_at' - 'updated_at'
             - 'access_until';
  v_in := jsonb_populate_record(v_spine, v_patch);

  update public.parent_subscriptions s set
    status                 = v_in.status,
    plan_shape             = v_in.plan_shape,
    purchase_path          = v_in.purchase_path,
    purchased_at           = v_in.purchased_at,
    instalments_total      = v_in.instalments_total,
    instalments_paid       = v_in.instalments_paid,
    price_pence            = v_in.price_pence,
    price_preset           = v_in.price_preset,
    deposit_pence          = v_in.deposit_pence,
    deposit_paid_at        = v_in.deposit_paid_at,
    deposit_refunded_at    = v_in.deposit_refunded_at,
    current_period_ends_at = v_in.current_period_ends_at,
    past_due_grace_ends_at = v_in.past_due_grace_ends_at,
    cancelled_at           = v_in.cancelled_at
  where s.id = v_spine.id;

  if p_spine_patch ? 'status' and p_access_age_years is not null then
    v_access_until := public.set_access_window(p_parent_user_id, p_access_age_years);
  end if;

  update public.payment_events e
     set processed_at = now(), parent_user_id = p_parent_user_id
   where e.id = v_event_id;

  return jsonb_build_object(
    'outcome', 'applied',
    'event_id', v_event_id,
    'access_until', v_access_until
  );
end;
$$;

comment on function public.apply_payment_event is
  '03 §5.4.3 / ADR-127 (0019; fourth outcome 0020 / ADR-146): the webhook''s ledger insert, spine update and processed_at stamp in one transaction. Four outcomes - duplicate (replay), ignored (no patch = no money: recorded and stamped processed, nothing owed), unresolved (a patch that cannot be applied: the error stands and the row stays on the unprocessed index), applied. Decides nothing about money: the signature check, the family resolution and the transition table stay in TypeScript. service_role only.';

revoke all on function public.apply_payment_event(text, text, text, jsonb, timestamptz, uuid, jsonb, integer) from public;
grant execute on function public.apply_payment_event(text, text, text, jsonb, timestamptz, uuid, jsonb, integer) to service_role;

drop index if exists public.payment_events_unprocessed_idx;
create index if not exists payment_events_unprocessed_idx
  on public.payment_events (received_at)
  where processed_at is null;

alter table public.payment_events drop column if exists outcome;

-- ---------------------------------------------------------------------------
-- ★ Verify — the two refused regressions, asserted inside the transaction that would otherwise commit them
-- ---------------------------------------------------------------------------
-- ADR-165 (3) is a test that applies forward -> twin -> and checks the hole is shut
-- (`supabase/__tests__/rollback-security-clauses.test.ts`). This block is the same claim made where it cannot be
-- skipped: if a future edit re-grants either function, the rollback aborts instead of quietly re-opening a hole.
do $$
begin
  if has_function_privilege('authenticated',
       'public.create_nanny_account(text, text, boolean, text, text, text, uuid, jsonb)', 'EXECUTE') then
    raise exception
      '0023 twin: `authenticated` must NOT hold EXECUTE on create_nanny_account (ADR-163 / ADR-165 (1)). Invited signup is restored by a ROLL-FORWARD migration, never by handing the grant back.';
  end if;
  if not has_function_privilege('service_role',
       'public.create_nanny_account(text, text, boolean, text, text, text, uuid, jsonb)', 'EXECUTE') then
    raise exception '0023 twin: service_role must hold EXECUTE on create_nanny_account, or there is no signup road at all';
  end if;
end;
$$;

commit;
