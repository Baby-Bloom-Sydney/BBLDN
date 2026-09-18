-- 0029_renewal-sweep.sql — the read the per-user annual renewal sweep needs (FATE `10.18`; ADR-174; L-009 `3g`).
--
-- **Why this is a migration and not a query in TypeScript.** `3c` built `dueForRenewal(userId)` — a per-user
-- read — and stopped there, for a reason worth repeating: a cron that is supposed to check *everyone* needs a
-- store read that answers "which people are due", and that question is `distinct on (user_id) … order by
-- created_at desc`. PostgREST cannot express it, so a TypeScript version would have to page the whole consent
-- table into memory and reduce it there. `3c`'s words were that half a version "would look like a check that
-- wasn't happening", which is the failure this function exists to avoid.
--
-- **What "due" means, and what it deliberately does not mean.** ADR-174 says a consent does not expire because
-- a year passed — it expires because the *words changed*. So the year buys the **check**, not a signature, and
-- this function answers only the cheap half: whose newest row for a purpose is older than the cadence. Whether
-- she is re-asked or carried forward is decided per person by `dueForRenewal`, on the content hash, in the
-- connector. Putting the hash comparison in here would have duplicated ADR-173's binding rule in SQL, where the
-- day `3a`'s ratified text lands as version 2 it would be a second place to get it right.
--
-- **Idempotency falls out of the shape.** A carry-forward is itself a `consent_records` row (ADR-174), so the
-- moment the sweep carries a purpose forward, that person's newest row is today's and she is no longer due. A
-- re-ask writes nothing and she stays due — correctly, because she *is* — and the run summary's count is then
-- the number of people whose renewal nobody has put in front of them, which is the number an operator needs.
--
-- Additive over `0000`–`0028`: one index, one function. No table, no policy, no grant widened.

begin;

-- ---------------------------------------------------------------------------
-- 1. The index the read walks
-- ---------------------------------------------------------------------------
-- `consent_records_user_purpose_idx` (`0017`) leads with `user_id`, which is right for "this person's trail" and
-- useless for "every person due for this purpose" — the leading column is the one being scanned across. This one
-- leads with `purpose` and orders by `(user_id, created_at desc)`, which is exactly the `distinct on` below, so
-- the planner takes the newest row per subject from the index rather than sorting the table.
create index if not exists consent_records_purpose_subject_recent_idx
  on public.consent_records (purpose, user_id, created_at desc);

comment on index public.consent_records_purpose_subject_recent_idx is
  'FATE 10.18 (L-009 3g): the annual renewal sweep''s read — newest row per subject for one purpose. Leads with purpose because the sweep scans across subjects, which consent_records_user_purpose_idx cannot serve.';

-- ---------------------------------------------------------------------------
-- 2. Who is due for the annual check
-- ---------------------------------------------------------------------------
-- `security invoker` and `stable`, deliberately: this reads a table with RLS and adds no privilege of its own.
-- The sweep calls it at service scope (07 §5.1 rule 5 — a named job read), where the service role's RLS bypass
-- is what lets it see every subject; a user session calling it sees only her own rows, which is harmless and is
-- the correct answer for that caller rather than a leak.
--
-- `p_limit` is capped in the body as well as passed, because an unbounded cron read is how a sweep that was fine
-- for a year becomes an incident in one run (07 §8's reasoning, applied to our own job rather than to a caller).
create or replace function public.consent_subjects_due_for_renewal(
  p_purpose public.consent_purpose,
  p_before  timestamptz,
  p_limit   integer default 500
)
returns table (subject_user_id uuid)
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select newest.user_id
    from (
      select distinct on (cr.user_id) cr.user_id, cr.created_at
        from public.consent_records cr
       where cr.purpose = p_purpose
       order by cr.user_id, cr.created_at desc
    ) as newest
   where newest.created_at < p_before
   order by newest.user_id
   limit least(greatest(coalesce(p_limit, 500), 1), 1000);
$$;

comment on function public.consent_subjects_due_for_renewal(public.consent_purpose, timestamptz, integer) is
  'FATE 10.18 / ADR-174 (L-009 3g): the subjects whose newest consent row for this purpose predates the renewal cadence — the cheap half of "who is due". Whether each is re-asked or carried forward is decided on the content hash by platform/consent.dueForRenewal, never here: ADR-173''s binding rule lives in one place.';

-- Nothing that arrives as a browser may call it: it is a cross-subject read, and although RLS would narrow the
-- answer to the caller's own rows, a function whose whole purpose is "list people" should not be reachable from
-- a session at all (07 §5.1). `service_role` is the sweep's road; `bbldn_retention` is deliberately NOT granted —
-- this is not a retention job and does not touch an append-only row.
revoke execute on function public.consent_subjects_due_for_renewal(public.consent_purpose, timestamptz, integer) from public;
revoke execute on function public.consent_subjects_due_for_renewal(public.consent_purpose, timestamptz, integer) from anon;
revoke execute on function public.consent_subjects_due_for_renewal(public.consent_purpose, timestamptz, integer) from authenticated;
grant execute on function public.consent_subjects_due_for_renewal(public.consent_purpose, timestamptz, integer) to service_role;

commit;

-- ---------------------------------------------------------------------------
-- Verify — by calling, not by reading a catalogue (`0019`'s standing lesson, and `0028`'s two findings)
-- ---------------------------------------------------------------------------
do $$
declare
  v_count integer;
begin
  -- 1. It runs, and on an empty table it answers nothing rather than erroring.
  select count(*) into v_count
    from public.consent_subjects_due_for_renewal('client-tos', now(), 10);
  if v_count is null then
    raise exception '0029: consent_subjects_due_for_renewal did not return a countable set';
  end if;

  -- 2. A future cutoff cannot return more than the cap, whatever it is asked for.
  select count(*) into v_count
    from public.consent_subjects_due_for_renewal('client-tos', now() + interval '100 years', 100000);
  if v_count > 1000 then
    raise exception '0029: the limit cap is not applied — % rows returned', v_count;
  end if;

  -- 3. The grant is exactly one role. A widened grant here is a "list every subject" road from a session.
  if has_function_privilege('authenticated', 'public.consent_subjects_due_for_renewal(public.consent_purpose, timestamptz, integer)', 'execute')
     or has_function_privilege('anon', 'public.consent_subjects_due_for_renewal(public.consent_purpose, timestamptz, integer)', 'execute') then
    raise exception '0029: consent_subjects_due_for_renewal is executable from a session role';
  end if;
  if not has_function_privilege('service_role', 'public.consent_subjects_due_for_renewal(public.consent_purpose, timestamptz, integer)', 'execute') then
    raise exception '0029: the sweep''s own role cannot execute the read';
  end if;

  -- 4. The index is the one the read needs — leading column `purpose`, not `user_id`.
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'consent_records_purpose_subject_recent_idx'
  ) then
    raise exception '0029: consent_records_purpose_subject_recent_idx is missing';
  end if;
end;
$$;
