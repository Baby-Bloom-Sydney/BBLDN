-- 0020_lead-email-ignored-outcome.sql — the ordered migration set (02-data-model.md §6 row 0020)
--
-- Creates: `parent_leads.email` (02 §4.7) and `apply_payment_event()`'s fourth outcome, `ignored` (02 §7).
--
-- Forced by: nothing later. Both objects are **additive** over `0000`–`0019` — one new nullable column, and
-- one `create or replace` of a function whose signature, grants, owner and three existing outcomes are
-- unchanged. No table, enum, policy, index or constraint is created, dropped, renamed or narrowed, so the set
-- still applies forwards from an empty database in one pass.
-- Rollback twin: supabase/rollbacks/0020_lead-email-ignored-outcome.rollback.sql
--
-- @adr ADR-146 — the ruling this file is. Three closes were assigned to it; the two that are schema are here,
--      and the third (`clear-call-slot-action`'s membership check, ADR-145's scope note) is TypeScript.
--
-- ---------------------------------------------------------------------------
-- 1. WHY `parent_leads` GAINS AN EMAIL (ADR-146 (2); ADR-145 (2)).
--
--    ADR-145 (2) ruled that a `leadId` arriving on the signup form converts only if the lead is unclaimed
--    **and** "its captured email equals the signup email case-insensitively". The second half had nothing to
--    compare: `parent_leads` (`0014`) captured no contact at all — the advanced wizard is pre-auth and
--    anonymous, so the address first exists at signup — and HARDEN-B pinned that against this migration
--    rather than inventing a value to compare (ADR-120 rule 2).
--
--    **What the column holds, and what it does not.** 04 §3.1 step 5 says a parent who drops the signup form
--    beside her matches leaves a "lead record held, recoverable" (ADR-041). That drop is the one moment before
--    signup where an address exists, so it is the one writer: a lead held from S-X-05 / S-X-06 carries the
--    email that was typed; a wizard-only lead carries none. The column is therefore **nullable, and null is
--    the common case** — which is exactly why ADR-146 phrases the control as "when it carries an email".
--
--    **`citext`, not `text` + a lowering trigger.** `0014`'s own convention for a lead's address is
--    `nanny_leads.email extensions.citext` (02 C-8: email is citext), and every other address column in the
--    set follows it — `user_profiles.email`, `email_logs.recipient_email`, `contact_messages.sender_email`,
--    `children.created_by_email_at_creation`. Case-insensitivity belongs to the column, so the comparison
--    cannot be got wrong by a caller that forgets to fold a case. The lower-casing ADR-146 asks for at write
--    is the **store's** (`to-lead-row.ts`), not a trigger's: `0014` has no data-normalising trigger on any of
--    its five tables — its only triggers are `set_updated_at` — and adding the set's first one to do what the
--    column type already guarantees would be a second copy of the same rule. What the lower-case buys is a
--    canonical stored value for the operator's eye and for any future `citext`-free reader; what the type
--    buys is that the invariant holds even if that writer is bypassed.
--
--    **No index.** Nothing reads `parent_leads` by email: the conversion path reads the lead by its
--    client-minted `id` and compares the column it finds. An index for a predicate no query has is cost
--    without a reader, and `0014`'s four indexes are each named by a query that exists.
--
--    **No policy, and that is asserted below.** 07 §5.2's last row makes `parent_leads` service-role only —
--    a customer role has no policy on it at all — and a new column must not become the reason someone adds
--    the first one.
-- ---------------------------------------------------------------------------

alter table public.parent_leads
  add column if not exists email extensions.citext;

comment on column public.parent_leads.email is
  '02 §4.7 / ADR-146: the contact captured when a lead is HELD from a signup-form drop (S-X-05 / S-X-06; 04 §3.1 step 5, ADR-041). A wizard-only lead has none, so null is the common case. citext (0014''s convention for nanny_leads.email; 02 C-8) so ADR-145 (2)''s case-insensitive match is the column''s own property; the one writer also lower-cases what it stores.';

