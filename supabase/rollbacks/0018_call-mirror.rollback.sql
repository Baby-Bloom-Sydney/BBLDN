-- 0018_call-mirror.rollback.sql — the twin of supabase/migrations/0018_call-mirror.sql (06 §4.2).
--
-- Drops the two objects 0018 adds. Nothing later references them (0018 is the last migration), so
-- this always succeeds on a database 0018 applied to.
--
-- Wrapped in one transaction (database-reviewer L-3 on 0017): a rollback that fails midway must not
-- leave half the objects standing.
--
-- WHAT IS LOST, stated rather than hidden. Dropping `position_call_mirror` loses every recorded call
-- **outcome**, its note, the no-answer count and the "about {nanny}" line — the positions and their
-- `call_state` survive on `nanny_positions`, and the `bookings` rows survive with their own
-- `call_outcome` / `call_note` / `done_by` / `done_at`, so a call that reached a booking is still
-- auditable from `0009`. What is unrecoverable is the detail of a call that never had a booking:
-- an admin who rang an `awaiting-slot` family and recorded the outcome. Re-applying 0018 gives an
-- empty table, not the old one.
-- Dropping `availability_blocks.revoked_at` puts every revoked block **back in force**, because the
-- in-force predicate is "`revoked_at is null`". Slots an admin had unblocked disappear again. That is
-- a behaviour change, not data loss, and it is the reason to prefer rolling forward.

begin;

drop function if exists public.upsert_call_mirror(
  uuid, public.call_state, integer, integer, public.call_type, timestamptz,
  uuid, public.call_outcome, text, text);

drop policy if exists position_call_mirror_select_admin on public.position_call_mirror;
drop policy if exists position_call_mirror_select_own on public.position_call_mirror;
drop trigger if exists set_updated_at on public.position_call_mirror;
drop table if exists public.position_call_mirror;

drop index if exists public.availability_blocks_in_force_idx;
alter table public.availability_blocks drop column if exists revoked_at;

do $$
begin
  if to_regclass('public.position_call_mirror') is not null then
    raise exception '0018 rollback: position_call_mirror still exists';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'availability_blocks'
      and column_name = 'revoked_at'
  ) then
    raise exception '0018 rollback: availability_blocks.revoked_at still exists';
  end if;
  if to_regclass('public.availability_blocks_in_force_idx') is not null then
    raise exception '0018 rollback: availability_blocks_in_force_idx still exists';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'upsert_call_mirror'
  ) then
    raise exception '0018 rollback: upsert_call_mirror() still exists';
  end if;
end
$$;

commit;
