-- 0021_nanny-onboarding.rollback.sql — the twin of supabase/migrations/0021_nanny-onboarding.sql (06 §4.2).
--
-- Drops the four functions 0021 adds. Nothing later references them (0021 is the last migration),
-- so this always succeeds on a database 0021 applied to. One transaction: a rollback that fails
-- midway must not leave half the objects standing (database-reviewer L-3 on 0017).
--
-- WHAT IS LOST, stated rather than hidden.
--
-- **No data.** Every row the three writers created — the nanny's role, profile, party and contact-state
-- rows, every profile column, every `is_isolated` that was cleared — stays exactly where it is. What is
-- lost is the ability to write those tables from the application at all: `0005` gives `nannies` no
-- client write policy and its verify block refuses one, so with the definers gone the apply funnel,
-- the profile completion and apply-from-portal return to reading the schema and not writing it. The
-- `onboarding-nanny` stores answer `INTERNAL` from the port rather than a silent success, which is the
-- honest signal.

begin;

drop function if exists public.lift_nanny_isolation();
drop function if exists public.update_nanny_profile(jsonb, jsonb);
drop function if exists public.create_nanny_account(text, text, boolean, text, text, text, uuid, jsonb);
drop function if exists public.nanny_profile_columns(jsonb);

commit;
