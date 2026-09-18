-- 0026_consent-draft-seed-and-binding.sql — the ordered migration set (02-data-model.md §6 row 0026; `3c`)
--
-- Creates: the v1 `legal_documents` rows 0003 deferred, every one marked **DRAFT — not legal advice, pending
-- review**; a unique key on `(document_id, version, content_hash)`; `consent_records.document_content_hash` and
-- `biometric_consent_records.notice_content_hash`, both bound to that key by foreign key. Re-creates:
-- `guard_consent_record_insert()` and `guard_biometric_consent_insert()` with the hash requirement. Narrows:
-- the two person foreign keys on the consent tables from `cascade` to `restrict` (ADR-170).
--
-- Rollback twin: supabase/rollbacks/0026_consent-draft-seed-and-binding.rollback.sql
--
-- ★ SECURITY CLAUSE, FORWARD-ONLY (ADR-165 (1)). **The `cascade` → `restrict` narrowing of section 4 is a
--   security clause and the twin does not undo it.** Named here so the twin can name it back: after this file a
--   `delete from auth.users` whose subject holds a consent row is refused instead of silently destroying the
--   Art 7(1) evidence. The twin drops what this file ADDS (the columns, the key, the hash requirement) and
--   leaves the two foreign keys at `restrict`, because re-arming a cascade that deletes consent evidence is not
--   a rollback, it is an incident. `supabase/__tests__/rollback-security-clauses.test.ts` applies forward →
--   twin → and asserts the cascade has not come back, which is ADR-165 (3).
--
-- ---------------------------------------------------------------------------
-- WHY (1) — the mechanism was built and could not run.
-- ---------------------------------------------------------------------------
-- `legal_documents` has been empty since `0003`: `body_md NOT NULL` refuses a placeholder, so the v1 rows were
-- deferred to Phase 3. The consequence is not cosmetic. `guard_consent_record_insert()` requires
-- `document_version = max(version)`, `checkDocument()` in `platform/consent` requires the named version to be the
-- current one, and with no rows at all `currentDocument` answers `null` — so **every document consent in the tree
-- fails `document-required`**: signup clickwrap (AGR-01 / AGR-02), the biometric notice (AGR-04), the guardian
-- permission (AGR-14). The whole of `3c` is unreachable until a row exists.
--
-- It cannot be fixed by writing a policy. L-009's kickoff §3 is explicit: the *documents* are blocked on BAI's
-- trading entity and a solicitor, and **no unit writes a legal document as if it were final**. So the seed is
-- what an honest placeholder looks like: every body says, in its first line, that it is a draft, that it is not
-- legal advice, and that nothing in it has been reviewed. `src/modules/platform/consent/__tests__` asserts that
-- marking is present on every day-one slug, and the assertion stands until ratified text replaces it — a
-- plausible-looking privacy policy with no lawyer behind it is the one thing this phase must not produce.
--
-- The ratified England-and-Wales text (FATE `10.36`–`10.40`, `3a`) lands as **version 2**, which is a new row.
-- `legal_documents` is append-only, so v1 and every consent that names it stay exactly as they are.
--
-- ---------------------------------------------------------------------------
-- WHY (2) — what a signature is bound to (ruling 5.1, L-009 kickoff §5).
-- ---------------------------------------------------------------------------
-- The requirement: a user's consent can be shown to attach to the exact words she saw, and a later edit cannot
-- silently re-point it. `0004` bound the row to `(document_id, version)` alone.
--
--   · **Version alone is a pointer.** It says *which row*, never *which words*. It relies on the body behind the
--     version never moving — which today is true only because of a trigger, and `prevent_row_modification()`
--     exempts `is_retention_job()` (`bbldn_retention`, `supabase_admin`). A binding whose strength depends on an
--     exemption list is not a binding; it is a convention. `0003`'s own comment on `content_hash` already claims
--     the proof — *"a consent row cites (document_id, version), and this proves the body behind it never moved"* —
--     and nothing in the schema made the claim true, because no consent row cited the hash.
--   · **Hash alone is the words, and loses everything else.** You cannot tell a regulator, or the user, "you
--     accepted version 3 on 12 March"; you cannot order versions; `requires_reacceptance` has nothing to key on.
--
-- **Ruling: both, in one foreign key.** `legal_documents` gains a unique key on
-- `(document_id, version, content_hash)` and each consent row's document reference becomes that triple. The
-- database then refuses a signature naming a (version, hash) pair that has never existed, and — because the
-- document table is append-only — a changed body is a new version with a new hash, so the old row's triple still
-- resolves to the old words. It is declarative: no trigger, no exemption list, nothing to remember.
--
-- ---------------------------------------------------------------------------
-- WHY (3) — ADR-170, the consent half (and only the consent half).
-- ---------------------------------------------------------------------------
-- ADR-170: a record we are accountable for under Art 5(2) is never cascaded away, because a foreign key deleting
-- it **silently** is worse than a refusal — nobody learns it happened. `consent_records.user_id` and
-- `biometric_consent_records.user_id` are both `on delete cascade` to `auth.users`. The append-only trigger does
-- catch an ordinary cascade and abort it, so today the outcome is an accidental `restrict` for most callers —
-- but `prevent_row_modification()` exempts `supabase_admin`, which is the role behind the Supabase dashboard's
-- "delete user" button and most admin-API paths. On the one path an operator is most likely to use, the cascade
-- succeeds and the Art 7(1) evidence is gone with no record that it ever existed.
--
-- **`restrict`, not `set null`.** ADR-170's mechanical half says "`on delete set null` on the subject with the
-- pseudonym written by the job", and that is right for a *safeguarding decision* whose subject column can be
-- nulled. It is wrong here, and 07 §6.1 says why in its own words: money and consent rows "must outlive the
-- account **with their `user_id` intact**, and FKs would forbid a hard delete". The product path is 07 §6.1's
-- scrub-and-retain — `auth.users` survives, scrubbed and banned, so the subject stays a stable pseudonymous id
-- and `set null` would destroy the very link the retention window exists to keep. `restrict` is also what the
-- money tables of `0010` already do (`parent_subscriptions`, `refund_requests`, `guarantee_events`), so after
-- this file a parent's consent record and her payment record refuse an emergency hard delete identically.
--
-- **What this file deliberately does NOT do.** The four safeguarding cascades — `verifications.nanny_id`,
-- `vetting_submissions.nanny_id`, `vetting_submissions.verification_id` and `nanny_suspension_lifts.nanny_id`,
-- all `on delete cascade` from a person — are ADR-170's other half and are **not** touched here. They are a
-- different domain (`verification` / `vetting`), they interact with ADR-168's terminal bar and with `0008`,
-- `0023` and `0025`'s verify blocks and twins, and one of them (`nanny_suspension_lifts`) sits on the same table
-- whose *other* person key is already `restrict` with a written justification. They are pinned as failing
-- integration cases in `supabase/__tests__/consent-erasure-binding.test.ts` naming their owner, and the full
-- cascade audit is in L-009 PROGRESS. Doing them here would be a schema-wide change riding in a consent unit.
--
-- Forced by: `0003` (`legal_documents`), `0004` (both consent tables and both guards), `0017`
-- (`consent_records.purpose`). Additive over `0000`–`0025`: two columns, one unique key, two foreign keys
-- replaced, two foreign keys narrowed, two functions re-created with the same signatures, 11 rows inserted. The
-- set still applies forwards from an empty database in one pass.

