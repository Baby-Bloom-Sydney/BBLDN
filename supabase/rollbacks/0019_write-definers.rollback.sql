-- 0019_write-definers.rollback.sql — the twin of supabase/migrations/0019_write-definers.sql (06 §4.2).
--
-- Drops the three functions 0019 adds. Nothing later references them (0019 is the last migration),
-- so this always succeeds on a database 0019 applied to.
--
-- Wrapped in one transaction (database-reviewer L-3 on 0017): a rollback that fails midway must not
-- leave half the objects standing.
--
-- WHAT IS LOST, stated rather than hidden. **No data at all** — these are functions, not tables, and
-- every row they wrote stays exactly where it is on `nanny_positions`, `position_schedule`,
-- `connection_requests` and `nanny_placements`. What is lost is the ability to write those four
-- tables at all from the application: ADR-127 refuses a table write inside a unit of work, `0006` and
-- `0007` give the tables no client write policy, and with these three definers gone there is nothing
-- left to call. The parent journey returns to the state P1-STORES measured — it reads the schema and
-- cannot commit to it — and `boot.test.ts`'s ADR-127 pin goes red again, which is the honest signal.
-- That is a behaviour change, not data loss, and it is the reason to prefer rolling forward.

begin;

drop function if exists public.upsert_position(
  uuid, uuid, public.position_source, public.position_stage, jsonb, jsonb, jsonb, integer);

drop function if exists public.upsert_connection(
  uuid, uuid, uuid, uuid, public.connection_stage, public.connection_origin, jsonb, integer);

drop function if exists public.upsert_placement(
  uuid, uuid, uuid, uuid, public.placement_source, public.placement_state, jsonb, uuid, integer);

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array['upsert_position', 'upsert_connection', 'upsert_placement'] loop
    if exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_fn
    ) then
      raise exception '0019 rollback: %() still exists', v_fn;
    end if;
  end loop;

  -- 0019 created no table, column, index, policy or constraint, so there is nothing else to undo -
  -- and this assertion is what proves that claim rather than repeating it.
  if to_regclass('public.nanny_positions') is null
     or to_regclass('public.connection_requests') is null
     or to_regclass('public.nanny_placements') is null
     or to_regclass('public.position_schedule') is null then
    raise exception '0019 rollback: a table 0019 never created has gone missing';
  end if;
end
$$;

commit;
