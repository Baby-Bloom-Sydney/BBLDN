-- 0003_legal-documents.sql — the ordered migration set (02-data-model.md §6 row 0003)
--
-- Creates: `legal_documents` — every version of every England & Wales document (02 §4.1 row 4).
-- **Table only.** 02 §6 originally said "+ v1 E&W seed"; the E&W bodies are Phase 3 legal drafting
-- (10.36-10.39) and `body_md NOT NULL` cannot take a placeholder, so the v1 rows land in a Phase 3
-- seed migration (HANDOFF §6.2 note, §13 item 9 — closed 2026-09-15).
--
-- **That seed is `0026` (L-009 `3c`), and it is a migration, not `supabase/seed.sql`.** This header used to
-- point at a `supabase/seed.sql` carrying dev-only placeholders marked `is-placeholder`; no such file was ever
-- written (`supabase/seed/` is a TypeScript tool that writes no `legal_documents` row). `0026` seeds all eleven
-- day-one slugs directly, every body marked `DRAFT — not legal advice, pending review`, with `is-placeholder` in
-- `change_summary` as the pointer intended. Corrected by the database pass over `0026`, 2026-09-19 (LOW).
--
-- Forced by: consent_records and biometric_consent_records (0004) reference (document_id, version);
--            the child_invites schema gate (0012).
-- Rollback twin: supabase/rollbacks/0003_legal-documents.rollback.sql
--
-- @adr ADR-072 — London is the controller; these are E&W documents, not the AU bodies (02 §5 row 12).
-- C-4 — append-only: no updated_at, no UPDATE/DELETE policy, prevent_row_modification() attached.

create table if not exists public.legal_documents (
  document_id           text        not null,
  version               integer     not null,
  effective_date        date        not null,
  body_md               text        not null,
  content_hash          text        not null,
  change_summary        text,
  requires_reacceptance boolean     not null default false,
  reacceptance_deadline date,
  created_at            timestamptz not null default now(),

  constraint legal_documents_pkey primary key (document_id, version),
  constraint legal_documents_version_positive_check check (version >= 1),
  constraint legal_documents_body_not_blank_check   check (length(btrim(body_md)) > 0),
  -- 02 §4.1 row 4: requires_reacceptance ⇒ deadline set
  constraint legal_documents_reacceptance_deadline_check
    check (not requires_reacceptance or reacceptance_deadline is not null),
  -- day-one slugs (02 §4.1 row 4). Add-only, like an enum, but kept as a CHECK because the set is
  -- open in the same way `events.name` is (C-1): a new document is a migration, not a new type.
  constraint legal_documents_document_id_check check (document_id in (
    'client-tos',
    'professional-tos',
    'privacy-policy',
    'biometric-notice',
    'code-of-conduct',
    'cookie-policy',
    'disclaimer',
    'parent-app-consent',
    'nanny-attestation',
    'media-consent',
    'agr14_nanny_child_add'
  ))
);

comment on table public.legal_documents is
  '02 §4.1 row 4 / ADR-072: every version of every E&W document. Versions are append-only; a new wording is a new row, never an edit (the consent trail must keep pointing at the exact text that was accepted).';
comment on column public.legal_documents.content_hash is
  'Integrity check for the accepted body: a consent row cites (document_id, version), and this proves the body behind it never moved.';

create index if not exists legal_documents_effective_date_idx
  on public.legal_documents (document_id, effective_date desc);

drop trigger if exists legal_documents_append_only on public.legal_documents;
create trigger legal_documents_append_only
  before update or delete on public.legal_documents
  for each row execute function public.prevent_row_modification();

-- TRUNCATE bypasses RLS and fires no row trigger, so the append-only claim needs a
-- statement-level backstop as well (security-reviewer H3). 0000 also revokes the
-- TRUNCATE privilege; this is the second of the two locks.
drop trigger if exists legal_documents_no_truncate on public.legal_documents;
create trigger legal_documents_no_truncate
  before truncate on public.legal_documents
  for each statement execute function public.prevent_row_modification();

-- ---------------------------------------------------------------------------
-- RLS (02 C-10; 07 §5.2 row `legal_documents`) — everyone reads, nobody writes.
-- The legal pages, the consent modals and the renewal modal are all anonymous-
-- readable surfaces, so `anon` gets SELECT (07 §5.2 row 3).
-- ---------------------------------------------------------------------------

alter table public.legal_documents enable row level security;
alter table public.legal_documents force row level security;

drop policy if exists legal_documents_anon_select on public.legal_documents;
create policy legal_documents_anon_select on public.legal_documents
  for select to anon
  using (true);

drop policy if exists legal_documents_authenticated_select on public.legal_documents;
create policy legal_documents_authenticated_select on public.legal_documents
  for select to authenticated
  using (true);

-- No write policy for any client role: seed / migration only (02 §4.1 row 4).
-- (`USING (true)` on a SELECT policy is the documented "public read" shape and is
--  not the banned `WITH CHECK (true)` of 07 §5.1 rule 3, which is about writes.)

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.legal_documents') is null then
    raise exception '0003: public.legal_documents missing';
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'legal_documents'
      and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception '0003: legal_documents must ENABLE and FORCE row level security (02 C-10)';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'legal_documents' and cmd <> 'SELECT'
  ) then
    raise exception '0003: legal_documents must have no write policy (02 §4.1 row 4)';
  end if;
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relname = 'legal_documents' and t.tgname = 'legal_documents_append_only'
  ) then
    raise exception '0003: the C-4 append-only trigger is missing';
  end if;
  -- This file inserts nothing (HANDOFF §6.2: the v1 E&W rows are a Phase 3 seed
  -- migration). It deliberately does **not** assert the table is empty: once that
  -- Phase 3 migration has run, a re-run of this file would then fail on rows it did
  -- not write (database-reviewer M-2). What it can honestly assert is the shape.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'legal_documents'
      and column_name = 'body_md' and is_nullable = 'NO'
  ) then
    raise exception '0003: legal_documents.body_md must be NOT NULL (02 §4.1 row 4) - which is why no placeholder row may live in a migration';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'legal_documents' and column_name = 'updated_at'
  ) then
    raise exception '0003: an append-only table must not carry updated_at (C-4)';
  end if;
end
$$;
