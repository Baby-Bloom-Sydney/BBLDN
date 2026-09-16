-- 0008_verification.rollback.sql — the twin of supabase/migrations/0008_verification.sql (06 §4.2).
--
-- Drops the two verification tables. Nothing later references them, so this rollback stands alone:
-- it may be run without unwinding 0009-0016 first. (The `verification_status` view of 0016 does
-- read `verifications`, so if 0016 is applied, drop that view first — its own twin does.)

-- Wrapped in one transaction (database-reviewer L-3): a rollback that fails midway -
-- a DROP TABLE refused by a live foreign key, which the headers above say is the
-- intended behaviour when a later migration is still applied - must not leave the
-- policies and triggers it already dropped on the floor.

begin;

drop policy if exists vetting_submissions_admin_select on public.vetting_submissions;
drop policy if exists verifications_admin_select on public.verifications;

drop trigger if exists verifications_set_updated_at on public.verifications;

drop table if exists public.vetting_submissions;
drop table if exists public.verifications;

do $$
declare
  v_t text;
begin
  foreach v_t in array array['vetting_submissions', 'verifications'] loop
    if to_regclass('public.' || v_t) is not null then
      raise exception '0008 rollback: public.% still present', v_t;
    end if;
  end loop;
end
$$;

commit;