-- ---------------------------------------------------------------------------
-- 1. The day-one bodies, every one marked a draft
-- ---------------------------------------------------------------------------
-- `content_hash` is the sha256 of the body it ships with, computed here rather than typed, so the seed cannot
-- disagree with itself. `on conflict do nothing` makes the file idempotent and, more importantly, means it can
-- never overwrite a ratified version that has already landed.

insert into public.legal_documents
  (document_id, version, effective_date, body_md, content_hash, change_summary, requires_reacceptance)
select
  d.document_id,
  1,
  date '2026-09-19',
  d.body_md,
  encode(sha256(convert_to(d.body_md, 'UTF8')), 'hex'),
  'is-placeholder — DRAFT seed (L-009 `3c`). Not legal advice. The ratified England-and-Wales text lands as version 2 (`3a`, FATE 10.36-10.40), which is a new row; this one is never edited.',
  false
from (
  select
    s.document_id,
    '# ' || s.title || E'\n\n'
      || E'**DRAFT — not legal advice, pending review.**\n\n'
      || 'This document has no ratified text. It exists so that the consent mechanism can record what a '
      || E'person accepted and when, and so that the record points at words that actually exist.\n\n'
      || 'Nothing here has been reviewed by a solicitor. It is not a statement of anyone''s legal obligations, '
      || 'it does not describe what the service does, and it must not be relied on. ' || s.scope || E'\n\n'
      || 'The ratified England-and-Wales text will be published as version 2 of this document. Because every '
      || 'version is kept, this version — and every consent that names it — will stay exactly as it is.'
      as body_md
  from (values
    ('client-tos',            'Client Terms of Service',
     'When ratified, this document will set out the terms between a parent and the service.'),
    ('professional-tos',      'Childcare Professional Terms of Service',
     'When ratified, this document will set out the terms between a childcare professional and the service.'),
    ('privacy-policy',        'Privacy Policy',
     'When ratified, this document will say what personal data is processed, on what lawful basis, for how long, and what rights a person has.'),
    ('biometric-notice',      'Biometric Data Collection Notice',
     'When ratified, this document will describe the identity check, what is processed, by whom, where, and for how long.'),
    ('code-of-conduct',       'Childcare Professional Code of Conduct',
     'When ratified, this document will set out the standards expected of a childcare professional using the service.'),
    ('cookie-policy',         'Cookie Policy',
     'When ratified, this document will list each cookie, what it is for, and which are set only with consent.'),
    ('disclaimer',            'Legal and Contact Information',
     'When ratified, this document will name the trading entity, its registered office, its company number and its data-protection registration.'),
    ('parent-app-consent',    'Parent Consent for a Child''s Record',
     'When ratified, this document will describe what is recorded about a child, who can see it, and how a parent ends it.'),
    ('nanny-attestation',     'Childcare Professional Attestation',
     'When ratified, this document will set out what a childcare professional confirms before entering a child''s record.'),
    ('media-consent',         'Photograph and Media Consent',
     'When ratified, this document will describe what images may be recorded about a child, who can see them, and how consent is withdrawn.'),
    ('agr14_nanny_child_add', 'Guardian Permission to Add a Child',
     'When ratified, this document will set out what a childcare professional confirms about a guardian''s permission before adding a child.')
  ) as s(document_id, title, scope)
) as d
on conflict (document_id, version) do nothing;

