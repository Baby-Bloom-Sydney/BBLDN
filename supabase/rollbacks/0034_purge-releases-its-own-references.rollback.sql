-- 0034_purge-releases-its-own-references.rollback.sql — the twin of
-- supabase/migrations/0034_purge-releases-its-own-references.sql (06 §4.2; **ADR-165 arm (1)**, read through
-- ADR-177: a hole is refused, data loss is announced).
--
-- ★ **This twin restores nothing, and unusually the reason is not a privilege — it is Article 17.**
--
-- `0034` fixes B-49: before it, every *self-service* erasure failed its 30-day purge, for ever, because the
-- `on delete set null` cascade under `purge_auth_user()` runs as `postgres` and the append-only guards refuse
-- it. There are exactly two statements this file could contain and both re-break that:
--
--   · **Restoring `0030`'s body** would put the defect back verbatim. A person who exercised her right to
--     erasure would be told it completed and the hard delete would never happen. That is the thing the
--     migration exists to remove, and ADR-165 arm (1)'s sentence — a twin never puts back what the migration
--     existed to remove — reads the same whether the thing removed is a privilege hole or a compliance one.
--   · **Revoking the two column grants alone** breaks it differently and worse: the release would answer
--     `42501`, the job would record `reference-refused` on every subject, and the purge would stop with a
--     reason that looks like a configuration mistake rather than a rollback. Measured, not assumed — the
--     `reference-refused` arm is driven by a real fourth key in `int.self-service-purge`.
--
-- So there is no half of this that can be undone in isolation, and the whole of it is a right. The file runs
-- and changes nothing.
--
-- ⚠️ **WHAT IT DELIBERATELY DOES NOT UNDO — all of it, named.**
--
--   · **The release loop stays.** It cannot do more than the referential action it replaces: its domain is,
--     by construction, the single-column `on delete set null` keys into `auth.users` whose table carries a
--     guard consulting `is_retention_job()` — it nulls the same column Postgres was about to null, for the
--     same row, in the same transaction.
--   · **The two column grants stay.** `update (user_id)` on `cookie_consent_records` and
--     `select, update (applied_by)` on `katie_prompt_edits`. Both are column-scoped: the consent choice and
--     its flags, and the content of a prompt edit, remain unwritable by the retention identity, and no DELETE
--     was granted on `katie_prompt_edits` at all. Reverting them would narrow the role by two columns and
--     break the right to erasure to do it.
--   · **`is_retention_job()` was never touched**, so there is nothing to put back there either. That is the
--     whole shape of the fix (ADR-186): the guard still refuses `postgres`, and the cascade was given nothing
--     to write instead of the guard being taught to allow it.
--
-- ⚠️ **AND THEREFORE: there is no rollback path from this file. The recovery is roll-forward.** If a later
-- migration must be reverted past `0034`, revert that migration with its own twin. If the release set is
-- found to be wrong — a fourth guarded key, or one of these three ceasing to be guarded — the fix is a new
-- migration with the grant and its reason, plus the matching entry in `int.self-service-purge`.
--
-- ADR-165 (2)'s `RAISE EXCEPTION` is not used, for ADR-177's reason: that refusal belongs to a twin that
-- genuinely cannot proceed, and this one can — it completes, having correctly done nothing.
--
-- One transaction, so that "did nothing" is a fact about the database and not about how far it got.

begin;

-- Both halves are intentionally empty: every statement either could contain re-breaks Article 17.

commit;

-- ---------------------------------------------------------------------------
-- Verify — the twin's own claim, asserted rather than described (ADR-165 (3)).
--
-- A twin whose whole content is a refusal has to prove the refusal held, or it is a comment. This one proves
-- it by **running the job**, which is the only evidence that matters here.
-- ---------------------------------------------------------------------------
do $$
declare
  v_probe   uuid := '00000000-0000-4000-8000-0000000000e5';
  v_windows jsonb := jsonb_build_object(
    'money',        jsonb_build_object('months', 72, 'from', 'last-activity'),
    'consent',      jsonb_build_object('months', 72, 'from', 'scrub'),
    'safeguarding', jsonb_build_object('months', 12, 'from', 'scrub'));
  v_answer  jsonb;
begin
  -- 1. ★ The release is still in the one body entitled to carry it.
  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_roles r on r.oid = p.proowner
     where n.nspname = 'public' and p.proname = 'purge_scrubbed_user'
       and r.rolname = 'bbldn_retention'
       and p.prosrc like '%update public.%I set %I = null%') then
    raise exception '0034 twin: the release is gone from purge_scrubbed_user — B-49 is back';
  end if;

  -- 2. ★ And nowhere else. A twin that left the capability in a second body would have widened what it
  --    claims to have left alone.
  if (select count(*) from pg_proc p
       where p.prosrc like '%update public.%I set %I = null%') <> 1 then
    raise exception '0034 twin: more than one function body carries the release (ADR-186)';
  end if;

  -- 3. ★ The two column grants are still there, and still column-scoped.
  if not has_column_privilege('bbldn_retention', 'public.cookie_consent_records', 'user_id', 'UPDATE')
     or not has_column_privilege('bbldn_retention', 'public.katie_prompt_edits', 'applied_by', 'UPDATE') then
    raise exception '0034 twin: a release grant was revoked — the purge would now answer reference-refused for ever';
  end if;
  if has_table_privilege('bbldn_retention', 'public.cookie_consent_records', 'UPDATE')
     or has_table_privilege('bbldn_retention', 'public.katie_prompt_edits', 'UPDATE')
     or has_table_privilege('bbldn_retention', 'public.katie_prompt_edits', 'DELETE') then
    raise exception '0034 twin: a column grant became a table grant';
  end if;

  -- 4. ★ The guard is still the guard. This twin's whole premise is that `0034` did not widen it.
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'is_retention_job')
     not like '%''bbldn_retention'', ''supabase_admin''%' then
    raise exception '0034 twin: is_retention_job() no longer admits exactly bbldn_retention and supabase_admin';
  end if;

  -- 5. ★ …and the right it restored still works, proved by exercising it and rolling the probe back.
  begin
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, banned_until, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', v_probe, 'authenticated', 'authenticated',
            'deleted+' || v_probe::text || '@invalid', null, now(), '{}'::jsonb, '{}'::jsonb,
            'infinity'::timestamptz, now(), now());
    insert into public.account_erasure_requests (subject_user_id, requested_by, road, state, completed_at)
    values (v_probe, v_probe, 'self-service', 'completed', now() - interval '31 days');

    v_answer := public.purge_scrubbed_user(v_probe, v_windows);

    raise exception using errcode = 'P0001', message = '0034 twin: probe rollback';
  exception
    when raise_exception then
      if sqlerrm <> '0034 twin: probe rollback' then raise; end if;
  end;

  if v_answer ->> 'outcome' is distinct from 'purged' then
    raise exception '0034 twin: a self-service erasure cannot reach its purge — got % (B-49)', v_answer;
  end if;
end;
$$;
