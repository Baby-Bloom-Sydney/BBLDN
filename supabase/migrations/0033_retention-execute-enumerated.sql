-- 0033_retention-execute-enumerated.sql — **ADR-185, one layer over: the blanket function grant goes**
-- (L-009 `3j`; `3i`'s Q-1).
--
-- `0032` revoked `0016:288`'s blanket **table** grant and replaced it with 33 enumerated relations. `0016:291`
-- is the same statement about functions:
--
--     grant execute on all functions in schema public to bbldn_retention;
--
-- ADR-185 rules that "one blanket grant outranks every narrow one, so the blanket grant goes". Nothing in that
-- sentence is about tables. This file is the same revoke, the same enumeration with a reason per line, and the
-- same gate, applied to `pg_proc`. **No new ADR is needed** — ADR-185's own words reach here.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ★ WHY THIS MATTERS MORE THAN `0032` DID, NOT LESS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- The three retention jobs run through six `SECURITY DEFINER` functions **owned by `bbldn_retention`**
-- (`erase_account`, `collect_erasure_objects`, `purge_scrubbed_user`, `retention_sweep_class`,
-- `pseudonymise_safeguarding_subject`, `money_last_activity_at`). Every statement inside them executes with
-- that identity — and `0016:291` meant that identity could call **38 SECURITY DEFINER functions, 33 of them
-- owned by `postgres`**.
--
-- So one line added tomorrow inside `erase_account` —
--
--     perform public.open_dfy_access(v_parent, v_placement, 7, 14);
--
-- — runs with **`postgres`'s** privilege by ordinary `SECURITY DEFINER` semantics, and reaches every table
-- `0032` had just put out of reach. **No table grant can close that**, because the privilege being exercised
-- is not the caller's. And unlike the table surface, nothing today would notice: `int.retention-grants` reads
-- relation ACLs and would stay green throughout.
--
-- This is not hypothetical arithmetic. Driven as `bbldn_retention` on `0000`–`0032` applied from empty, before
-- this file existed, **`select public.set_access_window(gen_random_uuid(), 5)` returned successfully** — the
-- retention identity moving a family's access-end window through a `postgres`-owned definer. `open_dfy_access`,
-- `start_family_trial_if_first` and `connect_child_invite` all passed the privilege check too and failed only
-- on their own business logic. The capability was real; only the caller was missing.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT WAS MEASURED, BEFORE ANYTHING HERE WAS WRITTEN
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- From `pg_proc.proacl` and — where the ACL cannot see it — from `has_function_privilege`, which is `3i`'s D-3
-- taken as the starting method rather than rediscovered, because both of its reviewers went round a
-- direct-grant read.
--
--   · **88** functions in `public`; **56** effectively executable by `bbldn_retention`.
--   · A direct-ACL read would have said **53** — exactly the functions that existed at `0016`, which is the
--     same migration-order rule `0032` found for tables, and the reason the 32 functions created in
--     `0017`–`0031` are unreachable (`nanny_visible()` among them).
--   · The other **3** are reachable only through **`EXECUTE TO PUBLIC`**: `0016:279` revokes EXECUTE from
--     `public, anon, authenticated` **once**, at `0016`, and a function created afterwards defaults straight
--     back to `EXECUTE TO PUBLIC`. `position_call_mirror_no_answer_count_never_falls()` (`0018`),
--     `prevent_erasure_request_modification()` (`0028`) and `refuse_primary_key_rewrite()` (`0032`) all have
--     it. `0016`'s own comment — "the sweep is what makes the list closed" — has not been true since `0018`.
--     All three are trigger functions, which bounds it today; the defect is that nothing noticed.
--   · **0** grantable EXECUTE, **0** `pg_default_acl` entries for functions, and `0032` already asserts role
--     membership empty in both directions. Those are the other three routes round a direct read.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ★ WHAT THE ROLE ACTUALLY NEEDS — TRACED IN TWO LAYERS, BECAUSE ONE LAYER WOULD HAVE BEEN WRONG
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- **Layer 1, the bodies.** All six retention-owned functions pin `search_path=""`, so every call they make
-- *must* be schema-qualified — which makes a scan of `prosrc` exhaustive rather than a heuristic. It finds
-- four: `scrub_auth_user`, `purge_auth_user`, `auth_user_purge_state` and `money_last_activity_at`.
--
-- **Layer 2, what the guard triggers call.** `0016:291`'s own comment justifies itself as "EXECUTE on the
-- trigger functions the writes fire, or every write raises permission denied". Driven on the local stack
-- against temporary objects rather than read:
--
--   | construct                                             | checks the firing role's EXECUTE? |
--   |-------------------------------------------------------|-----------------------------------|
--   | `BEFORE INSERT` / `UPDATE` / `DELETE` trigger function | **no**                            |
--   | partial-index **predicate** function                   | **no**                            |
--   | `CHECK` constraint function                            | **yes** (INSERT, and any UPDATE)  |
--   | column `DEFAULT` function                              | **yes**, when the default is used |
--
-- So the comment is **wrong about the trigger function and right one layer down**: the trigger function needs
-- nothing, but a **non-`SECURITY DEFINER`** trigger body runs as the *invoking* role, so the functions **it**
-- calls do need the privilege. Enumerating the triggers on `0032`'s 33 tables gives exactly three such
-- callees — `is_retention_job()`, `is_safeguarding_retention_job()` and `is_privileged_writer()` — reached
-- through `prevent_row_modification`, `prevent_cookie_consent_modification`,
-- `prevent_erasure_request_modification`, `prevent_safeguarding_row_modification`,
-- `prevent_safeguarding_record_loss` and the four `guard_*` column guards.
--
-- This also corrects one sentence of `3i`'s: it recorded that an index predicate's EXECUTE *is* checked
-- (`nanny_visible()` on `nannies`). Measured here, index maintenance checks nothing — and `pg_depend` says
-- `nannies_matching_idx` is the schema's **only** index, constraint or default depending on a `public`
-- function at all, so nothing in the enumerated set turns on it.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ★ THE RULE THIS FILE ESTABLISHES, FOR WHOEVER WRITES THE NEXT MIGRATION
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- **A new function gets no retention EXECUTE. The default is nothing, and it stays nothing until somebody asks
-- for it on purpose** — and never again `on all functions in schema public`.
--
-- ⚠️ Unlike `0032`'s rule for tables, **Postgres does not do this for you.** A new table's default is genuinely
-- nothing; a new function's default is `EXECUTE TO PUBLIC`, which reaches this role and every other. That is
-- why section 1 revokes from `PUBLIC` as well, and why `int.retention-execute` asserts no `public` function is
-- PUBLIC-executable — the assertion is what makes the rule true of `0034` rather than only of today.
--
-- To add one: write it into section 2 **and** into `ENUMERATED_FUNCTIONS` in
-- `supabase/__tests__/retention-execute.test.ts`, with its reason and how it is reached. The two lists must
-- name the same functions or `integration` fails.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS FILE DELIBERATELY DOES NOT DO — stated, not implied (ADR-180's condition)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
--
--   · **It does not revoke EXECUTE from `anon` or `authenticated`.** Those are named grantees, not `PUBLIC`,
--     and twelve functions created after `0016` hold deliberate grants to them (`0021`–`0023`'s wizard writes,
--     `nanny_is_visible`, `create_parent_profile`, and more). A blanket revoke there would break the
--     application, and narrowing the client surface is `0016:279`/`:293`'s own list to re-open, not this
--     unit's passenger. **Recorded as this unit's Q-2.**
--   · **It does not touch `storage` or `auth`.** `storage`'s 17 functions carry no ACL at all — Supabase's
--     platform default, `EXECUTE TO PUBLIC`, owned by `supabase_storage_admin` — and `auth`'s four
--     (`uid()`, `role()`, `jwt()`, `email()`) are PUBLIC by the platform's design and are what every RLS
--     policy in the tree calls. Revoking either would be this tree breaking the platform underneath it. The
--     limit is real and is written here rather than left for a reader to discover, exactly as ADR-180 requires
--     of `is_safeguarding_retention_job()`'s `set role` reach.
--   · **It cannot remove the owner's EXECUTE in substance.** The six functions marked `via: "owner"` in the
--     suite are owned by `bbldn_retention`; revoking EXECUTE from the owner of a function is theatre, because
--     the owner can re-grant at will. They are listed with the others rather than quietly omitted, and
--     `money_last_activity_at` is genuinely exercised from inside `retention_sweep_class`.
--   · **It changes no function body, no policy, no constraint and no row.** It is a privilege change and
--     nothing else, so that what breaks — if anything breaks — is unambiguous.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- WHERE THE GATE LIVES
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- `int.retention-execute`, in the **`integration`** job beside `int.retention-grants`, for `0032`'s reason: the
-- fact lives in the catalogue of a database with every migration applied, and `config-gates` has none. The
-- verify block below is the belt and runs at this file's apply time; the suite is the braces and runs after the
-- whole set, so it is the only thing that can catch a blanket grant added in `0034`.
--
-- The suite carries a **second** half the verify block cannot: it reads every retention-owned **body** and
-- fails if one references a `public` function outside the enumerated set. The privilege half stops the call at
-- run time; the body half stops it in review, which is where `perform public.open_dfy_access(...)` would
-- actually be seen. That half is sound rather than approximate **only because `search_path=""` is pinned** —
-- already asserted by `db.constraints`, and re-asserted in the suite because it is the suite's own precondition.
--
-- ⚠️ **With one limit, measured and stated rather than glossed:** `search_path` makes the scan exhaustive for
-- calls *written into* a body, and does nothing about a name assembled at run time. `purge_scrubbed_user`
-- contains one `execute format(...)` — a fixed `select exists` template with two `%I` identifier slots, the
-- subject bound as `$1`, no `%s` and no call site. So the suite **enumerates the dynamic SQL too**, on the same
-- rule as the privilege half: a new `execute` in a retention-owned body fails CI and is read by a person.
-- Driven both ways — a second `execute format` building a call into a `%s` slot fails two cases.
--
-- One transaction. A half-applied privilege change is a schema nobody can reason about.

begin;

-- ---------------------------------------------------------------------------
-- 1. The blanket grants go — both of them.
--
-- The second statement is not a widening: `0016:279` already revokes EXECUTE from `PUBLIC` on every function
-- that existed then, and this re-states it over the three created since. `PUBLIC` is a distinct grantee from
-- `anon` and `authenticated`, so no named client grant is touched — see "what this file does not do".
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from bbldn_retention;
revoke execute on all functions in schema public from public;

-- ---------------------------------------------------------------------------
-- 2. ENUMERATED FUNCTIONS — START
--
-- One line per function with the reason it is there and how it is reached. A function no job calls has no
-- line, and therefore no privilege.
-- ---------------------------------------------------------------------------

-- 2a. The erasure's and the purge's own narrow escalations (ADR-183) ----------------------------------------
--
-- `auth`'s privileges are not re-grantable, so 07 §6.1 step 5 cannot run under the retention role directly.
-- These three are `postgres`-owned definers with one job each, and `erase_account` / `purge_scrubbed_user`
-- call them by name from inside their own bodies.

-- 07 §6.1 step 5: the tombstone and the ban on one `auth.users` row, and nothing else
grant execute on function public.scrub_auth_user(uuid)           to bbldn_retention;
-- 07 §6.1 step 6: the 30-day hard delete of that row
grant execute on function public.purge_auth_user(uuid)           to bbldn_retention;
-- the precondition read: is the row already scrubbed and banned?
grant execute on function public.auth_user_purge_state(uuid)     to bbldn_retention;

-- 2b. What the guard triggers call while running as this role -----------------------------------------------
--
-- ★ Not the trigger functions themselves — a firing trigger checks no EXECUTE (measured). These are the
-- predicates the **non-SECURITY DEFINER** guard bodies call, which therefore run as `bbldn_retention`. Without
-- these three, every delete and every pseudonymising update the three jobs make raises `42501` from inside a
-- trigger, which is the true half of `0016:291`'s justification.

-- prevent_row_modification · prevent_erasure_request_modification · prevent_cookie_consent_modification —
-- the append-only exemption ADR-180 narrowed to this one role
grant execute on function public.is_retention_job()              to bbldn_retention;
-- prevent_safeguarding_row_modification · prevent_safeguarding_record_loss, on ADR-170's three tables
grant execute on function public.is_safeguarding_retention_job() to bbldn_retention;
-- the four guard_* column guards (children, user_profiles, inbox_messages, admin_notifications) and
-- prevent_cookie_consent_modification
grant execute on function public.is_privileged_writer()          to bbldn_retention;

-- 2c. The three jobs' own functions, owned by this role ------------------------------------------------------
--
-- Ownership, not a grant this file controls — see "what this file does not do". Listed so the set is the whole
-- truth about what the identity can call.

-- 0028's entry point, invoked by service_role and running as bbldn_retention
grant execute on function public.erase_account(uuid, uuid, jsonb) to bbldn_retention;
-- 0028 reads the subject's storage paths by prefix
grant execute on function public.collect_erasure_objects(uuid)   to bbldn_retention;
-- 0030's entry point
grant execute on function public.purge_scrubbed_user(uuid, jsonb) to bbldn_retention;
-- 0031's entry point, one class per bounded batch per transaction
grant execute on function public.retention_sweep_class(text, jsonb, integer) to bbldn_retention;
-- 0027's BEFORE DELETE trigger on `nannies`; ownership only, since a firing trigger checks no EXECUTE
grant execute on function public.pseudonymise_safeguarding_subject() to bbldn_retention;
-- ★ genuinely exercised: `retention_sweep_class`'s money class anchors on it, from inside its own body
grant execute on function public.money_last_activity_at(uuid)    to bbldn_retention;

-- ENUMERATED FUNCTIONS — END
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 3. The three PUBLIC grants section 1 removed, re-granted to the roles that were always meant to have them.
--
-- All three are trigger functions created after `0016:279`'s one-shot sweep, so they inherited
-- `EXECUTE TO PUBLIC` by default. `postgres` and `service_role` already hold each by name; this block exists
-- only so the diff says out loud that nothing was left without a caller. It re-grants nothing to `PUBLIC`.
-- ---------------------------------------------------------------------------

grant execute on function public.position_call_mirror_no_answer_count_never_falls() to service_role;
grant execute on function public.prevent_erasure_request_modification()             to service_role;
grant execute on function public.refuse_primary_key_rewrite()                       to service_role;

commit;

-- ---------------------------------------------------------------------------
-- 4. Verify — what this file claims, asserted rather than described.
--
-- Outside the transaction on purpose (`0032`'s shape): it reads the committed state, so a claim that passes is
-- a claim about the database an operator will find.
-- ---------------------------------------------------------------------------

do $$
declare
  v_named   text[] := array[
    'public.auth_user_purge_state', 'public.collect_erasure_objects', 'public.erase_account',
    'public.is_privileged_writer', 'public.is_retention_job', 'public.is_safeguarding_retention_job',
    'public.money_last_activity_at', 'public.pseudonymise_safeguarding_subject',
    'public.purge_auth_user', 'public.purge_scrubbed_user', 'public.retention_sweep_class',
    'public.scrub_auth_user'
  ];
  v_held    text[];
  v_extra   text[];
  v_missing text[];
  v_definers text[];
  v_public  text[];
begin
  select coalesce(array_agg(distinct fn order by fn), '{}')
    into v_held
    from (
      select n.nspname || '.' || p.proname as fn
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and has_function_privilege('bbldn_retention', p.oid, 'EXECUTE')
    ) s;

  -- 1. ★ ADR-185's claim, one layer over: the set held is the set named, in both directions, asked as an
  --    **effective** privilege so role membership, PUBLIC and ownership are all inside the answer.
  select coalesce(array_agg(x), '{}') into v_extra   from unnest(v_held)  x where x <> all (v_named);
  select coalesce(array_agg(x), '{}') into v_missing from unnest(v_named) x where x <> all (v_held);
  if array_length(v_extra, 1) is not null then
    raise exception '0033: bbldn_retention can still execute a function the enumerated set does not name: %', v_extra;
  end if;
  if array_length(v_missing, 1) is not null then
    raise exception '0033: the revoke took a function a retention job needs: %', v_missing;
  end if;

  -- 2. ★ The escalation path itself, stated as the thing it is.
  --
  --    ⚠️ **Three `postgres`-owned definers stay reachable, and that is not an oversight — it is ADR-183.**
  --    `auth`'s privileges are not re-grantable, so `scrub_auth_user`, `purge_auth_user` and
  --    `auth_user_purge_state` exist precisely to be the one narrow escalation 07 §6.1 steps 5 and 6 need.
  --    ADR-180's three conditions are met for each: the limit is stated here and in 07 §5.6, the reachable
  --    set is exactly these three, and a fourth requires an ADR. **This assertion is what makes "a fourth
  --    requires an ADR" true of the database rather than only of the prose** — adding one fails the apply.
  --
  --    (The first draft of this block asserted *zero* foreign definers and failed on its own first apply,
  --    naming these three. The claim was wrong, not the database; it is recorded because a verify block that
  --    catches its own author is the only evidence that it is doing anything.)
  select coalesce(array_agg(fn order by fn), '{}') into v_definers
    from (
      select n.nspname || '.' || p.proname as fn
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.prosecdef
         and pg_get_userbyid(p.proowner) <> 'bbldn_retention'
         and has_function_privilege('bbldn_retention', p.oid, 'EXECUTE')
         and n.nspname || '.' || p.proname <> all (array[
               'public.scrub_auth_user', 'public.purge_auth_user', 'public.auth_user_purge_state'
             ])
    ) s;
  if array_length(v_definers, 1) is not null then
    raise exception '0033: bbldn_retention can execute % SECURITY DEFINER(s) owned by another role, beyond ADR-183''s three: %',
      array_length(v_definers, 1), v_definers;
  end if;
  -- …and the three that do stay are the three, not two of them plus something else.
  if not (has_function_privilege('bbldn_retention', 'public.scrub_auth_user(uuid)', 'EXECUTE')
          and has_function_privilege('bbldn_retention', 'public.purge_auth_user(uuid)', 'EXECUTE')
          and has_function_privilege('bbldn_retention', 'public.auth_user_purge_state(uuid)', 'EXECUTE')) then
    raise exception '0033: an ADR-183 escalation the erasure or the purge needs is no longer reachable';
  end if;

  -- 3. ★ No function in `public` is PUBLIC-executable. This is the route round *any* enumeration of this role,
  --    and it is also `0016:279`'s own intent, which stopped being true at `0018`.
  select coalesce(array_agg(fn order by fn), '{}') into v_public
    from (
      select n.nspname || '.' || p.proname as fn
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace, lateral aclexplode(p.proacl) a
       where n.nspname = 'public' and a.grantee = 0 and a.privilege_type = 'EXECUTE'
    ) s;
  if array_length(v_public, 1) is not null then
    raise exception '0033: % function(s) in public are executable by PUBLIC: %',
      array_length(v_public, 1), v_public;
  end if;

  -- 4. ★ …and the three the revoke touched still have a caller, or this file broke the app to tidy a grant.
  if not has_function_privilege('service_role', 'public.refuse_primary_key_rewrite()', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.prevent_erasure_request_modification()', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.position_call_mirror_no_answer_count_never_falls()', 'EXECUTE') then
    raise exception '0033: a trigger function the revoke touched has no caller left';
  end if;

  -- 5. No grantable EXECUTE and no default-privilege rule for functions — the two routes that are invisible to
  --    a snapshot of today's ACLs (`3i`'s security pass, MEDIUM, applied here rather than rediscovered).
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace, lateral aclexplode(p.proacl) a
     where n.nspname = 'public' and a.grantee = 'bbldn_retention'::regrole
       and a.privilege_type = 'EXECUTE' and a.is_grantable
  ) then
    raise exception '0033: bbldn_retention holds a grantable EXECUTE and can widen itself';
  end if;
  if exists (
    select 1 from pg_default_acl d, lateral aclexplode(d.defaclacl) a
     where a.grantee = 'bbldn_retention'::regrole and d.defaclobjtype = 'f'
  ) then
    raise exception '0033: a default-privilege rule grants bbldn_retention EXECUTE on every function created from now on';
  end if;

  -- 6. ★ The body half's precondition. Every retention-owned function pins `search_path=""` — which is what
  --    makes a scan of its body exhaustive rather than a guess, and therefore what makes the suite's
  --    body-inspection case a control instead of a heuristic.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and pg_get_userbyid(p.proowner) = 'bbldn_retention'
       and coalesce(array_position(p.proconfig, 'search_path=""'), 0) = 0
  ) then
    raise exception '0033: a bbldn_retention-owned function does not pin search_path — body inspection cannot be trusted';
  end if;

  -- 7. USAGE on the schema survived, because section 1 is a revoke of function privileges and must not have
  --    been read as anything wider.
  if not has_schema_privilege('bbldn_retention', 'public', 'usage') then
    raise exception '0033: bbldn_retention lost USAGE on public and every grant above is unreachable';
  end if;
end;
$$;
