-- 0007_connections-placements.rollback.sql — the twin of supabase/migrations/0007_connections-placements.sql (06 §4.2).
--
-- Drops the three tables, the I-3 constraint trigger and — in the right order — the two
-- current_placement_id pointers that 0007 added to `parents` and `nannies`. The pointer FKs must
-- go before nanny_placements does, or the drop refuses.
-- child_client.placement_id (0012) references nanny_placements: roll back in reverse order.

-- Wrapped in one transaction (database-reviewer L-3): a rollback that fails midway -
-- a DROP TABLE refused by a live foreign key, which the headers above say is the
-- intended behaviour when a later migration is still applied - must not leave the
-- policies and triggers it already dropped on the floor.

begin;

alter table if exists public.parents drop constraint if exists parents_current_placement_id_fkey;
alter table if exists public.nannies drop constraint if exists nannies_current_placement_id_fkey;
alter table if exists public.parents drop column if exists current_placement_id;
alter table if exists public.nannies drop column if exists current_placement_id;

drop policy if exists nanny_placements_admin_select on public.nanny_placements;
drop policy if exists nanny_placements_nanny_select on public.nanny_placements;
drop policy if exists nanny_placements_parent_select on public.nanny_placements;
drop policy if exists precheck_notifications_admin_select on public.precheck_notifications;
drop policy if exists precheck_notifications_parent_select on public.precheck_notifications;
drop policy if exists precheck_notifications_nanny_select on public.precheck_notifications;
drop policy if exists connection_requests_admin_select on public.connection_requests;
drop policy if exists connection_requests_nanny_select on public.connection_requests;
drop policy if exists connection_requests_parent_select on public.connection_requests;

drop trigger if exists nanny_placements_enforce_i3 on public.nanny_placements;
drop trigger if exists nanny_placements_bump_version on public.nanny_placements;
drop trigger if exists connection_requests_bump_version on public.connection_requests;
drop trigger if exists nanny_placements_set_updated_at on public.nanny_placements;
drop trigger if exists connection_requests_set_updated_at on public.connection_requests;

drop table if exists public.nanny_placements;
drop table if exists public.precheck_notifications;
drop table if exists public.connection_requests;

drop function if exists public.enforce_placement_position_active();

do $$
declare
  v_t text;
begin
  foreach v_t in array array['nanny_placements', 'precheck_notifications', 'connection_requests'] loop
    if to_regclass('public.' || v_t) is not null then
      raise exception '0007 rollback: public.% still present', v_t;
    end if;
  end loop;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name in ('parents', 'nannies')
      and column_name = 'current_placement_id'
  ) then
    raise exception '0007 rollback: current_placement_id still present on a party table';
  end if;
end
$$;

commit;
