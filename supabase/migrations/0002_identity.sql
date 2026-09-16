-- 0002_identity.sql — the ordered migration set (02-data-model.md §6 row 0002)
--
-- Creates: `user_roles` and `user_profiles` (02 §4.1 rows 2-3) and the three RLS role helpers
-- `is_admin()` · `is_parent()` · `is_nanny()` (02 §7; 07 §5.1 rule 2).
--
-- Forced by: every domain row FKs `auth.users` or `user_profiles`; `user_profiles.district -> areas` (0001).
-- Rollback twin: supabase/rollbacks/0002_identity.rollback.sql
--
-- Why this file is a security control, not just two tables (S4 handover): `auth.signUp` and
-- `auth.grantRole` check the caller in code, but the reason those checks are *sufficient* rather
-- than merely necessary is that **02 §4.1 gives no client role an INSERT or UPDATE policy on
-- `user_roles`**. Without the policies below, any authenticated user could PATCH their own row
-- through PostgREST and become an admin. Nothing is deployed until this migration is applied.
--
-- @adr ADR-042 / ADR-066 — `auth.users` is the identity root; `user_profiles.email` mirrors it and
--      is re-synced by the auth callback. **No trigger on `auth.users`** (C-8): the managed project
--      rejects them (stocktake 11), and Sydney's `sync_user_profile_email` is not carried (02 §5 row 12).
-- @adr ADR-030 — "any admin login"; `user_role` has no `super_admin` (R-12, 02 §5 row 7).
-- @adr ADR-102 — mobile numbers are UK only: E.164 `+44…`, the C-7 CHECK.
-- R-7 — contact and location have exactly one owner, this table. `parents` and `nannies` (0005)
--      carry no mobile / area / DOB columns; matching joins `nannies -> user_profiles` for location.

-- ---------------------------------------------------------------------------
-- 1. `user_roles` (02 §4.1 row 2) — what the gate and every RLS helper read.
-- ---------------------------------------------------------------------------

create table if not exists public.user_roles (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  role       public.user_role not null,
  created_at timestamptz not null default now()
);

comment on table public.user_roles is
  '02 §4.1 / ADR-030: the one role row per user. 1:1 with auth.users, created in the signup action, never changed by the user. No client INSERT/UPDATE policy exists and none may be added (07 §5.4 row 3).';

create index if not exists user_roles_role_idx on public.user_roles (role);

-- ---------------------------------------------------------------------------
-- 2. `user_profiles` (02 §4.1 row 3; R-7) — the one profile for parents and nannies.
-- ---------------------------------------------------------------------------

