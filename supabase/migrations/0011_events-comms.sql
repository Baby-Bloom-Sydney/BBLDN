-- 0011_events-comms.sql — the ordered migration set (02-data-model.md §6 row 0011)
--
-- Creates: `events` (**the one event log** — R-2), the four typed views over it
-- (`connection_events` · `booking_events` · `verification_events` · `page_visits`),
-- `email_logs` (which is also the delayed queue — R-10), `inbox_messages`,
-- `admin_notifications` and `pipeline_snapshots`. 02 §4.6.
--
-- Forced by: admin_notifications.emailed_message_id -> email_logs; the views need every subject
--            table of 0006-0010.
-- Rollback twin: supabase/rollbacks/0011_events-comms.rollback.sql
--
-- R-2  — `events` IS the stage-model's stage_events, the events-connector table and the audit
--        trail. `connection_events`, `booking_events`, `verification_events` and
--        `child_client_events` (0012) are **views**, never tables; `activity_logs` is not created
--        and its names joined the EventName taxonomy (02 §5 row 8).
-- R-10 — the delayed queue is `email_logs` rows at status `queued` with `send_at` + `dedupe_key`;
--        `delayed_emails` is not created (02 §5 row 9). Cancel-on-state-change is
--        `cancel(dedupeKey)` -> status = cancelled.
-- R-13 — `page_visits` is a view over `events` where name = 'visit', keeping
--        src/lib/analytics/compute-snapshot.ts's field names (visitor_id, referrer_source,
--        page_path, created_at) so the snapshot job needs no rewrite.
-- R-3  — `inbox_messages` is owned by `comms`; the owner module of a transition calls
--        comms.createInboxMessage(msg, { uow }) inside its own unit of work.
-- C-1  — `events.name`, `email_logs.template_id`, `inbox_messages.type` and
--        `pipeline_snapshots.section_key` are deliberately **text, not enums**: open sets that must
--        not need a migration per value. `events.name` still carries a CHECK against the
--        88 EventNames of 03 §9.3 (add-only, one migration), because that one IS closed.
-- C-4  — `events` is append-only: no updated_at, no UPDATE/DELETE policy, prevent_row_modification().
-- @adr ADR-055 / ADR-062 — `consent_marketing` is snapshotted at emit; the Meta sink reads it and
--        nothing else decides whether a row may leave the building.

-- ---------------------------------------------------------------------------
-- 1. `events` (02 §4.6 "Analytics" row 1)
-- ---------------------------------------------------------------------------

create table if not exists public.events (
  id               uuid        primary key default gen_random_uuid(),
  name             text        not null,
  ts               timestamptz not null default now(),
  source           public.event_source not null,
  actor_kind       public.event_actor_kind not null,
  actor_id         uuid,
  on_behalf_of_id  uuid,
  system_job       text,
  subject_kind     text,
  subject_id       uuid,
  position_id      uuid        references public.nanny_positions (id) on delete set null,
  from_stage       text,
  to_stage         text,
  transition_id    text,
  props            jsonb       not null default '{}'::jsonb,
  attribution      jsonb,
  visitor_id       text,
  request_id       text,
  idempotency_key  text,
  consent_marketing boolean,
  dispatched_at    timestamptz,
  capi_sent_at     timestamptz,
  created_at       timestamptz not null default now(),

  -- 03 §9.3: the closed EventName list, add-only, in one migration (C-1).
  constraint events_name_check check (name in (
    'position.drafted', 'position.created', 'position.connecting', 'position.reopened',
    'position.active', 'position.ended', 'position.closed', 'position.amended',
    'precheck.fired', 'precheck.failed', 'precheck.responded', 'call.requested',
    'call.slot-chosen', 'call.rescheduled', 'call.done', 'connection.requested',
    'connection.applied', 'connection.accepted', 'connection.declined', 'connection.cancelled',
    'connection.expired', 'connection.not-selected', 'connection.finished', 'connection.amended',
    'meeting.scheduled', 'meeting.rescheduled', 'meeting.complete', 'meeting.incomplete',
    'outcome.recorded', 'trial.arranged', 'trial.complete', 'offer.made',
    'offer.withdrawn', 'placement.confirmed', 'placement.started', 'placement.ended',
    'placement.amended', 'booking.held', 'booking.displaced', 'booking.displacement-failed',
    'booking.blocked-over', 'availability.changed', 'visit', 'quick-match.run',
    'lead.created', 'wizard.step', 'wizard.completed', 'results.viewed',
    'profile.viewed', 'signup.completed', 'bundle.link-sent', 'deposit.paid',
    'deposit.refunded', 'payment.due', 'trial.started', 'bundle.paid',
    'bundle.payment-failed', 'access.opened', 'access.toggled', 'access.lapsed',
    'usage.weekly-check', 'invite.sent', 'invite.claimed', 'app.family-in',
    'app.nanny-in', 'verification.submitted', 'verification.level-changed', 'verification.held',
    'verification.released', 'vetting.evidence-viewed', 'vetting.submitted', 'vetting.extracted',
    'vetting.checked', 'vetting.needs-admin', 'vetting.decision-recorded', 'vetting.expiry-approaching',
    'vetting.expired', 'vetting.provider-unavailable', 'nanny.applied', 'nanny.isolation-lifted',
    'message.queued', 'message.sent', 'message.failed', 'message.cancelled',
    'consent.updated', 'ui.click', 'account.deleted', 'retention.applied'
  ))
);

