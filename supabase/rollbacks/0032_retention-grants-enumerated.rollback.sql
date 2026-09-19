-- 0032_retention-grants-enumerated.rollback.sql — the twin of
-- supabase/migrations/0032_retention-grants-enumerated.sql (06 §4.2; **ADR-165 arm (1)**).
--
-- ★ **This twin restores no privilege, and that is the whole of it.**
--
-- `0032` is a privilege change and contains nothing else: no function, no policy, no constraint, no row. Undoing
-- it means one statement —
--
--     grant select, insert, update, delete on all tables in schema public to bbldn_retention;
--
-- — and **restoring a privilege is restoring a hole**, which is the sentence ADR-165 exists to say. So the
-- security clause is forward-only, and since `0032` *is* a security clause from its first line to its last,
-- this file runs and changes nothing.
--
-- ⚠️ **WHAT IT DELIBERATELY DOES NOT UNDO — all of it, named.**
--
--   · The blanket `0016:288` grant stays revoked. Handing `bbldn_retention` DML on every table in `public` back
--     would re-open, in one statement: a retention identity that can **create** a vetting decision, one that can
--     **rewrite** who lifted a safeguarding bar, one that can **delete** an event row whose window BAI has not
--     confirmed, and one that can reach 34 tables no retention job has ever touched. ADR-170 and ADR-185 both
--     forbid the first two; the third is 07 §6.2 row 14's ★; the fourth is the blast radius the ruling exists
--     to remove.
--   · The enumerated set stays exactly as `0032` left it. It is a **superset** of what every arm in `0028`,
--     `0030` and `0031` exercises — proved by running all three jobs end to end against it — so no reverted
--     code is left without a privilege it needs. There is no version of this tree in which handing the blanket
--     grant back makes something work that does not work now.
--
-- ⚠️ **AND THEREFORE: there is no rollback path from this file. The recovery is roll-forward.** If a later
-- migration must be reverted past `0032`, revert that migration with its own twin; if a retention job is found
-- to need a privilege the enumerated set does not name, the fix is a new migration adding that table to the set
-- **with its reason**, and the matching entry in `int.retention-grants` — not a wider grant applied at 3 a.m.
-- ADR-165 (2)'s `RAISE EXCEPTION` is not used here for the reason ADR-177 gives: that refusal belongs to a twin
-- that genuinely cannot proceed, and this one can — it completes, having correctly done nothing.
--
-- One transaction, so that "did nothing" is a fact about the database and not about how far it got.

-- ⚠️ **AND A RUNBOOK NOTE, because the SQL comment is not where an operator looks** (security pass, LOW).
-- An operator reaching for this file mid-incident, expecting a temporary widening so they can diagnose
-- something, gets **nothing** — by design. There is no "just put it back for an hour" path. Diagnosis runs as
-- the migration owner, which can already read everything; if a retention *job* genuinely needs a privilege it
-- does not have, that is a forward migration naming the table and the reason.
--
-- One transaction, so that "did nothing" is a fact about the database and not about how far it got.

begin;

-- The privilege half is intentionally empty: every statement it could contain is one ADR-165 forbids.
--
-- The one thing there *is* to undo is `0032` §3 — the three `before update of id` guards, which are objects
-- this file created rather than a privilege it removed. They go, and their reason goes with them: after this
-- twin the `update (id)` grants are back to being defended by an argument that a security pass measured to be
-- false on two of the three tables. **That is a cost of the rollback, not a preference**, and it is the second
-- reason the recovery here is roll-forward.

drop trigger if exists nannies_refuse_key_rewrite on public.nannies;
drop trigger if exists admin_notifications_refuse_key_rewrite on public.admin_notifications;
drop trigger if exists cookie_consent_records_refuse_key_rewrite on public.cookie_consent_records;
drop function if exists public.refuse_primary_key_rewrite();

commit;

-- ---------------------------------------------------------------------------
-- Verify — the twin's own claim, asserted rather than described (ADR-165 (3)).
--
-- A twin whose whole content is a refusal has to prove the refusal held, or it is a comment.
-- ---------------------------------------------------------------------------
do $$
declare
  v_relations int;
begin
  -- 1. ★ The blanket grant was not restored. 33 relations, which is the enumerated set and nothing else; the
  --    state `0032` left behind was 33 and `main`'s was 69.
  select count(*) into v_relations
    from (
      select distinct c.oid
        from pg_class c, lateral aclexplode(c.relacl) a
       where c.relkind in ('r','p','v','m','f')
         and a.grantee = 'bbldn_retention'::regrole
    ) s;
  if v_relations <> 33 then
    raise exception '0032 twin: bbldn_retention holds privilege on % relations, not the enumerated 33 — a blanket grant is back', v_relations;
  end if;

  -- 2. ★ The two holes `0032` closed are still closed, named one at a time so a failure says which.
  if has_table_privilege('bbldn_retention', 'public.verifications', 'insert')
     or has_table_privilege('bbldn_retention', 'public.vetting_submissions', 'insert') then
    raise exception '0032 twin: the retention identity can create a vetting decision again';
  end if;
  if has_column_privilege('bbldn_retention', 'public.nanny_suspension_lifts', 'decided_by', 'update') then
    raise exception '0032 twin: the retention identity can rewrite who lifted a safeguarding bar again';
  end if;
  if has_table_privilege('bbldn_retention', 'public.events', 'delete') then
    raise exception '0032 twin: the retention identity can delete an event row again';
  end if;

  -- 3. ★ And the three jobs are still able to run, because a twin that quietly broke the right to erasure
  --    while proving a hole was shut would be the worse failure.
  if not has_column_privilege('bbldn_retention', 'public.verifications', 'subject_pseudonym', 'update')
     or not has_table_privilege('bbldn_retention', 'public.nannies', 'delete')
     or not has_table_privilege('bbldn_retention', 'public.file_retention_log', 'insert') then
    raise exception '0032 twin: a privilege the erasure needs is gone';
  end if;
end;
$$;
