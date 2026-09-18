-- 0027_safeguarding-survives-erasure.rollback.sql — the twin of supabase/migrations/0027_safeguarding-survives-erasure.sql (06 §4.2).
--
-- ⚠️ **WHAT THIS FILE DELIBERATELY DOES NOT UNDO** — ADR-165 (1), as ADR-177 generalised it: a rollback that
-- would re-open a **hole** refuses; one that destroys **data** completes and announces the loss. All three of
-- `0027`'s security clauses are kept, and each is named here so a reader can check the claim:
--
--  1. ★ **The four person keys stay off `cascade`.** `verifications.nanny_id`, `vetting_submissions.nanny_id`
--     and `nanny_suspension_lifts.nanny_id` stay `on delete set null`; `vetting_submissions.verification_id`
--     stays `on delete restrict`. Re-arming a cascade that erases which admin approved a DBS check, what the
--     outcome was and who lifted a bar — in the middle of an incident, at 3 a.m. — is not a rollback, it is the
--     incident. It also costs the reverted code nothing: no road in the application deletes a `nannies` row
--     except the erasure path, and that path wants exactly this behaviour (07 §6.1 step 3 + §6.2 row 4).
--
--  2. ★ **`prevent_safeguarding_row_modification()` and `prevent_safeguarding_record_loss()` stay attached.**
--     Detaching them hands UPDATE and DELETE on a safeguarding audit row back to every role that has the table
--     privilege, which is the hole `3c` measured. **What is kept is the refusal of DELETE and TRUNCATE** — the
--     loss itself. `prevent_safeguarding_record_loss()` is **re-created** below with its two *pseudonym*
--     clauses removed, and that is not a weakening by oversight, it is measured: those clauses exist to protect
--     the pseudonym machinery this file is removing, and with the pseudonymiser gone the foreign key's own
--     `set null` arrives at the guard as exactly the UPDATE the `nanny_id` clause forbids — so a twin that kept
--     it would make deleting a `nannies` row **impossible**, silently converting `set null` into `restrict` and
--     breaking the erasure job (07 §6.1 step 3) on the very path it was rolled back to unblock. Driven, not
--     argued: the first run of `int.rollback-0027` failed on precisely that. The `subject_pseudonym` clause
--     goes with the column, because a trigger referencing a dropped column fails at the next write rather than
--     at drop time, which would turn a rollback into an outage tomorrow.
--
--  3. ★ **The three `nanny_id` columns stay nullable.** Clause 1 is what makes them nullable, and restoring
--     NOT NULL over a row whose subject has already been erased would fail to apply anyway — so a twin that
--     tried it would abort halfway, which is the one outcome worse than either choice.
--
-- ⚠️ **WHAT IS LOST, stated rather than hidden.**
--
-- **Every pseudonym already written.** Dropping `subject_pseudonym` drops all three columns' values. After this
-- file a safeguarding row about an erased person still exists and still carries its decision, but the link
-- between that decision and *the same person's other decisions* is gone and cannot be reconstructed from the
-- database — the `nannies` row it came from was deleted. On any environment today that is no data at all: no
-- person has been erased. **On a database where an erasure has run, export `verifications`,
-- `vetting_submissions` and `nanny_suspension_lifts` before running this**, exactly as `0023`'s twin says of
-- `decided_by` and `0026`'s of `document_content_hash`.
--
-- **And going forward, correlation stops being captured.** With the pseudonymiser dropped, a later nanny
-- deletion detaches the rows with nothing written in their place: they survive with a null subject, which is
-- worse than `0027` and far better than `0008`'s cascade. **The recovery is roll-forward** — re-apply `0027`,
-- which re-creates the column and the trigger; it does not recover the pseudonyms this file dropped.
--
-- Nothing later references any of these objects (`0027` is the last migration), so this always succeeds on a
-- database `0027` applied to. One transaction: a rollback that fails midway must not leave half the objects
-- standing.

begin;

