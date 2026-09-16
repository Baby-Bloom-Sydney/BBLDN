-- 0010_money.sql — the ordered migration set (02-data-model.md §6 row 0010)
--
-- Creates: `parent_subscriptions` (the spine), `payment_events`, `contact_messages`,
-- `refund_requests`, `guarantee_events`, `subscribe_invites` (02 §4.5), and the money RPCs of
-- 02 §7 — `set_access_window()`, `open_dfy_access()`, `start_family_trial_if_first()`,
-- `family_has_access()`, `child_has_family_access()` and the view `family_access`.
--
-- Forced by: contact_messages.related_subscription_id, refund_requests.parent_subscription_id.
-- Rollback twin: supabase/rollbacks/0010_money.rollback.sql
--
-- @adr ADR-068 / ADR-024 / ADR-025 — one spine row per family; both purchase paths land here.
-- @adr ADR-083 / ADR-084 — `access_until` = the **3rd birthday of the youngest child linked at any
--   time**, recomputed on every link by `set_access_window()`. This supersedes ADR-078: there is no
--   `access_child_id` and no `guard_access_child_id()` (fix: offer-3).
-- @adr ADR-093 — a done-for-you family has **no trial**: the app is on from the nanny's first day.
--   `open_dfy_access()` sets status = placed. The admin access toggle overrides every other standing.
-- @adr ADR-094 / ADR-097 — the bill is due `PRICES.paymentAfterStartDays` after her start and is
--   fee − deposit − the first week's wages; the £150 deposit is credited and opens no access.
-- @adr ADR-088 / ADR-099 — the guarantee ledger is kept by hand; `guarantee_promise` retains
--   `nanny-bonus` (C-1 is add-only) and **no row day one** carries it.
-- @adr ADR-071 / N-2 — no Stripe Connect, no payouts, no commission engine (02 §5 row 2).
-- R-11 — `payment_events` is provider-neutral; the stub posts synthetic events.
-- R-5  — `stripe_customer_id` lives here and nowhere else.
--
-- **Why four functions take numbers as arguments.** `PRICES.accessAgeYears`, `.trialDays`,
-- `.paymentAfterStartDays` and `.satisfactionWindowDays` are config (L4: no product literal outside
-- config/). A SQL default of `3` or `7` in a function signature would be exactly such a literal, so
-- these are **required parameters** the calling module fills from `config/prices.ts`. Same reason
-- `start_family_trial_if_first` takes the `FLAGS.NEW_TRIALS` value rather than reading it.

-- ---------------------------------------------------------------------------
-- 1. `parent_subscriptions` — the spine (02 §4.5 row 1)
-- ---------------------------------------------------------------------------

create table if not exists public.parent_subscriptions (
  id                          uuid        primary key default gen_random_uuid(),
  parent_user_id              uuid        not null unique references auth.users (id) on delete restrict,
  status                      public.subscription_status not null,

  -- plan
  plan_shape                  public.plan_shape,
  purchase_path               public.purchase_path,
  purchased_at                timestamptz,

  -- instalments
  instalments_total           integer,
  instalments_paid            integer,

  -- price snapshot (C-5)
  price_pence                 integer,
  price_version               text,

  -- access
  access_until                timestamptz,

  -- done-for-you payment (ADR-094)
  placement_id                uuid        references public.nanny_placements (id) on delete set null,
  dfy_access_opened_at        timestamptz,
  payment_due_at              timestamptz,
  first_week_wages_pence      integer,
  balance_pence               integer,
  balance_link_ref            text,
  price_preset                text,

  -- deposit (ADR-085 / 097)
  deposit_pence               integer,
  deposit_link_ref            text,
  deposit_paid_at             timestamptz,
  deposit_refunded_at         timestamptz,

  -- trial, self-serve families only (ADR-068 / 093)
  trial_started_at            timestamptz,
  trial_ends_at               timestamptz,
  has_used_trial              boolean     not null default false,

  -- satisfaction window (ADR-088 / 090)
  satisfaction_window_ends_at timestamptz,

  -- access toggle (ADR-093)
  access_toggled_on           boolean,
  access_toggled_at           timestamptz,
  access_toggled_by           uuid        references auth.users (id) on delete set null,
  access_toggle_reason        text,
  access_toggle_until         timestamptz,

  -- provider
  stripe_customer_id              text,
  stripe_subscription_id          text,
  stripe_subscription_schedule_id text,
  stripe_payment_intent_id        text,
  stripe_checkout_session_id      text,
  stripe_payment_link_id          text,

  -- paid window (explicit, never arithmetic - 02 §4.5 row 1)
  current_period_ends_at      timestamptz,
  past_due_grace_ends_at      timestamptz,

  -- cancellation
  cancelled_at                timestamptz,
  cancellation_reason         public.cancellation_reason,
  cancellation_text           text,

  -- reminders
  trial_reminder_sent_at      timestamptz,
  access_end_reminder_sent_at timestamptz,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  -- C-5: every money column is integer minor units and never negative
  constraint parent_subscriptions_money_check check (
    coalesce(price_pence, 0) >= 0 and coalesce(first_week_wages_pence, 0) >= 0
    and coalesce(balance_pence, 0) >= 0 and coalesce(deposit_pence, 0) >= 0
  ),
  -- I-M6: upfront ⇒ instalment columns null
  constraint parent_subscriptions_upfront_has_no_instalments_check
    check (plan_shape is distinct from 'upfront'
           or (instalments_total is null and instalments_paid is null)),
  constraint parent_subscriptions_instalments_range_check
    check (instalments_total is null or instalments_paid is null
           or (instalments_paid >= 0 and instalments_paid <= instalments_total)),
  -- I-M9 (ADR-093; fix offer-2): a done-for-you family never has trial columns
  constraint parent_subscriptions_dfy_has_no_trial_check
    check (placement_id is null or (trial_started_at is null and trial_ends_at is null)),
  constraint parent_subscriptions_trial_pair_check
    check ((trial_started_at is null) = (trial_ends_at is null)),
  -- the toggle is a standing decision with a reason (02 §4.5 I-M10)
  constraint parent_subscriptions_toggle_has_reason_check
    check (access_toggled_on is null
           or (access_toggled_at is not null and access_toggled_by is not null
               and access_toggle_reason is not null)),
  constraint parent_subscriptions_cancellation_text_check
    check (cancellation_text is null or length(cancellation_text) <= 500),
  -- 03 §5.2 / 02 §4.5 row 1: the PRICES key snapshotted on the row
  constraint parent_subscriptions_price_preset_check
    check (price_preset is null or price_preset in
           ('deposit', 'balance-after-week-1', 'self-serve-app', 'custom'))
);

