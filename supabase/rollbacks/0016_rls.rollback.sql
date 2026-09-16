-- 0016_rls.rollback.sql — the twin of supabase/migrations/0016_rls.sql (06 §4.2).
--
-- Drops the three predicate views and the six cross-party policies 0016 added. Rolling this back
-- leaves the schema *more* restrictive, not less: without the views a parent cannot read a nanny at
-- all and a nanny cannot read a parent's contact details. The regenerated
-- src/modules/shared-types/database.types.ts must be regenerated again after this runs (C-12).

begin;

drop policy if exists position_schedule_nanny_connection_select on public.position_schedule;
drop policy if exists position_children_nanny_connection_select on public.position_children;
drop policy if exists nanny_positions_nanny_connection_select on public.nanny_positions;
drop policy if exists parents_nanny_select on public.parents;
drop policy if exists areas_admin_select on public.areas;

-- 0016 replaced 0010's subscribe_invites INSERT policy with the fuller predicate; restore 0010's
-- form rather than leaving the table with no INSERT policy at all, and so that
-- user_has_child_access() (0012) stops being depended on from here.
drop policy if exists subscribe_invites_nanny_insert on public.subscribe_invites;
create policy subscribe_invites_nanny_insert on public.subscribe_invites
  for insert to authenticated
  with check (nanny_user_id = (select auth.uid()) and (select public.is_nanny())
              and status = 'pending');

drop view if exists public.connection_party_contact;
drop view if exists public.verification_status;
drop view if exists public.nanny_public;

do $$
declare
  v_t text;
begin
  foreach v_t in array array['nanny_public', 'verification_status', 'connection_party_contact'] loop
    if to_regclass('public.' || v_t) is not null then
      raise exception '0016 rollback: public.% still present', v_t;
    end if;
  end loop;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and policyname in
      ('areas_admin_select', 'parents_nanny_select', 'nanny_positions_nanny_connection_select',
       'position_children_nanny_connection_select', 'position_schedule_nanny_connection_select')
  ) then
    raise exception '0016 rollback: a cross-party policy is still present';
  end if;
end
$$;

commit;
