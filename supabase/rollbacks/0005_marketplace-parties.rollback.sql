-- 0005_marketplace-parties.rollback.sql — the twin of supabase/migrations/0005_marketplace-parties.sql (06 §4.2).
--
-- Drops the two party tables, the vaccination-consent guard and the two party RLS helpers.
-- nanny_positions.parent_id (0006) and verifications.nanny_id (0008) reference these, so this
-- refuses while they are applied — roll back in reverse order.

-- Wrapped in one transaction (database-reviewer L-3): a rollback that fails midway -
-- a DROP TABLE refused by a live foreign key, which the headers above say is the
-- intended behaviour when a later migration is still applied - must not leave the
-- policies and triggers it already dropped on the floor.

begin;

drop policy if exists parents_admin_select on public.parents;
drop policy if exists parents_self_select on public.parents;
drop policy if exists nannies_admin_select on public.nannies;
drop policy if exists nannies_self_select on public.nannies;

drop trigger if exists nannies_guard_vaccination_consent on public.nannies;
drop trigger if exists nannies_set_updated_at on public.nannies;
drop trigger if exists parents_set_updated_at on public.parents;

drop table if exists public.parents;
drop table if exists public.nannies;

drop function if exists public.guard_nanny_vaccination_consent();
drop function if exists public.is_active_nanny();
drop function if exists public.current_nanny_id();
drop function if exists public.current_parent_id();

do $$
declare
  v_t text;
begin
  foreach v_t in array array['parents', 'nannies'] loop
    if to_regclass('public.' || v_t) is not null then
      raise exception '0005 rollback: public.% still present', v_t;
    end if;
  end loop;
  if to_regprocedure('public.current_nanny_id()') is not null then
    raise exception '0005 rollback: public.current_nanny_id() still present';
  end if;
end
$$;

commit;