comment on table public.parent_subscriptions is
  '02 §4.5 row 1: the spine. One row per family; neither purchase path creates a second (I-M1). Access flips on the verified webhook only (I-M2) - never on a redirect, never from a client.';
comment on column public.parent_subscriptions.access_until is
  'ADR-083 / 084: the 3rd birthday of the youngest child linked at ANY time. Written only by set_access_window() (I-M7 as amended, fix offer-3). Null while no child is linked.';
comment on column public.parent_subscriptions.deposit_paid_at is
  'ADR-097: the deposit is credited against the final bill and **opens no access** - family_has_access() never reads it.';
comment on column public.parent_subscriptions.parent_user_id is
  '07 §6.1 / §6 row 9: ON DELETE RESTRICT, not CASCADE - money rows outlive the account (6 years, HMRC / Limitation Act). The account-deletion job scrubs auth.users and leaves this row''s subject pseudonymous.';

-- I-M4 "one Stripe customer per parent" only held in one direction; nothing stopped two spine
-- rows sharing a customer, or a retried webhook writing a duplicate subscription / session id
-- (database-reviewer M-9).
create unique index if not exists parent_subscriptions_stripe_customer_idx
  on public.parent_subscriptions (stripe_customer_id) where stripe_customer_id is not null;
create unique index if not exists parent_subscriptions_stripe_subscription_idx
  on public.parent_subscriptions (stripe_subscription_id) where stripe_subscription_id is not null;
create unique index if not exists parent_subscriptions_stripe_session_idx
  on public.parent_subscriptions (stripe_checkout_session_id) where stripe_checkout_session_id is not null;

create index if not exists parent_subscriptions_status_idx on public.parent_subscriptions (status);
create index if not exists parent_subscriptions_payment_due_idx
  on public.parent_subscriptions (payment_due_at)
  where payment_due_at is not null;
create index if not exists parent_subscriptions_placement_idx
  on public.parent_subscriptions (placement_id)
  where placement_id is not null;

drop trigger if exists parent_subscriptions_set_updated_at on public.parent_subscriptions;
create trigger parent_subscriptions_set_updated_at
  before update on public.parent_subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. `payment_events` (02 §4.5 row 2; R-11)
-- ---------------------------------------------------------------------------

create table if not exists public.payment_events (
  id               uuid        primary key default gen_random_uuid(),
  provider         text        not null,
  provider_event_id text       not null,
  event_type       text        not null,
  payload          jsonb       not null,
  received_at      timestamptz not null default now(),
  processed_at     timestamptz,
  processing_error text,
  retry_count      integer     not null default 0,
  parent_user_id   uuid        references auth.users (id) on delete set null,

  constraint payment_events_provider_event_key unique (provider, provider_event_id),
  constraint payment_events_retry_count_check check (retry_count >= 0)
);

comment on table public.payment_events is
  '02 §4.5 row 2 / R-11: provider-neutral idempotency + audit. Insert BEFORE dispatch; a duplicate returns 200 skipped-duplicate. Never account.* / capability.* / payout.* (N-2).';

create index if not exists payment_events_unprocessed_idx
  on public.payment_events (received_at)
  where processed_at is null;

