-- 0022_verification-wizard.rollback.sql — the twin of supabase/migrations/0022_verification-wizard.sql (06 §4.2).
--
-- Drops the five functions 0022 adds and the `evidence_id` column with its unique index. Nothing later
-- references them (0022 is the last migration), so this always succeeds on a database 0022 applied to. One
-- transaction: a rollback that fails midway must not leave half the objects standing.
--
-- WHAT IS LOST, stated rather than hidden.
--
-- **The idempotency key.** `vetting_submissions.evidence_id` is dropped with every value in it, so a replayed
-- submit after a rollback-and-reapply would insert a second ledger row rather than answer the first. On a
-- database where the wizard has never run (every environment today) that is no data at all.
--
-- **The road, not the rows.** Every `verifications` and `vetting_submissions` row the functions wrote stays as it
-- is. What is lost is the ability to write those tables from the wizard: `0008` gives `verifications` an admin
-- SELECT policy and nothing else, so the wizard returns to reading the schema (through `verification_status`)
-- and not writing it, and the `verification` port answers `INTERNAL` from the store rather than a silent success.

begin;

drop function if exists public.apply_vetting_check_result(uuid, text, text, text, jsonb, public.checked_by, timestamptz);
drop function if exists public.claim_verification_processing();
drop function if exists public.save_verification_contact();
drop function if exists public.submit_verification_evidence(uuid, public.verification_section, text, text, public.vetting_submission_status, jsonb);
drop function if exists public.verification_submission_columns(public.verification_section, jsonb);

drop index if exists public.vetting_submissions_evidence_id_key;
alter table public.vetting_submissions drop column if exists evidence_id;

commit;
