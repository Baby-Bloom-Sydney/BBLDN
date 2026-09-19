-- 0033_retention-execute-enumerated.rollback.sql — the twin of
-- supabase/migrations/0033_retention-execute-enumerated.sql (06 §4.2; **ADR-165 arm (1)**).
--
-- ★ **This twin restores no privilege, and that is the whole of it.**
--
-- `0033` is a privilege change and contains nothing else: no function body, no policy, no constraint, no row.
-- Undoing it would mean re-issuing the two blanket grants its section 1 revoked — and **restoring a privilege
-- is restoring a hole**, which is the sentence ADR-165 exists to say. `0033` is a security clause from its
-- first line to its last, so the security clause is forward-only and this file runs and changes nothing.
--
-- ⚠️ **The two statements are described here rather than written out, and that is deliberate** (security pass,
-- LOW). The first draft printed them verbatim two lines above the warning not to run them. They were
-- `--`-commented and inert — but the reader this header is written for is an operator mid-incident looking for
-- something to paste, and handing them the exact re-open, inside the file whose entire subject is not
-- re-opening it, is a footgun with a caption on it. Anyone who genuinely needs the statements can read `0033`
-- section 1 and invert it, which is a deliberate enough act to be the whole point.
--
-- ⚠️ **WHAT IT DELIBERATELY DOES NOT UNDO — all of it, named.**
--
--   · **`0016:291` stays revoked.** Handing `bbldn_retention` EXECUTE on every function in `public` back would
--     re-open, in one statement, a retention identity that can call **38 SECURITY DEFINER functions, 33 of
--     them owned by `postgres`** — and therefore a `SECURITY DEFINER` owned by that identity from which any
--     added line runs as `postgres` and reaches every table `0032` put out of reach. Measured on `main` before
--     `0033`: `select public.set_access_window(gen_random_uuid(), 5)` **succeeded** as this role.
--   · **The `PUBLIC` revoke stays too.** It restores `0016:279`'s own stated intent, which had not been true
--     since `0018`: three trigger functions created after that one-shot sweep inherited `EXECUTE TO PUBLIC` by
--     default. Putting it back would re-open them to `anon` — and would also re-open the route *round* the
--     enumeration, since a grant to `PUBLIC` reaches `bbldn_retention` without naming it.
--   · **The enumerated set stays exactly as `0033` left it.** It is a superset of what every arm in `0028`,
--     `0030` and `0031` exercises — proved by running all three jobs end to end against it (97 cases green) —
--     so no reverted code is left without a privilege it needs. There is no version of this tree in which
--     handing either blanket grant back makes something work that does not work now.
--
-- ⚠️ **AND THEREFORE: there is no rollback path from this file. The recovery is roll-forward.** If a later
-- migration must be reverted past `0033`, revert that migration with its own twin. If a retention job is found
-- to need a function the enumerated set does not name, the fix is a new migration adding that function **with
-- its reason and how it is reached**, plus the matching entry in `int.retention-execute` — not a wider grant
-- applied at 3 a.m.
--
-- ADR-165 (2)'s `RAISE EXCEPTION` is not used, for ADR-177's reason: that refusal belongs to a twin that
-- genuinely cannot proceed, and this one can — it completes, having correctly done nothing.
--
-- ⚠️ **A RUNBOOK NOTE, because the SQL comment is not where an operator looks** (`3i`'s security LOW, which
-- applies here unchanged). An operator reaching for this file mid-incident expecting a temporary widening — so
-- that a retention job can be made to call something — gets **nothing**, by design. There is no "just put it
-- back for an hour" path. Diagnosis runs as the migration owner, which can already execute everything; if a
-- retention *job* genuinely needs a function it cannot call, that is a forward migration naming the function
-- and the reason.
--
-- **Unlike `0032`'s twin, this one creates no object of its own** — `0033` created none — so there is nothing
-- here for it to drop either. It is empty in both halves, which is why the verify block below is the only
-- thing that distinguishes it from a twin nobody wrote (ADR-165 (3)).
--
-- One transaction, so that "did nothing" is a fact about the database and not about how far it got.

begin;

-- The privilege half is intentionally empty: every statement it could contain is one ADR-165 forbids.
-- The object half is empty because `0033` created no object.

commit;

-- ---------------------------------------------------------------------------
-- Verify — the twin's own claim, asserted rather than described (ADR-165 (3)).
--
-- A twin whose whole content is a refusal has to prove the refusal held, or it is a comment.
-- ---------------------------------------------------------------------------
do $$
declare
  v_reachable int;
  v_total     int;
  v_definers  int;
  v_public    int;
begin
  -- 1. ★ Neither blanket grant came back. The state before `0033` was 56 of 88; it is now a small enumerated
  --    set.
  --
  --    ⚠️ **Asserted as "a small fraction", not as the literal 12** (security pass, LOW). A hardcoded 12 makes
  --    this twin raise *"a blanket grant is back"* the day `0034` legitimately enumerates a thirteenth — a
  --    false alarm pointing an operator at the wrong thing, in a file they are reading precisely because
  --    something has already gone wrong. What this twin can honestly claim is that it restored nothing, which
  --    is the *comparison* below, not a magic number: the count is well under the total, and every foreign
  --    definer beyond ADR-183's three is still out of reach (section 2).
  select count(*) into v_reachable
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and has_function_privilege('bbldn_retention', p.oid, 'EXECUTE');
  select count(*) into v_total
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public';
  if v_reachable > v_total / 2 then
    raise exception '0033 twin: bbldn_retention can execute % of % functions in public — a blanket grant is back',
      v_reachable, v_total;
  end if;

  -- 2. ★ The escalation path is still shut: no foreign-owned definer beyond ADR-183's three.
  select count(*) into v_definers
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and pg_get_userbyid(p.proowner) <> 'bbldn_retention'
     and has_function_privilege('bbldn_retention', p.oid, 'EXECUTE')
     and n.nspname || '.' || p.proname <> all (array[
           'public.scrub_auth_user', 'public.purge_auth_user', 'public.auth_user_purge_state'
         ]);
  if v_definers <> 0 then
    raise exception '0033 twin: the retention identity can borrow another owner''s definer again (% of them)', v_definers;
  end if;

  -- 3. ★ And nothing in `public` is PUBLIC-executable again — the route round the enumeration.
  select count(*) into v_public
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace, lateral aclexplode(p.proacl) a
   where n.nspname = 'public' and a.grantee = 0 and a.privilege_type = 'EXECUTE';
  if v_public <> 0 then
    raise exception '0033 twin: % function(s) in public are executable by PUBLIC again', v_public;
  end if;

  -- 4. ★ …and the three jobs can still run, because a twin that shut a hole by breaking the right to erasure
  --    would be the worse failure.
  if not has_function_privilege('bbldn_retention', 'public.scrub_auth_user(uuid)', 'EXECUTE')
     or not has_function_privilege('bbldn_retention', 'public.purge_auth_user(uuid)', 'EXECUTE')
     or not has_function_privilege('bbldn_retention', 'public.is_retention_job()', 'EXECUTE')
     or not has_function_privilege('bbldn_retention', 'public.is_safeguarding_retention_job()', 'EXECUTE')
     or not has_function_privilege('bbldn_retention', 'public.money_last_activity_at(uuid)', 'EXECUTE') then
    raise exception '0033 twin: a function one of the three retention jobs needs is gone';
  end if;
end;
$$;