-- ---------------------------------------------------------------------------
-- 2. The key a signature binds to (ruling 5.1)
-- ---------------------------------------------------------------------------
-- The primary key is `(document_id, version)`; this adds the hash so a consent row can name all three. It is a
-- constraint rather than a bare unique index because a foreign key needs a constraint to reference.

alter table public.legal_documents
  drop constraint if exists legal_documents_version_hash_key;
alter table public.legal_documents
  add constraint legal_documents_version_hash_key
  unique (document_id, version, content_hash);

comment on constraint legal_documents_version_hash_key on public.legal_documents is
  'Ruling 5.1 (L-009 `3c`): the target a consent row binds to. Version says WHICH ROW; content_hash says WHICH WORDS. A consent naming a (version, hash) pair that has never existed is unwritable, and because this table is append-only a changed body is a new version with a new hash, so an old signature still resolves to the old words.';

-- ---------------------------------------------------------------------------
-- 3. The consent rows name the hash as well as the version
-- ---------------------------------------------------------------------------

alter table public.consent_records
  add column if not exists document_content_hash text;

comment on column public.consent_records.document_content_hash is
  'Ruling 5.1: the content_hash of the version accepted, part of the composite foreign key to legal_documents. Null exactly when document_id is null (an informed action that names no document).';

-- The pair check becomes a triple check: all three travel together or none does.
alter table public.consent_records
  drop constraint if exists consent_records_document_pair_check;
alter table public.consent_records
  add constraint consent_records_document_pair_check
  check (
    (document_id is null) = (document_version is null)
    and (document_id is null) = (document_content_hash is null)
  );

alter table public.consent_records
  drop constraint if exists consent_records_document_fkey;
alter table public.consent_records
  add constraint consent_records_document_fkey
  foreign key (document_id, document_version, document_content_hash)
  references public.legal_documents (document_id, version, content_hash);

