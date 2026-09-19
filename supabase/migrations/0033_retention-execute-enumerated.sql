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
-- ★ **The index-predicate row deserves its own paragraph, because the first draft of this file got it wrong
-- and a reviewer drove the opposite result.** `3i` recorded that an index predicate's EXECUTE *is* checked
-- (`nanny_visible()` on `nannies`); this file first said it is not. **Both measurements were correct, on
-- different function shapes, and the variable is inlining:**
--
--   | predicate function                              | INSERT | UPDATE | DELETE |
--   |-------------------------------------------------|--------|--------|--------|
--   | `language sql` IMMUTABLE, not a definer (inlinable) | OK  | OK     | OK     |
--   | `language plpgsql` (not inlinable)              | 42501  | 42501  | OK     |
--
-- An inlinable SQL function is folded into the plan and never called, so no privilege is consulted; anything
-- else is a real call and is checked on INSERT and UPDATE (never on DELETE — removing an index entry does not
-- re-evaluate the predicate). `nanny_visible(boolean, verification_level)` is `language sql` IMMUTABLE and not
-- a definer, so it is inlined and the retention role does not need EXECUTE on it — which is why
-- `int.account-erasure` is green today with `has_function_privilege` **false** for it.
--
-- ⚠️ **That makes it load-bearing and fragile.** Rewriting `nanny_visible` in plpgsql, or making it
-- `SECURITY DEFINER`, or granting the retention role a real UPDATE on `nannies`, would each make a retention
-- write raise `42501 permission denied for function nanny_visible` with nothing in the diff to explain it. So
-- it is not left to a comment: `int.retention-execute` asserts that **every** function reached by an index
-- predicate, CHECK constraint or column DEFAULT on a table this role may INSERT or UPDATE is either in the
-- enumerated set **or** still of the inlinable shape. `pg_depend` says `nannies_matching_idx` is the schema's
-- only such object today, which is what keeps that assertion cheap.
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
--   · ★ **It drops `0030:177`'s grant on `subjects_ready_to_purge(timestamptz, integer)` and does not re-grant
--     it** (database pass, HIGH — I had removed it without noticing, which is the point of the finding). It is
--     the one post-`0016` explicit retention EXECUTE grant this file takes. It is **not** re-granted, because
--     the rule this file sets is that a function no job calls gets nothing and nothing calls it as this role:
--     `src/boot/privacy-purge-ops.ts` reaches it by `q.rpc(...)` with `scope: "service"`, and `set role`
--     appears nowhere in `src/` or `scripts/`, so the grant was already dead when this file found it.
--     ⚠️ **And the reviewer found something worse while proving that:** the function is `SECURITY INVOKER`, and
--     `0028:293` revoked `account_erasure_requests` from `service_role`, so **the purge's candidate listing has
--     been broken since `0028` on the one path the application actually uses** — `42501 permission denied for
--     table account_erasure_requests`. That is `0028`/`0030`'s defect, not this file's, it is unchanged by this
--     file, and it is recorded as this unit's Q-1 rather than fixed here, because a retention *job* repair
--     riding inside a privilege PR is the shape ADR-185 forbids.
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
-- ⚠️ **One transaction for the privilege change, and the verify block is deliberately outside it** — `0032`'s
-- shape, and the cost is worth stating rather than the header claiming otherwise (database pass, MEDIUM). The
-- assertions read **committed** state, which is what makes a passing claim a claim about the database an
-- operator will find. The price is that a verify failure leaves the grants applied and the migration
-- unrecorded: the recovery is to fix forward and re-run, not to reach for the twin, which is forbidden from
-- restoring anything. The first draft of this file failed its own verify block on the first apply, and that
-- apply had already changed the database — exactly the shape being described.

begin;

-- ---------------------------------------------------------------------------
-- 1. The blanket grants go — both of them.
--
-- The second statement is not a widening: `0016:279` already revokes EXECUTE from `PUBLIC` on every function
-- that existed then, and this re-states it over the three created since. `PUBLIC` is a distinct grantee from
-- `anon` and `authenticated`, so no named client grant is touched — see "what this file does not do".
-- ---------------------------------------------------------------------------

-- ⚠️ **`ALL ROUTINES`, not `ALL FUNCTIONS`** (database pass, MEDIUM). `ON ALL FUNCTIONS` covers functions and
-- aggregates and **not procedures**, which need `ON ALL PROCEDURES` or `ON ALL ROUTINES`. There is no procedure
-- in `public` today (`prokind = 'p'` count is 0) and the gate *would* catch one, since it reads `pg_proc`
-- unfiltered — but an operator reacting to that red gate by copying this statement would find the procedure
-- still reachable, and a remediation that does not work is worse than none. Driven: after
-- `revoke execute on all functions`, a newly created procedure was **still callable** by the role.
revoke execute on all routines in schema public from bbldn_retention;
revoke execute on all routines in schema public from public;

-- ---------------------------------------------------------------------------
-- 2. ENUMERATED FUNCTIONS — START
--
-- One line per function with the reason it is there and how it is reached. A function no job calls has no
-- line, and therefore no privilege.
-- ---------------------------------------------------------------------------