-- ---------------------------------------------------------------------------
-- 2. WHY `apply_payment_event()` GAINS A FOURTH OUTCOME (ADR-146 (1); ADR-127).
--
--    `0019` gave the function three outcomes — `duplicate`, `unresolved`, `applied` — and S5d wired the
--    webhook onto it. Wiring it exposed the gap S5d recorded in `webhook-method.ts` rather than papered over:
--
--      "`apply_payment_event` cannot say 'seen, and nothing to do'. A null family is `unresolved` there,
--       which stamps `processing_error` and leaves the row on the runbook's `processed_at IS NULL` index for
--       ever. Today's module marks an unhandled event type (and an unminted `LinkRef`) as processed, and
--       03 §5.4.3 wants the record either way. So those two paths are `applyEvent` **then** `stampEvent` —
--       the one path in the file that is not one transaction."
--
--    Two things were wrong with that, and one outcome fixes both. The ledger row was left permanently on
--    `payment_events_unprocessed_idx` (`0010` §2), which 06's reconciliation reads as "deliveries that still
--    need a human" — so every `checkout.session.expired` we do not act on silently grew that queue. And the
--    module had to make a second statement to correct it, which is the one road in the file ADR-127 does not
--    cover.
--
--    **The distinction the function now draws is money, not knowledge.**
--      * `p_spine_patch IS NULL` — the caller decided this delivery moves no money. Either it could not place
--        it (an unminted `LinkRef`) or the standing does not act on that type. The row is recorded and
--        **stamped `processed_at` with no `processing_error`**: seen, answered, nothing owed. → `ignored`.
--      * `p_spine_patch IS NOT NULL` and the family or its spine row cannot be found — a patch arrived that
--        cannot be applied. That is not "nothing to do"; it is work that failed. The row keeps its
--        `processing_error` and stays on the unprocessed index, which is what the index is for. → `unresolved`.
--
--    So `unresolved` narrows to what it always should have meant, and nothing that used to be `applied`
--    changes: `applied` still requires a patch, a family and a spine row. The webhook's no-money paths become
--    one RPC like the money paths, and `stampEvent` — `SpineStore`'s last raw `payment_events` write — has no
--    caller left and is deleted with this change.
--
--    Everything else in the function is `0019`'s, character for character: the `ON CONFLICT … DO NOTHING`
--    replay guard, the `FOR UPDATE` spine lock, the `jsonb_populate_record` merge over the stored row, the
--    stripped `access_until` recomputed through `set_access_window()` **inside this transaction** on a status
--    move (ADR-083 / 084), the static named column list, the `search_path = ''` pin and the `service_role`-only
--    grant (I-M2 — no client writes the spine). `create or replace` keeps the grants and the owner; the verify
--    block below asserts both rather than assuming them.
-- ---------------------------------------------------------------------------

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

  -- `ignored` (0020; ADR-146). No patch = no money in this delivery, whether because the caller could not
  -- place it or because the standing does not act on that type. 03 §5.4.3 wants the record either way, so the
  -- ledger row stands - stamped processed, with no processing_error, because nothing is owed on it. The
  -- family id is written when we have one: an ignored delivery we COULD place is still that family's history.
  --
  -- fix: database-reviewer L-5. Whatever 06 does with a row it finds on payment_events_unprocessed_idx, it
  -- cannot be "let the provider resend": the ON CONFLICT replay guard above answers `duplicate` to every
  -- redelivery of an id already in the ledger, so a row that needs reprocessing is reprocessed by hand or not
  -- at all. That is 0010's idempotency working as designed, and it is why which rows land on that index - the
  -- line this branch draws - is the whole subject of this file.
  if p_spine_patch is null then
    update public.payment_events e
       set processed_at = now(), parent_user_id = p_parent_user_id
     where e.id = v_event_id;
    return jsonb_build_object('outcome', 'ignored', 'event_id', v_event_id);
  end if;

  -- A patch with no family is work that cannot be done, not work there is none of: the row keeps its error
  -- and stays on payment_events_unprocessed_idx, where the runbook reconciles from.
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