-- The composite foreign key's covering index, widened to the triple (the two-column index `0004` created for the
-- pair no longer covers it; `audit-consent-expiry` reads on the same leading columns either way).
drop index if exists public.consent_records_document_idx;
create index if not exists consent_records_document_idx
  on public.consent_records (document_id, document_version, document_content_hash)
  where document_id is not null;

alter table public.biometric_consent_records
  add column if not exists notice_content_hash text;

comment on column public.biometric_consent_records.notice_content_hash is
  'Ruling 5.1: the content_hash of the biometric-notice version consented to, part of the composite foreign key to legal_documents. Art 9(2)(a) consent that cannot be shown to attach to the exact notice she scrolled is not explicit consent.';

alter table public.biometric_consent_records
  drop constraint if exists biometric_consent_records_notice_fkey;
alter table public.biometric_consent_records
  add constraint biometric_consent_records_notice_fkey
  foreign key (notice_document_id, notice_version, notice_content_hash)
  references public.legal_documents (document_id, version, content_hash);

drop index if exists public.biometric_consent_records_notice_idx;
create index if not exists biometric_consent_records_notice_idx
  on public.biometric_consent_records (notice_document_id, notice_version, notice_content_hash);

-- ---------------------------------------------------------------------------
-- 4. ★ ADR-170, the consent half: a consent record is never cascaded away
-- ---------------------------------------------------------------------------
-- See WHY (3). `restrict`, matching `0010`'s money tables and 07 §6.1's "user_id intact".

alter table public.consent_records
  drop constraint if exists consent_records_user_id_fkey;
alter table public.consent_records
  add constraint consent_records_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete restrict;

alter table public.biometric_consent_records
  drop constraint if exists biometric_consent_records_user_id_fkey;
alter table public.biometric_consent_records
  add constraint biometric_consent_records_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete restrict;

-- `restrict` needs the subject column indexed or every `auth.users` delete seq-scans both tables.
create index if not exists consent_records_user_idx
  on public.consent_records (user_id);
create index if not exists biometric_consent_records_user_idx
  on public.biometric_consent_records (user_id);

comment on table public.consent_records is
  '02 §4.1 row 5 / UK GDPR Art 7(1): append-only. A decline is a new row with consent_given = false; nothing is ever edited. The document triple (id, version, content_hash) is the latest at write, checked in the guard. ADR-170: the subject key is ON DELETE RESTRICT — an erasure is 07 §6.1 scrub-and-retain, never a cascade that destroys the evidence silently.';

-- ---------------------------------------------------------------------------
-- 5. The guards require the hash, of every writer
-- ---------------------------------------------------------------------------
-- The hash requirement sits ABOVE the `is_privileged_writer()` early return on purpose. The existing checks below
-- it are about a client not being trusted to state its own party or pick its own version; this one is about the
-- row being evidence at all, and a service-role insert that forgets the hash is exactly as unusable as a
-- client's. The foreign key already refuses a triple that does not exist; this refuses a triple half-given, with
-- a message that says which column is missing rather than a bare 23502.

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
  -- ruling 5.1 — every writer, privileged or not
  if new.document_id is not null and new.document_content_hash is null then
    raise exception
      'consent_records.document_content_hash must name the content_hash of the version accepted (ruling 5.1): a consent bound to a version alone can be silently re-pointed'
      using errcode = 'not_null_violation';
  end if;

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
  '07 §5.2 / Art 7(1): a consent row a subject can backdate, re-address, point at a superseded document version or leave unbound to the words accepted is not evidence. SECURITY DEFINER because it reads user_roles and legal_documents, both FORCE RLS.';

create or replace function public.guard_biometric_consent_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current integer;
begin
  -- ruling 5.1 — every writer. The notice document is a generated column, so this is never conditional.
  if new.notice_content_hash is null then
    raise exception
      'biometric_consent_records.notice_content_hash must name the content_hash of the notice version consented to (ruling 5.1)'
      using errcode = 'not_null_violation';
  end if;

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
-- Verify
-- ---------------------------------------------------------------------------

