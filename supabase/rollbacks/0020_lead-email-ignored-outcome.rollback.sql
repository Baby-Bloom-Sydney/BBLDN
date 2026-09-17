-- 0020_lead-email-ignored-outcome.rollback.sql — the twin of
-- supabase/migrations/0020_lead-email-ignored-outcome.sql (06 §4.2).
--
-- Wrapped in one transaction (database-reviewer L-3 on 0017): a rollback that fails midway must not leave
-- half the objects standing.
--
-- WHAT IS LOST, stated rather than hidden.
--
-- **`parent_leads.email` DOES lose data, and it is the one irreversible thing here.** Dropping the column
-- discards every address captured from a signup-form drop (S-X-05 / S-X-06; ADR-041), and re-applying `0020`
-- gives an empty column, not the old one. Nothing else in the schema holds those addresses: the lead is
-- pre-auth, so there is no `auth.users` row to recover them from, and the wizard answers in `form_data` never
-- contained one. The leads themselves, their answers and their conversions all survive; what disappears is
-- the second half of ADR-145 (2)'s control, so a `leadId` converts on "unclaimed" alone again — which is the
-- state HARDEN-B measured and pinned, and the honest signal that the rollback happened.
--
-- **`apply_payment_event()` loses its fourth outcome, which is a behaviour change, not data loss.** The body
-- below is `0019`'s, restored statement for statement, so a delivery with no money in it goes back to being
-- `unresolved` with `processing_error = 'E_EVENT_UNRESOLVED'` and no `processed_at` — permanently on
-- `payment_events_unprocessed_idx` (`0010` §2). Every row already written keeps exactly the stamp it got:
-- the deliveries `0020` marked `ignored` stay processed, so a rollback does not re-open them. The
-- application half must roll back with it — `webhook-method.ts` reads `ignored` as "recorded, nothing owed",
-- and against `0019`'s function that call answers `unresolved`, which the money path turns into a 5xx and
-- the provider retries for ever. **Roll the code back in the same change, or roll forward.**
--
-- `create or replace` here, never `drop`: `apply_payment_event()` is the webhook's one road, and a dropped
-- function is an outage rather than a rollback.

begin;

alter table public.parent_leads drop column if exists email;

-- `0019`'s body, statement for statement. The only differences from `0020`'s are the two branches: the null
-- family is tested first and answers `unresolved`, and there is no `ignored`.
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

  if p_parent_user_id is null then
    update public.payment_events e
       set processing_error = 'E_EVENT_UNRESOLVED'
     where e.id = v_event_id;
    return jsonb_build_object('outcome', 'unresolved', 'event_id', v_event_id);
  end if;

  if p_spine_patch is not null then
    select * into v_spine
      from public.parent_subscriptions s
     where s.parent_user_id = p_parent_user_id
       for update;
    if not found then
      -- I-M1: the spine row is minted before a purchase can be dispatched against it. A missing one is
      -- the same shape `set_access_window` refuses on, and it is recorded rather than invented.
      update public.payment_events e
         set processing_error = 'E_SPINE_MISSING', parent_user_id = p_parent_user_id
       where e.id = v_event_id;
      return jsonb_build_object('outcome', 'unresolved', 'event_id', v_event_id);
    end if;

    v_patch := p_spine_patch
               - 'id' - 'parent_user_id' - 'created_at' - 'updated_at'
               -- `access_until` is `set_access_window()`'s alone (`0010`; ADR-083 / 084), and this
               -- function calls it below rather than letting a patch reach the column directly.
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

    -- ADR-083 / 084, and the same condition `handleWebhook` applies: the window is recomputed on a
    -- transition that moved the status, and only then. In this transaction, so a paid delivery cannot
    -- leave a spine that says `paid_in_full` beside a window that was never opened.
    if p_spine_patch ? 'status' and p_access_age_years is not null then
      v_access_until := public.set_access_window(p_parent_user_id, p_access_age_years);
    end if;
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
  '03 §5.4.3 / ADR-127 (0019): the webhook''s ledger insert, spine update and processed_at stamp in one transaction - the fold 1h named and could not write. Decides nothing about money: the signature check, the family resolution and the transition table stay in TypeScript. service_role only.';

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'parent_leads' and column_name = 'email'
  ) then
    raise exception '0020 rollback: parent_leads.email still exists';
  end if;

  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'apply_payment_event') ~ '''ignored''' then
    raise exception '0020 rollback: apply_payment_event() can still answer `ignored`';
  end if;

  -- The restore is a replace, so everything 0019 asserted must still hold.
  if to_regprocedure('public.apply_payment_event(text, text, text, jsonb, timestamptz, uuid, jsonb, integer)') is null then
    raise exception '0020 rollback: apply_payment_event() is gone - the restore must replace it, never drop it';
  end if;
  if has_function_privilege('anon', 'public.apply_payment_event(text, text, text, jsonb, timestamptz, uuid, jsonb, integer)', 'execute')
     or has_function_privilege('authenticated', 'public.apply_payment_event(text, text, text, jsonb, timestamptz, uuid, jsonb, integer)', 'execute') then
    raise exception '0020 rollback: apply_payment_event() must stay service_role only (I-M2)';
  end if;
end
$$;

commit;
