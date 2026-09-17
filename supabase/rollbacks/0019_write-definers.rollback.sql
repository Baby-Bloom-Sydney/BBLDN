-- 0019_write-definers.rollback.sql — the twin of supabase/migrations/0019_write-definers.sql (06 §4.2).
--
-- Drops the three functions 0019 adds. Nothing later references them (0019 is the last migration),
-- so this always succeeds on a database 0019 applied to.
--
-- Wrapped in one transaction (database-reviewer L-3 on 0017): a rollback that fails midway must not
-- leave half the objects standing.
--
-- WHAT IS LOST, stated rather than hidden.
--
-- **The functions lose no data.** Every row `upsert_position` / `upsert_connection` / `upsert_placement`
-- / `create_child_invite` / `revoke_child_invite` / `apply_payment_event` wrote stays exactly where it is.
-- What is lost is the ability to write those tables at all from the application: ADR-127 refuses a table
-- write inside a unit of work, `0006` / `0007` / `0012` give the tables no client write policy, and with
-- the definers gone there is nothing left to call. The parent journey returns to the state P1-STORES
-- measured — it reads the schema and cannot commit to it — and `boot.test.ts`'s ADR-127 pin goes red
-- again, which is the honest signal.
--
-- **`children.created_by_user_id` DOES lose data, and it is the one thing here that is not recoverable.**
-- Dropping the column discards who created every child row. The children, their links and their invites
-- all survive; what disappears is the fact 04 §4.4 c1's path depends on, so a nanny who created a child
-- for a family that has not claimed it yet can no longer read it back — and re-applying `0019` gives an
-- empty column, not the old one. `child_invites.created_by_user_id` is a different column on a different
-- table, is `0012`'s, and is untouched either way.
--
-- **`user_has_child_access()` loses its fourth arm**, which is a behaviour change reaching every app table
-- at once: the creator of an unclaimed child stops being able to read it. That is the point of restoring
-- `0012`'s body rather than dropping the function — a dropped predicate would not narrow access, it would
-- break every policy that calls it.
--
-- **A payment delivery in flight is the one timing hazard.** `apply_payment_event()` is the webhook's
-- transaction; dropping it mid-delivery makes the next call fail, and the provider retries — no delivery
-- is lost, because the ledger's `provider_event_id` unique constraint is `0010`'s and is untouched.
--
-- All of it is a behaviour change rather than data loss, except the creator column, and that is the
-- reason to prefer rolling forward.

begin;

drop function if exists public.upsert_position(
  uuid, uuid, public.position_source, public.position_stage, jsonb, jsonb, jsonb, integer);

drop function if exists public.upsert_connection(
  uuid, uuid, uuid, uuid, public.connection_stage, public.connection_origin, jsonb, integer);

drop function if exists public.upsert_placement(
  uuid, uuid, uuid, uuid, public.placement_source, public.placement_state, jsonb, uuid, integer);

drop function if exists public.apply_payment_event(
  text, text, text, jsonb, timestamptz, uuid, jsonb, integer);

drop function if exists public.create_child_invite(uuid, public.invite_direction, text);
drop function if exists public.revoke_child_invite(uuid, public.invite_revoked_reason);

-- `0012`'s body, restored verbatim. Replaced rather than dropped: `children`, `child_client`,
-- `child_invites`, `development_images`, `feed_posts`, `milestones` and the rest of the app cluster all
-- read this predicate from their policies, so a `drop` here is an outage, not a rollback.
create or replace function public.user_has_child_access(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select public.is_admin())
    or exists (
      select 1 from public.children c
       where c.id = p_child_id and c.parent_user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.child_client cc
       where cc.child_id = p_child_id
         and cc.state = 'active'
         and ((select auth.uid()) in (cc.nanny_user_id, cc.parent_user_id))
    );
$$;

revoke all on function public.user_has_child_access(uuid) from public;
grant execute on function public.user_has_child_access(uuid) to authenticated, service_role;

drop trigger if exists children_stamp_creator on public.children;
drop function if exists public.children_stamp_creator();
drop index if exists public.children_created_by_idx;
alter table public.children drop column if exists created_by_user_id;

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array['upsert_position', 'upsert_connection', 'upsert_placement',
                              'create_child_invite', 'revoke_child_invite', 'apply_payment_event',
                              'children_stamp_creator'] loop
    if exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_fn
    ) then
      raise exception '0019 rollback: %() still exists', v_fn;
    end if;
  end loop;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'children' and column_name = 'created_by_user_id'
  ) then
    raise exception '0019 rollback: children.created_by_user_id still exists';
  end if;

  if to_regclass('public.children_created_by_idx') is not null then
    raise exception '0019 rollback: children_created_by_idx still exists';
  end if;

  -- The predicate must still EXIST and must no longer carry the fourth arm. Both halves, because either
  -- one alone passes for the wrong reason: a dropped function has no creator arm either.
  if to_regprocedure('public.user_has_child_access(uuid)') is null then
    raise exception '0019 rollback: user_has_child_access() was dropped - every app-table policy reads it';
  end if;
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'user_has_child_access') ~ 'created_by_user_id' then
    raise exception '0019 rollback: user_has_child_access() still carries 0019''s creator arm';
  end if;

  -- 0019 created no table, policy or constraint, so the rest is untouched - and this assertion is what
  -- proves that claim rather than repeating it.
  if to_regclass('public.nanny_positions') is null
     or to_regclass('public.connection_requests') is null
     or to_regclass('public.nanny_placements') is null
     or to_regclass('public.position_schedule') is null
     or to_regclass('public.children') is null
     or to_regclass('public.child_invites') is null
     or to_regclass('public.payment_events') is null
     or to_regclass('public.parent_subscriptions') is null then
    raise exception '0019 rollback: a table 0019 never created has gone missing';
  end if;
end
$$;

commit;