comment on table public.events is
  '02 §4.6 / R-2: the one event log. Every Events.emit, every stage transition, every booking change, every verification move, every child lifecycle event, every purchase event and every page visit. Insert-only; one row per fired transition (stage-model §4 rule 4).';
comment on column public.events.props is
  '02 §4.6: **ids only, no PII**. 07 §2.7(b): position free text and child care-needs never appear here.';
comment on column public.events.position_id is
  'The funnel join key: lead -> position -> call is one join, which is why this is a column and not a props field.';
comment on column public.events.dispatched_at is
  'Null marks the replay set for the sink dispatcher (the partial index below is what makes that scan cheap).';

-- 02 §4.6: unique (name, idempotency_key) where not null
create unique index if not exists events_name_idempotency_key_idx
  on public.events (name, idempotency_key)
  where idempotency_key is not null;

-- the five indexes 02 §4.6 names
create index if not exists events_name_ts_idx on public.events (name, ts);
-- Partial: both columns are null on the large majority of rows, and 02 §4.6 names the indexes,
-- not their predicates (database-reviewer LOW).
create index if not exists events_position_idx on public.events (position_id)
  where position_id is not null;
create index if not exists events_visitor_ts_idx on public.events (visitor_id, ts)
  where visitor_id is not null;
create index if not exists events_subject_idx on public.events (subject_kind, subject_id);
create index if not exists events_undispatched_idx on public.events (dispatched_at)
  where dispatched_at is null;

drop trigger if exists events_append_only on public.events;
create trigger events_append_only
  before update or delete on public.events
  for each row execute function public.prevent_row_modification();

-- TRUNCATE bypasses RLS and fires no row trigger (security-reviewer H3).
drop trigger if exists events_no_truncate on public.events;
create trigger events_no_truncate
  before truncate on public.events
  for each statement execute function public.prevent_row_modification();

-- ---------------------------------------------------------------------------
-- 2. `email_logs` (02 §4.6 "Comms" row 1; R-10) — one row per message per
--    attempt AND the delayed queue.
-- ---------------------------------------------------------------------------