do $$
declare
  v_n        integer;
  v_slug     text;
  v_body     text;
  v_hash     text;
  v_deltype  "char";
  v_slugs    text[] := array[
    'client-tos', 'professional-tos', 'privacy-policy', 'biometric-notice', 'code-of-conduct',
    'cookie-policy', 'disclaimer', 'parent-app-consent', 'nanny-attestation', 'media-consent',
    'agr14_nanny_child_add'
  ];
begin
  -- 1. Every day-one slug has a version, and every one of them says it is a draft. A seed that silently missed
  --    a slug would leave exactly one consent road failing `document-required` in production.
  foreach v_slug in array v_slugs loop
    select body_md, content_hash into v_body, v_hash
      from public.legal_documents where document_id = v_slug and version = 1;
    if v_body is null then
      raise exception '0026: legal_documents has no v1 for %', v_slug;
    end if;
    if position('DRAFT — not legal advice, pending review' in v_body) = 0 then
      raise exception '0026: the v1 body for % is not marked a draft (L-009 kickoff §3)', v_slug;
    end if;
    -- 2. The hash is the body's, not a typed string. `3a`'s ratified version must satisfy this too.
    if v_hash is distinct from encode(sha256(convert_to(v_body, 'UTF8')), 'hex') then
      raise exception '0026: content_hash for % v1 is not the sha256 of its body', v_slug;
    end if;
  end loop;

  select count(*) into v_n from public.legal_documents where version = 1;
  if v_n <> array_length(v_slugs, 1) then
    raise exception '0026: expected % v1 rows, found %', array_length(v_slugs, 1), v_n;
  end if;

  -- 3. Ruling 5.1 — the unique key exists and both consent references are the TRIPLE, not the pair. A
  --    two-column foreign key here would mean a signature bound to a pointer again.
  if not exists (
    select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public' and t.relname = 'legal_documents'
       and c.conname = 'legal_documents_version_hash_key' and c.contype = 'u'
       and array_length(c.conkey, 1) = 3
  ) then
    raise exception '0026: legal_documents_version_hash_key must be a 3-column unique constraint';
  end if;
  foreach v_slug in array array[
    'consent_records:consent_records_document_fkey',
    'biometric_consent_records:biometric_consent_records_notice_fkey'
  ] loop
    if not exists (
      select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
       where n.nspname = 'public' and t.relname = split_part(v_slug, ':', 1)
         and c.conname = split_part(v_slug, ':', 2) and c.contype = 'f'
         and array_length(c.conkey, 1) = 3
    ) then
      raise exception '0026: %.% must reference the (document_id, version, content_hash) triple (ruling 5.1)',
        split_part(v_slug, ':', 1), split_part(v_slug, ':', 2);
    end if;
  end loop;

  -- 4. ★ ADR-170 — neither consent table's subject key cascades. This is the security clause the twin keeps.
  foreach v_slug in array array['consent_records', 'biometric_consent_records'] loop
    select c.confdeltype into v_deltype
      from pg_constraint c join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_attribute a on a.attrelid = t.oid and a.attnum = c.conkey[1]
     where n.nspname = 'public' and t.relname = v_slug and c.contype = 'f'
       and array_length(c.conkey, 1) = 1 and a.attname = 'user_id';
    if v_deltype is distinct from 'r' then
      raise exception
        '0026: %.user_id must be ON DELETE RESTRICT, found % (ADR-170: consent is never cascaded away)',
        v_slug, coalesce(v_deltype::text, 'no foreign key');
    end if;
  end loop;

  -- 5. The guards refuse a half-given triple. Asserted by calling, not by reading the source: a `create or
  --    replace` that silently kept an older body would otherwise pass every structural check above.
  begin
    insert into public.biometric_consent_records
      (user_id, notice_version, notice_opened_at, notice_scroll_completed_at, checkboxes_enabled_at,
       notice_time_spent_seconds, checkbox_timestamps, ai_provider_disclosed, processing_location_disclosed)
    values
      ('00000000-0000-4000-8000-00000000dead', 1, now(), now(), now(), 1, '{}'::jsonb, 'x', 'y');
    raise exception '0026: guard_biometric_consent_insert accepted a row with no notice_content_hash';
  exception
    when not_null_violation then null;  -- the guard fired, which is the whole point
    when foreign_key_violation then
      raise exception '0026: guard_biometric_consent_insert did not fire — the row reached the foreign key';
  end;
end;
$$;
