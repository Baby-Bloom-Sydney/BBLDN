-- 0017_consent-purpose-rate-limits-profile.sql — the ordered migration set (02-data-model.md §6 row 0017)
--
-- Creates: enum `consent_purpose` + `consent_records.purpose`; `rate_limit_buckets` +
-- `consume_rate_limit()`; `create_parent_profile()`; `record_cookie_consent()`.
--
-- Forced by: nothing later — this is the first migration **after** the `0000`–`0016` set, and every
-- object in it is additive. Nothing here drops, renames or narrows anything `0000`–`0016` created,
-- so the set still applies forwards from an empty database in one pass.
-- Rollback twin: supabase/rollbacks/0017_consent-purpose-rate-limits-profile.rollback.sql
--
-- Why one file for four objects: they are one ruling. ADR-131 recorded three contract defects that
-- P1-WIRE found by being the first code to actually read 02 and 03 — a port that could not read a
-- row, a consent table with no purpose, a limiter with no store — and `1c` found the fourth by being
-- the first code to sign a parent up. 02 §6's "one file per table group" is about the dependency
-- order of the fresh build; these four share no table but they share a cause and a review.
--
-- @adr ADR-131 (2) — `consent_records.purpose`. 07 §2.7(a) and ADR-103 require consent to be recorded
--      **per purpose**; 02 §4.1 never gave the table the column that makes that possible, so a row
--      written for `vaccination-status` had `document_id IS NULL` and could not be attributed to any
--      purpose on the way back. `consent-record-from-row.ts` skipped such a row and `hasConsent`
--      answered `false` — fail-closed, but a consent log that cannot read back its own evidence is
--      not Art 7(1) evidence. The column is the fix; the CHECK is what stops it drifting from
--      `document_id`.
-- @adr ADR-131 (3) — `rate_limit_buckets`. 07 §8 names it as the shared limiter store and 02 never
--      defined it, so `wire-rate-limiter.ts` could not honestly call `configureRateLimiter(_, 'shared')`
--      and `assertSharedStore` (correctly) denied every `consume` in production. Every limit in 07 §8
--      was therefore per-instance, i.e. N × the limit across N serverless instances.
-- @adr ADR-127 — one RPC is one transaction. `consume_rate_limit`, `record_cookie_consent` and
--      `create_parent_profile` are each a definer function for the same reason: each is a
--      read-then-write or a two-table write that PostgREST cannot make atomic from a client.
-- @adr ADR-042 / 02 §4.1 — `create_parent_profile` writes the `user_profiles` **and** `user_roles`
--      rows 02 §4.1 says the signup action creates ("exactly one … per user … no triggers (C-8)").
--      It takes no user id: the row is minted for `auth.uid()`, so the function cannot be pointed at
--      anyone else whatever a caller passes.
-- 07 §5.1 rule 5 / §5.2 — `rate_limit_buckets` carries no client policy at all (the `events` pattern);
--      `EXECUTE` on `consume_rate_limit` and `record_cookie_consent` is `service_role` only, on
--      `create_parent_profile` `authenticated` only. `anon` gets nothing.

-- ---------------------------------------------------------------------------
-- 1. `consent_purpose` (02 §3, cluster "shared") — what a consent row is *for*.
--
--    Values, ordinals frozen: the eleven `legal_documents` day-one slugs in
--    02 §4.1's order, then the three non-document purposes 07 §2.7(a) and
--    ADR-131 (2) name. `shared-types/enums/shared.ts` holds the same tuple in
--    the same order and `enum-ordinals.test.ts` fails if the two ever disagree.
--    Add-only, like every enum in 02 §3.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'consent_purpose'
  ) then
    create type public.consent_purpose as enum (
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
      'agr14_nanny_child_add',
      'vaccination-status',
      'marketing',
      'cookie'
    );
  end if;
end
$$;

comment on type public.consent_purpose is
  '02 §3 / 07 §2.7(a) / ADR-131 (2): what a consent_records row is for. The eleven legal_documents slugs plus the three non-document purposes. Ordinals are frozen and mirrored by shared-types/enums/shared.ts (02 C-1).';