create table if not exists public.email_logs (
  id                  uuid        primary key default gen_random_uuid(),
  channel             public.message_channel not null default 'email',
  template_id         text        not null,
  recipient_user_id   uuid        references auth.users (id) on delete set null,
  recipient_email     extensions.citext,
  subject             text,
  body_html           text,
  body_text           text,
  data                jsonb,
  status              public.message_status not null default 'queued',
  send_at             timestamptz,
  dedupe_key          text,
  from_key            text,
  reference_type      text,
  reference_id        uuid,
  attempts            integer     not null default 0,
  sent_at             timestamptz,
  failed_at           timestamptz,
  error_code          text,
  provider_message_id text,
  cancelled_reason    text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint email_logs_attempts_check check (attempts >= 0),
  constraint email_logs_sent_has_time_check check (status <> 'sent' or sent_at is not null),
  constraint email_logs_failed_has_time_check check (status <> 'failed' or failed_at is not null)
);

comment on table public.email_logs is
  '02 §4.6 / R-10: comms writes every row. Also the delayed queue - send-delayed-emails selects status = queued AND send_at <= now(). No CHECK on template_id: the set is open (C-1). No sms_logs (N-11).';
comment on column public.email_logs.recipient_email is
  '07 §6.1 step 4: anonymised to a tombstone by the account-deletion job; 07 §6 row 13 nulls the bodies 90 days after send.';

-- 02 §4.6: dedupe_key unique among queued | sent (a second call returns the existing id)
create unique index if not exists email_logs_dedupe_key_idx
  on public.email_logs (dedupe_key)
  where dedupe_key is not null and status in ('queued', 'sent');

create index if not exists email_logs_due_idx on public.email_logs (send_at)
  where status = 'queued';
create index if not exists email_logs_recipient_idx on public.email_logs (recipient_user_id, created_at desc);

drop trigger if exists email_logs_set_updated_at on public.email_logs;
create trigger email_logs_set_updated_at
  before update on public.email_logs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. `inbox_messages` (02 §4.6 "Comms" row 2; R-3)
-- ---------------------------------------------------------------------------

create table if not exists public.inbox_messages (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references auth.users (id) on delete cascade,
  type                text        not null,
  title               text        not null,
  body                text,
  action_url          text,
  reference_type      text,
  reference_id        uuid,
  position_id         uuid        references public.nanny_positions (id) on delete set null,
  is_read             boolean     not null default false,
  read_at             timestamptz,
  metadata            jsonb,
  actor               public.mover not null,
  on_behalf_of_user_id uuid       references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),

  constraint inbox_messages_read_pair_check check (is_read = (read_at is not null))
);

comment on table public.inbox_messages is
  '02 §4.6 / R-3: the "steps in motion" feed. Raised only from a stage side effect or an admin message - there is no user-to-user messaging. Written through comms.createInboxMessage(msg, { uow }) by the owner module of the transition.';

create index if not exists inbox_messages_user_idx on public.inbox_messages (user_id, created_at desc);
create index if not exists inbox_messages_unread_idx on public.inbox_messages (user_id)
  where not is_read;
create index if not exists inbox_messages_position_idx on public.inbox_messages (position_id)
  where position_id is not null;
create index if not exists inbox_messages_on_behalf_idx on public.inbox_messages (on_behalf_of_user_id)
  where on_behalf_of_user_id is not null;

-- ---------------------------------------------------------------------------
-- 4. `admin_notifications` (02 §4.6 "Comms" row 3)
-- ---------------------------------------------------------------------------

create table if not exists public.admin_notifications (
  id                 uuid        primary key default gen_random_uuid(),
  kind               public.admin_notification_kind not null,
  subject_type       text,
  subject_id         uuid,
  summary            text        not null,
  due_at             timestamptz,
  emailed_at         timestamptz,
  -- 02 §4.6 writes this as "emailed_at -> email_logs"; a timestamp cannot be a foreign key, so the
  -- reference it asks for is this second column. It is what forces email_logs to be created first
  -- in this file (02 §6 row 0011 "email_logs <- admin_notifications.emailed_at").
  emailed_message_id uuid        references public.email_logs (id) on delete set null,
  acknowledged_by    uuid        references auth.users (id) on delete set null,
  acknowledged_at    timestamptz,
  created_at         timestamptz not null default now(),

  constraint admin_notifications_emailed_pair_check
    check ((emailed_at is null) = (emailed_message_id is null)),
  constraint admin_notifications_acknowledged_pair_check
    check ((acknowledged_at is null) = (acknowledged_by is null))
);

