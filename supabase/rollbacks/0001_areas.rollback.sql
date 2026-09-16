-- 0001_areas.rollback.sql — the twin of supabase/migrations/0001_areas.sql (06 §4.2).
--
-- Drops `areas` and the 291-row seed with it. Every `district` column in 0002 / 0006 / 0014
-- references this table, so a later migration still applied will make this drop fail on its
-- foreign keys - which is the correct behaviour, not a bug: roll back in reverse order.

-- Wrapped in one transaction (database-reviewer L-3): a rollback that fails midway -
-- a DROP TABLE refused by a live foreign key, which the headers above say is the
-- intended behaviour when a later migration is still applied - must not leave the
-- policies and triggers it already dropped on the floor.

begin;

drop policy if exists areas_authenticated_select on public.areas;
drop policy if exists areas_anon_select on public.areas;
drop table if exists public.areas;

do $$
begin
  if to_regclass('public.areas') is not null then
    raise exception '0001 rollback: public.areas still present';
  end if;
end
$$;

commit;
