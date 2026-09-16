-- 0000_extensions-enums.rollback.sql — the twin of 0000_extensions-enums.sql (06 §4.2).
--
-- Drops the two trigger functions and all 79 enums of 02 §3, newest cluster first so a
-- partial forward apply rolls back cleanly (IF EXISTS throughout - 06 §5 row 2).
-- The extensions are deliberately NOT dropped: citext and pgcrypto are project-level,
-- Supabase ships pgcrypto pre-installed, and dropping either would cascade far outside
-- this migration's blast radius.
--
-- Run only when no later migration is applied: every 0001-0016 table depends on these types,
-- and drop ... restrict (the default) will refuse while one still does. That refusal is a feature.

-- Wrapped in one transaction (database-reviewer L-3): a rollback that fails midway -
-- a DROP TABLE refused by a live foreign key, which the headers above say is the
-- intended behaviour when a later migration is still applied - must not leave the
-- policies and triggers it already dropped on the floor.

begin;

drop function if exists public.set_updated_at();
drop function if exists public.prevent_row_modification();
drop function if exists public.bump_version();
drop function if exists public.is_privileged_writer();
drop function if exists public.is_retention_job();

-- The retention identity. DROP ROLE refuses while the role holds any privilege or owns any
-- object anywhere in the cluster, so the grants 0016 made are revoked first. If Phase 1's job
-- functions exist and are owned by it, this still refuses - correctly: roll those back first.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'bbldn_retention') then
    execute 'revoke all on all tables in schema public from bbldn_retention';
    execute 'revoke all on all functions in schema public from bbldn_retention';
    execute 'revoke all on schema public from bbldn_retention';
    execute format('revoke bbldn_retention from %I', current_user);
    drop role bbldn_retention;
  end if;
end
$$;

drop type if exists public.contact_outcome;
drop type if exists public.contact_direction;
drop type if exists public.contact_method;
drop type if exists public.lead_contact_status;
drop type if exists public.lead_rtw_status;
drop type if exists public.nanny_lead_status;
drop type if exists public.admin_notification_kind;
drop type if exists public.message_status;
drop type if exists public.message_channel;
drop type if exists public.proposal_status;
drop type if exists public.proposal_kind;
drop type if exists public.prompt_edit_status;
drop type if exists public.schedule_mode;
drop type if exists public.schedule_created_by;
drop type if exists public.memory_priority;
drop type if exists public.memory_scope;
drop type if exists public.summary_period;
drop type if exists public.chat_trigger_source;
drop type if exists public.chat_role;
drop type if exists public.post_source;
drop type if exists public.post_status;
drop type if exists public.post_context;
drop type if exists public.post_type;
drop type if exists public.age_bracket;
drop type if exists public.dev_domain;
drop type if exists public.invite_revoked_reason;
drop type if exists public.invite_status;
drop type if exists public.invite_direction;
drop type if exists public.link_state;
drop type if exists public.link_source;
drop type if exists public.child_status;
drop type if exists public.guarantee_paid_to;
drop type if exists public.guarantee_promise;
drop type if exists public.payment_link_kind;
drop type if exists public.refund_status;
drop type if exists public.refund_reason;
drop type if exists public.contact_message_status;
drop type if exists public.contact_category;
drop type if exists public.subscribe_invite_status;
drop type if exists public.cancellation_reason;
drop type if exists public.purchase_path;
drop type if exists public.plan_shape;
drop type if exists public.subscription_status;
drop type if exists public.booking_cancel_reason;
drop type if exists public.attention_reason;
drop type if exists public.block_kind;
drop type if exists public.booking_subject_type;
drop type if exists public.booking_status;
drop type if exists public.vetting_submission_status;
drop type if exists public.verification_section;
drop type if exists public.cross_check_status;
drop type if exists public.checked_by;
drop type if exists public.rtw_evidence_type;
drop type if exists public.identity_evidence_type;
drop type if exists public.update_service_result;
drop type if exists public.dbs_outcome;
drop type if exists public.section_status;
drop type if exists public.verification_level;
drop type if exists public.placement_source;
drop type if exists public.schedule_type;
drop type if exists public.meeting_outcome;
drop type if exists public.connection_origin;
drop type if exists public.precheck_status;
drop type if exists public.signup_source;
drop type if exists public.position_source;
drop type if exists public.close_reason;
drop type if exists public.end_reason;
drop type if exists public.call_outcome;
drop type if exists public.call_type;
drop type if exists public.call_state;
drop type if exists public.placement_state;
drop type if exists public.connection_stage;
drop type if exists public.position_stage;
drop type if exists public.event_actor_kind;
drop type if exists public.event_source;
drop type if exists public.cookie_choice;
drop type if exists public.actor_role;
drop type if exists public.mover;
drop type if exists public.user_role;

-- Verify the rollback (06 §5 row 1: "re-run verify; results flip").
do $$
declare
  v_enums int;
begin
  -- Scoped to the 79 names this file created, not "every enum in public": an
  -- unrelated enum in the schema is not this rollback's business (database-reviewer L-4).
  select count(*) into v_enums
  from pg_type t
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public' and t.typtype = 'e'
    and t.typname in ('user_role', 'mover', 'actor_role', 'cookie_choice', 'event_source',
                      'event_actor_kind', 'position_stage', 'connection_stage', 'placement_state',
                      'call_state', 'call_type', 'call_outcome', 'end_reason', 'close_reason',
                      'position_source', 'signup_source', 'precheck_status', 'connection_origin',
                      'meeting_outcome', 'schedule_type', 'placement_source', 'verification_level',
                      'section_status', 'dbs_outcome', 'update_service_result',
                      'identity_evidence_type', 'rtw_evidence_type', 'checked_by',
                      'cross_check_status', 'verification_section', 'vetting_submission_status',
                      'booking_status', 'booking_subject_type', 'block_kind', 'attention_reason',
                      'booking_cancel_reason', 'subscription_status', 'plan_shape', 'purchase_path',
                      'cancellation_reason', 'subscribe_invite_status', 'contact_category',
                      'contact_message_status', 'refund_reason', 'refund_status',
                      'payment_link_kind', 'guarantee_promise', 'guarantee_paid_to', 'child_status',
                      'link_source', 'link_state', 'invite_direction', 'invite_status',
                      'invite_revoked_reason', 'dev_domain', 'age_bracket', 'post_type',
                      'post_context', 'post_status', 'post_source', 'chat_role',
                      'chat_trigger_source', 'summary_period', 'memory_scope', 'memory_priority',
                      'schedule_created_by', 'schedule_mode', 'prompt_edit_status', 'proposal_kind',
                      'proposal_status', 'message_channel', 'message_status',
                      'admin_notification_kind', 'nanny_lead_status', 'lead_rtw_status',
                      'lead_contact_status', 'contact_method', 'contact_direction', 'contact_outcome');
  if v_enums <> 0 then
    raise exception '0000 rollback: % of this file''s enum(s) still in public', v_enums;
  end if;
  if to_regprocedure('public.prevent_row_modification()') is not null then
    raise exception '0000 rollback: prevent_row_modification() still present';
  end if;
  if to_regprocedure('public.set_updated_at()') is not null then
    raise exception '0000 rollback: set_updated_at() still present';
  end if;
end
$$;

commit;