comment on table public.admin_notifications is
  '02 §4.6: the operator''s own queue. One OPEN row per (kind, subject) - the admin_notification email is the delivery, this row the state. booking.blocked-over and booking.displacement-failed land here (R9; booking.flagged folded into blocked-over).';

-- 02 §4.6: one open row per (kind, subject)
-- NULLS NOT DISTINCT (PG15+): subject_type / subject_id are nullable, and without it a kind with
-- no subject - `cron_failed`, `usage_check_low` - could open unlimited rows (database-reviewer M-16).
create unique index if not exists admin_notifications_one_open_per_subject_idx
  on public.admin_notifications (kind, subject_type, subject_id)
  nulls not distinct
  where acknowledged_at is null;

create index if not exists admin_notifications_due_idx on public.admin_notifications (due_at)
  where acknowledged_at is null;
-- covering indexes for the SET NULL foreign keys (database-reviewer LOW)
create index if not exists admin_notifications_emailed_message_idx
  on public.admin_notifications (emailed_message_id) where emailed_message_id is not null;

-- ---------------------------------------------------------------------------
-- 5. `pipeline_snapshots` (02 §4.6 "Analytics" row 2; ADR-062)
-- ---------------------------------------------------------------------------

create table if not exists public.pipeline_snapshots (
  id            uuid        primary key default gen_random_uuid(),
  snapshot_date date        not null,
  section_key   text        not null,
  stages        jsonb       not null,
  computed_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),

  constraint pipeline_snapshots_date_section_key unique (snapshot_date, section_key)
);

comment on table public.pipeline_snapshots is
  '02 §4.6 / R-13: the nightly funnel materialisation, kept as a TABLE while page_visits became a view. snapshot_date is the London date (C-3); isolated nannies are reported as their own stage and test users are excluded by the job.';

-- ---------------------------------------------------------------------------
-- 6. The four typed views over `events` (02 §7; R-2, R-13).
--    `events` itself carries no policy (07 §5.2: "no client role on events"), so a
--    `security_invoker = on` view over it returns **nothing** to an admin session,
--    which runs as `authenticated` like everyone else. 07 §5.2's same row says the
--    admin reads events "via helpers / views" - so the views are the helper, and
--    the three admin ones widen deliberately (07 §5.1 rule 6) with `is_admin()`
--    baked in, exactly as the three predicate views of 0016 do. That keeps the
--    base table policy-free, which is the property that matters.
--    (database-reviewer H-9: as first written these were dead surfaces.)
-- ---------------------------------------------------------------------------

create or replace view public.connection_events
with (security_invoker = off, security_barrier = true) as
  select e.id, e.ts, e.name, e.actor_kind, e.actor_id, e.on_behalf_of_id,
         e.position_id,
         (e.props ->> 'connectionId')::uuid as connection_id,
         (e.props ->> 'nannyId')::uuid      as nanny_id,
         e.from_stage, e.to_stage, e.transition_id, e.props, e.request_id
  from public.events e
  where (e.name like 'connection.%'
     or e.name like 'meeting.%'
     or e.name like 'trial.%'
     or e.name like 'offer.%'
     or e.name = 'outcome.recorded')
    and (select public.is_admin());

create or replace view public.booking_events
with (security_invoker = off, security_barrier = true) as
  select e.id, e.ts, e.name, e.actor_kind, e.actor_id, e.on_behalf_of_id,
         (e.props ->> 'bookingId')::uuid as booking_id,
         e.subject_kind, e.subject_id,
         e.from_stage, e.to_stage, e.props, e.request_id
  from public.events e
  where (e.name like 'booking.%'
     or e.name like 'call.%'
     or e.name = 'availability.changed')
    and (select public.is_admin());

