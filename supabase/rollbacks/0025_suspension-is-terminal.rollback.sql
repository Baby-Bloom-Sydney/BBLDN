-- 0025_suspension-is-terminal.rollback.sql — the twin of supabase/migrations/0025_suspension-is-terminal.sql (06 §4.2).
--
-- Drops what `0025` ADDS — `lift_nanny_suspension()` and the `nanny_suspension_lifts` audit table — and stops
-- there. Nothing later references either (0025 is the last migration), so this always succeeds on a database
-- 0025 applied to. One transaction.
--
-- ★ ADR-165 (1) — THE CLAUSE THIS TWIN DELIBERATELY DOES NOT UNDO, named as the rule requires.
--
--   `0025` re-created `sync_nanny_verification_state()` with one changed clause: `suspended_at` is derived in
--   neither of its two UPDATEs, so the function may SET a bar and may never CLEAR one (ADR-168 (a), closing
--   REVIEW-4 C-2 — measured `suspended t → f` on a re-decision of the same submission). **That is a security
--   clause and this file keeps it.** The function is not restored to `0023`'s body; the `else v.suspended_at`
--   / `else n.suspended_at` arms stay. Rolling back a safeguarding control is not a rollback, it is an
--   incident, and `supabase/__tests__/rollback-security-clauses.test.ts` applies forward → this file → and
--   asserts the bar is still un-clearable, which is ADR-165 (3).
--
-- WHAT IS LOST, stated rather than hidden.
--
--   **A suspension can no longer be lifted at all.** With `lift_nanny_suspension()` gone and the sync keeping
--   its narrowing, nothing in the schema clears `suspended_at`: an operator who must lift one after this file
--   does it by hand, as a named, logged database change, or rolls forward. That is the fail-SAFE direction and
--   it is why arm (1) applies here and arm (2) does not — ADR-165 (2)'s `RAISE EXCEPTION` gate is owed by a
--   twin whose reverted application code cannot run without the old, weaker grant, and no application code
--   needs a bar to come off silently. There is no hole to re-open at 3 a.m.; there is a lever that is missing,
--   which is a thing an operator can see.
--
--   **The audit rows go with the table.** `nanny_suspension_lifts` is dropped, not emptied — every recorded
--   lift is lost with it. An environment that has recorded one is an environment that has lifted a bar, and
--   that history should be exported before this file is applied. Stated here rather than assumed, because a
--   twin that silently destroys an audit trail is the second thing a regulator asks about.
--
--   **Nothing is un-lifted.** A nanny whose suspension was lifted before this file stays un-suspended, and her
--   `dbs_outcome` stays `unset`. This file reverses no decision; it removes the road that records them.

begin;

-- 1. The definer first: it is the only thing that writes the table below.
drop function if exists public.lift_nanny_suspension(uuid, text, uuid);

-- 2. The audit table and its indexes (the policy and indexes go with the table).
drop table if exists public.nanny_suspension_lifts;

-- 3. `sync_nanny_verification_state()` is NOT re-created here. See the ADR-165 (1) block above.

-- 4. Verify — the twin asserts what it did AND what it refused to do (M-16: a twin with no verify block cannot
--    tell a half-applied rollback from a whole one).
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'lift_nanny_suspension'
  ) then
    raise exception '0025 rollback: lift_nanny_suspension() is still here';
  end if;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'nanny_suspension_lifts'
  ) then
    raise exception '0025 rollback: nanny_suspension_lifts is still here';
  end if;

  -- ★ The refusal, asserted rather than promised: the forward-only clause must survive this file.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'sync_nanny_verification_state'
       and p.prosrc ~ 'else v\.suspended_at end'
       and p.prosrc ~ 'else n\.suspended_at end'
  ) then
    raise exception '0025 rollback: the ADR-168 (a) narrowing is gone — this twin must KEEP it (ADR-165 (1))';
  end if;
end
$$;

commit;
