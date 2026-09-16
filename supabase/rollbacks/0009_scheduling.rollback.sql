-- 0009_scheduling.rollback.sql — the twin of supabase/migrations/0009_scheduling.sql (06 §4.2).
--
-- Drops the four scheduling tables, book_slot() and the nanny_positions.call_booking_id FK that
-- 0009 added. The FK must go first, or dropping `bookings` refuses.
-- lead_contacts.booking_id (0014) references bookings: roll back in reverse order.

-- Wrapped in one transaction (database-reviewer L-3): a rollback that fails midway -
-- a DROP TABLE refused by a live foreign key, which the headers above say is the
-- intended behaviour when a later migration is still applied - must not leave the
-- policies and triggers it already dropped on the floor.

begin;

alter table if exists public.nanny_positions
  drop constraint if exists nanny_positions_call_booking_id_fkey;

drop policy if exists bookings_admin_select on public.bookings;
drop policy if exists bookings_nanny_select on public.bookings;
drop policy if exists bookings_parent_select on public.bookings;
drop policy if exists availability_blocks_admin_select on public.availability_blocks;
drop policy if exists availability_rules_admin_select on public.availability_rules;
drop policy if exists calendars_admin_select on public.calendars;

drop trigger if exists bookings_bump_version on public.bookings;
drop trigger if exists bookings_set_updated_at on public.bookings;
drop trigger if exists calendars_set_updated_at on public.calendars;

drop function if exists public.book_slot(uuid, public.call_type, public.booking_subject_type, uuid,
  timestamptz, public.actor_role, uuid, text, integer, uuid, timestamptz);

drop table if exists public.bookings;
drop table if exists public.availability_blocks;
drop table if exists public.availability_rules;
drop table if exists public.calendars;

do $$
declare
  v_t text;
begin
  foreach v_t in array array['bookings', 'availability_blocks', 'availability_rules', 'calendars'] loop
    if to_regclass('public.' || v_t) is not null then
      raise exception '0009 rollback: public.% still present', v_t;
    end if;
  end loop;
  if exists (select 1 from pg_constraint where conname = 'nanny_positions_call_booking_id_fkey') then
    raise exception '0009 rollback: the call_booking_id FK is still present';
  end if;
end
$$;

commit;