create or replace view public.verification_events
with (security_invoker = off, security_barrier = true) as
  select e.id, e.ts, e.name, e.actor_kind, e.actor_id, e.on_behalf_of_id,
         e.subject_id                       as nanny_id,
         e.props ->> 'section'              as section,
         e.props ->> 'fromStatus'           as from_status,
         e.props ->> 'toStatus'             as to_status,
         e.props ->> 'fromLevel'            as from_level,
         e.props ->> 'toLevel'              as to_level,
         e.props ->> 'providerKey'          as provider_key,
         e.props, e.request_id
  from public.events e
  where (e.name like 'verification.%' or e.name like 'vetting.%')
    and (select public.is_admin());

-- R-13: field names kept from src/lib/analytics/compute-snapshot.ts so the
-- nightly snapshot job reads this view with no change.
create or replace view public.page_visits
with (security_invoker = off, security_barrier = true) as
  select e.id,
         e.visitor_id,
         e.props ->> 'path'                  as page_path,
         e.attribution ->> 'referrer'        as referrer_source,
         e.actor_id                          as user_id,
         e.ts                                as created_at
  from public.events e
  where e.name = 'visit' and (select public.is_admin());

comment on view public.page_visits is
  '02 §7 / R-13: a view, never a table (02 §5 row 8). Field names are compute-snapshot.ts''s. Admin-only through the view; the nightly snapshot job reads it with the service role, which bypasses RLS entirely.';

revoke all on public.connection_events, public.booking_events,
               public.verification_events, public.page_visits from anon;
grant select on public.connection_events, public.booking_events,
                public.verification_events, public.page_visits to authenticated;

-- ---------------------------------------------------------------------------
-- 7. RLS (02 C-10; 07 §5.2 rows `events · views`, `email_logs ·
--    admin_notifications`, `inbox_messages`).
--    `events` has **no client role at all** (07 §5.2): the event-log sink writes
--    through the service role and the admin reads through the helpers and the
--    views. The one client write anywhere in this file is marking an inbox
--    message read.
-- ---------------------------------------------------------------------------

alter table public.events enable row level security;
alter table public.events force row level security;
-- deliberately no policy: no client role reads or writes events (07 §5.2).

alter table public.email_logs enable row level security;
alter table public.email_logs force row level security;

drop policy if exists email_logs_admin_select on public.email_logs;
create policy email_logs_admin_select on public.email_logs
  for select to authenticated using ((select public.is_admin()));

alter table public.inbox_messages enable row level security;
alter table public.inbox_messages force row level security;

drop policy if exists inbox_messages_owner_select on public.inbox_messages;
create policy inbox_messages_owner_select on public.inbox_messages
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists inbox_messages_admin_select on public.inbox_messages;
create policy inbox_messages_admin_select on public.inbox_messages
  for select to authenticated using ((select public.is_admin()));

-- 07 §5.2: "UPDATE own is_read / read_at only". A policy cannot compare OLD to
-- NEW, so the column restriction is the trigger below; the policy holds the row.
drop policy if exists inbox_messages_owner_update on public.inbox_messages;
create policy inbox_messages_owner_update on public.inbox_messages
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.guard_inbox_message_read_only_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_privileged_writer() then
    return new;
  end if;
  if (to_jsonb(new) - 'is_read' - 'read_at') is distinct from (to_jsonb(old) - 'is_read' - 'read_at') then
    raise exception 'inbox_messages: a recipient may update is_read and read_at only (07 §5.2)'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists inbox_messages_guard_columns on public.inbox_messages;
create trigger inbox_messages_guard_columns
  before update on public.inbox_messages
  for each row execute function public.guard_inbox_message_read_only_columns();

alter table public.admin_notifications enable row level security;
alter table public.admin_notifications force row level security;

drop policy if exists admin_notifications_admin_select on public.admin_notifications;
create policy admin_notifications_admin_select on public.admin_notifications
  for select to authenticated using ((select public.is_admin()));

