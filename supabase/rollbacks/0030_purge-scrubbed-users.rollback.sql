-- 0030_purge-scrubbed-users.rollback.sql — the twin of supabase/migrations/0030_purge-scrubbed-users.sql
-- (06 §4.2; ADR-165, arm (1) per ADR-177).
--
-- Drops the two purge functions and the candidate read. **It completes, and announces what it costs.**
--
-- ⚠️ **WHAT IS LOST.** After this file `purge-scrubbed-users` cannot run at all: a scrubbed `auth.users` row is
-- kept for ever instead of being hard-deleted once every retention window has passed. Nothing is destroyed and
-- nobody's rights are affected — the **scrub** is what protects the person (tombstoned email, no password,
-- banned for ever), and this job only removes a pseudonymous row that identifies nobody. The cost is storage
-- limitation (Art 5(1)(e)) drifting: rows that could have gone do not. **The recovery is roll-forward**, and the
-- first run afterwards catches up by construction, because "ready to purge" is computed from the ledger's dates
-- rather than from a cursor this file could have lost.
--
-- ⚠️ **FOUR THINGS THIS FILE DELIBERATELY DOES NOT UNDO — ADR-165 (1), each named.**
--
-- 1. ★ **`vetting_submissions.decided_by` and `verifications.dbs_update_service_checked_by` stay
--    `on delete restrict`.** `0030` narrowed them from `set null` on `3f`'s Q-3: *"an audit row whose author can
--    be deleted is not an audit row"* (`0025:83`, applied to who approved a DBS submission and who ran an Update
--    Service check). Re-arming `set null` in the middle of an incident would hand back a road that silently
--    removes the author of a safeguarding decision — exactly ADR-165 (2)'s "hole", and it costs the reverted code
--    nothing, because nothing before `0030` hard-deletes an `auth.users` row.
--
-- 2. ★ **`payment_events.parent_user_id` stays `on delete restrict`.** `0030` narrowed it from `set null` so
--    that the safety net the job claims — "anything still referencing the row raises" — is true for the money
--    class rather than true for three of its four tables. Re-arming `set null` would hand back a road that
--    silently orphans a payment event still inside its Limitation Act window, which is a hole in ADR-165 (2)'s
--    sense; and it costs the reverted code nothing, because nothing before `0030` hard-deletes an `auth.users`
--    row at all.
--
-- 3. **`account_erasure_requests.subject_user_id` stays nullable.** Restoring `not null` would fail outright on
--    any database where a purge has already run, and would be pointless anywhere else: nothing writes a null but
--    the function this file removes. A column that permits a value nothing writes is not a hole.
--
-- 4. **`purged_at` is kept, with its values.** It records that a hard delete happened on a given date, which is
--    an Art 5(2) fact about what we did; dropping the column would destroy that record to tidy up a schema.
--
-- One transaction: a rollback that fails midway must not leave half the objects standing.

begin;

drop function if exists public.purge_scrubbed_user(uuid, jsonb);
drop function if exists public.purge_auth_user(uuid);
drop function if exists public.auth_user_purge_state(uuid);
drop function if exists public.subjects_ready_to_purge(timestamptz, integer);

commit;

-- ---------------------------------------------------------------------------
-- Verify — the job is gone, and the four clauses above are still standing
-- ---------------------------------------------------------------------------
do $$
declare
  v_name text;
begin
  foreach v_name in array array['purge_scrubbed_user', 'purge_auth_user',
                                'auth_user_purge_state', 'subjects_ready_to_purge'] loop
    if exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = v_name
    ) then
      raise exception '0030 rollback: % is still present', v_name;
    end if;
  end loop;

  -- ★ Clause 2 — the money safety net is still true.
  if (select c.confdeltype from pg_constraint c join pg_class t on t.oid = c.conrelid
       where t.relname = 'payment_events' and c.conname = 'payment_events_parent_user_id_fkey') <> 'r' then
    raise exception '0030 rollback: it re-armed set null on payment_events.parent_user_id';
  end if;

  -- ★ Clause 1 — the safeguarding authors are still undeletable.
  if (select c.confdeltype from pg_constraint c join pg_class t on t.oid = c.conrelid
       where t.relname = 'vetting_submissions'
         and c.conname = 'vetting_submissions_decided_by_fkey') <> 'r' then
    raise exception '0030 rollback: it re-armed set null on vetting_submissions.decided_by';
  end if;
  if (select c.confdeltype from pg_constraint c join pg_class t on t.oid = c.conrelid
       where t.relname = 'verifications'
         and c.conname = 'verifications_dbs_update_service_checked_by_fkey') <> 'r' then
    raise exception '0030 rollback: it re-armed set null on verifications.dbs_update_service_checked_by';
  end if;

  -- Clause 4 — the record of what we did is still there.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'account_erasure_requests'
       and column_name = 'purged_at'
  ) then
    raise exception '0030 rollback: it dropped purged_at, which records that a hard delete happened';
  end if;

  -- And the erasure job itself is untouched: this twin removes the housekeeping, never the right.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'erase_account'
  ) then
    raise exception '0030 rollback: it removed erase_account(), which is 0028''s and not this file''s';
  end if;
end;
$$;
