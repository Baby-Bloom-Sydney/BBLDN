-- 0014_leads.rollback.sql — the twin of supabase/migrations/0014_leads.sql (06 §4.2).
--
-- Drops the five lead / CRM tables and the nannies.lead_id foreign key 0014 added. The FK must go
-- before nanny_leads does. Nothing later references these tables.

begin;

alter table if exists public.nannies drop constraint if exists nannies_lead_id_fkey;
drop index if exists public.nannies_lead_idx;

drop policy if exists lead_notes_admin_select on public.lead_notes;
drop policy if exists lead_contacts_admin_select on public.lead_contacts;
drop policy if exists nanny_contact_state_admin_select on public.nanny_contact_state;

drop trigger if exists lead_notes_set_updated_at on public.lead_notes;
drop trigger if exists lead_contacts_set_updated_at on public.lead_contacts;
drop trigger if exists nanny_contact_state_set_updated_at on public.nanny_contact_state;
drop trigger if exists parent_leads_set_updated_at on public.parent_leads;
drop trigger if exists nanny_leads_set_updated_at on public.nanny_leads;

drop table if exists public.lead_notes;
drop table if exists public.lead_contacts;
drop table if exists public.nanny_contact_state;
drop table if exists public.parent_leads;
drop table if exists public.nanny_leads;

do $$
declare
  v_t text;
begin
  foreach v_t in array array['lead_notes', 'lead_contacts', 'nanny_contact_state',
                             'parent_leads', 'nanny_leads'] loop
    if to_regclass('public.' || v_t) is not null then
      raise exception '0014 rollback: public.% still present', v_t;
    end if;
  end loop;
  if exists (select 1 from pg_constraint where conname = 'nannies_lead_id_fkey') then
    raise exception '0014 rollback: the nannies.lead_id FK is still present';
  end if;
end
$$;

commit;