-- ---------------------------------------------------------------------------
-- 3. Verify — the migration asserts its own result (02 §6; `0017` / `0018` / `0019`'s pattern).
--
--    Metadata only, and deliberately so: S5b's lesson on `0017` was that 151 metadata assertions passed over
--    a function that could not insert a row. The behavioural claims for both halves of this file live in
--    `supabase/__tests__/rpc-0020.test.ts`, every one of which invokes the thing it is about.
-- ---------------------------------------------------------------------------

do $$
declare
  v_sig   text;
  v_col   record;
  v_count integer;
begin
  -- 3a. parent_leads.email ---------------------------------------------------
  select data_type, udt_name, is_nullable into v_col
    from information_schema.columns
   where table_schema = 'public' and table_name = 'parent_leads' and column_name = 'email';
  if not found then
    raise exception '0020: parent_leads.email missing (02 §4.7; ADR-146 (2))';
  end if;
  if v_col.udt_name <> 'citext' then
    raise exception '0020: parent_leads.email must be extensions.citext (02 C-8; 0014''s nanny_leads.email), found %', v_col.udt_name;
  end if;
  if v_col.is_nullable <> 'YES' then
    raise exception '0020: parent_leads.email must be nullable - a wizard-only lead captures no address (ADR-146 (2))';
  end if;

  -- 07 §5.2's last row, re-asserted because a new column is exactly the excuse for a first policy.
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'parent_leads') then
    raise exception '0020: parent_leads is service role only; a new column is not a reason for a policy (07 §5.2)';
  end if;

  -- 3b. apply_payment_event --------------------------------------------------
  v_sig := 'public.apply_payment_event(text, text, text, jsonb, timestamptz, uuid, jsonb, integer)';
  if to_regprocedure(v_sig) is null then
    raise exception '0020: apply_payment_event() is not at 0019''s signature - create or replace must not have forked it';
  end if;

  -- fix: database-reviewer M-1. `0019` makes this assertion for its three upserts and omitted it here, and it
  -- matters most here: the checks below name the 8-argument signature as a LITERAL, so a second overload with
  -- any other argument list would keep PUBLIC's default EXECUTE, be reachable through PostgREST by named
  -- argument, and pass every one of them. On a function whose only defence is its grant, "exactly one" is part
  -- of the defence.
  select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'apply_payment_event';
  if v_count <> 1 then
    raise exception '0020: expected exactly 1 apply_payment_event() overload, found % - a leftover overload is a definer nobody granted on purpose', v_count;
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'apply_payment_event'
      and p.prosecdef and p.proconfig is not null and 'search_path=""' = any(p.proconfig)
  ) then
    raise exception '0020: apply_payment_event() must stay SECURITY DEFINER with search_path pinned';
  end if;

  -- The grant IS the defence (0019's database-reviewer H-1): there is no in-function authority check to
  -- fall back on, so a replace that widened EXECUTE would be the whole hole.
  if has_function_privilege('anon', v_sig, 'execute')
     or has_function_privilege('authenticated', v_sig, 'execute') then
    raise exception '0020: apply_payment_event() must stay service_role only (I-M2 - no client writes the spine)';
  end if;
  -- fix: database-reviewer L-1. The negative was asserted and the positive was not, and this file issues no
  -- `grant` of its own: the webhook's entire enablement is state inherited from `0019` through `create or
  -- replace`. It holds today; asserted, it holds provably.
  if not has_function_privilege('service_role', v_sig, 'execute') then
    raise exception '0020: apply_payment_event() must stay EXECUTE-able by service_role - create or replace preserves the ACL, and this asserts that it did';
  end if;

  if exists (
    select 1 from pg_proc p join pg_roles r on r.oid = p.proowner
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'apply_payment_event'
      and not (r.rolbypassrls or r.rolsuper)
  ) then
    raise exception '0020: apply_payment_event() is owned by a role without BYPASSRLS; FORCE RLS would make it write nothing, silently (0002''s rule)';
  end if;

  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'apply_payment_event') !~ '''ignored''' then
    raise exception '0020: apply_payment_event() must be able to answer `ignored` (ADR-146 (1))';
  end if;

  -- 0019's own assertion, kept: a replace that dropped the in-transaction recompute would leave a paid
  -- delivery beside a window that was never opened, and nothing else here would notice.
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'apply_payment_event') !~ 'set_access_window' then
    raise exception '0020: apply_payment_event() must recompute the access window inside its own transaction (ADR-083 / 084)';
  end if;

  -- The replay guard the `duplicate` outcome rests on is 0010's and must still be there.
  if not exists (select 1 from pg_constraint where conname = 'payment_events_provider_event_key') then
    raise exception '0020: payment_events_provider_event_key is missing - apply_payment_event()''s replay guard rests on it';
  end if;
end
$$;
