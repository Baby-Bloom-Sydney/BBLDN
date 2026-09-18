-- 0029_renewal-sweep.rollback.sql — the twin of supabase/migrations/0029_renewal-sweep.sql (06 §4.2; ADR-165).
--
-- Drops exactly what `0029` adds: the read `consent_subjects_due_for_renewal` and the index it walks. Nothing
-- later references either, so this always succeeds on a database `0029` applied to. One transaction.
--
-- **ADR-165 (1), arm (1) — it completes, and announces what stops working** (the rule ADR-177 generalised: a
-- rollback that re-opens a hole refuses; one that loses a capability completes and says so).
--
-- ⚠️ **WHAT IS LOST.** After this file the annual renewal sweep has no read, so `/api/cron/audit-consent-expiry`
-- carries on auditing **documents** — a day-one slug with no version, a passed re-acceptance deadline — and stops
-- checking **people**. Nobody is re-asked and no carry-forward is recorded, so the year-later question "was the
-- check done?" has no answer for the period the twin was in force. Nothing is destroyed: the carries already
-- written are ordinary `consent_records` rows on an append-only table and this file does not touch them, and no
-- consent is invalidated — ADR-174 is explicit that a consent does not expire because a year passed. **The
-- recovery is roll-forward**, and the first sweep after it catches up by construction, because "due" is computed
-- from the newest row rather than from a cursor this file could have lost.
--
-- ⚠️ **WHAT IT DOES NOT UNDO.** Nothing. `0029` narrows no grant, changes no referential action and creates no
-- table, so there is no security clause here for ADR-165 (2) to be about. That is stated rather than left as an
-- absence, because "this twin keeps nothing" should be a sentence a reader finds rather than one they infer.

begin;

drop function if exists public.consent_subjects_due_for_renewal(public.consent_purpose, timestamptz, integer);

drop index if exists public.consent_records_purpose_subject_recent_idx;

commit;

-- ---------------------------------------------------------------------------
-- Verify — the objects are gone, and the ones `0029` never owned are still here
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'consent_subjects_due_for_renewal'
  ) then
    raise exception '0029 rollback: the read is still present';
  end if;

  if exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'consent_records_purpose_subject_recent_idx'
  ) then
    raise exception '0029 rollback: the index is still present';
  end if;

  -- The rows the sweep wrote are not the twin's to remove, and the table would refuse anyway (append-only).
  -- Asserted rather than assumed: a twin that quietly took the carry rows with it would destroy the evidence
  -- that the check ran, which is the one thing ADR-174 wrote them down for.
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'consent_records_user_purpose_idx'
  ) then
    raise exception '0029 rollback: it removed an index it did not create';
  end if;
end;
$$;
