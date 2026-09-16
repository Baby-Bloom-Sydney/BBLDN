-- 0004_consent.rollback.sql — the twin of supabase/migrations/0004_consent.sql (06 §4.2).
--
-- Drops the three consent tables and the cookie-specific immutability function.
-- verifications.biometric_consent_id (0008) and development_images.consent_record_id (0012)
-- reference these tables, so this refuses while they are applied.

-- Wrapped in one transaction (database-reviewer L-3): a rollback that fails midway -
-- a DROP TABLE refused by a live foreign key, which the headers above say is the
-- intended behaviour when a later migration is still applied - must not leave the
-- policies and triggers it already dropped on the floor.

begin;

drop policy if exists cookie_consent_records_admin_select on public.cookie_consent_records;
drop policy if exists cookie_consent_records_authenticated_insert on public.cookie_consent_records;
drop policy if exists cookie_consent_records_anon_insert on public.cookie_consent_records;
drop policy if exists biometric_consent_records_admin_select on public.biometric_consent_records;
drop policy if exists biometric_consent_records_self_select on public.biometric_consent_records;
drop policy if exists biometric_consent_records_self_insert on public.biometric_consent_records;
drop policy if exists consent_records_admin_select on public.consent_records;
drop policy if exists consent_records_self_select on public.consent_records;
drop policy if exists consent_records_self_insert on public.consent_records;

drop trigger if exists cookie_consent_records_no_truncate on public.cookie_consent_records;
drop trigger if exists biometric_consent_records_no_truncate on public.biometric_consent_records;
drop trigger if exists consent_records_no_truncate on public.consent_records;
drop trigger if exists biometric_consent_records_guard_insert on public.biometric_consent_records;
drop trigger if exists consent_records_guard_insert on public.consent_records;
drop trigger if exists cookie_consent_records_append_only on public.cookie_consent_records;
drop trigger if exists biometric_consent_records_append_only on public.biometric_consent_records;
drop trigger if exists consent_records_append_only on public.consent_records;

drop table if exists public.cookie_consent_records;
drop table if exists public.biometric_consent_records;
drop table if exists public.consent_records;

drop function if exists public.prevent_cookie_consent_modification();
drop function if exists public.guard_biometric_consent_insert();
drop function if exists public.guard_consent_record_insert();

do $$
declare
  v_t text;
begin
  foreach v_t in array array['consent_records', 'biometric_consent_records', 'cookie_consent_records'] loop
    if to_regclass('public.' || v_t) is not null then
      raise exception '0004 rollback: public.% still present', v_t;
    end if;
  end loop;
  if to_regprocedure('public.prevent_cookie_consent_modification()') is not null then
    raise exception '0004 rollback: prevent_cookie_consent_modification() still present';
  end if;
end
$$;

commit;