-- 2a. The erasure's and the purge's own escalations (ADR-183) -----------------------------------------------
--
-- `auth`'s privileges are not re-grantable, so 07 §6.1 step 5 cannot run under the retention role directly.
-- These three are `postgres`-owned definers with one statement each, and `erase_account` /
-- `purge_scrubbed_user` call them by name from inside their own bodies.
--
-- ⚠️ **"One statement each" is not the same as "narrow", and a reviewer was right to press on it.**
-- `scrub_auth_user` and `purge_auth_user` carry **no precondition of their own** — no state check, no window,
-- no ownership test. Every gate that makes them safe lives in the caller. And `purge_auth_user`'s single
-- `delete from auth.users` fans out over **13 `ON DELETE CASCADE` and ~30 `ON DELETE SET NULL`** keys from
-- `public`, reaching `user_roles`, `development_images`, `child_invites` and `subscribe_invites` — tables this
-- role holds no DELETE on and which are not among `0032`'s 33 relations at all. That is this file's own
-- thesis turned on it: the privilege being exercised is not the caller's.
--
-- So these three are **pinned to their callers** (verify block section 7b, and three cases in
-- `int.retention-execute`), because a grant that says *who* may call and never *from where* closes nothing for
-- the functions it keeps.

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
  -- ★ **With identity arguments, not bare names** (security pass, MEDIUM). The first draft compared
  -- `nspname || '.' || proname`, so a `SECURITY DEFINER` **overload** — `scrub_auth_user(uuid, text)`, owned by
  -- `postgres`, granted to this role — walked straight past this block while the suite caught it. Belt failed,
  -- braces held; a migration applied without `int.retention-execute` therefore got nothing from section 4's
  -- headline claim that "adding one fails the apply". Driven by the reviewer, closed here.
  v_named   text[] := array[
    'public.auth_user_purge_state(p_user_id uuid)',
    'public.collect_erasure_objects(p_user_id uuid)',
    'public.erase_account(p_user_id uuid, p_request_id uuid, p_deleted_objects jsonb)',
    'public.is_privileged_writer()',
    'public.is_retention_job()',
    'public.is_safeguarding_retention_job()',
    'public.money_last_activity_at(p_user_id uuid)',
    'public.pseudonymise_safeguarding_subject()',
    'public.purge_auth_user(p_user_id uuid)',
    'public.purge_scrubbed_user(p_user_id uuid, p_windows jsonb)',
    'public.retention_sweep_class(p_class text, p_spec jsonb, p_limit integer)',
    'public.scrub_auth_user(p_user_id uuid)'
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
      select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as fn
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
  -- ★ **`grantee = 0` as well as the role** (security pass, MEDIUM). Checking only the direct form leaves the
  -- one grantee that reaches this role without naming it: `alter default privileges … grant execute on
  -- functions to PUBLIC` arms the rule for every function created afterwards, and a migration that arms it and
  -- creates no function passed this block clean, leaving the trap for whoever adds the next one. Driven by the
  -- reviewer; one operand closes it.
  if exists (
    select 1 from pg_default_acl d, lateral aclexplode(d.defaclacl) a
     where a.grantee in ('bbldn_retention'::regrole, 0)
       and a.privilege_type = 'EXECUTE'
       and d.defaclobjtype in ('f', 'p')
  ) then
    raise exception '0033: a default-privilege rule grants EXECUTE on every routine created from now on, to bbldn_retention or to PUBLIC';
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

  -- 7b. ★ **The enumeration says *who* may call; this says *from where*** (security pass, HIGH — the finding
  --     that matters most in this file). Sections 1 and 2 close the escalation for the 76 functions they
  --     revoked and leave it open for the 12 they kept. Two of those twelve — `scrub_auth_user` and
  --     `purge_auth_user` — are **unconditional account destruction with no precondition of their own**:
  --     every gate lives in the intended caller. A reviewer added one line to the existing body of
  --     `retention_sweep_class` (no new function, no new grant, owner and `search_path` preserved), called it
  --     as this role, and deleted an arbitrary `auth.users` row — an admin — with `public.user_roles`
  --     cascading away behind it, a table `has_table_privilege` says this role cannot DELETE and which is not
  --     among `0032`'s 33 relations. Every assertion above stayed green.
  --
  --     So the pair is the unit. `int.retention-execute` checks all three pins over normalised bodies; this
  --     is the apply-time half, deliberately blunt — a substring over `prosrc` — because a migration applied
  --     without the suite must still not be able to add the call.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and pg_get_userbyid(p.proowner) = 'bbldn_retention'
       and p.proname <> 'erase_account'
       and p.prosrc like '%public.scrub\_auth\_user%'
  ) then
    raise exception '0033: a retention-owned body other than erase_account() names scrub_auth_user() — an unconditional auth tombstone whose only gate is its caller';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and pg_get_userbyid(p.proowner) = 'bbldn_retention'
       and p.proname <> 'purge_scrubbed_user'
       and (p.prosrc like '%public.purge\_auth\_user%' or p.prosrc like '%public.auth\_user\_purge\_state%')
  ) then
    raise exception '0033: a retention-owned body other than purge_scrubbed_user() names purge_auth_user() — an unconditional account delete that cascades past every table grant';
  end if;
  -- …and the two pins guard something: the intended callers really do name them, or the check is theatre.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'erase_account'
       and p.prosrc like '%public.scrub\_auth\_user%'
  ) or not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'purge_scrubbed_user'
       and p.prosrc like '%public.purge\_auth\_user%'
  ) then
    raise exception '0033: a pinned escalation is not named by the caller it is pinned to — the pin protects nothing';
  end if;

  -- 8. ★ **The reach question is asked of every schema, not only `public`** (database pass, HIGH). Every
  --    assertion above filters `nspname = 'public'`, so a `0034` that creates `zz_jobs` and a definer inside
  --    it would escalate with all of them green — the reviewer drove exactly that and got `postgres` back
  --    from a function the gate never looked at. A function in a schema the role cannot enter is unreachable
  --    whatever its ACL says, so the cheap and total form of the question is the schema list.
  --
  --    ⚠️ `auth` is the one that matters and it was asserted **nowhere**: ADR-183's whole premise is that
  --    `auth`'s privileges are not re-grantable, and what actually stops the role is USAGE — `select auth.uid()`
  --    answers `42501 permission denied for schema auth`. That fact now has a line.
  if exists (
    select 1 from pg_namespace n
     where n.nspname not in ('public', 'storage', 'pg_catalog', 'information_schema')
       and n.nspname not like 'pg_%'
       and has_schema_privilege('bbldn_retention', n.oid, 'USAGE')
  ) then
    raise exception '0033: bbldn_retention holds USAGE on a schema beyond public and storage — the enumeration does not reach there: %',
      (select array_agg(n.nspname order by n.nspname) from pg_namespace n
        where n.nspname not in ('public','storage','pg_catalog','information_schema')
          and n.nspname not like 'pg_%'
          and has_schema_privilege('bbldn_retention', n.oid, 'USAGE'));
  end if;
  if has_schema_privilege('bbldn_retention', 'auth', 'USAGE') then
    raise exception '0033: bbldn_retention can enter the auth schema — ADR-183''s narrow definers are no longer the only road';
  end if;

  -- 9. ★ **Trigger dispatch is the third road, and neither half above watches it** (database pass, HIGH, and
  --    the sharpest finding of the pass). A `SECURITY DEFINER` trigger function owned by `postgres` runs as
  --    `postgres` when a retention write fires it — while `has_function_privilege` for this role is **false**
  --    (a firing trigger checks no EXECUTE, §"what the role actually needs" layer 2) and the call appears in
  --    no body, because it is dispatch rather than text. The reviewer demonstrated the write end to end.
  --
  --    So the overlap is **enumerated**, like everything else here: a foreign-owned definer trigger may fire on
  --    an event this role can perform only if it is named below with its reason. Two are, and one of them —
  --    `nanny_placements_enforce_i3` — genuinely fires on `0028`'s UPDATE today. Both bodies are read-only
  --    (they read and raise), which is why this is a boundary to hold rather than a hole to close.
  if exists (
    select 1
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_proc p on p.oid = t.tgfoid
     where not t.tgisinternal
       and p.prosecdef
       and pg_get_userbyid(p.proowner) <> 'bbldn_retention'
       and (   ((t.tgtype::int &  4) <> 0 and has_table_privilege('bbldn_retention', c.oid, 'INSERT'))
            or ((t.tgtype::int &  8) <> 0 and has_table_privilege('bbldn_retention', c.oid, 'DELETE'))
            or ((t.tgtype::int & 16) <> 0 and (has_table_privilege('bbldn_retention', c.oid, 'UPDATE')
                                               or has_any_column_privilege('bbldn_retention', c.oid, 'UPDATE'))))
       and t.tgname <> all (array['nanny_placements_enforce_i3', 'nannies_guard_vaccination_consent'])
  ) then
    raise exception '0033: a SECURITY DEFINER trigger owned by another role fires on a retention write and is not enumerated: %',
      (select array_agg(t.tgname order by t.tgname)
         from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid
        where not t.tgisinternal and p.prosecdef
          and pg_get_userbyid(p.proowner) <> 'bbldn_retention'
          and (   ((t.tgtype::int &  4) <> 0 and has_table_privilege('bbldn_retention', c.oid, 'INSERT'))
               or ((t.tgtype::int &  8) <> 0 and has_table_privilege('bbldn_retention', c.oid, 'DELETE'))
               or ((t.tgtype::int & 16) <> 0 and (has_table_privilege('bbldn_retention', c.oid, 'UPDATE')
                                                  or has_any_column_privilege('bbldn_retention', c.oid, 'UPDATE'))))
          and t.tgname <> all (array['nanny_placements_enforce_i3', 'nannies_guard_vaccination_consent']));
  end if;
end;
$$;
