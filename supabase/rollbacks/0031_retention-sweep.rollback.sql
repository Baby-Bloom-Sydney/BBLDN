-- 0031_retention-sweep.rollback.sql — the twin of supabase/migrations/0031_retention-sweep.sql
-- (06 §4.2; ADR-165, arm (1) per ADR-177).
--
-- Drops the sweep. **It completes, and announces what it costs.**
--
-- ⚠️ **WHAT IS LOST.** After this file nothing in the tree removes data because time has passed: 07 §6.2's
-- windows go back to being sentences. Two consequences, and they are not the same size.
--
--   · **Storage limitation drifts** (Art 5(1)(e)). Expired rows stay. Nothing is destroyed and no request goes
--     unanswered — an erasure is still served by `0028` on demand — but the ten classes `0031` swept stop being
--     swept, and the day the sweep returns it catches up by construction: every arm is a date against a column,
--     never a cursor this file could lose.
--   · ★ **`purge-scrubbed-users` goes back to refusing for ever.** This is the defect `0031` existed to close
--     (`3g`'s Q-1, measured): with every window passed but the expired money and consent rows still present,
--     `purge_scrubbed_user()` finds a `restrict` key still naming the subject and answers `rows-outstanding` —
--     correctly, and permanently, because nothing else removes those rows. So rolling this file back re-opens a
--     known permanent refusal rather than merely pausing a job. **The recovery is roll-forward.**
--
-- ⚠️ **ONE THING THIS FILE DELIBERATELY DOES NOT UNDO — ADR-165 (1).**
--
-- ★ **`bbldn_retention` does not get DELETE back on `verifications` and `vetting_submissions`.** `0031` revoked
-- it after measuring that the retention identity held DELETE on those two — created by `0008`, before `0016:288`
-- granted it DML on every table then in existence — while it did not hold DELETE on `nanny_suspension_lifts`,
-- created by `0025` afterwards. The same three tables, the same rule, and the difference was migration order.
-- `prevent_safeguarding_record_loss()` does not cover the gap because it **exempts** this very identity. Handing
-- the privilege back in the middle of an incident would restore a road on which a retention job can delete a
-- vetting decision — ADR-165 (2)'s "hole" exactly — and it costs the reverted code nothing, because no job
-- before or after `0031` deletes a safeguarding record.
--
-- One transaction: a rollback that fails midway must not leave half the objects standing.

begin;

drop function if exists public.retention_sweep_class(text, jsonb, integer);

commit;

-- ---------------------------------------------------------------------------
-- Verify — the twin's own claims, asserted rather than described
-- ---------------------------------------------------------------------------
do $$
begin
  -- It did the thing it exists to do.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'retention_sweep_class'
  ) then
    raise exception '0031 rollback: retention_sweep_class is still here';
  end if;

  -- ★ The one clause it keeps.
  if has_table_privilege('bbldn_retention', 'public.verifications', 'delete')
     or has_table_privilege('bbldn_retention', 'public.vetting_submissions', 'delete') then
    raise exception '0031 rollback: it handed DELETE on a safeguarding table back to the retention identity';
  end if;

  -- The two jobs that are not this file''s are untouched: the twin removes the sweep, never a right.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'erase_account'
  ) then
    raise exception '0031 rollback: it removed erase_account(), which is 0028''s';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'purge_scrubbed_user'
  ) then
    raise exception '0031 rollback: it removed purge_scrubbed_user(), which is 0030''s';
  end if;
end;
$$;
