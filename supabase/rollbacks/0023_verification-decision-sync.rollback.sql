-- 0023_verification-decision-sync.rollback.sql — the twin of supabase/migrations/0023_verification-decision-sync.sql (06 §4.2).
--
-- Drops the six functions 0023 adds, restores `apply_payment_event()` to its 0020 body, restores
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

begin;

drop function if exists public.sweep_stale_verification_processing(integer);
drop function if exists public.expire_verification_section(uuid, jsonb);
drop function if exists public.record_update_service_check(uuid, public.update_service_result, boolean, uuid, jsonb);
drop function if exists public.record_vetting_decision(uuid, text, text, text, timestamptz, jsonb);
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

commit;