-- ---------------------------------------------------------------------------
-- 2. `consent_records.purpose` (02 §4.1 row 5).
--
--    Added nullable, backfilled from `document_id`, then made NOT NULL — the
--    only order that is safe on a table that may already hold rows. The
--    backfill raises rather than guessing if a row cannot be attributed: an
--    un-attributable consent row is a data-protection problem, not a column
--    default. On a fresh database (02 §1) there are none.
--
--    Adding a column does **not** trip `prevent_row_modification()` (0000): that
--    trigger fires on row UPDATE/DELETE, and ALTER TABLE is neither.
-- ---------------------------------------------------------------------------

alter table public.consent_records
  add column if not exists purpose public.consent_purpose;

do $$
declare
  v_orphans int;
begin
  update public.consent_records
     set purpose = document_id::public.consent_purpose
   where purpose is null
     and document_id is not null;

  select count(*) into v_orphans from public.consent_records where purpose is null;
  if v_orphans <> 0 then
    raise exception
      '0017: % consent_records row(s) carry neither a purpose nor a document_id and cannot be attributed (ADR-131 (2)); attribute them by hand before applying', v_orphans;
  end if;
end
$$;

alter table public.consent_records
  alter column purpose set not null;

comment on column public.consent_records.purpose is
  '07 §2.7(a) / ADR-131 (2): what this consent is for. A document purpose repeats document_id (the CHECK enforces it); vaccination-status / marketing / cookie carry no document. Without this column a non-document consent could not be read back and hasConsent answered false for it.';

-- The purpose and the document pair cannot disagree. Deliberately **not** a rule that every
-- non-document purpose is one of the three: 02 §4.1 makes (document_id, document_version) "nullable
-- for informed actions", and forbidding that here would narrow the table beyond what 02 allows.
alter table public.consent_records
  drop constraint if exists consent_records_purpose_document_check;
alter table public.consent_records
  add constraint consent_records_purpose_document_check
  check (document_id is null or document_id = purpose::text);

-- The `latestConsent(userId, purpose)` read (03 §9.5; ADR-131 (1)) is keyed on user_id and then
-- filtered by purpose; this index is what keeps it from degrading into a per-user scan as the trail
-- grows. It does not replace the (user_id, agreement_id, created_at desc) index 0004 created.
create index if not exists consent_records_user_purpose_idx
  on public.consent_records (user_id, purpose, created_at desc);

-- ---------------------------------------------------------------------------
-- 3a. The three function names below belong to `0017` alone — no earlier migration defines any of
--     them. Postgres keys a function by name **and argument list**, so a `create or replace` after a
--     signature change leaves the previous overload standing and `q.rpc(name, args)` then resolves
--     by whichever overload matches: a stale definer nobody remembers granting. Dropping every
--     overload of the three names first makes this file idempotent across its own signature changes.
-- ---------------------------------------------------------------------------

do $$
declare
  v_sig text;
begin
  for v_sig in
    select p.oid::regprocedure::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('consume_rate_limit', 'create_parent_profile', 'record_cookie_consent')
  loop
    execute format('drop function %s', v_sig);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. `rate_limit_buckets` (02 §4.6; 07 §8) — the shared token-bucket store.
--
--    One row per (key, window). `bucket` is opaque to the database: the key the
--    caller derived — a user id, an IP + User-Agent hash, an email hash or a
--    token, **never** the consent-gated visitor_id (07 §2.9 / §8 row 4) —
--    already hashed by `platform/rate-limit`, joined to the window it counts in.
--    The database never interprets it and never logs it.
--
--    No client role at all: ENABLE + FORCE RLS and not one policy, the same
--    shape `events` has (07 §5.2). The only way in is `consume_rate_limit()`.
-- ---------------------------------------------------------------------------

