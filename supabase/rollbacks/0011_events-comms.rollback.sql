-- 0011_events-comms.rollback.sql — the twin of supabase/migrations/0011_events-comms.sql (06 §4.2).
--
-- Drops the five tables and the four typed views over `events`. `child_client_events` (0012) also
-- reads `events`, so roll back in reverse order.
--
-- `events` is append-only and carries prevent_row_modification(); DROP TABLE is DDL, not a row
-- modification, so the trigger does not stand in the way.

begin;

drop policy if exists pipeline_snapshots_admin_select on public.pipeline_snapshots;
drop policy if exists admin_notifications_admin_update on public.admin_notifications;
drop policy if exists admin_notifications_admin_select on public.admin_notifications;
drop policy if exists inbox_messages_owner_update on public.inbox_messages;
drop policy if exists inbox_messages_admin_select on public.inbox_messages;
drop policy if exists inbox_messages_owner_select on public.inbox_messages;
drop policy if exists email_logs_admin_select on public.email_logs;

drop view if exists public.page_visits;
drop view if exists public.verification_events;
drop view if exists public.booking_events;
drop view if exists public.connection_events;

drop trigger if exists admin_notifications_guard_columns on public.admin_notifications;
drop trigger if exists inbox_messages_guard_columns on public.inbox_messages;
drop trigger if exists email_logs_set_updated_at on public.email_logs;
drop trigger if exists events_no_truncate on public.events;
drop trigger if exists events_append_only on public.events;

drop table if exists public.pipeline_snapshots;
drop table if exists public.admin_notifications;
drop table if exists public.inbox_messages;
drop table if exists public.email_logs;
drop table if exists public.events;

drop function if exists public.guard_inbox_message_read_only_columns();
drop function if exists public.guard_admin_notification_acknowledge_only();

do $$
declare
  v_t text;
begin
  foreach v_t in array array['pipeline_snapshots', 'admin_notifications', 'inbox_messages',
                             'email_logs', 'events'] loop
    if to_regclass('public.' || v_t) is not null then
      raise exception '0011 rollback: public.% still present', v_t;
    end if;
  end loop;
  foreach v_t in array array['connection_events', 'booking_events', 'verification_events', 'page_visits'] loop
    if to_regclass('public.' || v_t) is not null then
      raise exception '0011 rollback: view public.% still present', v_t;
    end if;
  end loop;
end
$$;

commit;
