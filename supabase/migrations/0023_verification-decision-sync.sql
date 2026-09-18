-- 0023_verification-decision-sync.sql — the ordered migration set (02-data-model.md §6 row 0023; ADR-157; ADR-156 folded)
--
-- Creates: the level's ONE writer `sync_nanny_verification_state()` and the four decision-side `SECURITY DEFINER`
-- writes of 02 §7 — `record_vetting_decision()` · `record_update_service_check()` · `expire_verification_section()` ·
-- `sweep_stale_verification_processing()` — plus the pure helper `verification_sections_verified()`; and, folded in
-- from ADR-156, `payment_events.outcome` with `apply_payment_event()` re-created to write it and
-- `payment_events_unprocessed_idx` re-keyed on it; from REVIEW-3 (ADR-162 / ADR-163 / M-5): the one visibility
-- predicate `nanny_visible()` / `nanny_is_visible()` with `is_active_nanny()`, `nanny_public` and `nannies_matching_idx`
-- re-created over it, `create_nanny_account()` re-created for `p_user_id` as `service_role`, and
-- `submit_verification_evidence()` re-created to stamp the Update Service consent server-side.
--
-- Forced by: nothing later — every object here is **additive** over `0000`–`0022`: one nullable column on a
-- table that is empty in every environment, one index replaced by the same name, six functions, one function
-- re-created with the same signature. No policy, no drop of anything that carries data, no rename, no narrowing.
-- The set still applies forwards from an empty database in one pass.
-- Rollback twin: supabase/rollbacks/0023_verification-decision-sync.rollback.sql
--
-- WHY THE LEVEL IS WRITTEN HERE AND NOWHERE ELSE (ADR-157).
--   02 §4.3 names one sync writer for `nannies.verification_level` (R-8) and `0022` left `level`,
--   `level_changed_at`, `dbs_outcome`, the cross-check and the Update Service columns with no writer at all — its
--   verify block asserts that none of its functions touches them. The level is derived, never stated: a client
--   that could name a level could name L4. So the derivation runs in this function, inside the same transaction as
--   the decision that changes the facts it reads, and the only thing a caller hands it is WHICH sections each
--   level requires (`p_required` — `VETTING.requiredChecksByLevel` mapped to sections; 03 §4.2 "the list is the
--   gate and nothing in code"; ADR-153 holds because right-to-work is in no list). A malformed or emptied list
--   refuses rather than grants.
--
-- THE ADMIN IS THE CHECK (03 §4.4).
--   `stub-manual` extracts nothing, so under it the person deciding from the queue IS the surname cross-check
--   and IS the reader of the certificate: a DBS `verified` sets `dbs_outcome = cleared` and
--   `cross_check_status = passed`; a DBS `rejected adverse` sets `dbs_outcome = barred`, which I-V5 turns into
--   L0 + `suspended_at` in the same statement (the 0008 CHECK demands it). The Update Service check is the
--   level-4 action (04 §4.1 row 15): only `no_change`, recorded by an admin, confirms it — the B-19 default.
--
-- WHO MAY EXECUTE WHAT.
--   Every function here moves a section or a level on the strength of a decision the nanny did not make, so
--   every one is `service_role` only, called by boot adapters at service scope and named in the owning module
--   READMEs (07 §5.1 rule 5). The authority of the person deciding is checked by the action (`auth.requireRole`,
--   07 §5.4) BEFORE the adapter is reached; `record_update_service_check()` additionally refuses a checker who
--   is not an admin in `user_roles`, because that id is written as the audit trail.

-- ---------------------------------------------------------------------------
-- 0. ADR-156 folded: `payment_events.outcome`
-- ---------------------------------------------------------------------------

alter table public.payment_events
  add column if not exists outcome text
    constraint payment_events_outcome_check check (outcome in ('applied', 'ignored', 'unresolved'));

comment on column public.payment_events.outcome is
  'ADR-156 (0023): what apply_payment_event() concluded — applied · ignored · unresolved. NULL = not yet decided; the unprocessed index keys on it. A duplicate delivery inserts no row, so it has no outcome.';

-- The rows this column cannot be inferred for: a stamped row with no error is `applied` or `ignored` and the two
-- were indistinguishable — the defect ADR-156 closes. Nothing to attribute in any environment today; a populated
-- table is attributed by hand before this file is applied, never guessed here.
update public.payment_events set outcome = 'unresolved'
 where outcome is null and processing_error is not null;

do $$
begin
  if exists (select 1 from public.payment_events where outcome is null and processed_at is not null) then
    raise exception '0023: payment_events carries processed rows with no outcome; attribute applied / ignored by hand before applying (ADR-156)';
  end if;
end
$$;

drop index if exists public.payment_events_unprocessed_idx;
create index if not exists payment_events_unprocessed_idx
  on public.payment_events (received_at)
  where outcome is null;

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

  -- `ignored` (0020; ADR-146) — and since 0023 the outcome is a column (ADR-156), so an ignored delivery and an
  -- applied one are told apart on the row and neither sits on the unprocessed index.
  if p_spine_patch is null then
    update public.payment_events e
       set processed_at = now(), parent_user_id = p_parent_user_id, outcome = 'ignored'
     where e.id = v_event_id;
    return jsonb_build_object('outcome', 'ignored', 'event_id', v_event_id);
  end if;

  if p_parent_user_id is null then
    update public.payment_events e
       set processing_error = 'E_EVENT_UNRESOLVED', outcome = 'unresolved'
     where e.id = v_event_id;
    return jsonb_build_object('outcome', 'unresolved', 'event_id', v_event_id);
  end if;

  select * into v_spine
    from public.parent_subscriptions s
   where s.parent_user_id = p_parent_user_id
     for update;
  if not found then
    update public.payment_events e
       set processing_error = 'E_SPINE_MISSING', parent_user_id = p_parent_user_id, outcome = 'unresolved'
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
     set processed_at = now(), parent_user_id = p_parent_user_id, outcome = 'applied'
   where e.id = v_event_id;

  return jsonb_build_object(
    'outcome', 'applied',
    'event_id', v_event_id,
    'access_until', v_access_until
  );
end;
$$;

comment on function public.apply_payment_event is
  '03 §5.4.3 / ADR-127 (0019; fourth outcome 0020 / ADR-146; the outcome column 0023 / ADR-156): the webhook''s ledger insert, spine update and processed_at stamp in one transaction. Four outcomes - duplicate (replay; no row, no outcome), ignored, unresolved, applied - each written to payment_events.outcome on the row. Decides nothing about money. service_role only.';

revoke all on function public.apply_payment_event(text, text, text, jsonb, timestamptz, uuid, jsonb, integer) from public;
grant execute on function public.apply_payment_event(text, text, text, jsonb, timestamptz, uuid, jsonb, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 1. `verification_sections_verified()` — the pure helper the derivation reads (no table access)
-- ---------------------------------------------------------------------------

create or replace function public.verification_sections_verified(p_row public.verifications, p_sections jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_s text;
begin
  -- an empty or absent list is "nothing required" — the caller (the sync) refuses that shape for L2–L4 before
  -- this is reached, so an emptied config can never grant a level through here.
  if p_sections is null or jsonb_typeof(p_sections) <> 'array' then
    return false;
  end if;
  for v_s in select jsonb_array_elements_text(p_sections) loop
    if (v_s = 'identity' and p_row.identity_status <> 'verified')
       or (v_s = 'dbs' and p_row.dbs_status <> 'verified')
       or (v_s = 'right_to_work' and p_row.rtw_status <> 'verified') then
      return false;
    end if;
    if v_s not in ('identity', 'dbs', 'right_to_work') then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

comment on function public.verification_sections_verified(public.verifications, jsonb) is
  'ADR-157 (1): true when every section a level''s list names is verified on the row. Pure; the sync validates the list before asking.';

revoke all on function public.verification_sections_verified(public.verifications, jsonb) from public;
grant execute on function public.verification_sections_verified(public.verifications, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 2. `sync_nanny_verification_state()` — the level's one writer (ADR-157 (1); 02 §4.3 R-8)
-- ---------------------------------------------------------------------------

create or replace function public.sync_nanny_verification_state(p_nanny_id uuid, p_required jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n        public.nannies;
  v_v        public.verifications;
  v_from     public.verification_level;
  v_to       public.verification_level;
  v_suspend  boolean := false;
  v_released integer := 0;
  v_key      text;
  v_val      jsonb;
  v_s        text;
begin
  -- The list is data from config, not from a user — but it is still validated, because a definer that trusts
  -- its arguments is one bad caller away from granting L4 to everyone.
  if p_required is null or jsonb_typeof(p_required) <> 'object' then
    raise exception 'sync_nanny_verification_state: p_required must be an object of level -> sections (ADR-157)'
      using errcode = '22023';
  end if;
  for v_key, v_val in select * from jsonb_each(p_required) loop
    if v_key not in ('L0_SIGNED_UP', 'L1_REGISTERED', 'L2_ID_VERIFIED', 'L3_PROVISIONALLY_VERIFIED', 'L4_FULLY_VERIFIED') then
      raise exception 'sync_nanny_verification_state: % is not a verification_level (02 §3)', v_key
        using errcode = '22023';
    end if;
    if jsonb_typeof(v_val) <> 'array' then
      raise exception 'sync_nanny_verification_state: the sections for % must be an array', v_key
        using errcode = '22023';
    end if;
    for v_s in select jsonb_array_elements_text(v_val) loop
      if v_s not in ('identity', 'dbs', 'right_to_work') then
        raise exception 'sync_nanny_verification_state: % is not an evidence section (02 §3)', v_s
          using errcode = '22023';
      end if;
    end loop;
  end loop;
  foreach v_key in array array['L2_ID_VERIFIED', 'L3_PROVISIONALLY_VERIFIED', 'L4_FULLY_VERIFIED'] loop
    if coalesce(jsonb_array_length(p_required -> v_key), 0) = 0 then
      raise exception 'sync_nanny_verification_state: % must require at least one section (an emptied list refuses, never grants)', v_key
        using errcode = '22023';
    end if;
  end loop;

  select * into v_n from public.nannies n where n.id = p_nanny_id for update;
  if not found then
    raise exception 'sync_nanny_verification_state: unknown nanny %', p_nanny_id using errcode = 'P0002';
  end if;
  v_from := v_n.verification_level;

  select * into v_v from public.verifications v where v.nanny_id = p_nanny_id for update;
  if not found then
    -- I-V1: no row reads as every section not_started
    v_to := 'L0_SIGNED_UP';
  elsif v_v.dbs_outcome = 'barred' then
    -- I-V5
    v_to := 'L0_SIGNED_UP';
    v_suspend := true;
  elsif public.verification_sections_verified(v_v, p_required -> 'L4_FULLY_VERIFIED')
        and v_v.dbs_outcome = 'cleared'
        and v_v.cross_check_status = 'passed'
        and v_v.dbs_update_service_last_result = 'no_change'
        and v_v.dbs_update_service_checked_by is not null then
    v_to := 'L4_FULLY_VERIFIED';
  elsif public.verification_sections_verified(v_v, p_required -> 'L3_PROVISIONALLY_VERIFIED')
        and v_v.dbs_outcome = 'cleared'
        and v_v.cross_check_status = 'passed' then
    v_to := 'L3_PROVISIONALLY_VERIFIED';
  elsif public.verification_sections_verified(v_v, p_required -> 'L2_ID_VERIFIED') then
    v_to := 'L2_ID_VERIFIED';
  elsif v_v.identity_status <> 'not_started' then
    v_to := 'L1_REGISTERED';
  else
    v_to := 'L0_SIGNED_UP';
  end if;

  if v_v.id is not null then
    update public.verifications v
       set level            = v_to,
           level_changed_at = case when v.level is distinct from v_to then now() else v.level_changed_at end,
           suspended_at     = case when v_suspend then coalesce(v.suspended_at, now()) else null end
     where v.id = v_v.id;
  end if;

  update public.nannies n
     set verification_level    = v_to,
         verification_synced_at = now(),
         suspended_at          = case when v_suspend then coalesce(n.suspended_at, now()) else null end
   where n.id = p_nanny_id;

  -- ADR-158 arm 2: the silent-hold release — every connection held for verification is released at L4.
  if v_to = 'L4_FULLY_VERIFIED' then
    update public.connection_requests c
       set held_for_verification = false, held_at = null
     where c.nanny_id = p_nanny_id and c.held_for_verification;
    get diagnostics v_released = row_count;
  end if;

  return jsonb_build_object(
    'from_level', v_from::text,
    'to_level',   v_to::text,
    'suspended',  v_suspend,
    'released',   v_released
  );
end;
$$;

comment on function public.sync_nanny_verification_state(uuid, jsonb) is
  'ADR-157 (1): the ONE writer of verifications.level / nannies.verification_level (02 §4.3, R-8). Derives the level top-down from the section statuses, dbs_outcome, the cross-check and the Update Service columns against the sections-per-level the caller hands it (validated; an emptied L2-L4 list refuses). Releases held_for_verification rows at L4 (ADR-158). Called inside the decision definers; never from a client. service_role only.';

revoke all on function public.sync_nanny_verification_state(uuid, jsonb) from public;
grant execute on function public.sync_nanny_verification_state(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 3. `record_vetting_decision()` — the admin's one write (ADR-157 (2); ADR-159)
-- ---------------------------------------------------------------------------

create or replace function public.record_vetting_decision(
  p_submission_id uuid,
  p_decision      text,
  p_reject_reason text default null,
  p_note          text default null,
  p_expires_at    timestamptz default null,
  p_required      jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub     public.vetting_submissions;
  v_applied jsonb;
  v_sync    jsonb;
begin
  if p_decision not in ('verified', 'rejected') then
    raise exception 'record_vetting_decision: % is not a decision (03 §4.2 ManualDecision)', p_decision
      using errcode = '22023';
  end if;
  if p_decision = 'rejected' and p_reject_reason is null then
    raise exception 'record_vetting_decision: a rejection needs a reason (04 §5.3; 05 AC-A-17)'
      using errcode = '22023';
  end if;

  select * into v_sub from public.vetting_submissions s where s.id = p_submission_id for update;
  if not found then
    raise exception 'record_vetting_decision: unknown submission %', p_submission_id using errcode = 'P0002';
  end if;

  -- The ledger + the section's provider-side columns, by the one function that writes them (0022). The guidance
  -- key is the reason: 04 §8 owns the copy the key names and SectionCard maps the reason to a line.
  v_applied := public.apply_vetting_check_result(
    p_submission_id, p_decision, p_reject_reason, p_reject_reason, null, 'admin', p_expires_at);

  if p_note is not null then
    update public.vetting_submissions s
       set raw_response = coalesce(s.raw_response, '{}'::jsonb) || jsonb_build_object('note', p_note)
     where s.id = p_submission_id;
  end if;

  -- The admin is the check (03 §4.4): the DBS decision carries the outcome and the cross-check.
  if v_sub.section = 'dbs' then
    if p_decision = 'verified' then
      update public.verifications v
         set dbs_outcome        = 'cleared',
             cross_check_status = 'passed',
             cross_check_at     = now(),
             cross_check_note   = 'admin'
       where v.id = v_sub.verification_id;
    elsif p_reject_reason = 'adverse' then
      -- I-V5 in one statement, because 0008's CHECK reads all three columns together.
      update public.verifications v
         set dbs_outcome  = 'barred',
             level        = 'L0_SIGNED_UP',
             suspended_at = coalesce(v.suspended_at, now())
       where v.id = v_sub.verification_id;
    else
      update public.verifications v
         set dbs_outcome        = 'unset',
             cross_check_status = 'not_started',
             cross_check_at     = null,
             cross_check_note   = null
       where v.id = v_sub.verification_id;
    end if;
  end if;

  v_sync := public.sync_nanny_verification_state(v_sub.nanny_id, p_required);

  return v_applied || v_sync || jsonb_build_object('nanny_id', v_sub.nanny_id);
end;
$$;

comment on function public.record_vetting_decision(uuid, text, text, text, timestamptz, jsonb) is
  'ADR-157 (2) / ADR-159: the admin decision in one transaction - apply_vetting_check_result(..., admin), the note on the ledger, for dbs the outcome (verified => cleared + cross-check passed; rejected adverse => barred + L0 + suspended, I-V5; other rejections => unset), then the sync. service_role only; the person''s authority is the action''s (auth.requireRole, 07 §5.4).';

revoke all on function public.record_vetting_decision(uuid, text, text, text, timestamptz, jsonb) from public;
grant execute on function public.record_vetting_decision(uuid, text, text, text, timestamptz, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 4. `record_update_service_check()` — the level-4 action (ADR-157 (3); 04 §4.1 row 15; B-19 default)
-- ---------------------------------------------------------------------------

create or replace function public.record_update_service_check(
  p_nanny_id   uuid,
  p_result     public.update_service_result,
  p_subscribed boolean,
  p_checked_by uuid,
  p_required   jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_v public.verifications;
begin
  if p_checked_by is null
     or not exists (select 1 from public.user_roles r where r.user_id = p_checked_by and r.role = 'admin') then
    raise exception 'record_update_service_check: the checker must be an admin (07 §5.4 row 6)'
      using errcode = '42501';
  end if;
  select * into v_v from public.verifications v where v.nanny_id = p_nanny_id for update;
  if not found then
    raise exception 'record_update_service_check: no verifications row for nanny %', p_nanny_id
      using errcode = 'P0002';
  end if;

  update public.verifications v
     set dbs_update_service_last_checked_at = now(),
         dbs_update_service_last_result     = p_result,
         dbs_update_service_subscribed      = p_subscribed,
         dbs_update_service_checked_by      = p_checked_by,
         -- new information on the Update Service reopens the certificate decision (03 §4.3): the section returns
         -- to review, which the derivation reads as "not verified" and the level drops below L3
         dbs_status    = case when p_result = 'new_information' then 'review' else v.dbs_status end,
         dbs_status_at = case when p_result = 'new_information' then now() else v.dbs_status_at end
   where v.id = v_v.id;

  return public.sync_nanny_verification_state(p_nanny_id, p_required);
end;
$$;

comment on function public.record_update_service_check(uuid, public.update_service_result, boolean, uuid, jsonb) is
  'ADR-157 (3): the level-4 action (04 §4.1 row 15) - the four Update Service columns, checked_by = an admin user (refused otherwise); new_information returns dbs_status to review; then the sync. Only no_change confirms L4 (B-19 default). service_role only.';

revoke all on function public.record_update_service_check(uuid, public.update_service_result, boolean, uuid, jsonb) from public;
grant execute on function public.record_update_service_check(uuid, public.update_service_result, boolean, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 5. `expire_verification_section()` — the `vetting-expiry` write (ADR-157 (4); 03 §4.3)
-- ---------------------------------------------------------------------------

create or replace function public.expire_verification_section(p_submission_id uuid, p_required jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.vetting_submissions;
begin
  select * into v_sub from public.vetting_submissions s where s.id = p_submission_id for update;
  if not found then
    raise exception 'expire_verification_section: unknown submission %', p_submission_id using errcode = 'P0002';
  end if;

  -- The section expires; the ledger row keeps `passed` - that it passed is history, that it has lapsed is state.
  if v_sub.section = 'identity' then
    update public.verifications v set identity_status = 'expired', identity_status_at = now()
     where v.id = v_sub.verification_id;
  elsif v_sub.section = 'dbs' then
    update public.verifications v set dbs_status = 'expired', dbs_status_at = now()
     where v.id = v_sub.verification_id;
  elsif v_sub.section = 'right_to_work' then
    update public.verifications v set rtw_status = 'expired', rtw_status_at = now()
     where v.id = v_sub.verification_id;
  else
    raise exception 'expire_verification_section: submission % is on section %, which carries no evidence',
      v_sub.id, v_sub.section using errcode = '22023';
  end if;

  return jsonb_build_object('section', v_sub.section::text, 'nanny_id', v_sub.nanny_id)
         || public.sync_nanny_verification_state(v_sub.nanny_id, p_required);
end;
$$;

comment on function public.expire_verification_section(uuid, jsonb) is
  'ADR-157 (4): the section of a verified submission -> expired, then the sync (the level drops); the ledger row keeps passed. The vetting-expiry job''s write. service_role only.';

revoke all on function public.expire_verification_section(uuid, jsonb) from public;
grant execute on function public.expire_verification_section(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 6. `sweep_stale_verification_processing()` — I-V4's named job (ADR-157 (5); ADR-161)
-- ---------------------------------------------------------------------------

create or replace function public.sweep_stale_verification_processing(p_stale_minutes integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer := 0;
  v_n     integer;
  v_cut   timestamptz;
begin
  if p_stale_minutes is null or p_stale_minutes < 1 then
    raise exception 'sweep_stale_verification_processing: the window must be at least one minute'
      using errcode = '22023';
  end if;
  v_cut := now() - make_interval(mins => p_stale_minutes);

  update public.verifications v set identity_status = 'review', identity_status_at = now()
   where v.identity_status = 'processing' and coalesce(v.identity_status_at, v.updated_at) < v_cut;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  update public.verifications v set dbs_status = 'review', dbs_status_at = now()
   where v.dbs_status = 'processing' and coalesce(v.dbs_status_at, v.updated_at) < v_cut;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  update public.verifications v set rtw_status = 'review', rtw_status_at = now()
   where v.rtw_status = 'processing' and coalesce(v.rtw_status_at, v.updated_at) < v_cut;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- No sync: processing -> review cannot move a level (neither is verified).
  return v_total;
end;
$$;

comment on function public.sweep_stale_verification_processing(integer) is
  'ADR-157 (5) / I-V4: every section left processing longer than the window -> review, so a provider that never answered cannot hold a nanny in limbo. Hosted by the 5-minute run (ADR-161). service_role only.';

revoke all on function public.sweep_stale_verification_processing(integer) from public;
grant execute on function public.sweep_stale_verification_processing(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 8. ADR-162 (REVIEW-3 R-1) — pool visibility is ONE predicate with one home
-- ---------------------------------------------------------------------------
-- `is_active_nanny()` (0005) carried no verification-level term, so an applied nanny at L0 — the state /apply
-- creates (ADR-147 (1)) — passed the seven RLS policies keyed on it (0006:240,261,285; 0016:211,235,247,259)
-- and could read every OPEN position and every child's `needs_details`. The conjunction ADR-147 states is now
-- one function, read by the function, the view and the index alike. The level list is MATCHING.minVerificationLevel
-- (= 3, L3) and above, baked here the way 0016's view baked it, regenerated when the config changes.

create or replace function public.nanny_visible(p_is_isolated boolean, p_level public.verification_level)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not p_is_isolated
     and p_level in ('L3_PROVISIONALLY_VERIFIED', 'L4_FULLY_VERIFIED');
$$;

comment on function public.nanny_visible(boolean, public.verification_level) is
  'ADR-162: the ONE pool-visibility predicate, row form (IMMUTABLE so nannies_matching_idx can carry it) - NOT is_isolated AND verification_level >= MATCHING.minVerificationLevel (baked: L3, L4). Regenerated with the config.';

revoke all on function public.nanny_visible(boolean, public.verification_level) from public;
grant execute on function public.nanny_visible(boolean, public.verification_level) to anon, authenticated, service_role;

create or replace function public.nanny_is_visible(p_nanny_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select public.nanny_visible(n.is_isolated, n.verification_level) and n.suspended_at is null
      from public.nannies n where n.id = p_nanny_id
  ), false);
$$;

comment on function public.nanny_is_visible(uuid) is
  'ADR-162: the ONE pool-visibility predicate, id form - nanny_visible() over the party row, and not suspended (I-V5 keeps a suspended nanny at L0 anyway). What is_active_nanny() and nanny_public read.';

revoke all on function public.nanny_is_visible(uuid) from public;
grant execute on function public.nanny_is_visible(uuid) to anon, authenticated, service_role;

-- 0005's is_active_nanny(), re-created over the predicate: the same seven policies, one more term.
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
      and public.nanny_visible(n.is_isolated, n.verification_level)
      and n.suspended_at is null
  );
$$;

comment on function public.is_active_nanny() is
  'I-5 / AC-N-22..26 (0005) + ADR-162 (0023): a nanny who may see the marketplace at all - not isolated, not suspended AND in the pool (nanny_visible). An applied nanny at L0 reads only her own rows.';

revoke all on function public.is_active_nanny() from public;
grant execute on function public.is_active_nanny() to authenticated, service_role;

-- 0005's matching index, re-created over the predicate (same name, same key, the predicate is the one home).
drop index if exists public.nannies_matching_idx;
create index if not exists nannies_matching_idx
  on public.nannies (verification_level)
  where profile_visible and public.nanny_visible(is_isolated, verification_level);

-- 0016's nanny_public, re-created over the predicate: the same columns, the where-clause reads the one home.
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
    and public.nanny_visible(n.is_isolated, n.verification_level)
    and n.suspended_at is null
    and up.deactivated_at is null;

comment on view public.nanny_public is
  '07 §5.2 / 02 §7: the only road from a parent or a visitor to a nanny row. Excludes is_vaccinated (ADR-103), last_name, mobile, date_of_birth and every pointer. The predicate - visible, in the pool (nanny_visible(): not isolated, level >= MATCHING.minVerificationLevel — ADR-162, 0023), not suspended - is I-5 made structural.';

grant select on public.nanny_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. ADR-163 (REVIEW-3 R-2) — create_nanny_account() is service_role, acting for p_user_id
-- ---------------------------------------------------------------------------
-- 0021 granted it to `authenticated` and its `p_isolated` is a raw argument, so an invited nanny's own session
-- could call it with `false` and skip the apply road. Now only the signup actions may call it (service scope),
-- naming the user the session just minted; the argument stays, the caller changes.

drop function if exists public.create_nanny_account(text, text, boolean, text, text, text, uuid, jsonb);

create or replace function public.create_nanny_account(
  p_first_name text,
  p_last_name  text,
  p_isolated   boolean,
  p_mobile     text  default null,
  p_district   text  default null,
  p_area       text  default null,
  p_lead_id    uuid  default null,
  p_profile    jsonb default '{}'::jsonb,
  p_user_id    uuid  default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id   uuid := p_user_id;
  v_email     extensions.citext;
  v_role      public.user_role;
  v_nanny_id  uuid;
  v_lead_ok   boolean := false;
  v_lead_ref  uuid;
  v_cols      public.nannies;
begin
  if v_user_id is null then
    raise exception 'create_nanny_account: p_user_id is required — the caller is the signup action at service scope (ADR-163)' using errcode = '22023';
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


comment on function public.create_nanny_account(text, text, boolean, text, text, text, uuid, jsonb, uuid) is
  'ADR-152 (1), re-created by 0023 (ADR-163): the nanny signup pair + the party row + the contact state in one transaction for p_user_id. service_role only - the signup actions call it at service scope and decide p_isolated by road (/apply false, invite true); a nanny''s own session can never say false. Idempotent on the user.';

revoke all on function public.create_nanny_account(text, text, boolean, text, text, text, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.create_nanny_account(text, text, boolean, text, text, text, uuid, jsonb, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 10. REVIEW-3 M-5 — the Update Service consent instant is the server's
-- ---------------------------------------------------------------------------
-- 0022 wrote `dbs_update_service_consent_at` from the client's column value. 0004's rule for every consent
-- instant is that the server stamps it; the wizard's key now means "she ticked it" and the definer writes now().

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
         -- REVIEW-3 M-5 (0023): the consent instant is the server's, never the client's — a key present means she
         -- ticked it now; absent means unchanged (0004's rule for every client-authored instant)
         dbs_update_service_consent_at = case when p_section = 'dbs' and (p_columns ? 'dbs_update_service_consent_at')
                                              then now() else v_new.dbs_update_service_consent_at end,
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

-- ---------------------------------------------------------------------------
-- 7. Verify block — names what this file expects, raises if any of it is missing
-- ---------------------------------------------------------------------------

do $$
declare
  v_fn  text;
  v_oid oid;
  v_def text;
begin
  -- ADR-156
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'payment_events' and column_name = 'outcome'
  ) then
    raise exception '0023: payment_events.outcome is missing (ADR-156)';
  end if;
  select pg_get_indexdef(i.indexrelid) into v_def
    from pg_index i join pg_class c on c.oid = i.indexrelid
   where c.relname = 'payment_events_unprocessed_idx';
  if v_def is null or v_def !~* 'WHERE \(outcome IS NULL\)' then
    raise exception '0023: payment_events_unprocessed_idx must key on outcome IS NULL (ADR-156); got %', v_def;
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'apply_payment_event' and p.prosrc ~ 'outcome = ''applied'''
  ) then
    raise exception '0023: apply_payment_event() must write payment_events.outcome (ADR-156)';
  end if;

  -- ADR-157: six functions, each once, each SECURITY DEFINER with the exact search_path, none reachable by a client
  foreach v_fn in array array['sync_nanny_verification_state', 'record_vetting_decision',
                              'record_update_service_check', 'expire_verification_section',
                              'sweep_stale_verification_processing', 'verification_sections_verified'] loop
    select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn;
    if v_oid is null then
      raise exception '0023: public.%() is missing', v_fn;
    end if;
    if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = v_fn) <> 1 then
      raise exception '0023: public.%() must have exactly one overload', v_fn;
    end if;
    if not exists (
      select 1 from pg_proc p where p.oid = v_oid
        and (p.prosecdef or v_fn = 'verification_sections_verified')
        and p.proconfig is not null and 'search_path=""' = any(p.proconfig)
    ) then
      raise exception '0023: public.%() must be SECURITY DEFINER with search_path pinned to '''' (02 §7)', v_fn;
    end if;
    if has_function_privilege('anon', v_oid, 'execute') or has_function_privilege('authenticated', v_oid, 'execute') then
      raise exception '0023: no client role may execute public.%() (I-V2: the level is never a client''s to write)', v_fn;
    end if;
    if not has_function_privilege('service_role', v_oid, 'execute') then
      raise exception '0023: service_role must execute public.%()', v_fn;
    end if;
    if v_fn <> 'verification_sections_verified' and exists (
      select 1 from pg_proc p join pg_roles r on r.oid = p.proowner
      where p.oid = v_oid and not (r.rolbypassrls or r.rolsuper)
    ) then
      raise exception '0023: public.%() is owned by a role without BYPASSRLS; FORCE RLS would make it write nothing, silently', v_fn;
    end if;
  end loop;

  -- The level has ONE writer: of every function in the schema, only the sync (and the barring statement inside
  -- record_vetting_decision, which I-V5 forces into the same statement as dbs_outcome) may assign `level`.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname not in ('sync_nanny_verification_state', 'record_vetting_decision')
       and p.prosrc ~ '\ylevel\s*='
       and p.prosrc ~ 'public\.verifications'
  ) then
    raise exception '0023: a function other than the sync assigns verifications.level (ADR-157: one writer)';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname <> 'sync_nanny_verification_state'
       and p.prosrc ~ 'verification_level\s*='
  ) then
    raise exception '0023: a function other than the sync assigns nannies.verification_level (R-8: one writer)';
  end if;

  -- ADR-162: one visibility predicate, three readers
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'nanny_visible';
  if v_oid is null or (select p.provolatile from pg_proc p where p.oid = v_oid) <> 'i' then
    raise exception '0023: public.nanny_visible() must exist and be IMMUTABLE (ADR-162)';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'is_active_nanny' and p.prosrc ~ 'nanny_visible'
  ) then
    raise exception '0023: is_active_nanny() must read nanny_visible() (ADR-162)';
  end if;
  if pg_get_viewdef('public.nanny_public'::regclass) !~ 'nanny_visible' then
    raise exception '0023: nanny_public must read nanny_visible() (ADR-162)';
  end if;
  select pg_get_indexdef(i.indexrelid) into v_def
    from pg_index i join pg_class c on c.oid = i.indexrelid
   where c.relname = 'nannies_matching_idx';
  if v_def is null or v_def !~ 'nanny_visible' then
    raise exception '0023: nannies_matching_idx must carry nanny_visible() (ADR-162); got %', v_def;
  end if;

  -- ADR-163: create_nanny_account is one overload, service_role only
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'create_nanny_account') <> 1 then
    raise exception '0023: create_nanny_account() must have exactly one overload (ADR-163)';
  end if;
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_nanny_account';
  if has_function_privilege('authenticated', v_oid, 'execute') or has_function_privilege('anon', v_oid, 'execute') then
    raise exception '0023: create_nanny_account() must not be executable by a client role (ADR-163)';
  end if;
  if not has_function_privilege('service_role', v_oid, 'execute') then
    raise exception '0023: service_role must execute create_nanny_account() (ADR-163)';
  end if;
  if exists (select 1 from pg_proc p where p.oid = v_oid and p.prosrc ~ 'auth\.uid\(\)') then
    raise exception '0023: create_nanny_account() must act for p_user_id, never auth.uid() (ADR-163)';
  end if;

  -- REVIEW-3 M-5: the consent instant is stamped server-side
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'submit_verification_evidence'
       and p.prosrc ~ 'dbs_update_service_consent_at''\)\s*\n?\s*then now\(\)'
  ) then
    raise exception '0023: submit_verification_evidence() must stamp dbs_update_service_consent_at with now() (REVIEW-3 M-5)';
  end if;

  -- 0008's rule still holds: no client write policy on either table.
  if exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename in ('verifications', 'vetting_submissions') and cmd <> 'SELECT'
  ) then
    raise exception '0023: verifications / vetting_submissions must stay SELECT-only for client roles (I-V2)';
  end if;
end
$$;
