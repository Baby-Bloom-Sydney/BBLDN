-- 0035_client-function-surface-enumerated.sql — **ADR-185/186 turned outward** (L-009 `3k`; `3j`'s Q-2, and
-- REVIEW-4's **L-2** closes with it).
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT WAS THERE, MEASURED FROM THE CATALOGUE BEFORE ANYTHING CHANGED
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- `0032` enumerated what the retention identity may **touch** and `0033` what it may **call**. Both are about
-- one NOLOGIN role that no stranger can reach. The surface a stranger *with the anon key* reaches was left
-- alone, and `0033` said so in as many words. This file closes it.
--
-- On `0000`–`0034` applied from empty, effective privilege (`has_function_privilege`, not a direct-ACL read):
--
-- | What | Before | After |
-- |---|---|---|
-- | Functions in `public` executable by `authenticated` | **26** | **19** |
-- | …by `anon` | **4** | **1** |
-- | …`SECURITY DEFINER` owned by `postgres` among them | 21 | 15 |
-- | Functions in `public` executable by `PUBLIC` | 0 | 0 — asserted, not assumed |
-- | `EXECUTE` held `WITH GRANT OPTION` | 0 | 0 — asserted |
-- | Roles `anon` / `authenticated` are a member of | 0 | 0 — asserted, the direction that would matter |
--
-- ★ **And the default is against us, which is why the gate and not this file is the control.** Measured on
-- the local stack rather than read: a function created by `postgres` in `public` comes out with
-- `{=X/postgres, postgres=X, service_role=X}`. The `=X` is **PUBLIC**, so `anon` and `authenticated` reach it
-- the moment it exists. `0000:329` runs
--
--     alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
--
-- and states *"Default: **no client role may execute anything in public**"*. **That claim has been false
-- since `0000`.** Driven three ways in one transaction: the `pg_default_acl` row it wrote is correct
-- (`{postgres=X, service_role=X}`); re-issuing the revoke changes nothing; and a function created immediately
-- afterwards still carries `=X`. The world default for a function is merged in regardless of the recorded
-- default ACL. This is `3j`'s D-3 for the third time — *a default-deny sweep is a statement about one moment,
-- not a policy* — and the only durable control is `int.client-functions`, which reads the live catalogue
-- after the whole migration set.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT STAYS, AND FROM WHERE (ADR-186)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- The enumeration with a reason **and a call site** per entry lives in `int.client-functions`'s
-- `CLIENT_SURFACE`, because that is where it is checked every run. In summary, the 19 are:
--
--   · **7 policy predicates** — `is_admin`, `is_nanny`, `is_parent`, `is_active_nanny`, `current_nanny_id`,
--     `current_parent_id`, `user_has_child_access`. A policy expression is evaluated as the **querying**
--     role, so these are not optional: revoking one turns every gated read into `42501`.
--   · **1 non-definer trigger callee** — `is_privileged_writer()`. `3j`'s rule, applied to the client side:
--     an *invoker* trigger body runs as the invoking role, so the functions **it** calls need the caller's
--     privilege. Seven column guards on tables `authenticated` writes go through it.
--   · **2 view callees** — `nanny_visible(boolean, verification_level)` from `nanny_public` (readable by
--     `anon`) and `family_access_reason(uuid)` from `family_access` (readable by `authenticated`). See the
--     section below: a view body is the fifth surface and this file learned it by breaking.
--   · **9 named RPCs**, each with its `.rpc()` call site and the scope it is made at. All nine are **session
--     scope** — they take no user id and act for `auth.uid()`, so a service-scope call would mean "no
--     session" and be refused. ★ **There is no `anon` RPC left at all**: `get_invite_preview(text)` looked
--     like one and is called only at service scope (see the revoke block), so `anon`'s whole remaining
--     surface is one view callee.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT GOES, AND THE MEASUREMENT PER LINE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Each of the seven was searched for four ways before it was taken — and the fourth was added after two of
-- the original eight came back (see below): `src/` (excluding generated types), the
-- policy catalogue (`pg_policies.qual` / `with_check`), every other function body in `public`, and every
-- **view definition** in `public`.
--
-- ★ **`nanny_is_visible(uuid)` is REVIEW-4's L-2 and it is the sharpest of the eight**: an **anon**-reachable
-- `SECURITY DEFINER` owned by `postgres`, over a `FORCE RLS` table, with **no caller anywhere**. A definer
-- with no caller is not unused — it is an unattended endpoint, and this one answers a question about a
-- specific nanny to a stranger holding only the public anon key.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ★ THE FIFTH SURFACE — A VIEW BODY, FOUND BY EXECUTION AFTER THIS FILE HAD ALREADY BEEN WRITTEN
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- The first draft of this file revoked **eight** functions. Two of them broke `int.rls` and
-- `int.rls-isolation-conjunction` on the next run, with `permission denied for function nanny_visible` from an
-- **`anon`** `select … from public.nanny_public`, and the same for `family_access_reason` from `family_access`.
--
-- The caller search had covered `src/`, `pg_policies` and every other function body — 07 §5.7's four surfaces
-- read from the client side. It missed a **view definition**, and the platform fact underneath it is worth
-- writing down because it is not obvious: **all nine views in `public` are `security_invoker = off`, so their
-- *table* reads are checked as the view owner — but a function named inside a view body is still checked
-- against the querying role.** Owner substitution applies to relations, not to `EXECUTE`. So:
--
--   · `nanny_public` names `nanny_visible(boolean, verification_level)` and is readable by `anon` — the public
--     nanny pool. It stays, for both client roles.
--   · `family_access` names `family_access_reason(uuid)` and is readable by `authenticated`. It stays, for
--     that role only; `anon` cannot read the view and does not get the function.
--
-- Both are kept with the view named as their "from where" (ADR-186), and `int.client-functions` now scans
-- `pg_get_viewdef` as a fifth half so the next enumeration cannot make the same mistake silently. **This is
-- `3j`'s D-2 exactly**: the fix for an incomplete claim is not a weaker claim, it is another enumeration.
--
-- ⚠️ **And the index predicate, which is the part that stayed true** (`3j`'s D-4 — name the confounder rather
-- than overturning a measurement with an argument): `nanny_visible` is also named by `nannies_matching_idx`'s
-- partial-index predicate, where `3i` recorded that `EXECUTE` *is* checked and `3j` measured that it is not.
-- The variable is **inlining**: a `sql IMMUTABLE` non-definer is inlined into the index expression and never
-- called. That remains true and is asserted below — it simply was never the reason `nanny_visible` had to
-- stay. The view was.
--
-- 02 §6 row `0035`; 07 §5.9.
--
-- One transaction. The verify block runs after `commit` (`0032`'s house style).

begin;

-- ---------------------------------------------------------------------------
-- The revokes.  CLIENT SURFACE — START
--   (`int.client-functions` reads this block, so the migration and the gate cannot drift apart.)
-- ---------------------------------------------------------------------------

-- ★ REVIEW-4 L-2: an anon-reachable SECURITY DEFINER over a FORCE RLS table with no caller anywhere — not in
-- `src/`, not in a policy, not in another body. The visibility question the app actually asks is answered by
-- `nanny_public` (ADR-166) and by `is_active_nanny()` inside policies.
revoke execute on function public.nanny_is_visible(uuid) from anon, authenticated;

-- No caller anywhere either — not in `src/`, not in a policy, not in a body, not in a view. ⚠️ **And it has
-- no live successor**, which the first draft's comment implied it did (database pass, MEDIUM): the policies
-- that gate child access call `user_has_child_access(uuid)`, which is independently coded over `children` and
-- `child_client` and does **not** call this chain at all. What is being removed here is dead, not migrated.
revoke execute on function public.child_has_family_access(uuid) from anon, authenticated;

-- Called only by `child_has_family_access()`, a `postgres`-owned definer — so the client never evaluates it.
revoke execute on function public.family_has_access(uuid) from anon, authenticated;

-- ADR-152's static column map. Called only by `create_nanny_account()` and `update_nanny_profile()`, both
-- `postgres`-owned definers; a client that could call it directly could shape the column list those two exist
-- to fix.
revoke execute on function public.nanny_profile_columns(jsonb) from anon, authenticated;

-- The same shape one domain over: called only by `submit_verification_evidence()`, a `postgres`-owned definer.
revoke execute on function public.verification_submission_columns(verification_section, jsonb) from anon, authenticated;

-- ★ **The invite preview, and the reason it leaves the client surface even though it reads like an anon
-- endpoint.** The live tree calls it in exactly one place —
-- `modules/app/child-linking/lib/db-child-linking-store.ts` `invitePreview()` — at **`{ scope: "service" }`**,
-- with the reason written above the call: *"The anon path (02 §7): a signed-out visitor has no session to run
-- as."* `/invite/[token]` reaches it through `loadInviteLanding`, which uses that store. The only client-scope
-- caller is `lib/actions/bapp/child-invites.ts`'s `getInvitePreview()`, a legacy Sydney export that **nothing
-- imports** and which passes `invite_token:` to a function whose parameter is `p_token` — so it could not
-- succeed if it were called. `service_role` keeps EXECUTE, so the live path is untouched; asserted by the
-- verify block below.
revoke execute on function public.get_invite_preview(text) from anon, authenticated;

-- ★ The safeguarding guards' own predicate. `prevent_safeguarding_row_modification()` and
-- `prevent_safeguarding_record_loss()` are *invoker* triggers, so at first reading a client write would need
-- this — but the three tables that carry them (`verifications`, `vetting_submissions`,
-- `nanny_suspension_lifts`) have **SELECT-only** policies for `authenticated` and none at all for `anon`, so
-- no client write path exists that could fire them. Measured from `pg_policies`, not assumed.
revoke execute on function public.is_safeguarding_retention_job() from anon, authenticated;

-- CLIENT SURFACE — END

commit;

-- ---------------------------------------------------------------------------
-- Verify — effective privilege, the roads an ACL read cannot see, and one refusal driven live.
-- ---------------------------------------------------------------------------
do $$
declare
  v_authed   text[];
  v_anon     text[];
  v_kept     text[] := array[
    'public.claim_verification_processing()',
    'public.create_child_invite(uuid, invite_direction, text)',
    'public.create_parent_profile(text, text, text)',
    'public.current_nanny_id()',
    'public.current_parent_id()',
    'public.family_access_reason(uuid)',
    'public.get_pending_invites_for_recipient()',
    'public.is_active_nanny()',
    'public.is_admin()',
    'public.is_nanny()',
    'public.is_parent()',
    'public.is_privileged_writer()',
    'public.lift_nanny_isolation()',
    'public.nanny_visible(boolean, verification_level)',
    'public.revoke_child_invite(uuid, invite_revoked_reason)',
    'public.save_verification_contact()',
    'public.submit_verification_evidence(uuid, verification_section, text, text, vetting_submission_status, jsonb)',
    'public.update_nanny_profile(jsonb, jsonb)',
    'public.user_has_child_access(uuid)'];
  v_anon_kept text[] := array['public.nanny_visible(boolean, verification_level)'];
  v_count    int;
  v_lang     text;
  v_vol      "char";
begin
  -- 1. ★ Effective, not direct: a grant can arrive through `PUBLIC` or through role membership, and `3i`'s
  --    reviewers both went round a direct-ACL read.
  select array_agg(sig order by sig) into v_authed from (
    select 'public.' || p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')' as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'EXECUTE')) s;
  if v_authed is distinct from v_kept then
    raise exception '0035: authenticated reaches % — the enumerated set is %', v_authed, v_kept;
  end if;

  select array_agg(sig order by sig) into v_anon from (
    select 'public.' || p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')' as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')) s;
  if v_anon is distinct from v_anon_kept then
    raise exception '0035: anon reaches % — the enumerated set is %', v_anon, v_anon_kept;
  end if;

  -- 2. ★ The route round the enumeration: a grant to `PUBLIC` reaches both client roles without naming
  --    either, and it is the default for every function created after this file.
  select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace, lateral aclexplode(p.proacl) a
   where n.nspname = 'public' and a.grantee = 0 and a.privilege_type = 'EXECUTE';
  if v_count <> 0 then
    raise exception '0035: % function(s) in public are executable by PUBLIC', v_count;
  end if;

  -- 3. ★ And the other two roads: a grantable EXECUTE, and membership pointing the wrong way.
  select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace, lateral aclexplode(p.proacl) a
   where n.nspname = 'public' and a.is_grantable and a.privilege_type = 'EXECUTE';
  if v_count <> 0 then
    raise exception '0035: % EXECUTE grant(s) in public are grantable — a client role could hand the surface on', v_count;
  end if;
  select count(*) into v_count
    from pg_auth_members am
    join pg_roles r on r.oid = am.roleid
    join pg_roles g on g.oid = am.member
   where g.rolname in ('anon', 'authenticated');
  if v_count <> 0 then
    raise exception '0035: a client role is a member of % other role(s) and inherits their grants', v_count;
  end if;

  -- 4. ★ Default privileges, and **the limit we cannot close, named rather than hidden** (ADR-180's rule).
  --
  --    There are two `pg_default_acl` rows for functions in `public`. The one we own — `for role postgres`,
  --    written by `0000:329` — is `{postgres=X, service_role=X}` and names no client role. **The other is
  --    `supabase_admin`'s, and it grants `anon` and `authenticated` EXECUTE on every function that role
  --    creates.** We cannot touch it: `postgres` is not a superuser here and
  --    `alter default privileges for role supabase_admin …` answers *"permission denied to change default
  --    privileges"* — driven, not assumed.
  --
  --    Why it does not bite today, stated so the next reader does not have to re-derive it: every migration
  --    in this tree runs as `postgres`, and **no function in `public` is owned by `supabase_admin`** — which
  --    is what this arm asserts, together with the ownership half. A function created through the Supabase
  --    dashboard *as that role* would land on the client surface the moment it existed, and the only thing
  --    that would catch it is `int.client-functions` reading the live catalogue on the next run. That is
  --    `3j`'s D-3 again and it is why arm 1 above is the control rather than this file.
  select count(*) into v_count
    from pg_default_acl
   where defaclobjtype = 'f' and defaclnamespace = 'public'::regnamespace
     and defaclrole <> 'supabase_admin'::regrole
     and defaclacl::text ~ '(anon|authenticated)=';
  if v_count <> 0 then
    raise exception '0035: a default privilege we own grants a client role EXECUTE on every future function in public';
  end if;
  select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and pg_get_userbyid(p.proowner) = 'supabase_admin';
  if v_count <> 0 then
    raise exception '0035: % function(s) in public are owned by supabase_admin and therefore inherit its client default', v_count;
  end if;

  -- 5. ★ `nanny_visible` is the inlinable shape, which is the whole reason revoking it cannot break
  --    `nannies_matching_idx` (the header's `3i` / `3j` note). If it is ever rewritten as plpgsql this fails.
  select l.lanname, p.provolatile into v_lang, v_vol
    from pg_proc p join pg_language l on l.oid = p.prolang
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'nanny_visible';
  if v_lang is distinct from 'sql' or v_vol is distinct from 'i' or
     exists (select 1 from pg_proc p2 join pg_namespace n2 on n2.oid = p2.pronamespace
              where n2.nspname = 'public' and p2.proname = 'nanny_visible' and p2.prosecdef) then
    raise exception '0035: nanny_visible is % / %, not an inlinable sql IMMUTABLE invoker — the index predicate would now check EXECUTE', v_lang, v_vol;
  end if;

  -- 7. ★ The invite preview left the client surface but not the app: `service_role` is how it is reached.
  if not has_function_privilege('service_role', 'public.get_invite_preview(text)', 'EXECUTE') then
    raise exception '0035: get_invite_preview is unreachable by service_role — /invite/[token] is broken';
  end if;

  -- 8. ★ Driven rather than asserted: the sharpest revocation, refused as the role that had it.
  begin
    set local role anon;
    perform public.nanny_is_visible('00000000-0000-4000-8000-000000000000'::uuid);
    reset role;
    raise exception '0035: anon can still call nanny_is_visible — REVIEW-4 L-2 is open';
  exception
    when insufficient_privilege then reset role;  -- the revoke fired, which is the point
  end;
end;
$$;
