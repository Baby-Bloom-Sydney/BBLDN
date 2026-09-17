-- 0021_nanny-onboarding.sql — the ordered migration set (02-data-model.md §6 row 0021; ADR-152)
--
-- Creates: `create_nanny_account()`, `update_nanny_profile()`, `lift_nanny_isolation()` (02 §7) — the
-- nanny side's three `SECURITY DEFINER` writes.
--
-- Forced by: nothing later — like `0017`–`0020`, every object here is **additive**. No table, column,
-- policy, index or constraint is created, dropped, renamed or narrowed, so the set still applies
-- forwards from an empty database in one pass.
-- Rollback twin: supabase/rollbacks/0021_nanny-onboarding.rollback.sql
--
-- WHY THESE THREE FUNCTIONS EXIST.
--   `0005` gives `nannies` SELECT-only client policies and its own verify block raises if any write
--   policy is ever added (07 §5.1 rule 4: "column-level rules are enforced by SECURITY DEFINER actions
--   that write a named column set, not by column grants"). So the apply funnel (S-X-19), the ten-step
--   profile completion (S-N-18) and apply-from-portal (S-N-19) could read the schema and not write it —
--   the same shape P1-STORES measured on the parent chain before `0019`. `create_parent_profile()`
--   (`0017`) is the precedent for the signup pair; these extend it to the party row, the contact-state
--   row, the profile columns, and the one flag ADR-147 says has exactly one writer.
--
-- WHY `authenticated` AND NOT `service_role` (the opposite of `0019`'s stage-writers, for the same reason).
--   Every caller here IS the nanny, in her own session: she creates her own account row, completes her
--   own profile, lifts her own isolation by applying. `auth.uid()` is the honest authority test and a
--   null one is refused outright — running these under the service role would silently mean "no
--   session". The guarded columns of `0005` (`is_isolated`, `verification_level`, `suspended_at`,
--   `lead_id`, `commission_pitch_opted_in_at`, `is_vaccinated`, `profile_visible`) are simply not in
--   `update_nanny_profile()`'s column list, so a key naming one is dropped, not honoured — the grant
--   plus the static list IS the defence, as `0019`'s header says of its own functions.
--
-- WHAT `p_isolated` MEANS (ADR-147).
--   `nannies.is_isolated` defaults `true` so a row created without saying is invisible. The funnel is
--   the one road that says: `/apply` creates with `false`, S-X-07 with an invite creates with `true`.
--   Pool visibility is the conjunction `NOT is_isolated AND verification_level >= config` in every read
--   (`nannies_matching_idx`, `is_active_nanny()`, `nanny_public`), so a Path-A nanny at level 0 and an
--   invited nanny who has applied at level 0 are equally invisible; the flag records *having applied*.

-- ---------------------------------------------------------------------------
-- 1. `create_nanny_account()` — the signup pair, the party row, the contact-state row (ADR-152 (1)).
-- ---------------------------------------------------------------------------

create or replace function public.create_nanny_account(
  p_first_name text,
  p_last_name  text,
  p_isolated   boolean,
  p_mobile     text  default null,
  p_district   text  default null,
  p_area       text  default null,
  p_lead_id    uuid  default null,
  p_profile    jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id   uuid := auth.uid();
  v_email     extensions.citext;
  v_role      public.user_role;
  v_nanny_id  uuid;
  v_lead_ok   boolean := false;
  v_lead_ref  uuid;
  v_cols      public.nannies;
begin
  if v_user_id is null then
    raise exception 'create_nanny_account: no session (07 §4)' using errcode = '42501';
  end if;

  select u.email::extensions.citext into v_email from auth.users u where u.id = v_user_id;

  -- 02 §4.1: the role row is never changed by the user, and never re-roled here. A user who already
  -- holds another role is refused rather than given a second party row.
  select r.role into v_role from public.user_roles r where r.user_id = v_user_id;
  if v_role is not null and v_role <> 'nanny' then
    raise exception 'create_nanny_account: user already holds role % (02 §4.1)', v_role
      using errcode = '42501';
  end if;
  insert into public.user_roles (user_id, role)
  values (v_user_id, 'nanny')
  on conflict (user_id) do nothing;

  -- `email` mirrors the auth email (C-8); `mobile` is checked by the table's own E.164 GB constraint and
  -- `district` by its FK to `areas`, so a bad value is refused by the schema, not by a second copy here.
  insert into public.user_profiles (user_id, first_name, last_name, email, mobile, district, area)
  values (v_user_id, p_first_name, p_last_name, v_email, p_mobile, p_district, p_area)
  on conflict (user_id) do nothing;

  -- ADR-145 (2), applied to `nanny_leads`: a lead converts only if it is unclaimed AND its captured
  -- email is the account's. Anything else is left exactly as it was and the flag below says so.
  if p_lead_id is not null then
    update public.nanny_leads l
       set lead_status  = 'converted',
           converted_at = now(),
           auth_user_id = v_user_id
     where l.id = p_lead_id
       and l.converted_at is null
       -- `search_path = ''` hides `extensions`, so a bare `=` on two citext values resolves through the
       -- implicit cast to `text` and compares case-sensitively — `int.rpc-0021` caught it. The operator is
       -- named by schema so the comparison stays the citext one 02 §4.7 promises.
       and l.email operator(extensions.=) v_email
    returning l.id into v_lead_ref;
    v_lead_ok := v_lead_ref is not null;
  end if;

  -- The profile columns arrive as one jsonb merged over an empty row through the same static list
  -- `update_nanny_profile()` writes — no dynamic SQL, every value cast through the column's own type.
  v_cols := jsonb_populate_record(null::public.nannies, public.nanny_profile_columns(p_profile));

  insert into public.nannies (
    user_id, is_isolated, lead_id,
    bio, years_experience, qualification, certificates, languages,
    has_car, has_driving_licence, is_non_smoker, comfortable_with_pets,
    hourly_rate_min_pence, availability, available_from
  )
  values (
    v_user_id, p_isolated, v_lead_ref,
    v_cols.bio, v_cols.years_experience, v_cols.qualification,
    coalesce(v_cols.certificates, '{}'), coalesce(v_cols.languages, '{}'),
    v_cols.has_car, v_cols.has_driving_licence, v_cols.is_non_smoker, v_cols.comfortable_with_pets,
    v_cols.hourly_rate_min_pence, v_cols.availability, v_cols.available_from
  )
  on conflict (user_id) do nothing
  returning id into v_nanny_id;

  -- Idempotent: a second call answers the row that already exists, and changes nothing about it.
  if v_nanny_id is null then
    select n.id into v_nanny_id from public.nannies n where n.user_id = v_user_id;
  end if;

  -- 02 §4.7 row 3: every nanny is a lead; `is_isolated` mirrored (R-8's pattern).
  insert into public.nanny_contact_state (nanny_user_id, lead_status, is_isolated)
  values (v_user_id, 'untouched', p_isolated)
  on conflict (nanny_user_id) do nothing;

  return jsonb_build_object('nanny_id', v_nanny_id, 'lead_converted', v_lead_ok);
end
$$;

comment on function public.create_nanny_account(text, text, boolean, text, text, text, uuid, jsonb) is
  'ADR-152 (1) / 02 §4.1 + §4.2: mints user_roles + user_profiles + nannies + nanny_contact_state for auth.uid() in one transaction. is_isolated from the argument (ADR-147). A lead converts only if unclaimed and its email matches (ADR-145 (2)). Idempotent; never re-roles.';

revoke all on function public.create_nanny_account(text, text, boolean, text, text, text, uuid, jsonb) from public, anon;
grant execute on function public.create_nanny_account(text, text, boolean, text, text, text, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. `nanny_profile_columns()` — the static column list, in one place, so (1) and (3) cannot drift.
--    Not a road: it is a pure jsonb filter, IMMUTABLE, and grants nothing.
-- ---------------------------------------------------------------------------

create or replace function public.nanny_profile_columns(p_profile jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce((
    select jsonb_object_agg(e.key, e.value)
    from jsonb_each(coalesce(p_profile, '{}'::jsonb)) e
    where e.key in (
      'bio', 'years_experience', 'qualification', 'certificates', 'languages',
      'has_car', 'has_driving_licence', 'is_non_smoker', 'comfortable_with_pets',
      'hourly_rate_min_pence', 'availability', 'available_from'
    )
  ), '{}'::jsonb);
$$;

comment on function public.nanny_profile_columns(jsonb) is
  'ADR-152: the twelve nannies columns a nanny may write about herself. Every other key is dropped — the guarded columns of 0005 are guarded by not being here.';

revoke all on function public.nanny_profile_columns(jsonb) from public, anon;
grant execute on function public.nanny_profile_columns(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. `update_nanny_profile()` — the nanny's own row + her contact row; computes `profile_visible` (ADR-152 (2)).
-- ---------------------------------------------------------------------------

create or replace function public.update_nanny_profile(
  p_profile jsonb default '{}'::jsonb,
  p_contact jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id  uuid := auth.uid();
  v_row      public.nannies;
  v_new      public.nannies;
  v_contact  public.user_profiles;
  v_complete boolean;
begin
  if v_user_id is null then
    raise exception 'update_nanny_profile: no session (07 §4)' using errcode = '42501';
  end if;

  select * into v_row from public.nannies n where n.user_id = v_user_id for update;
  if not found then
    raise exception 'update_nanny_profile: no nannies row for this session (02 §4.2)' using errcode = 'P0002';
  end if;

  -- An omitted key keeps its value; a present key is cast through the column's own type.
  v_new := jsonb_populate_record(v_row, public.nanny_profile_columns(p_profile));

  update public.nannies n
     set bio                   = v_new.bio,
         years_experience      = v_new.years_experience,
         qualification         = v_new.qualification,
         certificates          = coalesce(v_new.certificates, '{}'),
         languages             = coalesce(v_new.languages, '{}'),
         has_car               = v_new.has_car,
         has_driving_licence   = v_new.has_driving_licence,
         is_non_smoker         = v_new.is_non_smoker,
         comfortable_with_pets = v_new.comfortable_with_pets,
         hourly_rate_min_pence = v_new.hourly_rate_min_pence,
         availability          = v_new.availability,
         available_from        = v_new.available_from
   where n.user_id = v_user_id;

  -- The contact half (R-7: location and mobile live on user_profiles). Present keys only.
  update public.user_profiles p
     set mobile        = case when p_contact ? 'mobile'        then nullif(p_contact->>'mobile', '')        else p.mobile        end,
         district      = case when p_contact ? 'district'      then nullif(p_contact->>'district', '')      else p.district      end,
         area          = case when p_contact ? 'area'          then nullif(p_contact->>'area', '')          else p.area          end,
         date_of_birth = case when p_contact ? 'date_of_birth' then (nullif(p_contact->>'date_of_birth', ''))::date else p.date_of_birth end
   where p.user_id = v_user_id
  returning * into v_contact;

  -- `03.18` — the completeness gate, computed here and nowhere else: this is profile_visible's one writer.
  v_complete := v_new.years_experience is not null
            and v_new.qualification is not null
            and v_new.hourly_rate_min_pence is not null
            and v_new.availability is not null
            and coalesce(v_new.bio, '') <> ''
            and v_contact.district is not null
            and v_contact.mobile is not null;

  update public.nannies n set profile_visible = v_complete where n.user_id = v_user_id;

  return v_complete;
end
$$;

comment on function public.update_nanny_profile(jsonb, jsonb) is
  'ADR-152 (2) / 03.18: the nanny''s own nannies row through nanny_profile_columns() plus user_profiles mobile/district/area/date_of_birth; profile_visible computed from the completeness rule and returned. The guarded columns are not in the list.';

revoke all on function public.update_nanny_profile(jsonb, jsonb) from public, anon;
grant execute on function public.update_nanny_profile(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. `lift_nanny_isolation()` — the one writer of is_isolated → false (ADR-147 / ADR-152 (3)).
-- ---------------------------------------------------------------------------

create or replace function public.lift_nanny_isolation()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_moved   boolean := false;
begin
  if v_user_id is null then
    raise exception 'lift_nanny_isolation: no session (07 §4)' using errcode = '42501';
  end if;

  update public.nannies n
     set is_isolated = false,
         isolation_lifted_at = now()
   where n.user_id = v_user_id
     and n.is_isolated;
  v_moved := found;

  -- R-8's pattern: the worklist tag mirrors the source of truth in the same transaction.
  update public.nanny_contact_state s
     set is_isolated = false
   where s.nanny_user_id = v_user_id
     and s.is_isolated;

  return v_moved;
end
$$;

comment on function public.lift_nanny_isolation() is
  'ADR-147 / ADR-152 (3): the one writer of nannies.is_isolated -> false for auth.uid(), mirrored onto nanny_contact_state. true when the flag moved; false when it was already clear.';

revoke all on function public.lift_nanny_isolation() from public, anon;
grant execute on function public.lift_nanny_isolation() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Verify — metadata only, on purpose. The behavioural claims live in `int.rpc-0021`.
-- ---------------------------------------------------------------------------

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array['create_nanny_account', 'update_nanny_profile', 'lift_nanny_isolation',
                              'nanny_profile_columns'] loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_fn
    ) then
      raise exception '0021: public.%() is missing', v_fn;
    end if;
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_fn
        and (p.prosecdef or v_fn = 'nanny_profile_columns')
        and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
    ) then
      raise exception '0021: public.%() must be SECURITY DEFINER with search_path pinned', v_fn;
    end if;
    if has_function_privilege('anon', (select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                        where n.nspname = 'public' and p.proname = v_fn), 'execute') then
      raise exception '0021: anon must not execute public.%()', v_fn;
    end if;
  end loop;

  -- 0005's rule still holds: this migration added no client write policy to nannies.
  if exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'nannies' and cmd <> 'SELECT'
  ) then
    raise exception '0021: nannies must stay SELECT-only for client roles (07 §5.1 rule 4)';
  end if;
end
$$;
