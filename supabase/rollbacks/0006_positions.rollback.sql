-- 0006_positions.rollback.sql — the twin of supabase/migrations/0006_positions.sql (06 §4.2).
--
-- Drops the position aggregate. connection_requests (0007), events.position_id (0011) and
-- parent_leads.position_id (0014) reference it, so this refuses while they are applied.
-- Child tables cascade from nanny_positions, but they are dropped explicitly so a partial
-- forward apply (06 §5 row 2) rolls back just as cleanly.

-- Wrapped in one transaction (database-reviewer L-3): a rollback that fails midway -
-- a DROP TABLE refused by a live foreign key, which the headers above say is the
-- intended behaviour when a later migration is still applied - must not leave the
-- policies and triggers it already dropped on the floor.

begin;

drop policy if exists position_schedule_admin_select on public.position_schedule;
drop policy if exists position_schedule_nanny_board_select on public.position_schedule;
drop policy if exists position_schedule_parent_select on public.position_schedule;
drop policy if exists position_children_admin_select on public.position_children;
drop policy if exists position_children_nanny_board_select on public.position_children;
drop policy if exists position_children_parent_select on public.position_children;
drop policy if exists nanny_positions_admin_select on public.nanny_positions;
drop policy if exists nanny_positions_nanny_board_select on public.nanny_positions;
drop policy if exists nanny_positions_parent_select on public.nanny_positions;

drop trigger if exists position_schedule_set_updated_at on public.position_schedule;
drop trigger if exists nanny_positions_bump_version on public.nanny_positions;
drop trigger if exists nanny_positions_set_updated_at on public.nanny_positions;

drop table if exists public.position_schedule;
drop table if exists public.position_children;
drop table if exists public.nanny_positions;

do $$
declare
  v_t text;
begin
  foreach v_t in array array['position_schedule', 'position_children', 'nanny_positions'] loop
    if to_regclass('public.' || v_t) is not null then
      raise exception '0006 rollback: public.% still present', v_t;
    end if;
  end loop;
end
$$;

commit;