-- 07 §5.2: admin SELECT + **acknowledge** UPDATE. A policy cannot restrict columns, so the row is
-- held by the policy and the column set by the trigger (database-reviewer M-17).
create or replace function public.guard_admin_notification_acknowledge_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_privileged_writer() then
    return new;
  end if;
  if (to_jsonb(new) - 'acknowledged_by' - 'acknowledged_at')
       is distinct from (to_jsonb(old) - 'acknowledged_by' - 'acknowledged_at') then
    raise exception 'admin_notifications: acknowledge only (07 §5.2)'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists admin_notifications_guard_columns on public.admin_notifications;
create trigger admin_notifications_guard_columns
  before update on public.admin_notifications
  for each row execute function public.guard_admin_notification_acknowledge_only();

drop policy if exists admin_notifications_admin_update on public.admin_notifications;
create policy admin_notifications_admin_update on public.admin_notifications
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter table public.pipeline_snapshots enable row level security;
alter table public.pipeline_snapshots force row level security;

drop policy if exists pipeline_snapshots_admin_select on public.pipeline_snapshots;
create policy pipeline_snapshots_admin_select on public.pipeline_snapshots
  for select to authenticated using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- 8. Verify
-- ---------------------------------------------------------------------------

do $$
declare
  v_t text;
  v_bad int;
begin
  foreach v_t in array array['events', 'email_logs', 'inbox_messages',
                             'admin_notifications', 'pipeline_snapshots'] loop
    if to_regclass('public.' || v_t) is null then
      raise exception '0011: public.% missing', v_t;
    end if;
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_t and c.relrowsecurity and c.relforcerowsecurity
    ) then
      raise exception '0011: public.% must ENABLE and FORCE row level security (02 C-10)', v_t;
    end if;
  end loop;

  -- 07 §5.2: events has no client role at all
  select count(*) into v_bad from pg_policies
  where schemaname = 'public' and tablename = 'events';
  if v_bad <> 0 then
    raise exception '0011: events must carry no policy - no client role reads or writes it (07 §5.2), found %', v_bad;
  end if;
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relname = 'events' and t.tgname = 'events_append_only'
  ) then
    raise exception '0011: the C-4 append-only trigger is missing on events';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'updated_at'
  ) then
    raise exception '0011: events is append-only and must not carry updated_at (C-4)';
  end if;

  -- the EventName list is closed and complete (03 §9.3)
  if not exists (select 1 from pg_constraint where conname = 'events_name_check') then
    raise exception '0011: the EventName CHECK is missing (C-1, 03 §9.3)';
  end if;

  -- the five indexes 02 §4.6 names, plus the two uniques
  foreach v_t in array array['events_name_ts_idx', 'events_position_idx', 'events_visitor_ts_idx',
                             'events_subject_idx', 'events_undispatched_idx',
                             'events_name_idempotency_key_idx', 'email_logs_dedupe_key_idx',
                             'admin_notifications_one_open_per_subject_idx'] loop
    if to_regclass('public.' || v_t) is null then
      raise exception '0011: index % missing (02 §4.6)', v_t;
    end if;
  end loop;

  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relname = 'admin_notifications' and t.tgname = 'admin_notifications_guard_columns'
  ) then
    raise exception '0011: the acknowledge-only guard is missing (07 §5.2)';
  end if;

  -- R-2 / R-13: these four are views, never tables (02 §5 row 8)
  foreach v_t in array array['connection_events', 'booking_events', 'verification_events', 'page_visits'] loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_t and c.relkind = 'v'
    ) then
      raise exception '0011: public.% must be a VIEW over events (R-2 / R-13)', v_t;
    end if;
  end loop;

  -- 02 §5 rows 8 and 9: the retired logs and the delayed queue must not exist
  foreach v_t in array array['activity_logs', 'connections_log', 'user_progress',
                             'delayed_emails', 'sms_logs', 'email_delivery_audit',
                             'connection_stats', 'user_stats'] loop
    if to_regclass('public.' || v_t) is not null then
      raise exception '0011: public.% must not exist (02 §5 rows 8, 9, 13)', v_t;
    end if;
  end loop;
end
$$;
