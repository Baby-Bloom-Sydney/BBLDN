-- 0034_purge-releases-its-own-references.sql — **B-49** (L-009 `3k`; `3j`'s Q-1, left deliberately unfixed
-- inside a privilege PR because ADR-185 says a privilege change is not a passenger on someone else's).
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- THE DEFECT, MEASURED BEFORE ANYTHING WAS CHANGED
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- **Every self-service erasure failed its 30-day purge, for ever.** Driven on the applied stack against a
-- properly scrubbed subject with a completed request 31 days old:
--
--     ERROR:  account_erasure_requests: UPDATE refused — the ledger is written by erase_account() alone
--     CONTEXT: SQL statement "UPDATE ONLY "public"."account_erasure_requests"
--                             SET "requested_by" = NULL WHERE $1 OPERATOR(pg_catalog.=) "requested_by""
--              SQL statement "delete from auth.users u where u.id = p_user_id"
--              PL/pgSQL function public.purge_auth_user(uuid) line 3
--
-- That `UPDATE ONLY` is Postgres' own referential action for `ON DELETE SET NULL`, and **it does not run as
-- the caller**. `purge_auth_user()` is a `SECURITY DEFINER` owned by the deploying role (ADR-183: `auth`'s
-- privileges are not re-grantable, so the delete cannot run under the retention identity), so the whole
-- cascade executes as `postgres`. `is_retention_job()` — `current_user in ('bbldn_retention',
-- 'supabase_admin')` — is therefore **false** inside it, and the append-only guard refuses.
--
-- ★ **The caller's identity genuinely does not reach the cascade, and that is the measurement this file turns
-- on.** Called under `set local role bbldn_retention`, with `select public.is_retention_job()` returning
-- **true** at the call site one statement earlier, the same refusal comes back. The definer's owner wins.
--
-- `create-privacy.ts:39` sets `requestedBy: input.subjectUserId`, so on the self-service road `requested_by`
-- is the subject and this fires for every subject. The admin road survived only because `requested_by` names
-- somebody else — and it would have failed the same way the day that admin's own account was purged.
--
-- **It is three keys, not one.** Every `ON DELETE SET NULL` key from `public` into `auth.users` whose table
-- carries an UPDATE guard that consults `is_retention_job()`, derived from the catalogue and each driven to
-- its refusal:
--
--   · `account_erasure_requests.requested_by` → `prevent_erasure_request_modification()` → `23001`
--   · `cookie_consent_records.user_id`        → `prevent_cookie_consent_modification()`  → `23001`
--   · `katie_prompt_edits.applied_by`         → `prevent_row_modification()`             → `23001`
--
-- Measured and **not** a defect, so that the next reader does not go looking: the *transitive* road is fine.
-- `nannies.user_id` is `on delete cascade` and every key beneath it (`verifications`, `vetting_submissions`,
-- `nanny_suspension_lifts`) is `set null` onto a guard that does not consult `is_retention_job()` for an
-- UPDATE — a nanny with a full safeguarding trail purges clean, driven both with and without a DBS row.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- WHY THIS IS NOT A WIDENING — ADR-186, which was ratified the morning this file was written
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- The one-line repair is to admit `postgres` to `is_retention_job()`. **That is the hole, not the fix.** The
-- guard's whole job is that exactly one identity may rewrite consent, cookie and erasure history; `postgres`
-- owns 33 `SECURITY DEFINER` functions in this schema and is the console's own identity, so admitting it
-- would hand a standing licence to every one of them and to anyone at a `psql` prompt. ADR-186's ruling is
-- that a privilege answer must say **from where**, not merely **who** — and "from inside any cascade any
-- `postgres`-owned definer happens to start" is the opposite of an answer.
--
-- So **the guard is not touched at all.** Its three bodies are byte-identical after this migration and a gate
-- asserts it. What changes is that the cascade is given nothing to do: `purge_scrubbed_user()` — the one body
-- entitled, owned by `bbldn_retention`, where the guard already passes — **releases its own references
-- immediately before the delete**. That is not a new idea in this file: `0030` already does exactly this for
-- `account_erasure_requests.subject_user_id`, in its own words, *"The ledger lets the subject go, explicitly
-- and before the delete, so the FK never has to act."* The defect is that the sentence was applied to one
-- column of one table when the catalogue named three.
--
-- ⚠️ **The first draft of this paragraph claimed the "from where" was *structural*. It was not, and the
-- security pass proved it** — see section 1b. ⚠️ And the text match has a second, smaller limit the reviewer
-- named and this file accepts rather than hides (`3j`'s D-2): a semantically identical call spelled
-- differently — positional `%1$I`, extra whitespace, `quote_ident()` instead of `format()` — would evade the
-- regex. It is **defence in depth, not the control**: the control is section 1b's trigger, which does not
-- care which body performs the write, or whether a body performs it at all. The capability does live in one body, and a gate does assert
-- that no second retention-owned body carries the release template; but a `prosrc` regex is a text match, not
-- a database control, and ad-hoc SQL under `set role bbldn_retention` never goes near it. What makes this
-- file safe is therefore **two** things, not one: the release lives in one body, *and* the value it may write
-- is constrained by a trigger that admits no role at all. The second is the structural half.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS COSTS IN PRIVILEGE — two column grants, and why they are the narrowest thing that works
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- `bbldn_retention` already holds table-level `select, update` on `account_erasure_requests` (`0032` §1), so
-- the ledger needs nothing new. The other two do:
--
--   · `cookie_consent_records` — held `select, delete, update (id)`; `update (id)` is `3i`'s row lock. The
--     release needs `update (user_id)` and nothing else, so the consent choice, its flags, its IP and its
--     expiry stay unwritable by this identity. Asserted by driving an UPDATE of `analytics_enabled` to
--     `42501`.
--   · `katie_prompt_edits` — held **nothing**. It gets `select (applied_by), update (applied_by)`: **both**
--     halves are column-scoped (security pass, MEDIUM — the first draft's table-level `SELECT` would have
--     handed this identity blanket read access to the prompt-edit text), table-level UPDATE is withheld so no
--     arm can rewrite what a prompt edit actually said, and DELETE is not granted at all. Asserted by driving
--     a read of `after_content`, an UPDATE of it, and a DELETE, each to `42501`.
--
-- ⚠️ **And a column grant is column-scoped, not value-scoped** — which is section 1b, and it is the thing
-- neither of these bullets could carry on its own.
--
-- ★ A row lock is an UPDATE privilege and a column grant satisfies it (`3i`, measured), which is why the
-- release takes `for update nowait` on the same column it is about to null and needs no wider grant to do it.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- AND THE SECOND HALF OF `3j`'s Q-1: a `SET NULL` blocker could never become a recorded refusal
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- `0030`'s `rows-outstanding` scan reads `confdeltype = 'r'` only, so a key that refuses through a *guard*
-- rather than through `restrict` surfaced as an unhandled `23001` — which the store classifies as neither a
-- policy refusal nor retryable contention, i.e. ADR-182's two answers with a third leaking between them. The
-- release loop closes it: a release that is refused returns a **recorded** refusal naming the table, the
-- column and the SQLSTATE, and rolls back every release it had already made, so nothing is half-done and
-- nothing is stamped. ⚠️ The cost is stated rather than hidden: a genuinely missing grant now reads as a
-- recorded refusal instead of a crash, so the reason carries the SQLSTATE and the gate drives the arm with a
-- real fourth key rather than describing it.
--
-- 02 §6 row `0034`; 07 §5.7 (the four surfaces) and §6.1 step 6.
--
-- One transaction. The verify block runs after `commit` — `0032`'s house style, `3j`'s MEDIUM-7 — so what it
-- proves is proved about the committed state, and it drives the job rather than reading the catalogue at it.

begin;

-- ---------------------------------------------------------------------------
-- 1. The two column grants.  ENUMERATED SET — START
--    (`int.retention-grants` reads this block and `0032`'s together, so neither can drift alone.)
-- ---------------------------------------------------------------------------

-- B-49: the purge nulls `user_id` itself, because the `on delete set null` cascade runs as `postgres` and
-- `prevent_cookie_consent_modification()` refuses it. `update (user_id)` and nothing more — the choice, its
-- flags, the IP, the user agent and the expiry stay unwritable by this identity.
grant update (user_id) on table public.cookie_consent_records to bbldn_retention;

-- B-49: the same for `applied_by`. ★ **Both halves are column-scoped** (security pass, MEDIUM): the release's
-- `for update nowait` reads only the key it is about to null, so a table-level `SELECT` would have handed this
-- identity blanket read access to the *content* of every prompt edit — what was changed and why — which this
-- file's own comments claim stays unreachable. It does now. DELETE is not granted at all.
grant select (applied_by), update (applied_by) on table public.katie_prompt_edits to bbldn_retention;

-- ENUMERATED SET — END

-- ---------------------------------------------------------------------------
-- ★ 1b. A reference may be RELEASED, never RE-POINTED — the value invariant the column grant cannot carry.
--
-- **The security pass's HIGH, and it is a correction to this file's own claim.** The header above said the
-- "from where" was structural. It was not: a column grant is *column*-scoped and says nothing about the
-- **value**, and `prevent_cookie_consent_modification()` / `prevent_row_modification()` pass any write once
-- `is_retention_job()` is true. Driven by the reviewer, rolled back:
--
--     set local role bbldn_retention;
--     update public.cookie_consent_records set user_id = '<some other account>' where visitor_id = 'x';
--
-- succeeded. `postgres` is a member of `bbldn_retention` with admin option — `0000` grants it so migrations
-- can set a function's owner — so an operator at a console could re-point a consent record at a different
-- person, and the pin that was supposed to prevent it is a `prosrc` regex in a test, which ad-hoc SQL does
-- not go near. ADR-186 again, turned on this file: a control on the wrong axis is still an argument.
--
-- So the invariant becomes a database control on the axis that matters — **the value** — and it is stated
-- once, for every role, with no exemption at all:
--
--     a foreign key naming a person may be set to NULL; it may never be moved to a different person.
--
-- That is strictly stronger than pinning a caller, because it does not depend on who is asking, and it is
-- true of the release, of the cascade it replaces, and of anybody at a console. Nothing in the tree
-- legitimately re-points these three columns — searched in `src/` (three INSERTs and one read filter) and in
-- every function body (none) — so the invariant costs nothing it should not cost. It is the same shape as
-- `refuse_primary_key_rewrite()` (`0032` §3), one column class over.
-- ---------------------------------------------------------------------------
create or replace function public.refuse_reference_rewrite()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_col text;
begin
  -- tg_argv carries the column names this trigger guards, so one function serves all three tables.
  foreach v_col in array tg_argv loop
    if v_new ->> v_col is not null and (v_new ->> v_col) is distinct from (v_old ->> v_col) then
      -- ★ `%` is plpgsql RAISE's only placeholder — `%s` is a placeholder followed by a literal "s", which is
      -- why the first draft said "user_ids" and "applied_bys" (database pass, MEDIUM). Measured, not read.
      raise exception
        '%.%: % may be released to NULL but never re-pointed at another person (B-49, 07 §5.8 rule 7)',
        tg_table_schema, tg_table_name, v_col
        using errcode = 'restrict_violation';
    end if;
  end loop;
  return new;
end;
$$;

comment on function public.refuse_reference_rewrite() is
  'B-49 / 07 §5.8: a foreign key naming a person may be set to NULL and never moved to a different person. Guards exactly the columns 0034''s release loop is allowed to null, on the value rather than on the caller — a column grant is column-scoped and says nothing about what is written into it, and is_retention_job() admits the write once the identity is right. No role is exempt: nothing in the tree re-points these columns, and an operator who genuinely must is writing a migration.';

revoke all on function public.refuse_reference_rewrite() from public;

-- `drop … if exists` first, so the file re-applies. `0027`'s house style, kept over PG14's
-- `create or replace trigger` (database pass, MEDIUM) because the tree already reads one way and a second
-- idiom for the same thing is how the two drift; the idempotency the reviewer asked for is the same either way.
drop trigger if exists account_erasure_requests_refuse_requester_rewrite on public.account_erasure_requests;
create trigger account_erasure_requests_refuse_requester_rewrite
  before update of requested_by on public.account_erasure_requests
  for each row execute function public.refuse_reference_rewrite('requested_by');

-- `drop … if exists` first, so the file re-applies. `0027`'s house style, kept over PG14's
-- `create or replace trigger` (database pass, MEDIUM) because the tree already reads one way and a second
-- idiom for the same thing is how the two drift; the idempotency the reviewer asked for is the same either way.
drop trigger if exists cookie_consent_records_refuse_user_rewrite on public.cookie_consent_records;
create trigger cookie_consent_records_refuse_user_rewrite
  before update of user_id on public.cookie_consent_records
  for each row execute function public.refuse_reference_rewrite('user_id');

-- `drop … if exists` first, so the file re-applies. `0027`'s house style, kept over PG14's
-- `create or replace trigger` (database pass, MEDIUM) because the tree already reads one way and a second
-- idiom for the same thing is how the two drift; the idempotency the reviewer asked for is the same either way.
drop trigger if exists katie_prompt_edits_refuse_author_rewrite on public.katie_prompt_edits;
create trigger katie_prompt_edits_refuse_author_rewrite
  before update of applied_by on public.katie_prompt_edits
  for each row execute function public.refuse_reference_rewrite('applied_by');

-- ---------------------------------------------------------------------------
-- 2. The job releases its own references.
--
--    `create or replace` preserves the owner (`bbldn_retention`) and the ACL. Everything before the release
--    loop is `0030`'s, unchanged and re-stated rather than patched, because a function body is replaced whole
--    and a diff that reads as three lines would hide which of the two files owns the rest.
-- ---------------------------------------------------------------------------
create or replace function public.purge_scrubbed_user(
  p_user_id uuid,
  p_windows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request      record;
  v_state        text;
  v_last         timestamptz;
  v_until        timestamptz;
  v_class        text;
  v_months       integer;
  v_from         text;
  v_blocker      record;
  v_outstanding  boolean;
  v_release      record;
  v_tbl          text;
  v_col          text;
  v_state_code   text;
begin
  -- ADR-179 at run time: a class with no window is not a class we may quietly skip.
  --
  -- ★ The **anchor is validated, not merely present** (`3g`'s database pass, MEDIUM). Each window below reads
  -- `case when v_from = 'scrub' then … else <last activity> end`, so a typo — `"srub"`, or a key renamed in
  -- `LEGAL.erasureRetains` — would fall silently into the activity branch and compute the wrong date with
  -- complete confidence. A malformed anchor is the same failure mode as a missing one, so it raises the same way.
  foreach v_class in array array['money', 'consent', 'safeguarding'] loop
    if p_windows -> v_class ->> 'months' is null or p_windows -> v_class ->> 'from' is null then
      raise exception
        'purge_scrubbed_user: no retention window supplied for class % — LEGAL.erasureRetains is the one owner of these dates (ADR-179)', v_class
        using errcode = 'invalid_parameter_value';
    end if;
    if p_windows -> v_class ->> 'from' not in ('scrub', 'last-activity') then
      raise exception
        'purge_scrubbed_user: class % names the anchor %, which is neither "scrub" nor "last-activity" — a window is a number AND the date it runs from (ADR-179)',
        v_class, p_windows -> v_class ->> 'from'
        using errcode = 'invalid_parameter_value';
    end if;
  end loop;

  -- ★ **The `auth.users` row is checked FIRST, and that ordering is the idempotency.** After a purge the ledger
  -- row survives with its subject nulled (that is the point of nulling it), so a second call would find no
  -- completed request and answer `not-erased` — which would be a lie about a subject we purged ourselves. The
  -- absence of the row is therefore the marker, exactly as `erase_account()`'s is the tombstone.
  v_state := public.auth_user_purge_state(p_user_id);
  if v_state = 'missing' then
    return jsonb_build_object('outcome', 'already-purged');
  end if;
  if v_state <> 'scrubbed' then
    return jsonb_build_object('outcome', 'refused', 'reason', 'not-scrubbed');
  end if;

  select r.id, r.completed_at
    into v_request
    from public.account_erasure_requests r
   where r.subject_user_id = p_user_id
     and r.state = 'completed'
   order by r.completed_at desc
   limit 1;

  if not found then
    -- Not a failure: the purge is only ever about an account that went through §6.1, and refusing to touch one
    -- that did not is the whole safety of the job.
    return jsonb_build_object('outcome', 'refused', 'reason', 'not-erased');
  end if;

  -- ★ **An OPEN request means something is still outstanding, so the purge does not run** (`3g`'s database
  -- pass, CRITICAL). Purging underneath it would leave a pending Art 12 request pointing at a person who no
  -- longer exists. Recorded, not raised: a human has to close it, and no amount of retrying will.
  if exists (
    select 1 from public.account_erasure_requests r
     where r.subject_user_id = p_user_id and r.state = 'requested'
  ) then
    return jsonb_build_object('outcome', 'refused', 'reason', 'request-open');
  end if;

  -- ── money (07 §6.2 row 9) — anchored on the LAST TRANSACTION ────────────────────────────────────────────
  v_months := (p_windows -> 'money' ->> 'months')::integer;
  v_from   := p_windows -> 'money' ->> 'from';
  select max(at) into v_last from (
    select max(s.created_at) as at from public.parent_subscriptions s where s.parent_user_id = p_user_id
    union all
    select max(e.received_at) from public.payment_events e where e.parent_user_id = p_user_id
    union all
    select max(rr.created_at) from public.refund_requests rr where rr.parent_user_id = p_user_id
    union all
    select max(g.created_at) from public.guarantee_events g where g.parent_user_id = p_user_id
  ) as money(at);
  if v_last is not null then
    v_until := (case when v_from = 'scrub' then v_request.completed_at else v_last end)
               + make_interval(months => v_months);
    if v_until > now() then
      return jsonb_build_object('outcome', 'refused', 'reason', 'retained-money', 'until', v_until);
    end if;
  end if;

  -- ── consent (row 11) — anchored on the SCRUB, in the spec's own words ──────────────────────────────────
  v_months := (p_windows -> 'consent' ->> 'months')::integer;
  v_from   := p_windows -> 'consent' ->> 'from';
  if exists (select 1 from public.consent_records c where c.user_id = p_user_id)
     or exists (select 1 from public.biometric_consent_records b where b.user_id = p_user_id) then
    select max(at) into v_last from (
      select max(c.created_at) as at from public.consent_records c where c.user_id = p_user_id
      union all
      select max(b.created_at) from public.biometric_consent_records b where b.user_id = p_user_id
    ) as consent(at);
    v_until := (case when v_from = 'scrub' then v_request.completed_at else v_last end)
               + make_interval(months => v_months);
    if v_until > now() then
      return jsonb_build_object('outcome', 'refused', 'reason', 'retained-consent', 'until', v_until);
    end if;
  end if;

  -- ── safeguarding (row 4) — the AUTHOR side, which is the only side still naming auth.users after `0027` ──
  v_months := (p_windows -> 'safeguarding' ->> 'months')::integer;
  v_from   := p_windows -> 'safeguarding' ->> 'from';
  if exists (select 1 from public.nanny_suspension_lifts l where l.decided_by = p_user_id)
     or exists (select 1 from public.vetting_submissions v where v.decided_by = p_user_id)
     or exists (select 1 from public.verifications vr where vr.dbs_update_service_checked_by = p_user_id) then
    select max(at) into v_last from (
      select max(l.decided_at) as at from public.nanny_suspension_lifts l where l.decided_by = p_user_id
      union all
      select max(coalesce(v.checked_at, v.created_at)) from public.vetting_submissions v where v.decided_by = p_user_id
      union all
      select max(vr.updated_at) from public.verifications vr where vr.dbs_update_service_checked_by = p_user_id
    ) as safeguarding(at);
    v_until := (case when v_from = 'scrub' then v_request.completed_at else v_last end)
               + make_interval(months => v_months);
    if v_until > now() then
      return jsonb_build_object('outcome', 'refused', 'reason', 'retained-safeguarding', 'until', v_until);
    end if;
  end if;

  -- ★ **Every window has passed — but the rows may still be here, and that is a different refusal.**
  -- Removing an *expired* money or consent row is `retention-sweep`'s job (07 §6.2 rows 9 and 11). Under a
  -- `restrict` key the delete below would raise `23503`, which the store classifies as retryable, and the
  -- sweep would try the same subject every night for ever. So it is a **recorded** refusal naming the table:
  -- there is nothing to retry, and an operator can read what is owed. The list is read from the catalogue
  -- rather than typed, so a `restrict` key added later is covered the day it appears.
  for v_blocker in
    select t.relname as tbl, a.attname as col
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_class ft on ft.oid = c.confrelid
      join pg_namespace fn on fn.oid = ft.relnamespace
      join pg_attribute a on a.attrelid = t.oid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confdeltype = 'r'
       and fn.nspname = 'auth' and ft.relname = 'users'
       and n.nspname = 'public'
       and array_length(c.conkey, 1) = 1
       -- this function nulls the ledger itself, below, so it is not a blocker
       and t.relname <> 'account_erasure_requests'
     order by t.relname, a.attname
  loop
    execute format('select exists (select 1 from public.%I where %I = $1)', v_blocker.tbl, v_blocker.col)
      into v_outstanding using p_user_id;
    if v_outstanding then
      return jsonb_build_object('outcome', 'refused', 'reason', 'rows-outstanding', 'table', v_blocker.tbl);
    end if;
  end loop;

  -- ═════════════════════════════════════════════════════════════════════════════════════════════════════
  -- ★ B-49. The job releases its own references, because the cascade cannot.
  --
  --   · It runs **before** the ledger writes below, so a refusal here leaves the transaction with nothing
  --     changed at all — never a `purged_at` stamped on a subject who was not purged (`3g`'s CRITICAL, one
  --     class over).
  --   · The whole loop is one `begin … exception` block, so a refusal on the third key rolls back the first
  --     two. A partially released subject committed alongside a recorded refusal would be a silent edit.
  --   · `for update nowait` is the house idiom (`0027`, `0028`, `auth_user_purge_state`): the transaction
  --     already holds the `auth.users` row lock, so waiting here is a purge holding a lock while it waits.
  --     `lock_not_available` is deliberately NOT caught — it is ADR-182's *raised* arm and the sweep retries.
  --
  -- ★ **The loop reads the catalogue, and the enumeration is the declaration over it — not the other way
  -- round.** The first draft looped a hand-written array of three, and `int.self-service-purge` drove a
  -- *fourth* guarded key at it: the array said nothing about it, the cascade refused it, and the job raised
  -- an unhandled `23001` — which is `3j`'s Q-1 second half, reproduced by the fix meant to close it. Reading
  -- the catalogue makes a fourth key **attempted** rather than ignored, and since the retention identity is
  -- granted nothing on it, the attempt answers `42501` and becomes a recorded refusal that names the table.
  --
  -- ⚠️ **This loop cannot do more than the cascade would have done, and that is its whole safety.** Its
  -- domain is, by construction, exactly the single-column `on delete set null` keys into `auth.users`: it
  -- nulls the same column Postgres itself was about to null, for the same row, in the same transaction. It
  -- cannot reach a column that is not such a key, and the two new grants in section 1 are column-scoped so it
  -- cannot reach a second column of a table it can reach at all. The **enumeration** — `v_named` in the
  -- verify block, and `int.self-service-purge`'s `RELEASES` — is what fails CI when the catalogue grows a
  -- fourth key, so the grant that would make it work is written down by a person on purpose (ADR-185/186).
  -- ═════════════════════════════════════════════════════════════════════════════════════════════════════
  begin
    for v_release in
      select t.relname as tbl, a.attname as col
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        join pg_class rt on rt.oid = c.confrelid
        join pg_namespace rn on rn.oid = rt.relnamespace
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
       where c.contype = 'f' and c.confdeltype = 'n'
         and rn.nspname = 'auth' and rt.relname = 'users'
         and n.nspname = 'public'
         and array_length(c.conkey, 1) = 1
         and exists (
           select 1 from pg_trigger tg join pg_proc p on p.oid = tg.tgfoid
            where tg.tgrelid = c.conrelid and not tg.tgisinternal
              and (tg.tgtype & 16) <> 0
              and p.prosrc like '%is_retention_job%')
       order by t.relname, a.attname
    loop
      v_tbl := v_release.tbl;
      v_col := v_release.col;
      execute format('select 1 from public.%I where %I = $1 for update nowait', v_tbl, v_col)
        using p_user_id;
      execute format('update public.%I set %I = null where %I = $1', v_tbl, v_col, v_col)
        using p_user_id;
    end loop;
  exception
    when insufficient_privilege or restrict_violation then
      get stacked diagnostics v_state_code = returned_sqlstate;
      return jsonb_build_object('outcome', 'refused', 'reason', 'reference-refused',
                                'table', v_tbl, 'column', v_col, 'sqlstate', v_state_code);
  end;

  -- The ledger lets the subject go, explicitly and before the delete, so the FK never has to act.
  --
  --   · `state <> 'requested'` — the structural half of the refusal above. A single `where subject_user_id = …`
  --     matched *every* row for the subject, so a still-open request was nulled and stamped as purged. The
  --     narrower `state = 'completed'` would have been wrong in the other direction: the key is
  --     `on delete restrict`, so an old **refused** row left pointing at the subject makes the delete below
  --     raise for ever. Every row that is not open must let go; the open one is why we are not here.
  --   · **`purged_at` goes on the completed row only.** It says "we hard-deleted on this date", and a refusal
  --     from two years earlier did not do that.
  perform 1 from public.account_erasure_requests r
   where r.subject_user_id = p_user_id and r.state <> 'requested'
   for update nowait;

  update public.account_erasure_requests r
     set subject_user_id = null
   where r.subject_user_id = p_user_id and r.state <> 'requested';

  update public.account_erasure_requests r
     set purged_at = now()
   where r.id = v_request.id;

  -- Anything still referencing the row raises `foreign_key_violation` here and the whole transaction rolls back
  -- — the safety net for a class this function does not yet know about.
  perform public.purge_auth_user(p_user_id);

  return jsonb_build_object('outcome', 'purged', 'scrubbed_at', v_request.completed_at);
end
$$;

comment on function public.purge_scrubbed_user(uuid, jsonb) is
  '07 §6.1 step 6 (L-009 3g; B-49 fixed by 3k): 30 days after a completed scrub, hard-delete the auth.users row ONLY IF no money, consent or safeguarding row is still inside its window. The windows and their anchors arrive as p_windows from LEGAL.erasureRetains (ADR-179). Before the delete it RELEASES its own references — every ON DELETE SET NULL key into auth.users whose table carries a guard consulting is_retention_job(), which a cascade running as postgres could never write (B-49). One transaction, idempotent on the absence of the row, refusing in ADR-182''s two distinguishable ways.';

commit;

-- ---------------------------------------------------------------------------
-- Verify — by CALLING the job (`0019`'s standing lesson), and by deriving the release set from the catalogue
-- rather than trusting the array above.
-- ---------------------------------------------------------------------------
do $$
declare
  v_derived  text[];
  -- ★ **B-49's release set, declared.** Every `on delete set null` key from `public` into `auth.users` whose
  -- table carries an UPDATE guard consulting `is_retention_job()` — i.e. exactly the keys whose cascade the
  -- database refuses. The job loops the *catalogue*; this array is the declaration over it, and the case
  -- below fails the apply when the two disagree, which is how a fourth key reaches a person instead of
  -- quietly needing a grant nobody wrote. `int.self-service-purge` reads this block, so neither drifts alone.
  -- RELEASE SET — START
  v_named    text[] := array[
    -- the self-service road sets `requested_by` to the subject itself (create-privacy.ts:39)
    'account_erasure_requests.requested_by',
    -- a signed-in visitor's cookie choice keeps her id; the record survives the purge, the id does not
    'cookie_consent_records.user_id',
    -- an admin's own erasure must not delete the record of a prompt edit she applied
    'katie_prompt_edits.applied_by'];
  -- RELEASE SET — END
  v_probe    uuid := '00000000-0000-4000-8000-0000000000e4';
  v_windows  jsonb := jsonb_build_object(
    'money',        jsonb_build_object('months', 72, 'from', 'last-activity'),
    'consent',      jsonb_build_object('months', 72, 'from', 'scrub'),
    'safeguarding', jsonb_build_object('months', 12, 'from', 'scrub'));
  v_answer   jsonb;
  v_cookie   uuid;
  v_katie    uuid;
  v_rewrote  boolean := false;
  v_admits   text[];
  v_role     text;
  v_guard    boolean;
  v_probes   text[][];
  v_i        integer;
begin
  -- 1. ★ The array in the function body is the catalogue's answer, not a typed three. A fourth guarded
  --    `set null` key added by a later migration fails here on the first apply.
  select array_agg(t.relname || '.' || a.attname order by t.relname, a.attname)
    into v_derived
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_class rt on rt.oid = c.confrelid
    join pg_namespace rn on rn.oid = rt.relnamespace
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
   where c.contype = 'f' and c.confdeltype = 'n'
     and rn.nspname = 'auth' and rt.relname = 'users'
     and n.nspname = 'public' and array_length(c.conkey, 1) = 1
     and exists (
       select 1 from pg_trigger tg join pg_proc p on p.oid = tg.tgfoid
        where tg.tgrelid = c.conrelid and not tg.tgisinternal
          and (tg.tgtype & 16) <> 0
          and p.prosrc like '%is_retention_job%');
  if v_derived is distinct from v_named then
    raise exception '0034: the release set and the catalogue disagree — catalogue says %, the job says %',
      v_derived, v_named;
  end if;

  -- 1b. ★ **No COMPOSITE `set null` key into `auth.users` exists**, because the release loop's domain is
  --     single-column by construction and a composite one would be skipped in silence rather than failing the
  --     way a new single-column key does (database pass, MEDIUM). Zero today; asserted so it stays that way.
  if exists (
    select 1 from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_class rt on rt.oid = c.confrelid
      join pg_namespace rn on rn.oid = rt.relnamespace
     where c.contype = 'f' and c.confdeltype = 'n'
       and rn.nspname = 'auth' and rt.relname = 'users'
       and n.nspname = 'public' and array_length(c.conkey, 1) > 1) then
    raise exception '0034: a COMPOSITE on delete set null key into auth.users exists — the release loop would skip it in silence';
  end if;

  -- 2. ★ The guard is untouched. This file would be a hole if it were not.
  --
  --    ⚠️ **Asserted on the parsed member list, not on a substring** (database pass, HIGH). The first draft
  --    matched `prosrc like '%''bbldn_retention'', ''supabase_admin''%'` — which still passes if the guard is
  --    widened to `('bbldn_retention', 'supabase_admin', 'postgres')`, i.e. it passes through **exactly** the
  --    change this whole file exists to avoid making. A check that cannot fail on its own subject is not a
  --    check.
  select array_agg(m[1] order by m[1]) into v_admits
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace,
         lateral regexp_matches(p.prosrc, '''([a-z_]+)''', 'g') as m
   where n.nspname = 'public' and p.proname = 'is_retention_job';
  if v_admits is distinct from array['bbldn_retention', 'supabase_admin'] then
    raise exception '0034: is_retention_job() admits % — it must admit exactly bbldn_retention and supabase_admin', v_admits;
  end if;
  -- …and behaviourally, which no source parse can substitute for: every other role in the cluster answers false.
  for v_role in select rolname from pg_roles
                 where rolname not in ('bbldn_retention', 'supabase_admin')
                   and pg_has_role(current_user, oid, 'MEMBER')
  loop
    begin
      execute format('set local role %I', v_role);
      select public.is_retention_job() into v_guard;
      reset role;
    exception
      -- ★ A role that cannot even EXECUTE the guard certainly does not pass it, and that is the ordinary case
      -- after `0033`: EXECUTE is the retention identity's alone. Measured — the first draft assumed every role
      -- could call it and the apply answered `42501` on the first one it tried.
      when insufficient_privilege then reset role; v_guard := false;
    end;
    if v_guard then
      raise exception '0034: is_retention_job() is true for %, which is a widening', v_role;
    end if;
  end loop;

  -- 3. ★ The two new privileges are column-narrow, not table-wide.
  if has_table_privilege('bbldn_retention', 'public.cookie_consent_records', 'UPDATE')
     or has_table_privilege('bbldn_retention', 'public.katie_prompt_edits', 'UPDATE') then
    raise exception '0034: a table-level UPDATE was granted where a column grant was meant';
  end if;
  if not has_column_privilege('bbldn_retention', 'public.cookie_consent_records', 'user_id', 'UPDATE')
     or not has_column_privilege('bbldn_retention', 'public.katie_prompt_edits', 'applied_by', 'UPDATE') then
    raise exception '0034: the release cannot reach a column it must null';
  end if;
  if has_table_privilege('bbldn_retention', 'public.katie_prompt_edits', 'SELECT') then
    raise exception '0034: a table-level SELECT was granted on katie_prompt_edits — the prompt-edit text must stay unreadable to this identity';
  end if;
  if not has_column_privilege('bbldn_retention', 'public.katie_prompt_edits', 'applied_by', 'SELECT') then
    raise exception '0034: the release cannot read the key it must lock';
  end if;
  if has_table_privilege('bbldn_retention', 'public.katie_prompt_edits', 'DELETE') then
    raise exception '0034: the retention identity can delete a prompt edit — B-49 asked for a release, not a removal';
  end if;

  -- 3b. ★ **The value invariant, driven rather than described** (security pass, HIGH). A release must be a
  --     release: the reference may go to NULL and may never be moved to another person. Tried as the identity
  --     that holds the grant, which is the identity that could actually do it.
  begin
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, banned_until, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', v_probe, 'authenticated', 'authenticated',
            'deleted+' || v_probe::text || '@invalid', null, now(), '{}'::jsonb, '{}'::jsonb,
            'infinity'::timestamptz, now(), now());
    insert into public.cookie_consent_records
      (visitor_id, user_id, consent_choice, analytics_enabled, marketing_enabled, expiry_date)
    values ('rewrite-' || v_probe::text, v_probe, 'accept_all', true, true, now() + interval '1 year');

    insert into public.katie_prompt_edits (section, applied_by)
    values ('rewrite-' || v_probe::text, v_probe);
    insert into public.account_erasure_requests (subject_user_id, requested_by, road, state, completed_at)
    values (v_probe, v_probe, 'self-service', 'completed', now() - interval '31 days');

    -- ★ **All three columns, driven** (database pass, MEDIUM): arm 3c counts the triggers, and a trigger with
    -- the wrong `tg_argv` or the wrong `before update of <col>` clause would be counted and still be inert.
    v_probes := array[
      ['cookie_consent_records',   'user_id',      'visitor_id'],
      ['katie_prompt_edits',       'applied_by',   'applied_by'],
      ['account_erasure_requests', 'requested_by', 'requested_by']
    ];
    for v_i in 1 .. array_length(v_probes, 1) loop
      begin
        set local role bbldn_retention;
        execute format('update public.%I set %I = %L where %I = %L',
                       v_probes[v_i][1], v_probes[v_i][2],
                       '00000000-0000-4000-8000-0000000000ff'::uuid,
                       v_probes[v_i][3],
                       case when v_probes[v_i][3] = 'visitor_id'
                            then 'rewrite-' || v_probe::text else v_probe::text end);
        reset role;
        v_rewrote := true;
      exception
        when restrict_violation then reset role;  -- the invariant fired, which is the point
      end;
      exit when v_rewrote;
    end loop;

    raise exception using errcode = 'P0001', message = '0034: rewrite probe rollback';
  exception
    when raise_exception then
      if sqlerrm <> '0034: rewrite probe rollback' then raise; end if;
  end;
  if v_rewrote then
    raise exception '0034: the retention identity re-pointed a consent record at another person — a release is not a rewrite';
  end if;

  -- 3c. ★ The invariant is a trigger on all three release columns, not a claim about one.
  if (select count(*) from pg_trigger t join pg_proc p on p.oid = t.tgfoid
       where p.proname = 'refuse_reference_rewrite' and not t.tgisinternal) <> 3 then
    raise exception '0034: refuse_reference_rewrite() does not guard all three release columns';
  end if;

  -- 4. ★ Driven end to end, on the road that was broken, then rolled back. A sub-block whose last act is a
  --    sentinel `raise` is how a verify block can call a job that *destroys* a row without keeping the
  --    fixture: plpgsql variables survive the subtransaction rollback, so the answer is read afterwards.
  begin
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, banned_until, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', v_probe, 'authenticated', 'authenticated',
            'deleted+' || v_probe::text || '@invalid', null, now(), '{}'::jsonb, '{}'::jsonb,
            'infinity'::timestamptz, now(), now());
    insert into public.account_erasure_requests (subject_user_id, requested_by, road, state, completed_at)
    values (v_probe, v_probe, 'self-service', 'completed', now() - interval '31 days');
    insert into public.cookie_consent_records
      (visitor_id, user_id, consent_choice, analytics_enabled, marketing_enabled, expiry_date)
    values ('probe-' || v_probe::text, v_probe, 'reject_non_essential', false, false, now() + interval '1 year')
    returning id into v_cookie;
    insert into public.katie_prompt_edits (section, applied_by)
    values ('probe-' || v_probe::text, v_probe)
    returning id into v_katie;

    v_answer := public.purge_scrubbed_user(v_probe, v_windows);

    -- read the survivors while they are still here; the assertions run after the rollback
    if not exists (select 1 from public.cookie_consent_records c where c.id = v_cookie and c.user_id is null)
       or not exists (select 1 from public.katie_prompt_edits k where k.id = v_katie and k.applied_by is null) then
      v_answer := jsonb_set(v_answer, '{survivors}', '"lost"'::jsonb);
    end if;
    if exists (select 1 from auth.users u where u.id = v_probe) then
      v_answer := jsonb_set(v_answer, '{deleted}', '"no"'::jsonb);
    end if;

    raise exception using errcode = 'P0001', message = '0034: probe rollback';
  exception
    when raise_exception then
      if sqlerrm <> '0034: probe rollback' then raise; end if;
  end;

  if v_answer ->> 'outcome' is distinct from 'purged' then
    raise exception '0034: a self-service erasure still cannot reach its purge — got % (B-49)', v_answer;
  end if;
  if v_answer ? 'survivors' then
    raise exception '0034: the purge released a reference by destroying the row that held it — %', v_answer;
  end if;
  if v_answer ? 'deleted' then
    raise exception '0034: the purge answered "purged" and left the auth.users row behind — %', v_answer;
  end if;
end;
$$;
