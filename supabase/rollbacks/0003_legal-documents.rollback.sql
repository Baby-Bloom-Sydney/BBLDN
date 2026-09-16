-- 0003_legal-documents.rollback.sql — the twin of supabase/migrations/0003_legal-documents.sql (06 §4.2).
--
-- Drops `legal_documents`. The consent tables of 0004 reference (document_id, version), so this
-- refuses while 0004 is applied — roll back in reverse order.
--
-- The table is append-only and carries the prevent_row_modification() trigger, but DROP TABLE is
-- DDL, not a row modification, so the trigger does not stand in the way.

-- Wrapped in one transaction (database-reviewer L-3): a rollback that fails midway -
-- a DROP TABLE refused by a live foreign key, which the headers above say is the
-- intended behaviour when a later migration is still applied - must not leave the
-- policies and triggers it already dropped on the floor.

begin;

drop policy if exists legal_documents_authenticated_select on public.legal_documents;
drop policy if exists legal_documents_anon_select on public.legal_documents;
drop trigger if exists legal_documents_no_truncate on public.legal_documents;
drop trigger if exists legal_documents_append_only on public.legal_documents;
drop table if exists public.legal_documents;

do $$
begin
  if to_regclass('public.legal_documents') is not null then
    raise exception '0003 rollback: public.legal_documents still present';
  end if;
end
$$;

commit;
