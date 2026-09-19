-- 0035_client-function-surface-enumerated.rollback.sql — the twin of
-- supabase/migrations/0035_client-function-surface-enumerated.sql (06 §4.2; **ADR-165 arm (1)**).
--
-- ★ **This twin restores nothing, and this is the plainest case of arm (1) in the folder.**
--
-- `0035` contains six `revoke execute … from anon, authenticated` and nothing else. Undoing it means handing
-- a stranger holding the public anon key, and every signed-in user, the right to call six functions the
-- application never calls — among them **`nanny_is_visible(uuid)`, REVIEW-4's L-2**: a `SECURITY DEFINER`
-- owned by `postgres`, over a `FORCE RLS` table, answering a question about a named nanny to anybody who
-- asks. "A rollback twin never restores a security hole" is the whole sentence.
--
-- ⚠️ **The two statements are described rather than written out** (`3j`'s security LOW, and it applies here
-- more than it did there): an operator mid-incident wants something to paste, and this file's subject is
-- exactly the thing they must not paste. Anyone who genuinely needs them can read `0035`'s revoke block and
-- invert it, which is a deliberate enough act to be the point.
--
-- ⚠️ **WHAT IT DELIBERATELY DOES NOT UNDO — all of it, named.**
--
--   · **The six revokes stay.** Each was searched for four ways before it was taken — `src/`, the policy
--     catalogue, every other function body, and every **view definition** — and the fourth search exists
--     because the first draft of `0035` revoked eight and two came back red from a view body. What is left
--     has no caller on any of the four surfaces.
--   · **The twenty that stayed, stayed.** `0035` removed nothing the app reaches: seven policy predicates,
--     one non-definer trigger callee, two view callees and ten named RPCs, each with its call site. Proved by
--     running the whole integration suite against the applied set, not by reading.
--   · **Nothing here re-opens `PUBLIC`.** `0033` revoked it and `0035` asserts it is still zero. A grant to
--     `PUBLIC` reaches both client roles without naming either, so restoring one would undo this file by a
--     side door.
--
-- ⚠️ **AND THEREFORE: there is no rollback path from this file. The recovery is roll-forward.** If a client
-- path is found that genuinely needs one of the six, the fix is a new migration granting **that one**, with
-- its reason and its call site, plus the matching entry in `int.client-functions` — not a blanket re-grant at
-- 3 a.m. And if the need is a *new* function, remember what `0035`'s header measured: it will already be
-- reachable by `anon` and `authenticated` the moment it exists, because the world default for a function is
-- `EXECUTE TO PUBLIC` and `alter default privileges … revoke` does not suppress it.
--
-- ADR-165 (2)'s `RAISE EXCEPTION` is not used, for ADR-177's reason: that refusal belongs to a twin that
-- genuinely cannot proceed, and this one can — it completes, having correctly done nothing.
--
-- One transaction, so that "did nothing" is a fact about the database and not about how far it got.

begin;

-- The privilege half is intentionally empty: every statement it could contain is one ADR-165 forbids.
-- The object half is empty because `0035` created no object.

commit;

-- ---------------------------------------------------------------------------
-- Verify — the twin's own claim, asserted rather than described (ADR-165 (3)).
-- ---------------------------------------------------------------------------
do $$
declare
  v_authed int;
  v_anon   int;
  v_total  int;
  v_public int;
begin
  -- 1. ★ Neither client role got the surface back. Asserted as a comparison rather than as the literal 20
  --    and 2 — `3j`'s security LOW, which `0034` proved the cost of by turning `0032`'s twin red on a lawful
  --    34th relation. The exact membership is `int.client-functions`'s, held against the enumeration on
  --    every run.
  select count(*) into v_total from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public';
  select count(*) into v_authed from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'EXECUTE');
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_authed > v_total / 2 then
    raise exception '0035 twin: authenticated can execute % of % functions in public — the surface is back',
      v_authed, v_total;
  end if;
  if v_anon > 4 then
    raise exception '0035 twin: anon can execute % functions in public — the surface is back', v_anon;
  end if;

  -- 2. ★ The six by name, one at a time so a failure says which.
  if has_function_privilege('anon', 'public.nanny_is_visible(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.nanny_is_visible(uuid)', 'EXECUTE') then
    raise exception '0035 twin: nanny_is_visible is client-reachable again — REVIEW-4 L-2 is open';
  end if;
  if has_function_privilege('authenticated', 'public.child_has_family_access(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.family_has_access(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.nanny_profile_columns(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.verification_submission_columns(verification_section, jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.is_safeguarding_retention_job()', 'EXECUTE') then
    raise exception '0035 twin: one of the five other revoked functions is client-reachable again';
  end if;

  -- 3. ★ And the side door: nothing in `public` is PUBLIC-executable, which would reach both roles without
  --    naming either.
  select count(*) into v_public
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace, lateral aclexplode(p.proacl) a
   where n.nspname = 'public' and a.grantee = 0 and a.privilege_type = 'EXECUTE';
  if v_public <> 0 then
    raise exception '0035 twin: % function(s) in public are PUBLIC-executable again', v_public;
  end if;

  -- 4. ★ …and the app still works, which is the failure mode a twin about revocations must not have: the
  --    two view callees and the seven policy predicates are still reachable.
  if not has_function_privilege('anon', 'public.nanny_visible(boolean, verification_level)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.family_access_reason(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.is_admin()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.user_has_child_access(uuid)', 'EXECUTE')
     or not has_function_privilege('anon', 'public.get_invite_preview(text)', 'EXECUTE') then
    raise exception '0035 twin: a function the client genuinely reaches has gone';
  end if;
end;
$$;