-- ---------------------------------------------------------------------------
-- 1. The pseudonymiser goes (see the header's second loss)
-- ---------------------------------------------------------------------------

drop trigger if exists nannies_pseudonymise_safeguarding on public.nannies;
drop function if exists public.pseudonymise_safeguarding_subject();

-- ---------------------------------------------------------------------------
-- 2. ★ The loss guard is RE-CREATED, not dropped — clause 2 of the header
-- ---------------------------------------------------------------------------
-- `0027`'s body with both pseudonym clauses removed — see clause 2 in the header for why removing them is the
-- correct rollback and keeping them would be a silent `restrict`. **DELETE and TRUNCATE stay refused**, which
-- is the hole.

create or replace function public.prevent_safeguarding_record_loss()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_safeguarding_retention_job() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception
      'safeguarding record %.%: % refused — a vetting decision outlives its subject (ADR-170)',
      tg_table_schema, tg_table_name, tg_op
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

-- `nanny_suspension_lifts` is the one genuinely append-only table of the three, and it keeps the full guard —
-- with one carve-out for the same reason, stated exactly: with the pseudonymiser gone, the foreign key's own
-- `set null` is an UPDATE, and an unqualified append-only guard would refuse it and make a `nannies` row
-- undeletable. The carve-out is narrow in **two** dimensions, and the first draft of this file had only one of
-- them (database pass, HIGH — caught before this twin ever ran anywhere):
--
--   * narrow in *columns* — `to_jsonb(...) - 'nanny_id'` compares the whole rest of the row, so an UPDATE that
--     nulls the subject *and* quietly rewrites the reason does not slip through the gap;
--   * narrow in *identity* — and this is the one that was missing. A column-shape check alone accepts the shape
--     from **any** caller, so `supabase_admin` (or anyone holding UPDATE) could have run
--     `update nanny_suspension_lifts set nanny_id = null` against a **live** nanny and silently detached a
--     lift from its subject: precisely the failure ADR-170 exists to prevent, and precisely the role section
--     4(e) of the forward file excludes on purpose. The `not exists` below is the fix: the branch passes only
--     when the parent is genuinely gone, which is true of a referential `set null` and of nothing a hand-written
--     statement can arrange without first deleting the nanny.
create or replace function public.prevent_safeguarding_row_modification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_safeguarding_retention_job() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE'
     and old.nanny_id is not null
     and new.nanny_id is null
     and (to_jsonb(new) - 'nanny_id') = (to_jsonb(old) - 'nanny_id')
     and not exists (select 1 from public.nannies n where n.id = old.nanny_id) then
    return new;
  end if;

  raise exception
    'safeguarding record %.%: % refused (ADR-170)', tg_table_schema, tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. What `0027` ADDED and this file removes: the pseudonym column and its invariant
-- ---------------------------------------------------------------------------

alter table public.verifications
  drop constraint if exists verifications_subject_present_check;
alter table public.vetting_submissions
  drop constraint if exists vetting_submissions_subject_present_check;
alter table public.nanny_suspension_lifts
  drop constraint if exists nanny_suspension_lifts_subject_present_check;

drop index if exists public.verifications_subject_pseudonym_idx;
drop index if exists public.vetting_submissions_subject_pseudonym_idx;
drop index if exists public.nanny_suspension_lifts_subject_pseudonym_idx;

alter table public.verifications drop column if exists subject_pseudonym;
alter table public.vetting_submissions drop column if exists subject_pseudonym;
alter table public.nanny_suspension_lifts drop column if exists subject_pseudonym;

-- `vetting_submissions_nanny_idx` is KEPT: `set null` on that key still needs it (clause 1), and an index that
-- stops a nanny deletion seq-scanning the ledger is not part of what this file reverts.
--
-- `verifications_rtw_status_idx` is KEPT for the same kind of reason and a different one. `0027` §1a added it to
-- close REVIEW-4 M-15 — a measured sequential scan on a five-minute cron — which has nothing to do with ADR-170
-- and nothing to do with whatever made someone run this twin. Dropping an index that only makes an existing
-- query fast would be reverting a defect fix as collateral.

-- ---------------------------------------------------------------------------
-- 4. Verify — ADR-165 (3): the hole is still shut AFTER the twin
-- ---------------------------------------------------------------------------

do $$
declare
  v_pair  text[];
  v_pairs text[][] := array[
    array['verifications', 'nanny_id'],
    array['vetting_submissions', 'nanny_id'],
    array['nanny_suspension_lifts', 'nanny_id'],
    array['vetting_submissions', 'verification_id']
  ];
  v_action text;
  v_tbl    text;
begin
  foreach v_pair slice 1 in array v_pairs loop
    select c.confdeltype::text into v_action
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_attribute a on a.attrelid = t.oid and a.attnum = c.conkey[1]
     where n.nspname = 'public' and t.relname = v_pair[1] and c.contype = 'f'
       and array_length(c.conkey, 1) = 1 and a.attname = v_pair[2];
    if v_action = 'c' then
      raise exception '0027 twin: public.%.% was handed its cascade back — that is the incident, not a rollback',
        v_pair[1], v_pair[2];
    end if;
  end loop;

  -- The guards are still attached and still narrow. A twin that quietly left `supabase_admin` able to edit a
  -- DBS decision would have undone the clause while passing every other check in this file.
  if (select count(*) from pg_trigger g join pg_class t on t.oid = g.tgrelid
       join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public' and not g.tgisinternal
        and g.tgname in ('nanny_suspension_lifts_append_only', 'nanny_suspension_lifts_no_truncate',
                         'verifications_safeguarding_guard', 'verifications_no_truncate',
                         'vetting_submissions_safeguarding_guard', 'vetting_submissions_no_truncate')) <> 6 then
    raise exception '0027 twin: a safeguarding guard trigger was dropped (ADR-165 (1))';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'is_safeguarding_retention_job'
       and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') !~ 'supabase_admin'
  ) then
    raise exception '0027 twin: is_safeguarding_retention_job() widened — the exemption must stay bbldn_retention alone';
  end if;

  -- ★ And the carve-out this file introduces is narrow in identity as well as in columns. Asserting the shape
  --   of the source is not enough on its own, but it is what stops a later "simplification" of this twin from
  --   dropping the clause and re-opening the detach — the behaviour itself is driven in `int.rollback-0027`.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'prevent_safeguarding_row_modification'
       and p.prosrc ~ 'not exists'
  ) then
    raise exception '0027 twin: the detach carve-out has no identity check — a live nanny''s lift could be detached';
  end if;

  -- And what the twin DID undo, so a half-run file is loud rather than silent.
  foreach v_tbl in array array['verifications', 'vetting_submissions', 'nanny_suspension_lifts'] loop
    if exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = v_tbl and column_name = 'subject_pseudonym'
    ) then
      raise exception '0027 twin: public.%.subject_pseudonym is still there — the twin did not complete', v_tbl;
    end if;
  end loop;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'pseudonymise_safeguarding_subject'
  ) then
    raise exception '0027 twin: pseudonymise_safeguarding_subject() is still there — the twin did not complete';
  end if;
end;
$$;

commit;