create table if not exists public.rate_limit_buckets (
  bucket     text        primary key,
  count      integer     not null,
  reset_at   timestamptz not null,
  updated_at timestamptz not null default now(),

  constraint rate_limit_buckets_count_positive_check check (count > 0),
  -- a window that has already expired at the moment it is written is not a window
  constraint rate_limit_buckets_window_open_check check (reset_at > updated_at)
);

comment on table public.rate_limit_buckets is
  '07 §8 / ADR-131 (3): the identity-layer token bucket. One counter per (key, window), keyed by an already-hashed caller identity. Service role only — no client policy exists and none may be added. Rows are disposable: a lost row costs one window''s allowance, never access.';
comment on column public.rate_limit_buckets.bucket is
  'The hashed caller key joined to its window. Opaque here; never logged (07 §8, 01 §4a rule 1). Never the visitor_id (07 §2.9 / §8 row 4).';

create index if not exists rate_limit_buckets_reset_at_idx
  on public.rate_limit_buckets (reset_at);

alter table public.rate_limit_buckets enable row level security;
alter table public.rate_limit_buckets force row level security;
-- deliberately no policy: no client role reads or writes the limiter (07 §5.2, the `events` pattern).

revoke all on public.rate_limit_buckets from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. `consume_rate_limit()` — the atomic increment (ADR-127).
--
--    `platform/rate-limit`'s store port is `increment(bucket, windowSeconds, now)
--    -> { count, resetAt }`. Read-then-write from a client would undercount
--    under exactly the concurrency the limiter exists for, so the read, the
--    window roll and the increment are one statement: INSERT … ON CONFLICT DO
--    UPDATE, where the UPDATE either rolls the window (if it has expired) or
--    adds one to the count inside it.
-- ---------------------------------------------------------------------------

create or replace function public.consume_rate_limit(
  p_bucket         text,
  p_window_seconds integer,
  p_now            timestamptz
)
returns table (count integer, reset_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  insert into public.rate_limit_buckets as b (bucket, count, reset_at, updated_at)
  values (p_bucket, 1, p_now + make_interval(secs => p_window_seconds), p_now)
  on conflict (bucket) do update
    set count      = case when b.reset_at <= p_now then 1 else b.count + 1 end,
        reset_at   = case when b.reset_at <= p_now
                          then p_now + make_interval(secs => p_window_seconds)
                          else b.reset_at end,
        updated_at = p_now
  returning b.count, b.reset_at;
$$;

comment on function public.consume_rate_limit(text, integer, timestamptz) is
  '07 §8 / ADR-127: one statement does the read, the window roll and the increment, because a read-then-write from a client undercounts under exactly the concurrency a limiter is for. Service role only.';

revoke all on function public.consume_rate_limit(text, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 5. `create_parent_profile()` — the signup pair (02 §4.1; L-007 `1c`).
--
--    02 §4.1 says every user has exactly one `user_roles` row and one
--    `user_profiles` row, "created in the signup action; no triggers (C-8)".
--    Neither table has a client INSERT policy (07 §5.4 row 3 forbids adding
--    one), so the signup action had nothing to write through and `1c` pinned
--    the gap. This is that writer.
--
--    It takes **no user id**: the rows are minted for `auth.uid()`. A caller
--    cannot create a profile for anyone else, whatever it passes.
--
--    Idempotent: signup can be retried, and the auth user may already exist
--    from a passwordless catch (ADR-042). A second call is a no-op, not an
--    error and not an overwrite — in particular it never re-roles a user who is
--    already a nanny.
-- ---------------------------------------------------------------------------

create or replace function public.create_parent_profile(
  p_first_name text,
  p_last_name  text,
  p_mobile     text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email   extensions.citext;
begin
  if v_user_id is null then
    raise exception 'create_parent_profile: no session (07 §4)' using errcode = '42501';
  end if;

  select u.email::extensions.citext into v_email from auth.users u where u.id = v_user_id;

  -- 02 §4.1: the role row is never changed by the user, and never re-roled here.
  insert into public.user_roles (user_id, role)
  values (v_user_id, 'parent')
  on conflict (user_id) do nothing;

  -- `email` mirrors the auth email (C-8); `mobile` is checked by the table's own E.164 GB constraint,
  -- so a bad value is refused by the schema rather than by a second copy of the rule in here.
  insert into public.user_profiles (user_id, first_name, last_name, email, mobile)
  values (v_user_id, p_first_name, p_last_name, v_email, p_mobile)
  on conflict (user_id) do nothing;
end
$$;

comment on function public.create_parent_profile(text, text, text) is
  '02 §4.1 / L-007 1c: mints the user_roles + user_profiles pair for auth.uid() at signup. Takes no user id on purpose. Idempotent, and never re-roles an existing user.';

revoke all on function public.create_parent_profile(text, text, text) from public, anon;
grant execute on function public.create_parent_profile(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. `record_cookie_consent()` — the new row and the supersede stamp (ADR-127).
--
--    02 §4.1 row 7: a change inserts a new row and sets `superseded_by` on the
--    old one — "the one permitted UPDATE, service role". Those cannot be two
--    PostgREST statements: between them the table would show two current rows
--    for one visitor, which is what `currentCookie` reads. One transaction.
-- ---------------------------------------------------------------------------

create or replace function public.record_cookie_consent(
  p_id          uuid,
  p_visitor_id  text,
  p_choice      public.cookie_choice,
  p_analytics   boolean,
  p_marketing   boolean,
  p_expiry_date timestamptz,
  p_created_at  timestamptz,
  -- the three nullable columns of 02 §4.1 row 7 carry a DEFAULT so `supabase gen types` spells them
  -- optional rather than `string`, which is what the connector actually has: an absent ip / user agent
  -- is an omitted argument, not a `null` the type system has to be lied to about.
  p_user_id     uuid default null,
  p_ip          inet default null,
  p_user_agent  text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_superseded uuid;
begin
  select c.id into v_superseded
    from public.cookie_consent_records c
   where c.visitor_id = p_visitor_id
     and c.superseded_by is null
   order by c.created_at desc
   limit 1
   for update;

  insert into public.cookie_consent_records
    (id, visitor_id, user_id, consent_choice, analytics_enabled, marketing_enabled,
     ip_address, user_agent, expiry_date, created_at)
  values
    (p_id, p_visitor_id, p_user_id, p_choice, p_analytics, p_marketing,
     p_ip, p_user_agent, p_expiry_date, p_created_at);

  if v_superseded is not null then
    update public.cookie_consent_records
       set superseded_by = p_id
     where id = v_superseded;
  end if;

  return v_superseded;
end
$$;

comment on function public.record_cookie_consent(uuid, text, public.cookie_choice, boolean, boolean, timestamptz, timestamptz, uuid, inet, text) is
  '02 §4.1 row 7 / ADR-127: the new cookie row and the superseded_by stamp on the one it replaces, in one transaction — between two PostgREST statements a visitor would briefly have two current rows. Service role only (07 §5.1 rule 5).';

revoke all on function public.record_cookie_consent(uuid, text, public.cookie_choice, boolean, boolean, timestamptz, timestamptz, uuid, inet, text) from public, anon, authenticated;
grant execute on function public.record_cookie_consent(uuid, text, public.cookie_choice, boolean, boolean, timestamptz, timestamptz, uuid, inet, text) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Verify — the migration asserts its own claims (the 0000–0016 convention).
-- ---------------------------------------------------------------------------

do $$
declare
  v_labels text[];
  v_bad    int;
begin
  -- the enum, in order (02 C-1: the ordinals are the contract, not the set)
  select array_agg(e.enumlabel::text order by e.enumsortorder) into v_labels
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    join pg_enum e on e.enumtypid = t.oid
   where n.nspname = 'public' and t.typname = 'consent_purpose';
  if v_labels is null then
    raise exception '0017: enum public.consent_purpose missing';
  end if;
  if v_labels <> array[
    'client-tos','professional-tos','privacy-policy','biometric-notice','code-of-conduct',
    'cookie-policy','disclaimer','parent-app-consent','nanny-attestation','media-consent',
    'agr14_nanny_child_add','vaccination-status','marketing','cookie'
  ] then
    raise exception '0017: consent_purpose ordinals are not the 02 §3 order: %', v_labels;
  end if;

  -- the column and its NOT NULL
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'consent_records'
      and column_name = 'purpose' and is_nullable = 'NO'
  ) then
    raise exception '0017: consent_records.purpose missing or nullable (ADR-131 (2))';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'consent_records_purpose_document_check') then
    raise exception '0017: consent_records_purpose_document_check missing';
  end if;
  if not exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = 'consent_records_user_purpose_idx'
  ) then
    raise exception '0017: consent_records_user_purpose_idx missing';
  end if;
  -- C-4 survives: adding a column must not have added an updated_at or a write policy
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'consent_records' and column_name = 'updated_at'
  ) then
    raise exception '0017: consent_records must stay append-only (C-4)';
  end if;

  -- the limiter store
  if to_regclass('public.rate_limit_buckets') is null then
    raise exception '0017: public.rate_limit_buckets missing (07 §8)';
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'rate_limit_buckets'
      and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception '0017: rate_limit_buckets must ENABLE and FORCE row level security (02 C-10)';
  end if;
  select count(*) into v_bad from pg_policies
   where schemaname = 'public' and tablename = 'rate_limit_buckets';
  if v_bad <> 0 then
    raise exception '0017: rate_limit_buckets carries % policy(ies); it is service-role only (07 §5.2)', v_bad;
  end if;

  -- the three definers exist and are definers with a pinned search_path
  if to_regprocedure('public.consume_rate_limit(text, integer, timestamptz)') is null then
    raise exception '0017: consume_rate_limit() missing';
  end if;
  if to_regprocedure('public.create_parent_profile(text, text, text)') is null then
    raise exception '0017: create_parent_profile() missing';
  end if;
  if to_regprocedure('public.record_cookie_consent(uuid, text, public.cookie_choice, boolean, boolean, timestamptz, timestamptz, uuid, inet, text)') is null then
    raise exception '0017: record_cookie_consent() missing';
  end if;
  select count(*) into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('consume_rate_limit', 'create_parent_profile', 'record_cookie_consent')
     and (not p.prosecdef or p.proconfig is null or not ('search_path=""' = any(p.proconfig)));
  if v_bad <> 0 then
    raise exception '0017: % of the three functions is not SECURITY DEFINER with search_path pinned (02 §7)', v_bad;
  end if;

  -- exactly one overload of each: see 3a — a leftover overload is a definer nobody granted on purpose
  select count(*) into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('consume_rate_limit', 'create_parent_profile', 'record_cookie_consent');
  if v_bad <> 3 then
    raise exception '0017: expected exactly 3 functions across the three names, found %', v_bad;
  end if;

  -- 07 §5.2: anon may execute none of them; authenticated only create_parent_profile
  if has_function_privilege('anon', 'public.consume_rate_limit(text, integer, timestamptz)', 'execute')
     or has_function_privilege('anon', 'public.create_parent_profile(text, text, text)', 'execute')
     or has_function_privilege('anon', 'public.record_cookie_consent(uuid, text, public.cookie_choice, boolean, boolean, timestamptz, timestamptz, uuid, inet, text)', 'execute') then
    raise exception '0017: anon must not execute any 0017 function (07 §5.2)';
  end if;
  if has_function_privilege('authenticated', 'public.consume_rate_limit(text, integer, timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'public.record_cookie_consent(uuid, text, public.cookie_choice, boolean, boolean, timestamptz, timestamptz, uuid, inet, text)', 'execute') then
    raise exception '0017: the two service-role functions must not be executable by authenticated (07 §5.1 rule 5)';
  end if;
  if not has_function_privilege('authenticated', 'public.create_parent_profile(text, text, text)', 'execute') then
    raise exception '0017: create_parent_profile() must be executable by authenticated (02 §4.1)';
  end if;
end
$$;
