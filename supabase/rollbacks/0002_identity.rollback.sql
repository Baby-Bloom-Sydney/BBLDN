-- 0002_identity.rollback.sql — the twin of supabase/migrations/0002_identity.sql (06 §4.2).
--
-- Drops the two identity tables, their guard trigger function and the three RLS helpers.
-- Every later migration FKs `auth.users` or `user_profiles` and every later policy calls
-- `is_admin()`, so this will refuse while 0003+ are applied. Roll back in reverse order.

-- Wrapped in one transaction (database-reviewer L-3): a rollback that fails midway -
-- a DROP TABLE refused by a live foreign key, which the headers above say is the
-- intended behaviour when a later migration is still applied - must not leave the
-- policies and triggers it already dropped on the floor.

begin;

drop policy if exists user_profiles_self_update on public.user_profiles;
drop policy if exists user_profiles_admin_select on public.user_profiles;
drop policy if exists user_profiles_self_select on public.user_profiles;
drop policy if exists user_roles_admin_select on public.user_roles;
drop policy if exists user_roles_self_select on public.user_roles;

drop trigger if exists user_profiles_guard_protected_columns on public.user_profiles;
drop trigger if exists user_profiles_set_updated_at on public.user_profiles;

drop table if exists public.user_profiles;
drop table if exists public.user_roles;

drop function if exists public.guard_user_profiles_protected_columns();
drop function if exists public.is_nanny();
drop function if exists public.is_parent();
drop function if exists public.is_admin();

do $$
begin
  if to_regclass('public.user_profiles') is not null then
    raise exception '0002 rollback: public.user_profiles still present';
  end if;
  if to_regclass('public.user_roles') is not null then
    raise exception '0002 rollback: public.user_roles still present';
  end if;
  if to_regprocedure('public.is_admin()') is not null then
    raise exception '0002 rollback: public.is_admin() still present';
  end if;
end
$$;

commit;