-- ---------------------------------------------------------------------------
-- 3. `contact_messages` (02 §4.5 row 4) — the only parent path to a refund.
-- ---------------------------------------------------------------------------

create table if not exists public.contact_messages (
  id                      uuid        primary key default gen_random_uuid(),
  user_id                 uuid        references auth.users (id) on delete set null,
  sender_email            extensions.citext not null,
  sender_name             text,
  subject                 text        not null,
  body                    text        not null,
  category                public.contact_category not null,
  status                  public.contact_message_status not null default 'unread',
  related_subscription_id uuid        references public.parent_subscriptions (id) on delete set null,
  reply_subject           text,
  reply_body              text,
  replied_at              timestamptz,
  replied_by              uuid        references auth.users (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint contact_messages_replied_pair_check
    check (status <> 'replied' or (replied_at is not null and reply_body is not null))
);

comment on table public.contact_messages is
  '02 §4.5 row 4: Contact Us. Refunds are deliberately not self-serve (memory feedback_refunds_via_contact_us); the friction is the design. Rate limit + honeypot live at the form (07 §8 row 10).';

create index if not exists contact_messages_status_idx on public.contact_messages (status, created_at desc);

drop trigger if exists contact_messages_set_updated_at on public.contact_messages;
create trigger contact_messages_set_updated_at
  before update on public.contact_messages
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. `refund_requests` (02 §4.5 row 5)
-- ---------------------------------------------------------------------------

create table if not exists public.refund_requests (
  id                     uuid        primary key default gen_random_uuid(),
  parent_subscription_id uuid        not null references public.parent_subscriptions (id) on delete restrict,
  parent_user_id         uuid        not null references auth.users (id) on delete restrict,
  contact_message_id     uuid        references public.contact_messages (id) on delete set null,
  reason                 public.refund_reason not null,
  requested_pence        integer     not null,
  refunded_pence         integer,
  status                 public.refund_status not null default 'open',
  stripe_refund_id       text        unique,
  stripe_charge_id       text,
  decided_by             uuid        references auth.users (id) on delete set null,
  decided_at             timestamptz,
  admin_notes            text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint refund_requests_requested_pence_check check (requested_pence > 0),
  constraint refund_requests_refunded_pence_check check (refunded_pence is null or refunded_pence > 0),
  -- the webhook stamps `refunded` and the refund id together, never one without the other
  constraint refund_requests_refunded_check
    check (status <> 'refunded' or (stripe_refund_id is not null and refunded_pence is not null))
);

comment on table public.refund_requests is
  '02 §4.5 row 5: the refund is issued by hand in the Stripe Dashboard; `refunded` is stamped only by the webhook matching stripe_refund_id. There is no refund engine (02 §5 row 11) and this row never flips parent_subscriptions.status by itself.';

create index if not exists refund_requests_status_idx on public.refund_requests (status, created_at desc);

drop trigger if exists refund_requests_set_updated_at on public.refund_requests;
create trigger refund_requests_set_updated_at
  before update on public.refund_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. `guarantee_events` (02 §4.5 row 6) — the guarantee ledger.
-- ---------------------------------------------------------------------------

create table if not exists public.guarantee_events (
  id                     uuid        primary key default gen_random_uuid(),
  parent_user_id         uuid        not null references auth.users (id) on delete restrict,
  parent_subscription_id uuid        not null references public.parent_subscriptions (id) on delete restrict,
  placement_id           uuid        references public.nanny_placements (id) on delete set null,
  promise                public.guarantee_promise not null,
  claimed_at             timestamptz not null default now(),
  condition_met          boolean     not null default false,
  condition_met_at       timestamptz,
  condition_note         text,
  paid_out_pence         integer,
  paid_to                public.guarantee_paid_to,
  paid_at                timestamptz,
  method                 text,
  refund_request_id      uuid        references public.refund_requests (id) on delete set null,
  decided_by             uuid        references auth.users (id) on delete set null,
  note                   text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint guarantee_events_payout_complete_check
    check (paid_out_pence is null or (paid_to is not null and paid_at is not null)),
  constraint guarantee_events_paid_out_pence_check check (paid_out_pence is null or paid_out_pence > 0),
  -- G3 / G4 pay against a proven condition (02 §4.5 row 6). The gate is the **payout**, not the
  -- claim: 02 models claimed_at -> later condition_met / condition_met_at, so requiring the
  -- condition at insert made an open G3 claim unrepresentable (database-reviewer M-10).
  constraint guarantee_events_condition_check
    check (paid_out_pence is null or promise not in ('G3', 'G4') or condition_met),
  constraint guarantee_events_condition_met_at_check
    check (not condition_met or condition_met_at is not null)
);

comment on table public.guarantee_events is
  '02 §4.5 row 6 / ADR-088: one row per promise claimed against a family, kept by hand. No payout automation (N-2). ADR-099 removed the nanny bonus: the `nanny-bonus` enum value is retained (C-1 is add-only) and no row day one may carry it - enforced below.';

-- 02 §4.5 row 6: <= 1 row per (family, promise) for G1-G4; G5 is unbounded.
create unique index if not exists guarantee_events_once_per_family_idx
  on public.guarantee_events (parent_user_id, promise)
  where promise in ('G1', 'G2', 'G3', 'G4');

-- ADR-099: the value exists so a future cohort test needs no migration (P-8); it is never written today.
create or replace function public.guard_guarantee_promise_nanny_bonus()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.promise = 'nanny-bonus' then
    raise exception
      'guarantee_promise ''nanny-bonus'' is reserved and unused: the nanny bonus was removed (ADR-099). The value is kept only because enum values are add-only (C-1).'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists guarantee_events_no_nanny_bonus on public.guarantee_events;
create trigger guarantee_events_no_nanny_bonus
  before insert or update of promise on public.guarantee_events
  for each row execute function public.guard_guarantee_promise_nanny_bonus();

drop trigger if exists guarantee_events_set_updated_at on public.guarantee_events;
create trigger guarantee_events_set_updated_at
  before update on public.guarantee_events
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. `subscribe_invites` (02 §4.5 row 3). The child_id FK arrives in 0012.
-- ---------------------------------------------------------------------------

create table if not exists public.subscribe_invites (
  id             uuid        primary key default gen_random_uuid(),
  token          text        not null unique,
  child_id       uuid        not null,
  nanny_user_id  uuid        not null references auth.users (id) on delete cascade,
  parent_user_id uuid        references auth.users (id) on delete set null,
  status         public.subscribe_invite_status not null default 'pending',
  expires_at     timestamptz,
  redeemed_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- memory project_invite_token_format: XXXX-XXXX, Crockford-like, hyphen stored
  constraint subscribe_invites_token_shape_check
    check (token ~ '^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$'),
  constraint subscribe_invites_redeemed_check
    check (status <> 'redeemed' or redeemed_at is not null)
);

comment on table public.subscribe_invites is
  '02 §4.5 row 3 / ADR-059: the nanny-shared purchase link /subscribe-for/{token}. Bonus attribution is dropped (N-2). The token is stable for the life of the invite (memory project_invite_token_stability).';

-- 02 §4.5 row 3: <= 1 pending per (child, nanny)
create unique index if not exists subscribe_invites_one_pending_per_pair_idx
  on public.subscribe_invites (child_id, nanny_user_id)
  where status = 'pending';

create or replace function public.guard_subscribe_invite_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_privileged_writer() then
    return new;
  end if;
  if (to_jsonb(new) - 'status' - 'updated_at')
       is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
    raise exception 'subscribe_invites: a nanny may revoke her own invite and nothing else (07 §5.2; token stability)'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists subscribe_invites_guard_columns on public.subscribe_invites;
create trigger subscribe_invites_guard_columns
  before update on public.subscribe_invites
  for each row execute function public.guard_subscribe_invite_columns();

drop trigger if exists subscribe_invites_set_updated_at on public.subscribe_invites;
create trigger subscribe_invites_set_updated_at
  before update on public.subscribe_invites
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 7. The gate (02 §4.5 read model; 02 §7).
--    `family_access_reason()` is the one implementation; `family_has_access()`
--    and the `family_access` view both read it, so the gate can never disagree
--    with the reason it reports.
--    Order is 02 §4.5's, exactly: test user · admin toggle (on OR off, it wins
--    whatever else stands) · placed · trial · paid · grace · cancelled period ·
--    else none. A paid deposit alone grants nothing (ADR-097).
-- ---------------------------------------------------------------------------

