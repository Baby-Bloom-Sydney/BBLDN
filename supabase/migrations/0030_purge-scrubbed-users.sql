-- 0030_purge-scrubbed-users.sql — 07 §6.1 **step 6, second half** (L-009 `3g`; `3f`'s named residual).
--
-- `0028` built the scrub. §6.1 step 6's other sentence — *"30 days later `purge-scrubbed-users` hard-deletes the
-- `auth.users` row **only if** no money / consent row still inside its window references it"* — was the last part
-- of §6.1 with nothing behind it: `0000` names the job as one of the three retention identities, and it had no
-- cron, no route, no `SystemJobName` and no function.
--
-- It is housekeeping rather than a right: the **scrub** is what protects the person (tombstoned, password gone,
-- banned for ever), and the purge only removes a pseudonymous row that no longer identifies anybody. That is
-- also why it is safe to make it refuse rather than push: nothing is owed to anyone by it running today.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- THE RULING THIS FILE IMPLEMENTS, and the thing it deliberately does not contain
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- **The window check reads ADR-179's machine-readable list, not a second copy of the dates.** `LEGAL.erasureRetains`
-- carries, per class, the window in months **and the anchor it runs from** — and the anchors genuinely differ:
-- money runs from the **last transaction** (07 §6.2 row 9 — HMRC and the Limitation Act both count from the
-- event), consent runs from the **account scrub** (row 11, in its own words). A job that embedded either number
-- would be a second owner of a legal fact; a job that embedded one anchor would be wrong for one class and look
-- right. So both travel in as `p_windows`, and a class missing from them **raises** rather than being assumed:
-- ADR-179 already makes a class with no config entry a gate failure (`check:retention-classes`), and this is the
-- same rule enforced at the only other moment it could be broken.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT HAD TO CHANGE FIRST, and why each is not incidental
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- **(a) The ledger blocked its own job.** `account_erasure_requests.subject_user_id` is `not null` and
-- `on delete restrict`, which `0028` chose for a stated reason — the request is the record that the erasure
-- happened, so it outlives the scrub exactly as money and consent do. True of the *scrub*; the *purge* is a later
-- event with a stronger precondition, and under that FK it could never run at all. The column becomes
-- **nullable** and the key **stays `restrict`**, which is the safer half of the fix: the purge nulls the subject
-- explicitly, as a step, so no path can ever delete a person while the ledger still points at them by accident.
-- The row survives with its dates, its road and its outcome — "an erasure was requested on this day, completed on
-- that day, purged on this one" — which is the Art 5(2) fact, and a `purged_at` column makes it explicit rather
-- than inferred from a null.
--
-- **No pseudonym, and that is ADR-181 rather than laziness.** ADR-170's pseudonym exists so surviving records
-- stay *correlatable*. After a purge there is nothing to correlate with, by construction: the job only runs when
-- no money, consent or safeguarding row still references the subject. A stable handle to a person we have just
-- finished deleting would be re-identification by the back door.
--
-- **(b) `3f`'s Q-3, ruled here because this is the job that makes it bite.** `vetting_submissions.decided_by` and
-- `verifications.dbs_update_service_checked_by` were `on delete set null` while `nanny_suspension_lifts.decided_by`
-- is `restrict` with the written justification *"an audit row whose author can be deleted is not an audit row"*.
-- The same sentence applies to who approved a DBS submission and who ran an Update Service check. It did not bite
-- before because nothing hard-deleted an `auth.users` row — **this job does**, and under `set null` its first run
-- against an admin who had also asked to be erased would have quietly removed the author of a safeguarding
-- decision. Both become `restrict`, so the purge **refuses and says why** instead.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- THE SHAPE, and ADR-182's two refusals
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- One transaction per subject, idempotent on the absence of the `auth.users` row, and refusing in the two ways
-- ADR-182 makes distinguishable:
--
--   · a **recorded** refusal (`{"outcome": "refused", "reason": …}`) is policy — not erased, not actually
--     scrubbed, or a class still inside its window. It commits nothing, tells the operator which class and until
--     when, and retrying tomorrow will not help until the date arrives;
--   · a **raised** refusal is contention or an invariant — the `for update nowait` probe losing, or a `restrict`
--     foreign key this file did not anticipate — and rolls the whole transaction back so the sweep retries. That
--     second case is the safety net that matters: if the window list ever misses a table, the delete is refused
--     by the database rather than succeeding against a row somebody still needs.
--
-- **Two definers, for ADR-183's reason.** `auth` is owned by `supabase_auth_admin` and its privileges are not
-- re-grantable, so the delete cannot run under the retention identity: `purge_auth_user()` is owned by the
-- deploying role, its whole body is the deletion of one named row, and EXECUTE is `bbldn_retention`'s alone.
-- `purge_scrubbed_user()` is owned by **`bbldn_retention`** so that `is_retention_job()` is true inside it and the
-- ledger's own append-only guard admits the one update it makes. Either owner alone would have failed: the first
-- cannot touch `auth`, the second cannot write the ledger.
--
-- Additive over `0000`–`0029`: one column, one NOT NULL dropped, two foreign keys replaced, two functions.

begin;

-- ---------------------------------------------------------------------------
-- 1. The ledger outlives its subject
-- ---------------------------------------------------------------------------
alter table public.account_erasure_requests
  alter column subject_user_id drop not null;

alter table public.account_erasure_requests
  add column if not exists purged_at timestamptz;

comment on column public.account_erasure_requests.subject_user_id is
  '07 §6.1 steps 5 and 6. ON DELETE RESTRICT, and nullable since 0030: the row outlives the scrub with its subject intact (that is 0028''s rule and it stands), and outlives the PURGE with its subject nulled — by an explicit step in purge_scrubbed_user(), never by a referential action, so no path can delete a person while this row still points at them. No pseudonym: ADR-181''s handle exists to correlate surviving records, and after a purge there are none.';
comment on column public.account_erasure_requests.purged_at is
  '07 §6.1 step 6 (L-009 3g): when purge-scrubbed-users hard-deleted the auth.users row. Explicit rather than inferred from a null subject, because "we purged on this date" is the Art 5(2) fact and "the column is null" is an observation about a column.';

-- ---------------------------------------------------------------------------
-- 2. `3f` Q-3 — a safeguarding decision's AUTHOR cannot be deleted either
-- ---------------------------------------------------------------------------
alter table public.vetting_submissions
  drop constraint if exists vetting_submissions_decided_by_fkey;
alter table public.vetting_submissions
  add constraint vetting_submissions_decided_by_fkey
  foreign key (decided_by) references auth.users (id) on delete restrict;

comment on column public.vetting_submissions.decided_by is
  'ON DELETE RESTRICT since 0030 (3f Q-3, L-009 3g): an audit row whose author can be deleted is not an audit row — 0025:83''s justification for nanny_suspension_lifts.decided_by, applied to who approved a DBS submission. It did not bite while nothing hard-deleted an auth.users row; purge-scrubbed-users does, so the purge refuses and says why rather than nulling the author.';

alter table public.verifications
  drop constraint if exists verifications_dbs_update_service_checked_by_fkey;
alter table public.verifications
  add constraint verifications_dbs_update_service_checked_by_fkey
  foreign key (dbs_update_service_checked_by) references auth.users (id) on delete restrict;

comment on column public.verifications.dbs_update_service_checked_by is
  'ON DELETE RESTRICT since 0030: as vetting_submissions.decided_by — who ran the Update Service check is part of the decision, not metadata about it.';

-- ---------------------------------------------------------------------------
-- 3. Who is ready to be considered
-- ---------------------------------------------------------------------------
-- Ready means only "the scrub completed more than `SECURITY.retention.purgeScrubbedUserDays` ago". Whether the
-- subject may actually go is `purge_scrubbed_user()`'s question, per subject, in its own transaction — a
-- candidate list that pre-filtered on the windows would have to know the dates, which is the one thing the
-- ruling forbids it to know.
create or replace function public.subjects_ready_to_purge(
  p_before timestamptz,
  p_limit  integer default 200
)
returns table (subject_user_id uuid, scrubbed_at timestamptz)
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select r.subject_user_id, r.completed_at
    from public.account_erasure_requests r
   where r.state = 'completed'
     and r.purged_at is null
     and r.subject_user_id is not null
     and r.completed_at is not null
     and r.completed_at < p_before
   order by r.completed_at
   limit least(greatest(coalesce(p_limit, 200), 1), 1000);
$$;

comment on function public.subjects_ready_to_purge(timestamptz, integer) is
  '07 §6.1 step 6: completed erasures whose scrub is older than the grace period and whose auth.users row has not yet been purged. It answers only "old enough to consider"; the retention windows are purge_scrubbed_user()''s, because the dates live in LEGAL.erasureRetains (ADR-179) and not in SQL.';

revoke execute on function public.subjects_ready_to_purge(timestamptz, integer) from public;
revoke execute on function public.subjects_ready_to_purge(timestamptz, integer) from anon, authenticated;
grant execute on function public.subjects_ready_to_purge(timestamptz, integer) to service_role;
grant execute on function public.subjects_ready_to_purge(timestamptz, integer) to bbldn_retention;

-- ---------------------------------------------------------------------------
-- 4. The narrow escalation — the delete itself (ADR-183's shape)
-- ---------------------------------------------------------------------------
-- **Two** functions, not one, and the split is forced rather than chosen. `bbldn_retention` cannot be granted
-- anything on `auth` (ADR-183, measured by `3f`), so *every* touch of `auth.users` has to sit behind the
-- deploying role — the lock probe and the scrub check as much as the delete. Putting the probe in the caller
-- would have been the natural shape and would have failed at run time with `permission denied for schema auth`,
-- which is precisely the class of thing `0019`'s "verify by calling" rule exists to catch before a real request.
create or replace function public.auth_user_purge_state(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scrubbed boolean;
begin
  -- The lock is taken here and held by the caller's transaction: an erasure or an admin holding this row beats a
  -- purge, which is only housekeeping. `nowait` makes that a fast raised refusal rather than a wait.
  perform 1 from auth.users u where u.id = p_user_id for update nowait;
  if not found then
    return 'missing';
  end if;
  select (u.banned_until = 'infinity'::timestamptz
          and u.email like 'deleted+%@invalid'
          and u.encrypted_password is null)
    into v_scrubbed
    from auth.users u where u.id = p_user_id;
  return case when coalesce(v_scrubbed, false) then 'scrubbed' else 'not-scrubbed' end;
end
$$;

comment on function public.auth_user_purge_state(uuid) is
  '07 §6.1 step 6: locks one auth.users row FOR UPDATE NOWAIT and says whether it is missing, scrubbed, or present-but-not-scrubbed. Owned by the deploying role for ADR-183''s reason — auth privileges are not re-grantable, so the retention identity cannot read this table either, not merely write it. EXECUTE is bbldn_retention''s alone.';

revoke all on function public.auth_user_purge_state(uuid) from public;
revoke all on function public.auth_user_purge_state(uuid) from anon, authenticated, service_role;
grant execute on function public.auth_user_purge_state(uuid) to bbldn_retention;

create or replace function public.purge_auth_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.users u where u.id = p_user_id;
end
$$;

comment on function public.purge_auth_user(uuid) is
  '07 §6.1 step 6: the hard delete of one named auth.users row, and nothing else. Owned by the deploying role because auth is owned by supabase_auth_admin and its privileges are not re-grantable (ADR-183, measured by 3f); EXECUTE is bbldn_retention''s alone, so purge_scrubbed_user() is the only caller that can exist. Every precondition is checked by that caller — this function is the privilege, not the policy.';

revoke all on function public.purge_auth_user(uuid) from public;
revoke all on function public.purge_auth_user(uuid) from anon, authenticated, service_role;
grant execute on function public.purge_auth_user(uuid) to bbldn_retention;

-- ---------------------------------------------------------------------------
-- 5. The job
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
begin
  -- ADR-179 at run time: a class with no window is not a class we may quietly skip.
  foreach v_class in array array['money', 'consent', 'safeguarding'] loop
    if p_windows -> v_class ->> 'months' is null or p_windows -> v_class ->> 'from' is null then
      raise exception
        'purge_scrubbed_user: no retention window supplied for class % — LEGAL.erasureRetains is the one owner of these dates (ADR-179)', v_class
        using errcode = 'invalid_parameter_value';
    end if;
  end loop;

  -- ★ **The `auth.users` row is checked FIRST, and that ordering is the idempotency.** After a purge the ledger
  -- row survives with its subject nulled (that is the point of nulling it), so a second call would find no
  -- completed request and answer `not-erased` — which would be a lie about a subject we purged ourselves. The
  -- absence of the row is therefore the marker, exactly as `erase_account()`'s is the tombstone: nothing new to
  -- remember, and a second run cannot emit a second event.
  --
  -- The scrub is checked in the same call rather than trusted: the ledger says what we *did*, this says what is
  -- *true*, and purging a row that was never scrubbed would destroy the evidence that it was not.
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

  -- The ledger lets the subject go, explicitly and before the delete, so the FK never has to act. This is the
  -- update `is_retention_job()` admits, which is why this function is owned by `bbldn_retention` and the delete
  -- below is not.
  update public.account_erasure_requests r
     set subject_user_id = null,
         purged_at = now()
   where r.subject_user_id = p_user_id;

  -- Anything still referencing the row raises `foreign_key_violation` here and the whole transaction rolls back
  -- — the safety net for a class this function does not yet know about.
  perform public.purge_auth_user(p_user_id);

  return jsonb_build_object('outcome', 'purged', 'scrubbed_at', v_request.completed_at);
end
$$;

comment on function public.purge_scrubbed_user(uuid, jsonb) is
  '07 §6.1 step 6 (L-009 3g): 30 days after a completed scrub, hard-delete the auth.users row ONLY IF no money, consent or safeguarding row is still inside its window. The windows and their anchors arrive as p_windows from LEGAL.erasureRetains (ADR-179) — a class missing from them raises, because this job must never guess a retention date. One transaction, idempotent on the absence of the row, refusing in ADR-182''s two distinguishable ways.';

-- The privileges a definer owned by `bbldn_retention` actually runs with. `0000` gives the role none and `0028`
-- enumerated what an erasure may touch; this is the same discipline for what a purge may *read*. Every table
-- here is read-only to it — the job's one write is the ledger, and its one destructive act is behind
-- `purge_auth_user()`.
grant usage, create on schema public to bbldn_retention;

grant select on table public.consent_records            to bbldn_retention;
grant select on table public.biometric_consent_records  to bbldn_retention;
grant select on table public.payment_events             to bbldn_retention;
grant select on table public.refund_requests            to bbldn_retention;
grant select on table public.guarantee_events           to bbldn_retention;
grant select on table public.nanny_suspension_lifts     to bbldn_retention;
grant select on table public.vetting_submissions        to bbldn_retention;
grant select on table public.verifications              to bbldn_retention;

alter function public.purge_scrubbed_user(uuid, jsonb) owner to bbldn_retention;

-- And straight back: a standing schema-wide `create` on the one role whose whole design is a tightly enumerated
-- privilege set would be an oversight wearing the shape of a decision (`0027`'s rule, `0028`'s repeat).
revoke create on schema public from bbldn_retention;

revoke all on function public.purge_scrubbed_user(uuid, jsonb) from public;
revoke all on function public.purge_scrubbed_user(uuid, jsonb) from anon, authenticated;
grant execute on function public.purge_scrubbed_user(uuid, jsonb) to service_role;

commit;

-- ---------------------------------------------------------------------------
-- Verify — by CALLING the job (`0019`'s standing lesson; `0028` found two platform facts this way)
-- ---------------------------------------------------------------------------
do $$
declare
  v_answer jsonb;
  v_probe  uuid := '00000000-0000-4000-8000-0000000000e0';
  v_windows jsonb := jsonb_build_object(
    'money',        jsonb_build_object('months', 72, 'from', 'last-activity'),
    'consent',      jsonb_build_object('months', 72, 'from', 'scrub'),
    'safeguarding', jsonb_build_object('months', 12, 'from', 'scrub'));
begin
  -- 1a. An id with no `auth.users` row at all answers `already-purged` — the idempotency marker, checked first.
  v_answer := public.purge_scrubbed_user(v_probe, v_windows);
  if v_answer ->> 'outcome' is distinct from 'already-purged' then
    raise exception '0030: a missing auth.users row did not answer already-purged — got %', v_answer;
  end if;

  -- 1b. A **scrubbed row with no completed erasure request** is refused, and the refusal is RECORDED rather
  --     than raised. Driven with a real row, then removed: `0019`'s lesson is that a job is verified by being
  --     called, and the only honest way to call this arm is to give it something to refuse.
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, banned_until, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_probe, 'authenticated', 'authenticated',
          'deleted+' || v_probe::text || '@invalid', null, now(), '{}'::jsonb, '{}'::jsonb,
          'infinity'::timestamptz, now(), now());
  begin
    v_answer := public.purge_scrubbed_user(v_probe, v_windows);
  exception
    when others then
      delete from auth.users where id = v_probe;
      raise;
  end;
  delete from auth.users where id = v_probe;
  if v_answer ->> 'outcome' is distinct from 'refused'
     or v_answer ->> 'reason' is distinct from 'not-erased' then
    raise exception '0030: an un-erased subject was not refused — got %', v_answer;
  end if;

  -- 2. ADR-179 at run time: a missing class raises rather than being skipped.
  begin
    perform public.purge_scrubbed_user(v_probe, jsonb_build_object(
      'money', jsonb_build_object('months', 72, 'from', 'last-activity')));
    raise exception '0030: a call with no consent window was accepted — the job guessed a retention date';
  exception
    when invalid_parameter_value then null;  -- the ADR-179 guard fired, which is the point
  end;

  -- 3. The escalation is exactly one role wide.
  if has_function_privilege('service_role', 'public.purge_auth_user(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.purge_auth_user(uuid)', 'execute')
     or has_function_privilege('anon', 'public.purge_auth_user(uuid)', 'execute') then
    raise exception '0030: purge_auth_user is executable by a role other than bbldn_retention';
  end if;
  if not has_function_privilege('bbldn_retention', 'public.purge_auth_user(uuid)', 'execute') then
    raise exception '0030: the retention identity cannot execute the delete it exists to make';
  end if;

  -- 4. The job runs as the retention identity, or the ledger''s own guard would refuse its one update.
  if (select r.rolname from pg_proc p join pg_roles r on r.oid = p.proowner
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'purge_scrubbed_user') is distinct from 'bbldn_retention' then
    raise exception '0030: purge_scrubbed_user is not owned by bbldn_retention — the ledger update would be refused';
  end if;

  -- 5. The schema-wide `create` went straight back (`0027` / `0028`'s rule).
  if has_schema_privilege('bbldn_retention', 'public', 'create') then
    raise exception '0030: bbldn_retention was left holding create on schema public';
  end if;

  -- 6. Both safeguarding author keys refuse a delete (3f Q-3).
  if (select c.confdeltype from pg_constraint c join pg_class t on t.oid = c.conrelid
       where t.relname = 'vetting_submissions' and c.conname = 'vetting_submissions_decided_by_fkey') <> 'r' then
    raise exception '0030: vetting_submissions.decided_by is not ON DELETE RESTRICT';
  end if;
  if (select c.confdeltype from pg_constraint c join pg_class t on t.oid = c.conrelid
       where t.relname = 'verifications'
         and c.conname = 'verifications_dbs_update_service_checked_by_fkey') <> 'r' then
    raise exception '0030: verifications.dbs_update_service_checked_by is not ON DELETE RESTRICT';
  end if;
end;
$$;