create table if not exists public.user_profiles (
  id                   uuid        primary key default gen_random_uuid(),
  user_id              uuid        not null unique references auth.users (id) on delete cascade,
  first_name           text,
  last_name            text,
  email                extensions.citext,
  mobile               text,
  date_of_birth        date,
  district             text        references public.areas (district),
  area                 text,
  profile_picture_path text,
  is_test_user         boolean     not null default false,
  deactivated_at       timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- C-7 / ADR-102: E.164, UK only. 9 or 10 digits after +44 - 10 for mobiles (7…) and
  -- most landlines, 9 for the shorter GB landline ranges (e.g. +44 16977 xxxx).
  constraint user_profiles_mobile_e164_gb_check
    check (mobile is null or mobile ~ '^\+44[1-9][0-9]{8,9}$'),
  -- no bucket path may be an absolute URL (02 I-V7's sibling rule; 07 §5.3)
  -- fix: security-reviewer H2 / database-reviewer C-2. 07 §5.3 rule 1 makes all three
  -- buckets private precisely so a guessed path is not access; the signed URL is minted
  -- FROM this column, so a user who can point it at another user's prefix has a minting
  -- oracle. The path is therefore tied to the row's own user_id in the database, which
  -- holds no matter who writes the column.
  constraint user_profiles_picture_path_owned_check
    check (profile_picture_path is null
           or profile_picture_path ~ ('^(parent|nanny)/' || user_id::text || '/'))
);

comment on table public.user_profiles is
  '02 §4.1 / R-7: the single owner of contact and location for every customer role. parents and nannies carry no mobile, area or DOB.';
comment on column public.user_profiles.email is
  'C-8: citext mirror of auth.users.email, re-synced by the auth callback. No trigger on auth.users (stocktake 11).';
comment on column public.user_profiles.area is
  'C-6: denormalised display name of `district` at write time, checked by the areas connector rather than a trigger so the connector stays swappable (03 §6).';
comment on column public.user_profiles.is_test_user is
  'ADR-024: keeps seeded and internal purchases out of every metric.';

-- D-9: the matching hot query joins nannies -> user_profiles for location (R-7).
create index if not exists user_profiles_district_idx
  on public.user_profiles (district);

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;
create trigger user_profiles_set_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Protected columns (07 §5.1 rule 4).
--    A policy cannot compare OLD to NEW, so the columns a user may never write
--    are held by a trigger instead of a column grant. The privileged callers -
--    the auth callback re-syncing `email`, admin-on-behalf, the upload action,
--    the retention jobs - are recognised by `is_privileged_writer()` (0000).
--    NOT by `auth.uid() is null`: SECURITY DEFINER changes `current_user` but
--    leaves the request's JWT claims alone, so a definer invoked from a user
--    session still sees that user's uid and would have been refused - which is
--    to say the first draft made 07 §5.1 rule 4's own pattern unimplementable
--    (security-reviewer H1, database-reviewer H-1, both measured).
-- ---------------------------------------------------------------------------

create or replace function public.guard_user_profiles_protected_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_privileged_writer() then
    return new;  -- service role, the owner, or a module SECURITY DEFINER (07 §5.1 rule 4)
  end if;
  if new.profile_picture_path is distinct from old.profile_picture_path then
    raise exception 'user_profiles.profile_picture_path is written by the upload action only (07 §5.2)'
      using errcode = 'insufficient_privilege';
  end if;
  if new.email is distinct from old.email then
    raise exception 'user_profiles.email is written by the auth callback only (02 §4.1, C-8)'
      using errcode = 'insufficient_privilege';
  end if;
  if new.is_test_user is distinct from old.is_test_user then
    raise exception 'user_profiles.is_test_user is admin-only (ADR-024)'
      using errcode = 'insufficient_privilege';
  end if;
  if new.deactivated_at is distinct from old.deactivated_at then
    raise exception 'user_profiles.deactivated_at is written by the account jobs only (07 §6)'
      using errcode = 'insufficient_privilege';
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception 'user_profiles.user_id is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists user_profiles_guard_protected_columns on public.user_profiles;
create trigger user_profiles_guard_protected_columns
  before update on public.user_profiles
  for each row execute function public.guard_user_profiles_protected_columns();

-- ---------------------------------------------------------------------------
-- 4. RLS role helpers (02 §7; 07 §5.1 rule 2).
--    SECURITY DEFINER so a policy on `user_roles` cannot recurse into itself;
--    STABLE so the planner calls them once per statement; search_path pinned.
--    `current_parent_id()` / `current_nanny_id()` are the same shape but read
--    `parents` / `nannies`, which do not exist until 0005 — they are created
--    there. (HANDOFF §6.2 lists all five on this row; the two party helpers
--    cannot compile before their tables exist. Recorded, not silently moved.)
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = auth.uid() and r.role = 'admin'
  );
$$;

create or replace function public.is_parent()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = auth.uid() and r.role = 'parent'
  );
$$;

create or replace function public.is_nanny()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = auth.uid() and r.role = 'nanny'
  );
$$;

comment on function public.is_admin() is
  '02 §7 / 07 §5.1 rule 2: reads user_roles, never raw_user_meta_data. Katie''s is_admin_user() folds into this one.';

revoke all on function public.is_admin() from public;
revoke all on function public.is_parent() from public;
revoke all on function public.is_nanny() from public;
-- 0000 revoked EXECUTE in `public` from anon and authenticated by default (security-reviewer C1),
-- so these grants are the whole of what a client may call. `anon` is deliberately absent: they
-- always answer false for an anonymous caller, and 07 §5.2 gives `anon` no admin or party surface.
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_parent() to authenticated, service_role;
grant execute on function public.is_nanny() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. RLS (02 C-10; 07 §5.2 rows `user_roles`, `user_profiles`).
--    Cross-role reads (a parent reading a visible nanny, a nanny reading a
--    connected parent) arrive in 0016 with the `nanny_public` and
--    `connection_party_contact` views, whose predicates need 0005-0007.
-- ---------------------------------------------------------------------------

alter table public.user_roles enable row level security;
alter table public.user_roles force row level security;

