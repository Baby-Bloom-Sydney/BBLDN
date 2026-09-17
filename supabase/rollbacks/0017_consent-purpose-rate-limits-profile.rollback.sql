-- 0017_consent-purpose-rate-limits-profile.rollback.sql — the twin of
-- supabase/migrations/0017_consent-purpose-rate-limits-profile.sql (06 §4.2).
--
-- Drops the four objects 0017 adds and returns `consent_records` to its 0004 shape. Nothing later
-- references them (0017 is the last migration), so this always succeeds on a database 0017 applied to.
--
-- Wrapped in one transaction (database-reviewer L-3): a rollback that fails midway must not leave
-- half the objects standing. Dropping `consent_records.purpose` **loses the attribution of every
-- non-document consent row** — the rows survive, their purpose does not, which is exactly the state
-- ADR-131 (2) was raised about. That is the price of a rollback here and it is stated rather than
-- hidden; re-applying 0017 will refuse (not guess) if such a row exists.

begin;

-- by name, every overload: the three names belong to 0017 alone, and dropping by a fixed signature
-- would strand an overload left by an earlier signature (see the migration's step 3a).
do $$
declare
  v_sig text;
begin
  for v_sig in
    select p.oid::regprocedure::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('consume_rate_limit', 'create_parent_profile', 'record_cookie_consent')
  loop
    execute format('drop function %s', v_sig);
  end loop;
end
$$;

drop table if exists public.rate_limit_buckets;

-- back to 0004's shape: NOT DEFERRABLE (0017 widened it so record_cookie_consent could stamp the old
-- row before the new one existed; with the function gone there is nothing left that needs it).
alter table public.cookie_consent_records
  alter constraint cookie_consent_records_superseded_by_fkey not deferrable;

drop index if exists public.consent_records_user_purpose_idx;
alter table public.consent_records
  drop constraint if exists consent_records_purpose_document_check;
alter table public.consent_records
  drop column if exists purpose;

-- the enum goes only after the column that uses it
drop type if exists public.consent_purpose;

do $$
begin
  if to_regclass('public.rate_limit_buckets') is not null then
    raise exception '0017 rollback: public.rate_limit_buckets still present';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'consent_records' and column_name = 'purpose'
  ) then
    raise exception '0017 rollback: consent_records.purpose still present';
  end if;
  if exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'consent_purpose'
  ) then
    raise exception '0017 rollback: type public.consent_purpose still present';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('consume_rate_limit', 'create_parent_profile', 'record_cookie_consent')
  ) then
    raise exception '0017 rollback: a 0017 function (or an overload of one) is still present';
  end if;
  -- what 0004 built must be untouched
  if to_regclass('public.consent_records') is null then
    raise exception '0017 rollback: consent_records was dropped — 0017 never created it';
  end if;
  if exists (
    select 1 from pg_constraint
    where conname = 'cookie_consent_records_superseded_by_fkey' and condeferrable
  ) then
    raise exception '0017 rollback: the superseded_by FK is still DEFERRABLE (0004 made it not)';
  end if;
end
$$;

commit;
