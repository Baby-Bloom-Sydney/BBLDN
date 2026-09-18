-- 0026_consent-draft-seed-and-binding.rollback.sql — the twin of supabase/migrations/0026_consent-draft-seed-and-binding.sql (06 §4.2).
--
-- Drops what `0026` ADDS: `consent_records.document_content_hash`, `biometric_consent_records.notice_content_hash`,
-- the three-column foreign keys they belong to, `legal_documents_version_hash_key`, and the two guard functions'
-- hash requirement (both restored to their `0004` bodies). Restores the two-column document foreign keys and the
-- two-column indexes. Nothing later references any of them (`0026` is the last migration), so this always
-- succeeds on a database `0026` applied to. One transaction: a rollback that fails midway must not leave half
-- the objects standing.
--
-- ⚠️ **TWO THINGS THIS FILE DELIBERATELY DOES NOT UNDO.**
--
-- 1. ★ **ADR-165 (1) — the `cascade` → `restrict` narrowing of the two subject keys is KEPT.** `0026` §4 changed
--    `consent_records.user_id` and `biometric_consent_records.user_id` from `on delete cascade` to
--    `on delete restrict` so that a `delete from auth.users` whose subject holds consent evidence is refused
--    instead of silently destroying it (ADR-170; 07 §6.1's scrub-and-retain is the product path). Re-arming that
--    cascade in the middle of an incident is not a rollback, it is the incident. `restrict` costs nothing to the
--    reverted code: nothing in the application hard-deletes an `auth.users` row — the `delete-account` job
--    scrubs. `supabase/__tests__/rollback-security-clauses.test.ts` is where ADR-165 (3) asserts this stays true
--    through the twin.
--
-- 2. **The v1 `legal_documents` rows are KEPT, and could not be removed anyway.** The table is append-only: the
--    `legal_documents_append_only` trigger refuses a DELETE for every caller except the retention job, and
--    `0000` revokes TRUNCATE. It is also the right outcome — with no rows, `getPolicy` answers none and every
--    consent road in the tree fails closed with `document-required` (that is the state `0026` was written to end).
--    They are drafts, they say so in their own first line, and a rolled-back tree still needs them.
--
-- ⚠️ **WHAT IS LOST, stated rather than hidden.**
--
-- **The binding between a signature and the words it accepted (ruling 5.1).** Dropping `document_content_hash`
-- drops **every value in it**. After this file a consent row names `(document_id, version)` again — which row,
-- never which words — and the evidence that a given user accepted a given text can no longer be reconstructed
-- from the database alone. On a database where no real consent has been recorded (every environment today) that
-- is no data at all. **On any database where a real consent exists, export `consent_records` and
-- `biometric_consent_records` before running this**, exactly as `0023`'s twin says of `decided_by`.
--
-- That is data loss, not a re-opened hole, which is why this file completes rather than refusing: ADR-165 (2)'s
-- `RAISE EXCEPTION` is for a twin that would hand an access hole back, and the tree's own precedent for
-- destructive-but-necessary column drops is a stated warning (`0023`'s twin, `payment_events.outcome` and
-- `vetting_submissions.decided_by`). The line this tree draws: **a hole is refused, data loss is announced.**

begin;

-- ---------------------------------------------------------------------------
-- 1. The guards go back to their `0004` bodies (the hash requirement is dropped)
-- ---------------------------------------------------------------------------

create or replace function public.guard_consent_record_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
  v_current integer;
begin
  if public.is_privileged_writer() then
    return new;
  end if;

  -- server-observed values are not the client's to supply
  new.created_at := now();
  new.ip_address := null;
  new.user_agent := null;

  select r.role into v_role from public.user_roles r where r.user_id = new.user_id;
  if v_role is null or new.party <> v_role then
    raise exception 'consent_records.party must be the subject''s own role (02 §4.1 row 5)'
      using errcode = 'insufficient_privilege';
  end if;

  if new.document_id is not null then
    select max(d.version) into v_current
    from public.legal_documents d where d.document_id = new.document_id;
    if new.document_version is distinct from v_current then
      raise exception
        'consent_records.document_version must be the current version of % (07 §5.2)', new.document_id
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;
comment on function public.guard_consent_record_insert() is
  '07 §5.2 / Art 7(1): a consent row a subject can backdate, re-address or point at a superseded document version is not evidence. SECURITY DEFINER because it reads user_roles and legal_documents, both FORCE RLS.';

create or replace function public.guard_biometric_consent_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current integer;
begin
  if public.is_privileged_writer() then
    return new;
  end if;
  new.created_at := now();
  select max(d.version) into v_current
  from public.legal_documents d where d.document_id = 'biometric-notice';
  if new.notice_version is distinct from v_current then
    raise exception
      'biometric_consent_records.notice_version must be the current biometric-notice version (I-V3)'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The document references go back to the pair
-- ---------------------------------------------------------------------------

alter table public.consent_records
  drop constraint if exists consent_records_document_fkey;
alter table public.consent_records
  drop constraint if exists consent_records_document_pair_check;
alter table public.consent_records
  add constraint consent_records_document_pair_check
  check ((document_id is null) = (document_version is null));
alter table public.consent_records
  add constraint consent_records_document_fkey
  foreign key (document_id, document_version)
  references public.legal_documents (document_id, version);

drop index if exists public.consent_records_document_idx;
create index if not exists consent_records_document_idx
  on public.consent_records (document_id, document_version)
  where document_id is not null;

alter table public.biometric_consent_records
  drop constraint if exists biometric_consent_records_notice_fkey;
alter table public.biometric_consent_records
  add constraint biometric_consent_records_notice_fkey
  foreign key (notice_document_id, notice_version)
  references public.legal_documents (document_id, version);

drop index if exists public.biometric_consent_records_notice_idx;
create index if not exists biometric_consent_records_notice_idx
  on public.biometric_consent_records (notice_document_id, notice_version);

-- ---------------------------------------------------------------------------
-- 3. The columns and the key `0026` added (see "WHAT IS LOST" above)
-- ---------------------------------------------------------------------------

alter table public.consent_records drop column if exists document_content_hash;
alter table public.biometric_consent_records drop column if exists notice_content_hash;
alter table public.legal_documents
  drop constraint if exists legal_documents_version_hash_key;

comment on table public.consent_records is
  '02 §4.1 row 5 / UK GDPR Art 7(1): append-only. A decline is a new row with consent_given = false; nothing is ever edited. document_version is the latest at write, checked in the action. The subject key stays ON DELETE RESTRICT (ADR-170) — that narrowing is forward-only and this rollback does not undo it.';

-- ---------------------------------------------------------------------------
-- ★ Verify — the refused regression, asserted inside the transaction that would otherwise commit it
-- ---------------------------------------------------------------------------

do $$
declare
  v_table   text;
  v_deltype "char";
  v_n       integer;
begin
  -- (a) The shape this file REVERTED, not only the clause it kept (database pass, 2026-09-19 — LOW). `0023`'s
  --     twin verifies only its kept clauses; a twin that silently half-ran would otherwise leave a database
  --     whose columns are gone and whose foreign keys still name three of them.
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public'
     and ((table_name = 'consent_records' and column_name = 'document_content_hash')
       or (table_name = 'biometric_consent_records' and column_name = 'notice_content_hash'));
  if v_n <> 0 then
    raise exception '0026 twin: the hash columns must be gone, found %', v_n;
  end if;

  if exists (
    select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public' and t.relname = 'legal_documents'
       and c.conname = 'legal_documents_version_hash_key'
  ) then
    raise exception '0026 twin: legal_documents_version_hash_key must be dropped';
  end if;

  foreach v_table in array array[
    'consent_records:consent_records_document_fkey',
    'biometric_consent_records:biometric_consent_records_notice_fkey'
  ] loop
    if not exists (
      select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
       where n.nspname = 'public' and t.relname = split_part(v_table, ':', 1)
         and c.conname = split_part(v_table, ':', 2) and c.contype = 'f'
         and array_length(c.conkey, 1) = 2
    ) then
      raise exception '0026 twin: %.% must be back to the two-column pair', split_part(v_table, ':', 1), split_part(v_table, ':', 2);
    end if;
  end loop;

  -- (b) ★ The clause this file deliberately does NOT undo.
  foreach v_table in array array['consent_records', 'biometric_consent_records'] loop
    select c.confdeltype into v_deltype
      from pg_constraint c join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_attribute a on a.attrelid = t.oid and a.attnum = c.conkey[1]
     where n.nspname = 'public' and t.relname = v_table and c.contype = 'f'
       and array_length(c.conkey, 1) = 1 and a.attname = 'user_id';
    if v_deltype is distinct from 'r' then
      raise exception
        '0026 twin: %.user_id must STILL be ON DELETE RESTRICT after the rollback (ADR-165 (1) / ADR-170) — found %',
        v_table, coalesce(v_deltype::text, 'no foreign key');
    end if;
  end loop;
end;
$$;

commit;
