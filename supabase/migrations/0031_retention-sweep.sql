-- 0031_retention-sweep.sql — 07 §6.2's job, the third retention identity (L-009 `3h`; `3g`'s Q-1).
--
-- `0000` names three retention jobs. `0028` built the first (`delete-account`) and `0030` the second
-- (`purge-scrubbed-users`). This is the third, and it is the one 07 §6.2 names in nearly every row: **the yearly,
-- monthly and daily passes that remove data because time has passed rather than because a person asked.**
--
-- **It is the counterpart to the erasure job, not a variation of it.** An erasure is one subject, asked for,
-- answerable within a month. A sweep is one *class* at a time across every subject, unasked, and its correctness
-- is a date rather than an identity. So the unit of work is a class, not a person: one transaction per class per
-- batch. A single transaction over all seventeen classes would hold locks on the busiest tables in the schema
-- while it worked through the quietest, which is not a sweep but an outage.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- WHY THIS FILE EXISTS TODAY, and not in six years
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- `0030` measured the consequence of this job not existing: with every retention window passed but the rows
-- still present, `purge_scrubbed_user()` found a `restrict` key still naming the subject and answered
-- `rows-outstanding` — correctly, and **for ever**, because nothing else in the tree removes an expired money or
-- consent row. The purge is therefore blocked on this file in a way no amount of retrying could clear. Closing
-- that is this migration's first job, and the integration suite asserts it as behaviour rather than claiming it:
-- seed a subject past both windows, run the purge (refused, `rows-outstanding`), run the sweep, run the purge
-- again (purged).
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- THE RULINGS THIS FILE IMPLEMENTS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- **(1) Every date arrives as a parameter. None is written here.** `config/retention.ts` is 07 §6.2's table as a
-- value (ADR-179 widened from `LEGAL.erasureRetains`, which is the same fact seen by a person rather than by a
-- timer), and `p_spec` is one row of it. A class with no window, or with a window this file had to know, would
-- be a second owner of a legal fact. Two guards make that real rather than stated: a spec with no window
-- **raises**, and **every anchor column named in the spec is checked against the catalogue** — a renamed column
-- would otherwise make a window silently unenforceable, which is `0030`'s misspelled-anchor defect one layer up.
--
-- **(2) It never widens a promise.** Where 07 §6.2 says a column is nulled and the row kept — `email_logs`'
-- bodies at 90 days, `events`' identifiers at 25 months, `vetting_submissions.raw_response` at 12 — this nulls
-- and keeps. Deleting the row would be tidier and would be a different promise. Where §6.2 says delete, it
-- deletes, and where §6.2's window is marked ★ (BAI's to confirm), the class has no arm here at all: the config
-- entry says `deferred` and this function refuses to dispatch it.
--
-- **(3) Safeguarding is not removed by a clock, and that is pinned rather than chosen.** 07 §6.2 row 4 says a
-- vetting decision is kept for the life of the account plus ★ 12 months; ADR-170 says it survives an erasure for
-- the same six years as row 11 unless 10-legal sets longer. Those are two answers to one question and this unit
-- was told to record rather than decide, so the only safeguarding arm here is row 5's `raw_response` — the
-- provider's raw payload, which 07 §6.2 names explicitly and which is not the decision. The decision, its
-- outcome, its date and its author are untouched by this job in every class.
--
-- **(4) ADR-182's two refusals, per class.** A **recorded** refusal is a class the config defers or a class with
-- nothing due: it returns a count of zero with a reason, and retrying changes nothing until a date arrives or
-- BAI confirms a number. A **raised** refusal is contention or a foreign key the schedule did not anticipate:
-- it rolls that class's batch back, the sweep carries on to the next class, and tomorrow's run retries. The
-- distinction matters here for the same reason it does in `0028` — one means wait, the other means try again.
--
-- **(5) Bounded.** Every arm takes `p_limit` rows at most and says whether it hit the cap, so a first run against
-- a table that has never been swept is a series of short transactions rather than one that never commits.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- OWNERSHIP
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Owned by `bbldn_retention`, for the reason 07 §6.2's own "retention vs immutability" paragraph gives: rows 11,
-- 12 and 14 delete or null columns on append-only tables whose trigger exempts exactly the retention identity
-- (`is_retention_job()`). No other owner could perform this work at all. It reads and writes only the tables
-- enumerated at the foot of this file, `service_role` holds EXECUTE and nothing else, and the schema-wide
-- `create` needed to set the owner goes straight back (`0027`'s rule, `0028`'s and `0030`'s repeat).
--
-- This job does **not** touch `auth.users`: it never needs to. ADR-183's escalation stays `0028`'s and `0030`'s.

begin;

-- ---------------------------------------------------------------------------
-- 1. The money class's anchor, as a function — because it is asked twice and the second time matters
-- ---------------------------------------------------------------------------
--
-- ★ **A batch's membership is not a licence to delete** (security pass, HIGH). The `money` arm is the one class
-- whose window is a fact about a **subject** rather than about the row being deleted — 07 §6.2 row 9 counts six
-- years from the *last transaction*, so one recent payment holds the whole set. The arm therefore selects the
-- subjects whose newest transaction is out of window, and then deletes by subject id across four tables.
--
-- Under READ COMMITTED each of those DELETEs takes its own snapshot. A webhook writing a `payment_events` row for
-- one of those subjects **between** the selection and the delete would have had that brand-new row deleted, along
-- with the rest of the set, because the delete filtered on the subject and not on the date. That is the exact
-- invariant the arm exists to protect, holding at select time and not at delete time — and the loss would be a
-- live financial record, silently.
--
-- So every money DELETE re-asserts the window per subject, through this function, in its own snapshot. A
-- concurrent transaction is then simply not visible or makes the predicate false; either way the subject's rows
-- survive and the next run reconsiders them. It is the same union the arm's selection uses, narrowed to one
-- subject, which is why it is a function rather than four copies of a five-line `not exists`.
--
-- `consent` (row 11) deliberately does **not** get the same treatment, and the difference is not an oversight:
-- its anchor is `account_erasure_requests.completed_at` for a subject whose account is already scrubbed and
-- banned. That value is written once onto an append-only ledger and no session exists that could add a consent
-- row afterwards, so there is no later write for a second snapshot to reveal.
create or replace function public.money_last_activity_at(p_user_id uuid)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select max(at) from (
    select max(s.created_at) as at from public.parent_subscriptions s where s.parent_user_id = p_user_id
    union all select max(e.received_at) from public.payment_events e where e.parent_user_id = p_user_id
    union all select max(r.created_at) from public.refund_requests r where r.parent_user_id = p_user_id
    union all select max(g.created_at) from public.guarantee_events g where g.parent_user_id = p_user_id
  ) money;
$$;

comment on function public.money_last_activity_at(uuid) is
  '07 §6.2 row 9''s anchor for one subject: the newest of her subscription, payment, refund and guarantee rows. retention_sweep_class()''s money arm re-asserts the window through this in every DELETE, so a transaction written after the batch was selected cannot be deleted with it (security pass, HIGH).';

revoke all on function public.money_last_activity_at(uuid) from public;
revoke all on function public.money_last_activity_at(uuid) from anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The job
-- ---------------------------------------------------------------------------
create or replace function public.retention_sweep_class(
  p_class text,
  p_spec  jsonb,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff  timestamptz;
  v_months  integer;
  v_days    integer;
  v_anchor  jsonb;
  v_removed integer := 0;
  v_nulled  integer := 0;
  v_n       integer;
begin
  if p_limit is null or p_limit <= 0 then
    raise exception 'retention_sweep_class: a batch limit is required and must be positive (got %)', p_limit
      using errcode = 'invalid_parameter_value';
  end if;

  -- ── ruling (1): the window is the caller's, and it must exist ─────────────────────────────────────────────
  v_months := (p_spec -> 'window' ->> 'months')::integer;
  v_days   := (p_spec -> 'window' ->> 'days')::integer;
  if (v_months is null and v_days is null) or (v_months is not null and v_days is not null) then
    raise exception
      'retention_sweep_class(%): exactly one of window.months / window.days is required — 07 §6.2 owns these numbers and config/retention.ts is their one home (ADR-179)', p_class
      using errcode = 'invalid_parameter_value';
  end if;
  v_cutoff := now() - coalesce(make_interval(months => v_months), make_interval(days => v_days));

  -- ── ruling (1) again: an anchor that does not exist is a window nobody is enforcing ───────────────────────
  -- `0030`'s misspelled-anchor defect, one layer up: there the anchor was validated as a *word*, here it is
  -- validated as a *column*, because a renamed column would leave this job computing a date against nothing.
  for v_anchor in select * from jsonb_array_elements(coalesce(p_spec -> 'anchors', '[]'::jsonb)) loop
    if not exists (
      select 1 from information_schema.columns c
       where c.table_schema = 'public'
         and c.table_name = v_anchor ->> 'table'
         and c.column_name = v_anchor ->> 'column'
    ) then
      raise exception
        'retention_sweep_class(%): anchor %.% does not exist — a retention window whose anchor column is gone is a promise nobody is keeping',
        p_class, v_anchor ->> 'table', v_anchor ->> 'column'
        using errcode = 'undefined_column';
    end if;
  end loop;

  -- ── the arms. One per class the config gives a treatment; every other class is the config's `deferred` and
  --    never reaches here, which the `else` below makes true rather than assumed. ─────────────────────────────
  case p_class

    -- 07 §6.2 row 5 — the provider's raw payload, not the decision (ruling 3).
    when 'provider-responses' then
      with due as (
        select s.id from public.vetting_submissions s
         where s.checked_at is not null and s.checked_at < v_cutoff and s.raw_response is not null
         order by s.checked_at
         limit p_limit
         for update nowait)
      update public.vetting_submissions s set raw_response = null
        from due where s.id = due.id;
      get diagnostics v_nulled = row_count;

    -- 07 §6.2 row 6 — the hire record, six years after it ended (Limitation Act 1980 s 5).
    when 'placements' then
      with due as (
        select p.id from public.nanny_placements p
         where p.state = 'ENDED' and p.ended_at is not null and p.ended_at < v_cutoff
         order by p.ended_at
         limit p_limit
         for update nowait)
      delete from public.nanny_placements p using due where p.id = due.id;
      get diagnostics v_removed = row_count;

    -- 07 §6.2 row 9 — six years after the **last transaction**, so one recent payment holds the whole set.
    -- Per subject rather than per row: deleting a single old payment event while a current subscription runs
    -- would leave books that do not add up, which is the opposite of what a six-year window is for.
    when 'money' then
      create temporary table due_money on commit drop as
        select m.parent_user_id
          from (
            select s.parent_user_id, s.created_at as at from public.parent_subscriptions s
            union all select e.parent_user_id, e.received_at from public.payment_events e
            union all select r.parent_user_id, r.created_at from public.refund_requests r
            union all select g.parent_user_id, g.created_at from public.guarantee_events g
          ) m
         where m.parent_user_id is not null
         group by m.parent_user_id
        having max(m.at) < v_cutoff
         limit p_limit;

      -- Children first: `guarantee_events` and `refund_requests` are `on delete restrict` from the spine.
      -- ★ Each delete re-asserts the window in its own snapshot (item 1 above): membership in the batch is not
      --   a licence, and a transaction written since the batch was selected keeps its whole set alive.
      delete from public.guarantee_events g
       where g.parent_user_id in (select parent_user_id from due_money)
         and public.money_last_activity_at(g.parent_user_id) < v_cutoff;
      get diagnostics v_n = row_count; v_removed := v_removed + v_n;
      delete from public.refund_requests r
       where r.parent_user_id in (select parent_user_id from due_money)
         and public.money_last_activity_at(r.parent_user_id) < v_cutoff;
      get diagnostics v_n = row_count; v_removed := v_removed + v_n;
      delete from public.payment_events e
       where e.parent_user_id in (select parent_user_id from due_money)
         and public.money_last_activity_at(e.parent_user_id) < v_cutoff;
      get diagnostics v_n = row_count; v_removed := v_removed + v_n;
      delete from public.parent_subscriptions s
       where s.parent_user_id in (select parent_user_id from due_money)
         and public.money_last_activity_at(s.parent_user_id) < v_cutoff;
      get diagnostics v_n = row_count; v_removed := v_removed + v_n;

    -- 07 §6.2 row 11 — six years after the **account scrub**, in the row's own words. A living account's
    -- consent trail has no anchor and is therefore never reached, whatever its age.
    when 'consent' then
      create temporary table due_consent on commit drop as
        select r.subject_user_id
          from public.account_erasure_requests r
         where r.state = 'completed'
           and r.subject_user_id is not null
           and r.completed_at is not null
           and r.completed_at < v_cutoff
         order by r.completed_at
         limit p_limit;

      delete from public.biometric_consent_records b where b.user_id in (select subject_user_id from due_consent);
      get diagnostics v_n = row_count; v_removed := v_removed + v_n;
      delete from public.consent_records c where c.user_id in (select subject_user_id from due_consent);
      get diagnostics v_n = row_count; v_removed := v_removed + v_n;

    -- 07 §6.2 row 12 — the replaced choice goes at 30 days, the standing one at 13 months. Superseded first:
    -- the older row is the one that points at the newer, so taking it first never leaves a dangling reference.
    when 'cookie-consent-superseded' then
      with due as (
        select k.id from public.cookie_consent_records k
         where k.superseded_by is not null and k.created_at < v_cutoff
         order by k.created_at
         limit p_limit)
      delete from public.cookie_consent_records k using due where k.id = due.id;
      get diagnostics v_removed = row_count;

    when 'cookie-consent' then
      with due as (
        select k.id from public.cookie_consent_records k
         where k.created_at < v_cutoff
           and not exists (select 1 from public.cookie_consent_records o where o.superseded_by = k.id)
         order by k.created_at
         limit p_limit)
      delete from public.cookie_consent_records k using due where k.id = due.id;
      get diagnostics v_removed = row_count;

    -- 07 §6.2 row 13 — the body is the sensitive half and goes at 90 days; the metadata row lives to 24 months.
    -- Two classes rather than one because they are two windows on one table, and nulling is not deleting.
    when 'email-bodies' then
      with due as (
        select l.id from public.email_logs l
         where coalesce(l.sent_at, l.failed_at) is not null
           and coalesce(l.sent_at, l.failed_at) < v_cutoff
           and (l.subject is not null or l.body_html is not null or l.body_text is not null)
         order by coalesce(l.sent_at, l.failed_at)
         limit p_limit
         for update nowait)
      update public.email_logs l set subject = null, body_html = null, body_text = null
        from due where l.id = due.id;
      get diagnostics v_nulled = row_count;

    when 'email-metadata' then
      with due as (
        select l.id from public.email_logs l
         where coalesce(l.sent_at, l.failed_at) is not null
           and coalesce(l.sent_at, l.failed_at) < v_cutoff
         order by coalesce(l.sent_at, l.failed_at)
         limit p_limit
         for update nowait)
      delete from public.email_logs l using due where l.id = due.id;
      get diagnostics v_removed = row_count;

    when 'admin-notifications' then
      with due as (
        select n.id from public.admin_notifications n
         where n.acknowledged_at is not null and n.acknowledged_at < v_cutoff
         order by n.acknowledged_at
         limit p_limit
         for update nowait)
      delete from public.admin_notifications n using due where n.id = due.id;
      get diagnostics v_removed = row_count;

    -- 07 §6.2 row 14 — the identifiers go at 25 months and **the row stays**. Deleting it instead would be the
    -- tidier change and a different promise: `pipeline_snapshots` and every funnel count read these rows.
    when 'events-identifiers' then
      with due as (
        select e.id from public.events e
         where e.ts < v_cutoff
           and (e.visitor_id is not null or e.attribution is not null or e.request_id is not null)
         order by e.ts
         limit p_limit
         for update nowait)
      update public.events e set visitor_id = null, attribution = null, request_id = null
        from due where e.id = due.id;
      get diagnostics v_nulled = row_count;

    else
      raise exception
        'retention_sweep_class: % is not a class this job implements — config/retention.ts gives it no treatment, or gives it `deferred`, and a sweep that silently did nothing would be worse than one that says so', p_class
        using errcode = 'invalid_parameter_value';
  end case;

  return jsonb_build_object(
    'class',   p_class,
    'removed', v_removed,
    'nulled',  v_nulled,
    'cutoff',  v_cutoff,
    -- ruling (5): the caller needs to know a batch was capped, because "0 left" and "500 done, more waiting"
    -- are the same number of rows removed and completely different states.
    'capped',  greatest(v_removed, v_nulled) >= p_limit);
end
$$;

comment on function public.retention_sweep_class(text, jsonb, integer) is
  '07 §6.2 (L-009 3h): one class of the retention schedule, one bounded batch, one transaction. Every window and anchor arrives in p_spec from config/retention.ts (ADR-179) — a missing window raises and an anchor column that does not exist raises, because a retention date this job knew by itself would be a second owner of a legal fact. Nulls where §6.2 nulls and deletes where it deletes; no safeguarding decision is removed by any arm (07 §6.2 row 4 and ADR-170 disagree about its window, and that is pinned, not chosen). Owned by bbldn_retention because rows 11, 12 and 14 touch append-only tables whose trigger exempts exactly that identity.';

-- ---------------------------------------------------------------------------
-- 3. What the retention identity may touch, enumerated (`0028` / `0030`'s discipline)
-- ---------------------------------------------------------------------------
-- ★ **These lists are documentation, not the authority, and saying so is the honest part.** `0016:288` grants
-- `bbldn_retention` SELECT / INSERT / UPDATE / DELETE on **all tables in schema public** — so the enumerated
-- grants in `0027`, `0028`, `0030` and here re-grant what the role already holds on every table that existed
-- when `0016` ran. They still earn their place: they state what each job needs, and they are what would remain
-- the day `0016`'s blanket grant is narrowed. But a reader must not mistake the list for a closed set.
--
-- The one place that mattered enough to fix here is ruling 3's. Measured on the applied stack (2026-09-20):
-- `bbldn_retention` could DELETE `verifications` and `vetting_submissions` — both created by `0008`, before
-- `0016`'s blanket grant — while it could not delete `nanny_suspension_lifts`, created by `0025` afterwards.
-- The same three tables, the same rule, two different answers, and the difference was the order the migrations
-- happened to run in. `prevent_safeguarding_record_loss()` does not close it either: that trigger **exempts**
-- `is_safeguarding_retention_job()`, which is this identity precisely. So "no timer removes a safeguarding
-- decision" rested on this file not having written an arm that did. It is a privilege now.
grant usage, create on schema public to bbldn_retention;

revoke delete on table public.verifications       from bbldn_retention;
revoke delete on table public.vetting_submissions from bbldn_retention;

grant select, update (raw_response)                        on table public.vetting_submissions      to bbldn_retention;
grant select, delete                                       on table public.nanny_placements         to bbldn_retention;
grant select, delete                                       on table public.parent_subscriptions     to bbldn_retention;
grant select, delete                                       on table public.payment_events           to bbldn_retention;
grant select, delete                                       on table public.refund_requests          to bbldn_retention;
grant select, delete                                       on table public.guarantee_events         to bbldn_retention;
grant select, delete                                       on table public.consent_records          to bbldn_retention;
grant select, delete                                       on table public.biometric_consent_records to bbldn_retention;
grant select, delete                                       on table public.cookie_consent_records   to bbldn_retention;
grant select, delete, update (subject, body_html, body_text) on table public.email_logs             to bbldn_retention;
grant select, delete                                       on table public.admin_notifications      to bbldn_retention;
grant select, update (visitor_id, attribution, request_id) on table public.events                   to bbldn_retention;
-- `contact_messages.related_subscription_id` and the five `nanny_placements` back-references are all
-- `on delete set null`, so the money and placement deletes above update rows this role holds no privilege on.
-- A referential action runs with the privileges of the constraint, not of the caller — the deletes are the
-- authority, and granting UPDATE on those tables would widen the role for no reason.

alter function public.money_last_activity_at(uuid) owner to bbldn_retention;
alter function public.retention_sweep_class(text, jsonb, integer) owner to bbldn_retention;

revoke create on schema public from bbldn_retention;

revoke all on function public.retention_sweep_class(text, jsonb, integer) from public;
revoke all on function public.retention_sweep_class(text, jsonb, integer) from anon, authenticated;
grant execute on function public.retention_sweep_class(text, jsonb, integer) to service_role;
grant execute on function public.money_last_activity_at(uuid) to bbldn_retention;

commit;

-- ---------------------------------------------------------------------------
-- Verify — by CALLING the job (`0019`'s standing lesson; `0028` and `0030` each found a platform fact this way)
-- ---------------------------------------------------------------------------
do $$
declare
  v_answer jsonb;
  v_spec   jsonb := jsonb_build_object(
    'window',  jsonb_build_object('months', 72),
    'anchors', jsonb_build_array(jsonb_build_object('table', 'account_erasure_requests', 'column', 'completed_at')));
begin
  -- 1. A class with nothing due answers with zeroes rather than raising: a quiet table is a correct outcome.
  v_answer := public.retention_sweep_class('consent', v_spec, 100);
  if (v_answer ->> 'removed')::integer <> 0 or (v_answer ->> 'capped')::boolean then
    raise exception '0031: an empty consent sweep did not answer zero — got %', v_answer;
  end if;

  -- 2. ADR-179 at run time: no window, no sweep. A job that assumed six years would be a second owner of it.
  begin
    perform public.retention_sweep_class('consent', jsonb_build_object('anchors', '[]'::jsonb), 100);
    raise exception '0031: a call with no window was accepted — the job guessed a retention date';
  exception
    when invalid_parameter_value then null;  -- the ADR-179 guard fired, which is the point
  end;

  -- 3. Two windows is as wrong as none: `months` and `days` together is a spec nobody can read twice the same way.
  begin
    perform public.retention_sweep_class('consent',
      jsonb_build_object('window', jsonb_build_object('months', 72, 'days', 30)), 100);
    raise exception '0031: a spec carrying both months and days was accepted';
  exception
    when invalid_parameter_value then null;
  end;

  -- 4. ★ An anchor column that does not exist raises — the guard this file exists to make real, since a
  --    renamed column would otherwise leave a window silently unenforced.
  begin
    perform public.retention_sweep_class('consent', jsonb_build_object(
      'window',  jsonb_build_object('months', 72),
      'anchors', jsonb_build_array(jsonb_build_object('table', 'account_erasure_requests', 'column', 'complete_at'))), 100);
    raise exception '0031: an anchor column that does not exist was accepted';
  exception
    when undefined_column then null;  -- the guard fired
  end;

  -- 5. A class the config defers has no arm, and saying so is the whole point of the `else`.
  begin
    perform public.retention_sweep_class('leads', v_spec, 100);
    raise exception '0031: a deferred class was dispatched — the sweep would have done nothing and reported success';
  exception
    when invalid_parameter_value then null;
  end;

  -- 6. A batch limit is required. An unbounded first run against a never-swept table is the failure mode
  --    bounding exists for.
  begin
    perform public.retention_sweep_class('consent', v_spec, 0);
    raise exception '0031: a zero batch limit was accepted';
  exception
    when invalid_parameter_value then null;
  end;

  -- 7. The job runs as the retention identity, or rows 11, 12 and 14's append-only triggers refuse it outright.
  if (select r.rolname from pg_proc p join pg_roles r on r.oid = p.proowner
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'retention_sweep_class') is distinct from 'bbldn_retention' then
    raise exception '0031: retention_sweep_class is not owned by bbldn_retention — every append-only arm would be refused';
  end if;

  -- 8. The schema-wide `create` went straight back (`0027` / `0028` / `0030`'s rule).
  if has_schema_privilege('bbldn_retention', 'public', 'create') then
    raise exception '0031: bbldn_retention was left holding create on schema public';
  end if;

  -- 9. No client role can run a sweep.
  if has_function_privilege('authenticated', 'public.retention_sweep_class(text, jsonb, integer)', 'execute')
     or has_function_privilege('anon', 'public.retention_sweep_class(text, jsonb, integer)', 'execute') then
    raise exception '0031: retention_sweep_class is executable by a client role';
  end if;

  -- 10. ★ The money arm's re-check is reachable, and by the job's identity alone (security pass, HIGH).
  if not has_function_privilege('bbldn_retention', 'public.money_last_activity_at(uuid)', 'execute') then
    raise exception '0031: the job cannot call the anchor it re-asserts the money window with';
  end if;
  if has_function_privilege('service_role', 'public.money_last_activity_at(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.money_last_activity_at(uuid)', 'execute')
     or has_function_privilege('anon', 'public.money_last_activity_at(uuid)', 'execute') then
    raise exception '0031: money_last_activity_at is executable by a role other than bbldn_retention';
  end if;

  -- 11. ★ The safeguarding tables are reachable by this role for exactly one column, and not for DELETE.
  --     Ruling 3 as a privilege rather than as a comment: even a future arm that tried could not.
  if has_table_privilege('bbldn_retention', 'public.vetting_submissions', 'delete')
     or has_table_privilege('bbldn_retention', 'public.verifications', 'delete')
     or has_table_privilege('bbldn_retention', 'public.nanny_suspension_lifts', 'delete') then
    raise exception '0031: the sweep identity can delete a safeguarding record — 07 §6.2 row 4 and ADR-170 both forbid a clock doing that';
  end if;
end;
$$;