drop policy if exists user_roles_self_select on public.user_roles;
create policy user_roles_self_select on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists user_roles_admin_select on public.user_roles;
create policy user_roles_admin_select on public.user_roles
  for select to authenticated
  using ((select public.is_admin()));

-- Deliberately no INSERT / UPDATE / DELETE policy for any client role: writes are
-- service-role only (02 §4.1 row 2; 07 §5.4 row 3). Adding one is a privilege escalation.

alter table public.user_profiles enable row level security;
alter table public.user_profiles force row level security;

drop policy if exists user_profiles_self_select on public.user_profiles;
create policy user_profiles_self_select on public.user_profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists user_profiles_admin_select on public.user_profiles;
create policy user_profiles_admin_select on public.user_profiles
  for select to authenticated
  using ((select public.is_admin()));

drop policy if exists user_profiles_self_update on public.user_profiles;
create policy user_profiles_self_update on public.user_profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- INSERT is service role only: the signup action creates exactly one profile row
-- per user in the same transaction as the role row (02 §4.1 row 3).

-- ---------------------------------------------------------------------------
-- 6. Verify
-- ---------------------------------------------------------------------------

do $$
declare
  v_t text;
  v_policies int;
begin
  foreach v_t in array array['user_roles', 'user_profiles'] loop
    if to_regclass('public.' || v_t) is null then
      raise exception '0002: public.% missing', v_t;
    end if;
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_t
        and c.relrowsecurity and c.relforcerowsecurity
    ) then
      raise exception '0002: public.% must ENABLE and FORCE row level security (02 C-10)', v_t;
    end if;
  end loop;

  -- the escalation guard: no write policy on user_roles, for any role, ever
  select count(*) into v_policies
  from pg_policies
  where schemaname = 'public' and tablename = 'user_roles' and cmd <> 'SELECT';
  if v_policies <> 0 then
    raise exception '0002: user_roles has % non-SELECT policy(ies); writes are service role only (02 §4.1, 07 §5.4 row 3)', v_policies;
  end if;

  -- 07 §5.1 rule 3: no WITH CHECK (true) anywhere in this migration's tables
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename in ('user_roles', 'user_profiles')
      and with_check = 'true'
  ) then
    raise exception '0002: a policy uses WITH CHECK (true) (07 §5.1 rule 3)';
  end if;

  foreach v_t in array array['is_admin', 'is_parent', 'is_nanny'] loop
    if to_regprocedure('public.' || v_t || '()') is null then
      raise exception '0002: helper public.%() missing (02 §7)', v_t;
    end if;
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_t and p.prosecdef
        and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
                    where cfg like 'search_path=%')
    ) then
      raise exception '0002: helper public.%() must be SECURITY DEFINER with search_path pinned (07 §5.1 rule 2)', v_t;
    end if;
  end loop;

  -- fix: database-reviewer H-3 / security-reviewer M2. Every table in this schema is
  -- FORCE RLS, so a SECURITY DEFINER helper whose owner lacks BYPASSRLS has row security
  -- applied to it as the owner - and no policy is TO that role. is_admin() would then
  -- return false for every admin, silently, and the policy on user_roles that calls it
  -- would recurse. Both are properties of the *owner*, so assert the owner.
  foreach v_t in array array['is_admin', 'is_parent', 'is_nanny'] loop
    if not exists (
      select 1 from pg_proc p join pg_roles r on r.oid = p.proowner
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_t and (r.rolbypassrls or r.rolsuper)
    ) then
      raise exception '0002: public.%() must be owned by a role with BYPASSRLS, or FORCE RLS makes it answer false for everyone and the user_roles policy recurses', v_t;
    end if;
  end loop;

  if not exists (
    select 1 from pg_constraint
    where conname = 'user_profiles_mobile_e164_gb_check'
  ) then
    raise exception '0002: the C-7 / ADR-102 mobile CHECK is missing';
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'user_profiles_picture_path_owned_check'
  ) then
    raise exception '0002: the profile_picture_path ownership CHECK is missing (07 §5.3 rule 1)';
  end if;

  if to_regclass('public.user_profiles_district_idx') is null then
    raise exception '0002: index user_profiles_district_idx missing (D-9)';
  end if;

  -- C-8: no trigger may exist on auth.users
  if exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth' and c.relname = 'users' and not t.tgisinternal
  ) then
    raise exception '0002: a trigger exists on auth.users (C-8 forbids it)';
  end if;
end
$$;
