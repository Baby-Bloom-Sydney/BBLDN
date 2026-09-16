-- 0000_extensions-enums.sql — BabyBloom London, the ordered migration set (02-data-model.md §6 row 0000)
--
-- Creates: the two extensions (citext, pgcrypto), **every one of the 79 enums of 02 §3**
-- (values verbatim, in order — the tuple index IS the ordinal, and src/modules/shared-types/enums/*
-- freezes the same order: C-1, 03 §2.6 I-7), and the two trigger functions C-4 names —
-- prevent_row_modification() (Sydney's prevent_consent_modification, renamed) and set_updated_at().
--
-- Forced by: everything. Nothing in 0001-0016 can be written before the enums exist.
-- Rollback twin: 0000_extensions-enums.rollback.sql
--
-- Conventions honoured (HANDOFF §6.1): idempotent; no Europe/London literal in a DDL default (C-3);
-- every function schema-qualified with search_path pinned (07 §5.1 rule 2); ends with a verify block.
--
-- @adr ADR-006 (fresh database) - ADR-070 (enums, never text status) - ADR-099 (guarantee_promise
--      keeps 'nanny-bonus', unused day one: C-1 values are add-only and never removed)

-- ---------------------------------------------------------------------------
-- 1. Extensions (02 §6 row 0000). Supabase keeps extensions out of public.
-- ---------------------------------------------------------------------------

create schema if not exists extensions;
create extension if not exists citext with schema extensions;   -- C-8: email is citext
create extension if not exists pgcrypto with schema extensions; -- C-2: gen_random_uuid()

-- ---------------------------------------------------------------------------
-- 2. The enum register — 02 §3, all 79, values verbatim and in order (C-1).
--    Ordinals are load-bearing: shared-types reads ">=" comparisons off them,
--    and supabase/__tests__/enum-ordinals.test.ts pins database order against
--    src/modules/shared-types/enums/*. Add-only; never renumber, never remove.
-- ---------------------------------------------------------------------------

do $$
begin

  -- shared
  if to_regtype('public.user_role') is null then create type public.user_role as enum ('parent', 'nanny', 'admin'); end if;
  if to_regtype('public.mover') is null then create type public.mover as enum ('user', 'admin', 'system'); end if;
  if to_regtype('public.actor_role') is null then create type public.actor_role as enum ('parent', 'nanny', 'admin', 'system'); end if;
  if to_regtype('public.cookie_choice') is null then create type public.cookie_choice as enum ('accept_all', 'reject_non_essential', 'custom'); end if;
  if to_regtype('public.event_source') is null then create type public.event_source as enum ('server', 'client'); end if;
  if to_regtype('public.event_actor_kind') is null then create type public.event_actor_kind as enum ('user', 'admin', 'system', 'visitor', 'anonymous'); end if;

  -- marketplace
  if to_regtype('public.position_stage') is null then create type public.position_stage as enum ('DRAFT', 'OPEN', 'CONNECTING', 'ACTIVE', 'ENDED', 'CLOSED'); end if;
  if to_regtype('public.connection_stage') is null then create type public.connection_stage as enum ('REQUEST_SENT', 'ACCEPTED', 'INTRO_SCHEDULED', 'INTRO_COMPLETE', 'TRIAL_ARRANGED', 'TRIAL_COMPLETE', 'OFFERED', 'CONFIRMED', 'ACTIVE', 'NANNY_APPLIED', 'REQUEST_EXPIRED', 'DECLINED', 'REQUEST_CANCELLED', 'SCHEDULE_EXPIRED', 'INTRO_INCOMPLETE', 'AWAITING_RESPONSE', 'NOT_HIRED', 'NOT_SELECTED', 'FINISHED', 'CANCELLED_BY_PARENT', 'CANCELLED_BY_NANNY'); end if;
  if to_regtype('public.placement_state') is null then create type public.placement_state as enum ('CONFIRMED', 'ACTIVE', 'ENDED'); end if;
  if to_regtype('public.call_state') is null then create type public.call_state as enum ('awaiting-slot', 'slot-chosen', 'done'); end if;
  if to_regtype('public.call_type') is null then create type public.call_type as enum ('matchmaking', 'onboarding', 'nanny-commission'); end if;
  if to_regtype('public.call_outcome') is null then create type public.call_outcome as enum ('proceeding', 'not-now', 'not-proceeding', 'no-answer', 'cancelled'); end if;
  if to_regtype('public.end_reason') is null then create type public.end_reason as enum ('natural', 'nanny_left', 'no_longer_needed', 'mutual', 'child_aged_out', 'relocation', 'other'); end if;
  if to_regtype('public.close_reason') is null then create type public.close_reason as enum ('parent_closed', 'no_candidates', 'admin_closed'); end if;
  if to_regtype('public.position_source') is null then create type public.position_source as enum ('results_signup', 'in_app', 'admin', 'invite', 'agent'); end if;
  if to_regtype('public.signup_source') is null then create type public.signup_source as enum ('results', 'cold', 'invite', 'admin'); end if;
  if to_regtype('public.precheck_status') is null then create type public.precheck_status as enum ('notified', 'pending_wave', 'viewed', 'interested', 'declined', 'expired'); end if;
  if to_regtype('public.connection_origin') is null then create type public.connection_origin as enum ('parent_request', 'precheck_response', 'nanny_application', 'admin'); end if;
  if to_regtype('public.meeting_outcome') is null then create type public.meeting_outcome as enum ('hired', 'not_hired', 'awaiting', 'trial', 'incomplete'); end if;
  if to_regtype('public.schedule_type') is null then create type public.schedule_type as enum ('fixed', 'flexible'); end if;
  if to_regtype('public.placement_source') is null then create type public.placement_source as enum ('connection', 'invite_shell'); end if;

  -- verification
  if to_regtype('public.verification_level') is null then create type public.verification_level as enum ('L0_SIGNED_UP', 'L1_REGISTERED', 'L2_ID_VERIFIED', 'L3_PROVISIONALLY_VERIFIED', 'L4_FULLY_VERIFIED'); end if;
  if to_regtype('public.section_status') is null then create type public.section_status as enum ('not_started', 'pending', 'processing', 'verified', 'review', 'rejected', 'failed', 'expired'); end if;
  if to_regtype('public.dbs_outcome') is null then create type public.dbs_outcome as enum ('unset', 'cleared', 'adverse', 'barred'); end if;
  if to_regtype('public.update_service_result') is null then create type public.update_service_result as enum ('not_subscribed', 'no_change', 'new_information', 'check_failed'); end if;
  if to_regtype('public.identity_evidence_type') is null then create type public.identity_evidence_type as enum ('passport', 'uk_driving_licence', 'evisa_share_code'); end if;
  if to_regtype('public.rtw_evidence_type') is null then create type public.rtw_evidence_type as enum ('british_irish_passport', 'share_code', 'immigration_document'); end if;
  if to_regtype('public.checked_by') is null then create type public.checked_by as enum ('ai', 'admin', 'none'); end if;
  if to_regtype('public.cross_check_status') is null then create type public.cross_check_status as enum ('not_started', 'pending', 'passed', 'review'); end if;
  if to_regtype('public.verification_section') is null then create type public.verification_section as enum ('identity', 'dbs', 'right_to_work', 'contact', 'cross_check', 'overall'); end if;
  if to_regtype('public.vetting_submission_status') is null then create type public.vetting_submission_status as enum ('pending', 'processing', 'needs_admin', 'passed', 'failed'); end if;

  -- scheduling
  if to_regtype('public.booking_status') is null then create type public.booking_status as enum ('held', 'booked', 'rescheduled', 'cancelled', 'done', 'no-answer'); end if;
  if to_regtype('public.booking_subject_type') is null then create type public.booking_subject_type as enum ('position', 'nanny'); end if;
  if to_regtype('public.block_kind') is null then create type public.block_kind as enum ('open', 'blocked'); end if;
  if to_regtype('public.attention_reason') is null then create type public.attention_reason as enum ('blocked-over', 'displaced', 'manual'); end if;
  if to_regtype('public.booking_cancel_reason') is null then create type public.booking_cancel_reason as enum ('user-cancelled', 'admin-cancelled', 'position-closed', 'duplicate', 'displaced-no-slot', 'other'); end if;

  -- money
  if to_regtype('public.subscription_status') is null then create type public.subscription_status as enum ('trial', 'active', 'past_due', 'cancelled', 'paid_in_full', 'lapsed', 'placed'); end if;
  if to_regtype('public.plan_shape') is null then create type public.plan_shape as enum ('upfront', 'instalments'); end if;
  if to_regtype('public.purchase_path') is null then create type public.purchase_path as enum ('payment_link', 'self_serve'); end if;
  if to_regtype('public.cancellation_reason') is null then create type public.cancellation_reason as enum ('too_expensive', 'not_using', 'service_issue', 'circumstances_changed', 'other'); end if;
  if to_regtype('public.subscribe_invite_status') is null then create type public.subscribe_invite_status as enum ('pending', 'redeemed', 'expired', 'revoked'); end if;
  if to_regtype('public.contact_category') is null then create type public.contact_category as enum ('refund', 'billing', 'technical', 'general'); end if;
  if to_regtype('public.contact_message_status') is null then create type public.contact_message_status as enum ('unread', 'replied', 'closed', 'spam'); end if;
  if to_regtype('public.refund_reason') is null then create type public.refund_reason as enum ('cooling_off', 'service_issue', 'goodwill', 'duplicate_charge', 'other', 'guarantee'); end if;
  if to_regtype('public.refund_status') is null then create type public.refund_status as enum ('open', 'refunded', 'denied'); end if;
  if to_regtype('public.payment_link_kind') is null then create type public.payment_link_kind as enum ('deposit', 'balance-after-week-1', 'custom'); end if;
  if to_regtype('public.guarantee_promise') is null then create type public.guarantee_promise as enum ('G1', 'G2', 'G3', 'G4', 'G5', 'nanny-bonus'); end if;
  if to_regtype('public.guarantee_paid_to') is null then create type public.guarantee_paid_to as enum ('nanny', 'family'); end if;

  -- app
  if to_regtype('public.child_status') is null then create type public.child_status as enum ('setup', 'active', 'closed'); end if;
  if to_regtype('public.link_source') is null then create type public.link_source as enum ('invite', 'placement', 'manual'); end if;
  if to_regtype('public.link_state') is null then create type public.link_state as enum ('active', 'ended'); end if;
  if to_regtype('public.invite_direction') is null then create type public.invite_direction as enum ('nanny_to_parent', 'parent_to_nanny'); end if;
  if to_regtype('public.invite_status') is null then create type public.invite_status as enum ('pending', 'connected', 'revoked'); end if;
  if to_regtype('public.invite_revoked_reason') is null then create type public.invite_revoked_reason as enum ('manual', 'child_deleted'); end if;
  if to_regtype('public.dev_domain') is null then create type public.dev_domain as enum ('CL', 'PSE', 'PD', 'LIT', 'NUM', 'UW', 'EAD'); end if;
  if to_regtype('public.age_bracket') is null then create type public.age_bracket as enum ('0-3', '3-6', '6-12', '12-18', '18-24', '24-32'); end if;
  if to_regtype('public.post_type') is null then create type public.post_type as enum ('observation', 'activity', 'report', 'progress', 'diary', 'insight', 'custom'); end if;
  if to_regtype('public.post_context') is null then create type public.post_context as enum ('adhoc', 'activity', 'assessment'); end if;
  if to_regtype('public.post_status') is null then create type public.post_status as enum ('pending', 'ready', 'completed'); end if;
  if to_regtype('public.post_source') is null then create type public.post_source as enum ('manual', 'katie', 'system'); end if;

  -- app (Katie)
  if to_regtype('public.chat_role') is null then create type public.chat_role as enum ('user', 'assistant', 'system', 'tool'); end if;
  if to_regtype('public.chat_trigger_source') is null then create type public.chat_trigger_source as enum ('user', 'assistant_reply', 'proactive_module', 'proactive_scheduled', 'proactive_template', 'proactive_manual'); end if;
  if to_regtype('public.summary_period') is null then create type public.summary_period as enum ('daily', 'weekly', 'monthly'); end if;
  if to_regtype('public.memory_scope') is null then create type public.memory_scope as enum ('account', 'child', 'shared'); end if;
  if to_regtype('public.memory_priority') is null then create type public.memory_priority as enum ('high', 'medium', 'low'); end if;
  if to_regtype('public.schedule_created_by') is null then create type public.schedule_created_by as enum ('module', 'katie', 'admin'); end if;
  if to_regtype('public.schedule_mode') is null then create type public.schedule_mode as enum ('template', 'ai-minimal', 'ai-full'); end if;
  if to_regtype('public.prompt_edit_status') is null then create type public.prompt_edit_status as enum ('applied', 'rolled_back'); end if;
  if to_regtype('public.proposal_kind') is null then create type public.proposal_kind as enum ('module_change', 'schema_change', 'prompt_change', 'other'); end if;
  if to_regtype('public.proposal_status') is null then create type public.proposal_status as enum ('open', 'accepted', 'rejected', 'implemented'); end if;

  -- comms
  if to_regtype('public.message_channel') is null then create type public.message_channel as enum ('email', 'sms'); end if;
  if to_regtype('public.message_status') is null then create type public.message_status as enum ('queued', 'sent', 'failed', 'bounced', 'cancelled', 'dry_run'); end if;
  if to_regtype('public.admin_notification_kind') is null then create type public.admin_notification_kind as enum ('call_due', 'call_overdue', 'commission_call_booked', 'onboarding_call_due', 'nanny_barred', 'contact_message', 'cron_failed', 'lead_replied', 'booking_blocked_over', 'booking_displacement_failed', 'payment_due', 'usage_check_low'); end if;

  -- leads
  if to_regtype('public.nanny_lead_status') is null then create type public.nanny_lead_status as enum ('applied', 'ai_generated', 'converted', 'abandoned', 'rejected'); end if;
  if to_regtype('public.lead_rtw_status') is null then create type public.lead_rtw_status as enum ('citizen', 'settled', 'visa_with_rtw', 'no_rtw', 'unknown'); end if;
  if to_regtype('public.lead_contact_status') is null then create type public.lead_contact_status as enum ('untouched', 'called', 'texted', 'emailed', 'voicemail_left', 'no_response', 'replied', 'in_conversation', 'booked', 'activated', 'dormant', 'do_not_contact'); end if;
  if to_regtype('public.contact_method') is null then create type public.contact_method as enum ('call', 'sms', 'email', 'whatsapp', 'instagram', 'in_person', 'manual', 'other'); end if;
  if to_regtype('public.contact_direction') is null then create type public.contact_direction as enum ('outbound', 'inbound'); end if;
  if to_regtype('public.contact_outcome') is null then create type public.contact_outcome as enum ('answered', 'voicemail', 'no_answer', 'replied', 'booked', 'not_interested', 'bounced', 'pending'); end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Trigger functions (02 §2 C-4, §7).
-- ---------------------------------------------------------------------------

-- The retention identity (fix: database-reviewer C-1). The first draft of this
-- trigger exempted a caller that had set the transaction-local GUC `app.job` to
-- a job name, as 02 C-4 and 07 §6.2 describe. A GUC is settable by anyone who can
-- issue SQL, and **every cron, webhook, comms write and event-sink write runs as
-- `service_role`** - so `select set_config('app.job','retention-sweep',true)`
-- followed by an UPDATE rewrote consent history. That is the exact opposite of
-- 07 §6.2's promise ("no ad-hoc service-role statement can modify or delete an
-- append-only row"), and it was demonstrated against a live instance.
--
-- The exemption is therefore keyed on **identity**, which a statement cannot
-- forge: a dedicated `NOLOGIN` role owns the retention job functions, and
-- `SECURITY DEFINER` makes `current_user` that role for the duration of the job.
-- `app.job` survives as the job's *name*, for the log line and the error text,
-- never as the authorisation.
--
-- The contract Phase 1 must honour when it writes the three jobs of 07 §6.1-§6.2
-- (`retention-sweep`, `delete-account`, `purge-scrubbed-users`):
--     create function public.retention_sweep(...) returns ...
--       language plpgsql security definer set search_path = '' ...;
--     alter function public.retention_sweep(...) owner to bbldn_retention;
-- Ownership is the whole of it. 07 §6.2's `set_config('app.retention_job', ...)` is not the
-- authorisation and must not be written as though it were; the job's *name* is a log field, and
-- if a job wants it in a GUC it may set one, but nothing reads it for a decision. (A function-level
-- `SET app.job = ...` in the signature is also refused on this platform - "permission denied to set
-- parameter", measured - which is a second reason not to build a control on it.) Both that and the
-- two-versus-three job names are recorded as foundations items in this unit's PROGRESS entry.
--
-- `supabase_admin` is exempt as well: it is the cluster superuser, reachable only
-- by a real operator at the console and never by the application's service role,
-- and without it 02 C-2's stated safety net - "ON DELETE CASCADE from auth.users
-- is the safety net for a manual emergency delete" - would not be true, because
-- the cascade fires this trigger through consent_records.user_id.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'bbldn_retention') then
    create role bbldn_retention nologin;
  end if;
  -- BYPASSRLS, because a retention job has to reach rows no policy grants it: every table is FORCE
  -- RLS and none of them has a policy for this role, so without it a job owned by it would see an
  -- empty database and delete nothing. NOLOGIN + not granted to service_role is what keeps that
  -- from being a hole.
  alter role bbldn_retention bypassrls;
  -- The migration role must be a member to set a function's owner to it (Phase 1's three jobs, and
  -- int.rls's probe). Deliberately NOT granted to `service_role`: if it were, the application could
  -- SET ROLE into the exemption and the control would be back where it started.
  execute format('grant bbldn_retention to %I', current_user);
end
$$;

comment on role bbldn_retention is
  '02 C-4 / 07 §6.2: owns the retention job functions. Owning them is what exempts them from prevent_row_modification(); nothing else is exempt. NOLOGIN - it is an identity, not an account.';

create or replace function public.is_retention_job()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user in ('bbldn_retention', 'supabase_admin');
$$;

comment on function public.is_retention_job() is
  'The one authorisation test for writing an append-only table: are we inside a SECURITY DEFINER owned by bbldn_retention, or is a true operator at the console? current_user cannot be forged by a statement, which is why it and not a GUC carries the decision.';

-- Append-only enforcement. Every table with no updated_at and no UPDATE/DELETE
-- policy carries this trigger. The ONLY callers that may pass are the
-- security-definer retention jobs of 07 §6.1-§6.2, each of which declares the
-- setting 'app.job' as its own name (C-4, fix: D-2). The plain service role, the
-- admin client, every other definer and every user role are refused - that is the
-- point: a retention rule must not become a general licence to edit consent or
-- event history.
--
-- TRUNCATE is refused too (a statement-level trigger on each append-only table
-- routes here): TRUNCATE bypasses RLS and never fires row triggers, so without
-- that backstop the append-only claim would have a hole the size of one statement.
create or replace function public.prevent_row_modification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_retention_job() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception
    'append-only table %.%: % refused (02 C-4)', tg_table_schema, tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;

comment on function public.prevent_row_modification() is
  '02 C-4 / 07 §6.2 (fix: D-2): refuses UPDATE, DELETE and TRUNCATE on append-only tables. Passes only for a SECURITY DEFINER job owned by bbldn_retention, or for a true operator (supabase_admin).';

-- updated_at maintenance. Mutable tables only (C-4); an append-only table has
-- no updated_at column and carries prevent_row_modification() instead.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  '02 C-4: stamps updated_at on every UPDATE of a mutable table. timestamptz, UTC (C-3).';


-- C-9 optimistic locking, made real (fix: database-reviewer M-1). 02 §4.2 puts a
-- `version integer` on every row a stage transition moves and has advance()
-- compare `expectedFrom` + `version`. A version the *writer* has to remember to
-- bump is advisory: one amend() that forgets it defeats every compare-and-set
-- silently. The database bumps it, so `where version = $expected` in the
-- connector keeps working and cannot be out-voted by a forgetful write path.
create or replace function public.bump_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;

comment on function public.bump_version() is
  '02 C-9: every UPDATE of a version-carrying row bumps it. The connector still sends `where version = $expected`; this only guarantees the value moves.';

-- Is the current caller a privileged writer - the service role, the owner, or a
-- SECURITY DEFINER function owned by one of them? `auth.uid() is null` is NOT
-- this test: SECURITY DEFINER changes `current_user` but leaves the request's JWT
-- claims alone, so `auth.uid()` still returns the signed-in user inside a definer
-- invoked from a user session, and it is null for `anon` and for any key-shaped
-- JWT that carries a role but no subject. Every column guard in 0002 / 0004 /
-- 0011 reads this instead (07 §5.1 rules 4 and 5).
create or replace function public.is_privileged_writer()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user in ('service_role', 'postgres', 'supabase_admin');
$$;

comment on function public.is_privileged_writer() is
  '07 §5.1 rules 4-5: true for the service role, the schema owner and any SECURITY DEFINER owned by them (PostgREST runs a user session as `authenticated` / `anon`). The one honest test for "a named service-role use or a module definer is writing this".';

-- 07 §5.1 rule 2's discipline applied uniformly: PUBLIC keeps EXECUTE on a new
-- function by default. Trigger functions are not reachable through PostgREST, so
-- this is hygiene rather than a hole - but the rule should have no exceptions.
revoke all on function public.prevent_row_modification() from public;
revoke all on function public.set_updated_at() from public;
revoke all on function public.is_retention_job() from public;
revoke all on function public.is_privileged_writer() from public;
revoke all on function public.bump_version() from public;
grant execute on function public.is_privileged_writer() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Privileges (07 §5.1 rule 1's default, made real).
--    Supabase grants ALL on every new table in `public` to `anon` and
--    `authenticated`, which includes TRUNCATE, REFERENCES and TRIGGER. RLS does
--    not gate any of the three: TRUNCATE bypasses row security entirely and
--    fires no row trigger, so an append-only table could be emptied without
--    prevent_row_modification() ever running. None of the three is reachable
--    through PostgREST today; all three are the wrong default to carry into a
--    schema whose C-4 claim is absolute.
-- ---------------------------------------------------------------------------

revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;

-- The same reasoning applied to **functions**, which the first draft missed and which is worse
-- (security-reviewer C1, measured). Supabase also ships
--     alter default privileges for role postgres in schema public
--       grant all on functions to postgres, anon, authenticated, service_role;
-- so `revoke all on function ... from public` removes only the PUBLIC pseudo-grant and leaves the
-- **direct** grants to anon and authenticated standing. Every SECURITY DEFINER in this schema is
-- then reachable at POST /rest/v1/rpc/<name>, runs as the owner (BYPASSRLS), and trusts its
-- arguments - so `start_family_trial_if_first(my_uid, 3650, true)` mints a ten-year trial and
-- `end_child_link(any_child_id, ...)` ends any family's nanny link.
--
-- Default: **no client role may execute anything in public.** 0002, 0005 and 0012 grant back the
-- handful of helpers a client legitimately calls, one name at a time, and 0016 asserts that the
-- list has not grown.
-- `public` (the pseudo-role) is in this list too: PostgreSQL grants EXECUTE on a new function to
-- PUBLIC by default, so revoking only the two named roles leaves the grant standing through PUBLIC
-- and `has_function_privilege('anon', ...)` still answers true.
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Verify (HANDOFF §6.1 - a migration ends by asserting what it claims).
-- ---------------------------------------------------------------------------

do $$
declare
  v_enums int;
  v_user_role text[];
  v_guarantee text[];
begin
  select count(*) into v_enums
  from pg_type t
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public' and t.typtype = 'e';
  if v_enums <> 79 then
    raise exception '0000: expected 79 enums in public (02 §3), found %', v_enums;
  end if;

  -- ordinals, not just membership: the order is the contract (C-1)
  select array_agg(e.enumlabel order by e.enumsortorder) into v_user_role
  from pg_enum e where e.enumtypid = 'public.user_role'::regtype;
  if v_user_role <> array['parent', 'nanny', 'admin']::text[] then
    raise exception '0000: user_role ordinals are %, expected parent/nanny/admin (R-12)', v_user_role;
  end if;

  select array_agg(e.enumlabel order by e.enumsortorder) into v_guarantee
  from pg_enum e where e.enumtypid = 'public.guarantee_promise'::regtype;
  if not ('nanny-bonus' = any(v_guarantee)) then
    raise exception '0000: guarantee_promise must retain nanny-bonus, unused day one (ADR-099, C-1)';
  end if;

  if to_regprocedure('public.prevent_row_modification()') is null then
    raise exception '0000: prevent_row_modification() missing (02 C-4)';
  end if;
  if to_regprocedure('public.set_updated_at()') is null then
    raise exception '0000: set_updated_at() missing (02 C-4)';
  end if;
  if not exists (select 1 from pg_extension where extname = 'citext') then
    raise exception '0000: citext missing (02 C-8)';
  end if;
  if not exists (select 1 from pg_extension where extname = 'pgcrypto') then
    raise exception '0000: pgcrypto missing (02 C-2)';
  end if;
  if to_regprocedure('public.is_privileged_writer()') is null then
    raise exception '0000: is_privileged_writer() missing (07 §5.1 rules 4-5)';
  end if;
  if to_regprocedure('public.is_retention_job()') is null then
    raise exception '0000: is_retention_job() missing (C-4 exemption identity)';
  end if;
  if to_regprocedure('public.bump_version()') is null then
    raise exception '0000: bump_version() missing (C-9)';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'bbldn_retention' and not rolcanlogin) then
    raise exception '0000: the bbldn_retention NOLOGIN role is missing (C-4 exemption identity)';
  end if;
  -- the forgery the first draft allowed, asserted closed
  if (select public.is_retention_job()
      from (select set_config('app.job', 'retention-sweep', true)) _) then
    raise exception '0000: setting app.job still grants the append-only exemption - it must be identity-based';
  end if;
  -- Asserted by probe rather than by reading pg_default_acl: the local stack carries
  -- default-privilege entries for TWO owners (postgres and supabase_admin) while the
  -- hosted project carries one, and only the entry of the role that actually creates
  -- the table applies. A probe table created here is created exactly the way
  -- 0001-0016 create theirs, so it answers the question that matters.
  create table public._priv_probe (id integer);
  -- Functions are asserted on the **direct** grant, not on has_function_privilege(): PostgreSQL's
  -- own built-in default gives PUBLIC EXECUTE on every new function, and ALTER DEFAULT PRIVILEGES
  -- cannot take that away (measured - the stored default ACL loses anon and authenticated, and the
  -- created function still carries `=X`). PUBLIC's grant is removed per function by the
  -- `revoke all on function ... from public` line each file carries, and swept once over the
  -- finished schema by 0016. What this migration can guarantee, and therefore asserts, is that no
  -- new function is born with a **named** grant to a client role.
  create function public._priv_probe_fn() returns integer language sql immutable as $fn$ select 1 $fn$;
  if exists (
    select 1 from pg_proc p
    cross join lateral unnest(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where p.oid = 'public._priv_probe_fn()'::regprocedure
      and (acl::text like 'anon=%' or acl::text like 'authenticated=%')
  ) then
    drop function public._priv_probe_fn();
    drop table public._priv_probe;
    raise exception '0000: a newly created function in public is still granted to anon / authenticated (security-reviewer C1)';
  end if;
  drop function public._priv_probe_fn();
  if has_table_privilege('authenticated', 'public._priv_probe', 'TRUNCATE')
     or has_table_privilege('anon', 'public._priv_probe', 'TRUNCATE') then
    drop table public._priv_probe;
    raise exception '0000: anon / authenticated still hold TRUNCATE on a newly created table - the append-only guarantee has a hole';
  end if;
  drop table public._priv_probe;
end
$$;
