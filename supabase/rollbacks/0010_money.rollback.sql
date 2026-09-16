-- 0010_money.rollback.sql — the twin of supabase/migrations/0010_money.sql (06 §4.2).
--
-- Drops the six money tables, the family_access view and the six money functions.
-- subscribe_invites.child_id gets its FK in 0012 and guarantee_events / parent_subscriptions
-- reference nanny_placements (0007): roll back in reverse order.

-- Wrapped in one transaction (database-reviewer L-3): a rollback that fails midway -
-- a DROP TABLE refused by a live foreign key, which the headers above say is the
-- intended behaviour when a later migration is still applied - must not leave the
-- policies and triggers it already dropped on the floor.

begin;

drop policy if exists subscribe_invites_admin_select on public.subscribe_invites;
drop policy if exists subscribe_invites_parent_select on public.subscribe_invites;
drop policy if exists subscribe_invites_nanny_update on public.subscribe_invites;
drop policy if exists subscribe_invites_nanny_insert on public.subscribe_invites;
drop policy if exists subscribe_invites_nanny_select on public.subscribe_invites;
drop policy if exists guarantee_events_admin_update on public.guarantee_events;
drop policy if exists guarantee_events_admin_insert on public.guarantee_events;
drop policy if exists guarantee_events_admin_select on public.guarantee_events;
drop policy if exists refund_requests_admin_update on public.refund_requests;
drop policy if exists refund_requests_admin_insert on public.refund_requests;
drop policy if exists refund_requests_admin_select on public.refund_requests;
drop policy if exists refund_requests_self_select on public.refund_requests;
drop policy if exists contact_messages_admin_update on public.contact_messages;
drop policy if exists contact_messages_admin_select on public.contact_messages;
drop policy if exists payment_events_admin_select on public.payment_events;
drop policy if exists parent_subscriptions_admin_select on public.parent_subscriptions;
drop policy if exists parent_subscriptions_self_select on public.parent_subscriptions;

drop view if exists public.family_access;

drop function if exists public.start_family_trial_if_first(uuid, integer, boolean);
drop function if exists public.open_dfy_access(uuid, uuid, integer, integer);
drop function if exists public.set_access_window(uuid, integer);
drop function if exists public.child_has_family_access(uuid);
drop function if exists public.family_has_access(uuid);
drop function if exists public.family_access_reason(uuid);

drop trigger if exists subscribe_invites_guard_columns on public.subscribe_invites;
drop trigger if exists subscribe_invites_set_updated_at on public.subscribe_invites;
drop trigger if exists guarantee_events_set_updated_at on public.guarantee_events;
drop trigger if exists guarantee_events_no_nanny_bonus on public.guarantee_events;
drop trigger if exists refund_requests_set_updated_at on public.refund_requests;
drop trigger if exists contact_messages_set_updated_at on public.contact_messages;
drop trigger if exists parent_subscriptions_set_updated_at on public.parent_subscriptions;

drop table if exists public.subscribe_invites;
drop table if exists public.guarantee_events;
drop table if exists public.refund_requests;
drop table if exists public.contact_messages;
drop table if exists public.payment_events;
drop table if exists public.parent_subscriptions;

drop function if exists public.guard_guarantee_promise_nanny_bonus();
drop function if exists public.guard_subscribe_invite_columns();

do $$
declare
  v_t text;
begin
  foreach v_t in array array['subscribe_invites', 'guarantee_events', 'refund_requests',
                             'contact_messages', 'payment_events', 'parent_subscriptions'] loop
    if to_regclass('public.' || v_t) is not null then
      raise exception '0010 rollback: public.% still present', v_t;
    end if;
  end loop;
  if to_regclass('public.family_access') is not null then
    raise exception '0010 rollback: the family_access view is still present';
  end if;
end
$$;

commit;