create or replace function public.family_access_reason(p_parent_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.parent_subscriptions;
begin
  if p_parent_user_id is null then
    return 'none';
  end if;

  -- The reason string carries parent_subscriptions.status and user_profiles.is_test_user, both of
  -- which 07 §5.2 limits to "parent SELECT own; admin SELECT". The function is granted to
  -- `authenticated` because the app calls it about itself, so it has to refuse a subject that is
  -- not the caller (security-reviewer H1). A privileged caller - the webhook, a cron, the
  -- family_access view running as its owner - has no auth.uid() and passes.
  if auth.uid() is not null and p_parent_user_id <> auth.uid() and not public.is_admin() then
    return 'none';
  end if;

  if exists (
    select 1 from public.user_profiles up
    where up.user_id = p_parent_user_id and up.is_test_user
  ) then
    return 'test-user';
  end if;

  select * into s from public.parent_subscriptions x where x.parent_user_id = p_parent_user_id;
  if not found then
    return 'none';
  end if;

  if s.access_toggled_on is not null
     and (s.access_toggle_until is null or s.access_toggle_until > now()) then
    return case when s.access_toggled_on then 'toggled-on' else 'toggled-off' end;
  end if;

  if s.status = 'placed' and (s.access_until is null or s.access_until > now()) then
    return 'placed';
  end if;
  if s.status = 'trial' and s.trial_ends_at is not null and s.trial_ends_at > now() then
    return 'trial';
  end if;
  if s.status in ('active', 'paid_in_full')
     and (s.access_until is null or s.access_until > now()) then
    return 'paid';
  end if;
  if s.status = 'past_due'
     and s.past_due_grace_ends_at is not null and s.past_due_grace_ends_at > now() then
    return 'grace';
  end if;
  if s.status = 'cancelled'
     and s.current_period_ends_at is not null and s.current_period_ends_at > now() then
    return 'cancelled-period';
  end if;

  return 'none';
end;
$$;

comment on function public.family_access_reason is
  '02 §4.5: the single implementation of the bundle gate, returning why. family_has_access() and the family_access view are both thin readers of it so the answer and the reason can never drift apart.';

create or replace function public.family_has_access(p_parent_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.family_access_reason(p_parent_user_id) not in ('none', 'toggled-off');
$$;

-- Resolves the linked parent; an unlinked nanny-only child passes (02 §4.5).
-- plpgsql, because `children` / `child_client` arrive in 0012 and a language-sql
-- body would be resolved at CREATE time. 02 §6 puts this function in this file.
create or replace function public.child_has_family_access(p_child_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parent uuid;
begin
  select c.parent_user_id into v_parent from public.children c where c.id = p_child_id;
  if v_parent is null then
    -- 02 §4.5: "resolves the **linked** parent; an unlinked nanny-only child passes". The link is
    -- child_client, not children.parent_user_id, and a child can be linked to a family whose
    -- parent_user_id was never back-filled - which the first draft let through the paywall for
    -- good (database-reviewer H-11).
    select l.parent_user_id into v_parent
    from public.child_client l
    where l.child_id = p_child_id and l.state = 'active' and l.parent_user_id is not null
    limit 1;
  end if;
  if v_parent is null then
    return true;  -- nanny-created child, genuinely unlinked
  end if;
  return public.family_has_access(v_parent);
end;
$$;

-- One call to the gate per row, not two: the first draft called family_has_access() and
-- family_access_reason() separately, each re-reading user_profiles and parent_subscriptions
-- (database-reviewer M-12). security_barrier because this view IS the access control and the
-- planner must not push a caller's qual below its predicate (database-reviewer H-12).
create or replace view public.family_access
with (security_invoker = off, security_barrier = true) as
  select
    s.parent_user_id,
    r.reason not in ('none', 'toggled-off') as has_access,
    r.reason,
    s.status,
    s.access_until,
    s.trial_ends_at,
    s.payment_due_at
  from public.parent_subscriptions s
  cross join lateral (select public.family_access_reason(s.parent_user_id) as reason) r
  where s.parent_user_id = (select auth.uid()) or (select public.is_admin());

comment on view public.family_access is
  '02 §7 / 07 §5.1 rule 6: one of the two views that exist to widen, so security_invoker = off with its own predicate baked in - a family reads its own row, an admin reads all.';

-- `grant ... to authenticated` does not exclude `anon`, which already holds SELECT from Supabase's
-- default privileges; the revoke is what makes the grant line mean what it reads as
-- (security-reviewer M5).
revoke all on public.family_access from anon;
grant select on public.family_access to authenticated;

-- ---------------------------------------------------------------------------
-- 8. The spine writers (02 §7).
-- ---------------------------------------------------------------------------

-- The ONE setter for access_until (ADR-083 / 084; fix offer-3). Recomputes from
-- the youngest child linked at any time, so a later-born child extends the
-- window. plpgsql for the same 0012-ordering reason as above.
create or replace function public.set_access_window(
  p_parent_user_id uuid,
  p_access_age_years integer
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_youngest date;
  v_until    timestamptz;
begin
  if p_access_age_years is null or p_access_age_years <= 0 then
    raise exception 'set_access_window: p_access_age_years must come from PRICES.accessAgeYears';
  end if;

  -- Every child this family has ever had, owned or linked, in ONE pass. The first draft made the
  -- link query a fallback, so a family with one directly-owned child never counted a younger
  -- linked one - and ADR-083 / 084 say the youngest child linked **at any time**
  -- (database-reviewer H-6).
  select max(q.dob) into v_youngest
  from (
    select c.date_of_birth as dob
    from public.children c
    where c.parent_user_id = p_parent_user_id
    union all
    select c.date_of_birth
    from public.children c
    join public.child_client l on l.child_id = c.id
    where l.parent_user_id = p_parent_user_id
  ) q;

  if v_youngest is null then
    return null;  -- no child linked yet: the window stays open-ended (02 R-6 as amended)
  end if;

  v_until := (v_youngest + make_interval(years => p_access_age_years))::timestamptz;

  -- Never shrink an already-granted window: "all future children are included" is a promise the
  -- family was sold, and unlinking a child must not take access back (ADR-083 / 084).
  update public.parent_subscriptions
  set access_until = greatest(coalesce(access_until, v_until), v_until)
  where parent_user_id = p_parent_user_id;

  if not found then
    raise exception 'set_access_window: no spine row for parent % (02 I-M1)', p_parent_user_id
      using errcode = 'no_data_found';
  end if;

  return v_until;
end;
$$;

comment on function public.set_access_window is
  '02 §7 / ADR-083-084: the one writer of access_until. Called by the payments webhook and by the child-link hook; recomputed on every link so all future children are included.';

-- ADR-093 / 094: the app switches on for family and nanny on the nanny's first
-- day, with no trial and no charge. Idempotent (I-M8).
create or replace function public.open_dfy_access(
  p_parent_user_id uuid,
  p_placement_id uuid,
  p_payment_after_start_days integer,
  p_satisfaction_window_days integer
)
returns public.parent_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_started timestamptz;
  v_row     public.parent_subscriptions;
begin
  if p_payment_after_start_days is null or p_satisfaction_window_days is null then
    raise exception 'open_dfy_access: the two windows come from PRICES.paymentAfterStartDays / .satisfactionWindowDays';
  end if;

  -- The placement must belong to this family (database-reviewer M-8).
  select p.started_at into v_started
  from public.nanny_placements p
  join public.parents pa on pa.id = p.parent_id
  where p.id = p_placement_id and pa.user_id = p_parent_user_id;
  if v_started is null then
    raise exception 'open_dfy_access: placement % is not this family''s, or has not started (L-1b writes started_at first)', p_placement_id
      using errcode = 'no_data_found';
  end if;

  -- **Upsert, not update.** Under ADR-094 a done-for-you family pays a week after the nanny starts,
  -- so at L-1b there may be no spine row at all; the first draft's UPDATE then hit zero rows,
  -- returned a NULL composite and access silently never opened (database-reviewer H-7).
  insert into public.parent_subscriptions as s (
    parent_user_id, status, placement_id, dfy_access_opened_at,
    payment_due_at, satisfaction_window_ends_at
  ) values (
    p_parent_user_id, 'placed', p_placement_id, v_started,
    v_started + make_interval(days => p_payment_after_start_days),
    v_started + make_interval(days => p_satisfaction_window_days)
  )
  on conflict (parent_user_id) do update set
    status                      = 'placed',
    placement_id                = excluded.placement_id,
    -- idempotent, and a second placement does not re-arm the clocks on an unpaid first one (M-8)
    dfy_access_opened_at        = coalesce(s.dfy_access_opened_at, excluded.dfy_access_opened_at),
    payment_due_at              = coalesce(s.payment_due_at, excluded.payment_due_at),
    satisfaction_window_ends_at = coalesce(s.satisfaction_window_ends_at, excluded.satisfaction_window_ends_at),
    trial_started_at            = null,
    trial_ends_at               = null
  returning * into v_row;

  return v_row;
end;
$$;

-- ADR-068 / 093: self-serve families only; a done-for-you family is refused.
-- Idempotent and once per parent for life (I-M6). plpgsql for the 0012 ordering.
create or replace function public.start_family_trial_if_first(
  p_parent_user_id uuid,
  p_trial_days integer,
  p_new_trials_enabled boolean
)
returns public.parent_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.parent_subscriptions;
begin
  if p_trial_days is null or p_trial_days <= 0 then
    raise exception 'start_family_trial_if_first: p_trial_days comes from PRICES.trialDays';
  end if;
  if p_new_trials_enabled is not true then
    select * into v_row from public.parent_subscriptions where parent_user_id = p_parent_user_id;
    return v_row;  -- FLAGS.NEW_TRIALS off: wired and read, no row minted
  end if;

  -- no trial row for a test user (02 §7)
  if exists (
    select 1 from public.user_profiles up
    where up.user_id = p_parent_user_id and up.is_test_user
  ) then
    select * into v_row from public.parent_subscriptions where parent_user_id = p_parent_user_id;
    return v_row;
  end if;

  select * into v_row from public.parent_subscriptions where parent_user_id = p_parent_user_id;

  -- Name what disqualifies, rather than requiring status = 'trial'. `subscription_status` has no
  -- pre-trial value, so a spine row created by purchase-paths to hold stripe_customer_id must
  -- already carry one of the seven - and the first draft then silently refused that family its
  -- first trial (I-M6; database-reviewer M-7).
  if found and (v_row.has_used_trial or v_row.placement_id is not null
                or v_row.status in ('active', 'paid_in_full', 'past_due', 'placed', 'cancelled')) then
    return v_row;  -- ADR-093: a done-for-you family is refused; a used trial is never re-minted
  end if;

  if not found then
    -- on conflict, not a bare insert: two concurrent first-child creations both miss the select
    -- above and the second would die on the parent_user_id unique (database-reviewer M-6)
    insert into public.parent_subscriptions (parent_user_id, status, trial_started_at,
                                             trial_ends_at, has_used_trial)
    values (p_parent_user_id, 'trial', now(), now() + make_interval(days => p_trial_days), true)
    on conflict (parent_user_id) do nothing
    returning * into v_row;
    if v_row.id is null then
      select * into v_row from public.parent_subscriptions where parent_user_id = p_parent_user_id;
    end if;
    return v_row;
  end if;

  if v_row.trial_started_at is not null then
    return v_row;  -- idempotent
  end if;

  update public.parent_subscriptions
  set trial_started_at = now(),
      trial_ends_at    = now() + make_interval(days => p_trial_days),
      has_used_trial   = true
  where parent_user_id = p_parent_user_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.family_access_reason(uuid) from public;
revoke all on function public.family_has_access(uuid) from public;
revoke all on function public.child_has_family_access(uuid) from public;
revoke all on function public.set_access_window(uuid, integer) from public;
revoke all on function public.open_dfy_access(uuid, uuid, integer, integer) from public;
revoke all on function public.start_family_trial_if_first(uuid, integer, boolean) from public;

grant execute on function public.family_access_reason(uuid) to authenticated, service_role;
grant execute on function public.family_has_access(uuid) to authenticated, service_role;
grant execute on function public.child_has_family_access(uuid) to authenticated, service_role;
-- the three writers are service role only (I-M2 / I-M8 / I-M10: no client writes the spine)
grant execute on function public.set_access_window(uuid, integer) to service_role;
grant execute on function public.open_dfy_access(uuid, uuid, integer, integer) to service_role;
grant execute on function public.start_family_trial_if_first(uuid, integer, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 9. RLS (02 C-10; 07 §5.2 money rows). No client write anywhere on the spine
--    (I-M2): the webhook, the RPCs and the crons are all service role.
--    `subscribe_invites` is the one money-cluster table a user writes, and she
--    writes only her own (the nanny mints and revokes).
-- ---------------------------------------------------------------------------

alter table public.parent_subscriptions enable row level security;
alter table public.parent_subscriptions force row level security;

drop policy if exists parent_subscriptions_self_select on public.parent_subscriptions;
create policy parent_subscriptions_self_select on public.parent_subscriptions
  for select to authenticated using (parent_user_id = (select auth.uid()));

drop policy if exists parent_subscriptions_admin_select on public.parent_subscriptions;
create policy parent_subscriptions_admin_select on public.parent_subscriptions
  for select to authenticated using ((select public.is_admin()));

alter table public.payment_events enable row level security;
alter table public.payment_events force row level security;

drop policy if exists payment_events_admin_select on public.payment_events;
create policy payment_events_admin_select on public.payment_events
  for select to authenticated using ((select public.is_admin()));

alter table public.contact_messages enable row level security;
alter table public.contact_messages force row level security;

drop policy if exists contact_messages_admin_select on public.contact_messages;
create policy contact_messages_admin_select on public.contact_messages
  for select to authenticated using ((select public.is_admin()));

drop policy if exists contact_messages_admin_update on public.contact_messages;
create policy contact_messages_admin_update on public.contact_messages
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- No client SELECT and no client INSERT: the contact form posts through a
-- rate-limited server action on the service role (02 §4.5 row 4; 07 §8 row 10).

alter table public.refund_requests enable row level security;
alter table public.refund_requests force row level security;

drop policy if exists refund_requests_self_select on public.refund_requests;
create policy refund_requests_self_select on public.refund_requests
  for select to authenticated using (parent_user_id = (select auth.uid()));

drop policy if exists refund_requests_admin_select on public.refund_requests;
create policy refund_requests_admin_select on public.refund_requests
  for select to authenticated using ((select public.is_admin()));

drop policy if exists refund_requests_admin_insert on public.refund_requests;
create policy refund_requests_admin_insert on public.refund_requests
  for insert to authenticated with check ((select public.is_admin()));

drop policy if exists refund_requests_admin_update on public.refund_requests;
create policy refund_requests_admin_update on public.refund_requests
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

alter table public.guarantee_events enable row level security;
alter table public.guarantee_events force row level security;

drop policy if exists guarantee_events_admin_select on public.guarantee_events;
create policy guarantee_events_admin_select on public.guarantee_events
  for select to authenticated using ((select public.is_admin()));

drop policy if exists guarantee_events_admin_insert on public.guarantee_events;
create policy guarantee_events_admin_insert on public.guarantee_events
  for insert to authenticated with check ((select public.is_admin()));

drop policy if exists guarantee_events_admin_update on public.guarantee_events;
create policy guarantee_events_admin_update on public.guarantee_events
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

alter table public.subscribe_invites enable row level security;
alter table public.subscribe_invites force row level security;

drop policy if exists subscribe_invites_nanny_select on public.subscribe_invites;
create policy subscribe_invites_nanny_select on public.subscribe_invites
  for select to authenticated using (nanny_user_id = (select auth.uid()));

drop policy if exists subscribe_invites_nanny_insert on public.subscribe_invites;
create policy subscribe_invites_nanny_insert on public.subscribe_invites
  for insert to authenticated
  with check (nanny_user_id = (select auth.uid()) and (select public.is_nanny())
              and status = 'pending');
-- The "and she is linked to that child" half needs user_has_child_access(), which arrives with
-- `children` in 0012; 0016 replaces this policy with the full predicate.

-- 07 §5.2 says "SELECT / INSERT / **revoke** own". The first draft's USING had no status test, so a
-- `redeemed` row matched and could be set back to `pending` - re-arming a spent purchase link -
-- and a policy cannot restrict columns, so `token`, `child_id` and `parent_user_id` were writable
-- too (both reviewers). The policy now covers only a pending row going to revoked, and the guard
-- trigger below holds the columns.
drop policy if exists subscribe_invites_nanny_update on public.subscribe_invites;
create policy subscribe_invites_nanny_update on public.subscribe_invites
  for update to authenticated
  using (nanny_user_id = (select auth.uid()) and status = 'pending')
  with check (nanny_user_id = (select auth.uid()) and status = 'revoked');

drop policy if exists subscribe_invites_parent_select on public.subscribe_invites;
create policy subscribe_invites_parent_select on public.subscribe_invites
  for select to authenticated using (parent_user_id = (select auth.uid()));

drop policy if exists subscribe_invites_admin_select on public.subscribe_invites;
create policy subscribe_invites_admin_select on public.subscribe_invites
  for select to authenticated using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- 10. Verify
-- ---------------------------------------------------------------------------

do $$
declare
  v_t text;
  v_bad int;
begin
  foreach v_t in array array['parent_subscriptions', 'payment_events', 'contact_messages',
                             'refund_requests', 'guarantee_events', 'subscribe_invites'] loop
    if to_regclass('public.' || v_t) is null then
      raise exception '0010: public.% missing', v_t;
    end if;
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_t and c.relrowsecurity and c.relforcerowsecurity
    ) then
      raise exception '0010: public.% must ENABLE and FORCE row level security (02 C-10)', v_t;
    end if;
    if exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = v_t and with_check = 'true'
    ) then
      raise exception '0010: public.% uses the banned WITH CHECK (true) (07 §5.1 rule 3)', v_t;
    end if;
  end loop;

  -- I-M2: no client role writes the spine
  select count(*) into v_bad
  from pg_policies where schemaname = 'public' and tablename = 'parent_subscriptions' and cmd <> 'SELECT';
  if v_bad <> 0 then
    raise exception '0010: parent_subscriptions must have no client write policy (I-M2)';
  end if;

  -- ADR-083 / 084 (fix offer-3): the snapshot rule is retired
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'parent_subscriptions' and column_name = 'access_child_id'
  ) then
    raise exception '0010: access_child_id must not exist (ADR-083 / 084 supersede ADR-078)';
  end if;
  if to_regprocedure('public.guard_access_child_id()') is not null then
    raise exception '0010: guard_access_child_id() must not exist (fix offer-3)';
  end if;

  -- 02 §5 row 2 / N-2: no Connect, no payouts
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and column_name in ('stripe_connect_account_id', 'charges_enabled', 'payouts_enabled',
                          'connect_onboarded_at', 'payout_application_status')
  ) then
    raise exception '0010: a Stripe Connect / payouts column exists (N-2, 02 §5 row 2)';
  end if;
  -- 02 §5 row 11: the refund engine's columns are not carried
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'refund_requests'
      and column_name in ('calculated_pence', 'calculation_breakdown', 'amount_aud_cents')
  ) then
    raise exception '0010: a refund-engine column exists (02 §5 row 11)';
  end if;

  foreach v_t in array array[
    'public.family_has_access(uuid)',
    'public.child_has_family_access(uuid)',
    'public.set_access_window(uuid, integer)',
    'public.open_dfy_access(uuid, uuid, integer, integer)',
    'public.start_family_trial_if_first(uuid, integer, boolean)'
  ] loop
    if to_regprocedure(v_t) is null then
      raise exception '0010: RPC % missing (02 §7)', v_t;
    end if;
  end loop;

  if to_regclass('public.family_access') is null then
    raise exception '0010: the family_access view is missing (02 §7)';
  end if;
  if to_regclass('public.guarantee_events_once_per_family_idx') is null then
    raise exception '0010: the G1-G4 once-per-family unique index is missing (02 §4.5 row 6)';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payment_events_provider_event_key') then
    raise exception '0010: UNIQUE (provider, provider_event_id) missing (R-11)';
  end if;

  -- ADR-097: a deposit opens no access. Proven, not asserted in prose.
  if public.family_access_reason(null) <> 'none' then
    raise exception '0010: the gate must answer none for an unknown family';
  end if;
end
$$;
