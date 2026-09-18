-- 0028_erasure-job.sql — the ordered migration set (02-data-model.md §6 row 0028; **07 §6.1**, B-46)
--
-- **The right to erasure, executable.** 07 §6.1 has specified the path since Phase 0 and `3e` made the schema
-- safe for it (ADR-170), but nothing executed it: `/api/cron/delete-account` is a shell with no inside, no table
-- records a request, and the one table 07 §6.2 row 16 names as the evidence of deletion was never created. This
-- file is the database half of that job.
--
-- Creates: `public.file_retention_log` (07 §6.2 row 16) · `public.account_erasure_requests` (01 §4f's
--          "processes deletion requests", which nothing created) · `public.collect_erasure_objects()` ·
--          `public.erase_account()`.
-- Narrows: six person→history foreign keys from `on delete cascade` to `on delete set null`, and drops the six
--          NOT NULLs that made the cascade the only possible answer.
--
-- Rollback twin: supabase/rollbacks/0028_erasure-job.rollback.sql
--
-- ★ SECURITY CLAUSE, FORWARD-ONLY (ADR-165 (1), as ADR-177 generalised it). **Two clauses of this file are
--   forward-only and the twin does not undo them**, named here so the twin can name them back:
--     (1) the six foreign keys stay off `cascade` — re-arming a cascade that destroys a hire record or the other
--         party's connection history in the middle of an erasure is not a rollback, it is the incident;
--     (2) `file_retention_log`'s append-only triggers stay attached — handing UPDATE and DELETE on the evidence
--         that an object was deleted back to `service_role` is an access hole, and it is the one table whose
--         whole purpose is that nobody can quietly rewrite it (Art 5(2)).
--   What the twin DOES undo, and what that costs, is stated in its own header.
--
-- WHY THE SIX KEYS (measured against the applied stack before anything was changed, `3e`'s method).
--
--   | FK                                        | file      | on delete | what a `delete from parents/nannies` destroyed |
--   |-------------------------------------------|-----------|-----------|------------------------------------------------|
--   | `nanny_positions.parent_id`               | `0006:36` | cascade   | the position skeleton §6.2 row 6 keeps 24 months |
--   | `connection_requests.parent_id`           | `0007:36` | cascade   | **the nanny's** connection history                |
--   | `connection_requests.nanny_id`            | `0007:35` | cascade   | **the parent's** connection history               |
--   | `nanny_placements.parent_id`              | `0007:162`| cascade   | the hire record §6.2 row 6 keeps **6 years**      |
--   | `nanny_placements.nanny_id`               | `0007:161`| cascade   | the same hire record, from the other side         |
--   | `precheck_notifications.nanny_id`         | `0007:124`| cascade   | the pre-check row of §6.2 row 6                   |
--
--   **This is `3e`'s contradiction one class over, and it is the same sentence that produces it.** 07 §6.1 step 3
--   hard-deletes the `parents` / `nannies` rows on the product path, and in the same breath says positions and
--   connections "not yet past their §6 window are **anonymised instead** (the other party's history keeps ids)".
--   Under `cascade` that instruction is unreachable: the referential action fires before any job can anonymise
--   anything, and it takes the other party's history with it. A parent erasing her account silently deleted the
--   nanny's record of the placement she worked — which is not the parent's to erase, is a hire record the
--   Limitation Act says we keep for six years, and left no trace that it had existed.
--
--   `set null` and not `restrict`, for exactly 0027's reason: `restrict` would make the erasure job refuse on its
--   own product path. And **no pseudonym column**, which is where this file deliberately parts company with
--   0027: a safeguarding decision needs the erased subject to stay **correlatable** (Art 5(2) accountability is a
--   question about a person), while a class-B row needs the opposite — 07 §6.1 says anonymised, so the erased
--   party's id simply goes and the surviving party's stays. Writing a pseudonym here would re-identify the very
--   rows the right to erasure exists to de-identify.
--
-- THE SHAPE OF THE JOB.
--
--   (a) **One transaction per subject, one RPC** (ADR-127). A partially erased person is worse than a refused
--       request: half a scrub leaves a name in one table and a tombstone in another, with nothing saying which
--       half ran. `erase_account()` does every database write of 07 §6.1 steps 3–6 or none of them.
--
--   (b) **Idempotent** (07 §6.1's own word). A second request for an already-erased subject **succeeds and
--       changes nothing** — a data-subject request is not a thing you may fail for being repeated, and a person
--       who sends the same email twice must not get an error. The marker is the tombstone 07 §6.1 step 5 already
--       specifies (`deleted+<uuid>@invalid` + `banned_until = 'infinity'`), so nothing new has to be remembered.
--
--   (c) **Two kinds of refusal, and they are not the same kind.**
--       *Recorded* refusals are policy — a live placement or an `active` / `past_due` subscription (step 1). The
--       function **returns** them, having written `refused` and the reason onto the request row, so the person is
--       told what to do and the transaction commits that fact and nothing else.
--       *Raised* refusals are invariants and contention — `0027`'s `<table>_subject_present_check` turning a
--       forgotten pseudonym into a refused delete, and `pseudonymise_safeguarding_subject()`'s `nowait` probe
--       losing to a DBS decision being recorded right now. Those roll the whole transaction back, including the
--       request row, so the request stays open and the sweep retries it. **A refusal is reported as a refusal**
--       either way; what differs is whether retrying can help.
--
--   (d) **Objects are deleted outside the transaction, and the log is written inside it.** Removing an object is
--       an HTTP call to the storage API (`0015`'s `protect_objects_delete` refuses a direct DELETE for every
--       role), so it cannot be in the transaction. The order is: `collect_erasure_objects()` reads the paths →
--       the job removes each one → `erase_account()` writes one `file_retention_log` row per object the storage
--       API **confirmed** it removed, in the same transaction as the scrub. A crash between the two leaves
--       objects gone and the database intact, which is the failure in the safe direction, and the next run
--       collects the same paths (the refs are still there), removes nothing (already gone) and commits. The
--       evidence therefore never claims a deletion that did not happen.
--
--   (e) **It runs as `bbldn_retention` and never as `service_role`** (ADR-180; `0000:138-169`'s contract).
--       `SECURITY DEFINER` + `alter function … owner to bbldn_retention` is the whole of the authorisation:
--       `current_user` becomes the retention identity for the duration, which is what `prevent_row_modification()`
--       and `0027`'s narrow guards test. `service_role` is not a member of that role and cannot `set role` into
--       it, so no application path reaches the exemption except through this function's own body.
--
--   (f) **`account_erasure_requests` is what makes ADR-145 satisfiable on the admin road.** An erasure asked for
--       by email has to be actioned by a person, and 07 §5.4 row 6 forbids the subject being taken from the
--       caller's input. The request row is the ledger the admin road names by **opaque id**, exactly as
--       `decide_submission` names a submission: the subject is read off the row, never off the request body. It
--       is also the durable state 01 §4f's `/api/cron/delete-account` needs in order to mean anything.
--
-- Forced by: `0005` (`parents`, `nannies`), `0006` / `0007` (the six keys), `0015` (buckets), `0027`
-- (`bbldn_retention` grants, the safeguarding trigger). Additive over `0000`–`0027`: two tables, six foreign keys
-- replaced, six NOT NULLs dropped, two functions, three triggers. The set still applies forwards from an empty
-- database in one pass.

-- ---------------------------------------------------------------------------
-- 1. `file_retention_log` — 07 §6.2 row 16: the evidence that an object was deleted
-- ---------------------------------------------------------------------------
--
-- Permanent, append-only, one row per object. The **path** is not stored: a profile-picture path is
-- `<role>/<user_id>/…` and a child image path is `children/<child_id>/…`, so keeping it would keep the
-- identifiers the deletion exists to remove. 07 §6.2 row 16 says "path hash" for that reason; the hash still
-- answers "was this object deleted?" for anyone who can name the object.

create table if not exists public.file_retention_log (
  id          uuid primary key default gen_random_uuid(),
  bucket      text        not null,
  path_hash   text        not null,
  entity_kind text        not null,
  entity_id   uuid,
  reason      text        not null,
  job         text        not null,
  deleted_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

comment on table public.file_retention_log is
  '07 §6.2 row 16: one row per storage object deleted by a retention job — permanent, append-only, evidence of deletion under Art 5(2). The path is hashed, not stored: an object path names the user or child whose data was just erased.';
comment on column public.file_retention_log.path_hash is
  'sha256 hex of "<bucket>/<name>". Answers "was this object deleted?" without re-carrying the identifier the deletion removed.';
comment on column public.file_retention_log.job is
  'The SystemJobName that deleted it (03 §2 / 01 §4f) — a log field, never an authorisation (0000:138-169).';

create index if not exists file_retention_log_entity_idx
  on public.file_retention_log (entity_kind, entity_id, deleted_at desc);
create index if not exists file_retention_log_path_idx
  on public.file_retention_log (path_hash);

alter table public.file_retention_log enable row level security;
alter table public.file_retention_log force row level security;

-- Admins read it; nobody else sees it at all, and no role writes it through PostgREST. The job writes it inside
-- `erase_account()`, which is a definer owned by `bbldn_retention` (BYPASSRLS).
drop policy if exists file_retention_log_admin_select on public.file_retention_log;
create policy file_retention_log_admin_select on public.file_retention_log
  for select using ((select public.is_admin()));

drop trigger if exists file_retention_log_append_only on public.file_retention_log;
create trigger file_retention_log_append_only
  before update or delete on public.file_retention_log
  for each row execute function public.prevent_row_modification();

drop trigger if exists file_retention_log_no_truncate on public.file_retention_log;
create trigger file_retention_log_no_truncate
  before truncate on public.file_retention_log
  for each statement execute function public.prevent_row_modification();

-- ---------------------------------------------------------------------------
-- 2. The six person→history keys: `cascade` → `set null`
-- ---------------------------------------------------------------------------

alter table public.nanny_positions       alter column parent_id drop not null;
alter table public.connection_requests   alter column parent_id drop not null;
alter table public.connection_requests   alter column nanny_id  drop not null;
alter table public.nanny_placements      alter column parent_id drop not null;
alter table public.nanny_placements      alter column nanny_id  drop not null;
alter table public.precheck_notifications alter column nanny_id drop not null;

alter table public.nanny_positions
  drop constraint if exists nanny_positions_parent_id_fkey;
alter table public.nanny_positions
  add constraint nanny_positions_parent_id_fkey
  foreign key (parent_id) references public.parents (id) on delete set null;

alter table public.connection_requests
  drop constraint if exists connection_requests_parent_id_fkey;
alter table public.connection_requests
  add constraint connection_requests_parent_id_fkey
  foreign key (parent_id) references public.parents (id) on delete set null;

alter table public.connection_requests
  drop constraint if exists connection_requests_nanny_id_fkey;
alter table public.connection_requests
  add constraint connection_requests_nanny_id_fkey
  foreign key (nanny_id) references public.nannies (id) on delete set null;

alter table public.nanny_placements
  drop constraint if exists nanny_placements_parent_id_fkey;
alter table public.nanny_placements
  add constraint nanny_placements_parent_id_fkey
  foreign key (parent_id) references public.parents (id) on delete set null;

alter table public.nanny_placements
  drop constraint if exists nanny_placements_nanny_id_fkey;
alter table public.nanny_placements
  add constraint nanny_placements_nanny_id_fkey
  foreign key (nanny_id) references public.nannies (id) on delete set null;

alter table public.precheck_notifications
  drop constraint if exists precheck_notifications_nanny_id_fkey;
alter table public.precheck_notifications
  add constraint precheck_notifications_nanny_id_fkey
  foreign key (nanny_id) references public.nannies (id) on delete set null;

comment on column public.nanny_placements.parent_id is
  '07 §6.1 step 3 / §6.2 row 6: null once the parent has erased her account. The row is the hire record and outlives her by six years (Limitation Act); the NANNY''s id stays, because "the other party''s history keeps ids".';
comment on column public.nanny_placements.nanny_id is
  'As parent_id, from the other side. Both null means both parties erased and the row is the counting skeleton only.';

-- ---------------------------------------------------------------------------
-- 3. `account_erasure_requests` — the ledger 01 §4f implies and ADR-145 needs
-- ---------------------------------------------------------------------------

create table if not exists public.account_erasure_requests (
  id              uuid primary key default gen_random_uuid(),
  subject_user_id uuid        not null references auth.users (id) on delete restrict,
  requested_by    uuid        references auth.users (id) on delete set null,
  road            text        not null check (road in ('self-service', 'admin')),
  state           text        not null default 'requested'
                              check (state in ('requested', 'completed', 'refused')),
  refusal_reason  text,
  object_count    integer,
  scrubbed_tables text[],
  requested_at    timestamptz not null default now(),
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  constraint account_erasure_requests_refusal_reason_check
    check ((state = 'refused') = (refusal_reason is not null))
);

comment on table public.account_erasure_requests is
  '07 §6.1 / 01 §4f: one row per Art 17 request. The self-service road writes its own; the admin road writes one for a request that arrived by email, and then names it by id — so the erasure''s subject is read from this row and never from the caller (07 §5.4 row 6, ADR-145).';
comment on column public.account_erasure_requests.subject_user_id is
  'ON DELETE RESTRICT: the request is the record that the erasure happened, so it outlives the scrub exactly as the money and consent rows do. auth.users survives scrubbed and banned (07 §6.1 step 5).';

-- One open request per subject: a second click, or an admin actioning a request the person also made herself,
-- must not produce two. The partial unique is what makes `erase_account()`'s idempotence visible at the ledger
-- as well as at the subject.
create unique index if not exists account_erasure_requests_open_idx
  on public.account_erasure_requests (subject_user_id)
  where state = 'requested';

create index if not exists account_erasure_requests_state_idx
  on public.account_erasure_requests (state, requested_at);

alter table public.account_erasure_requests enable row level security;
alter table public.account_erasure_requests force row level security;

-- The subject may see her own request (Art 12 — she is entitled to know it is in progress); an admin sees all.
-- Nobody writes through PostgREST: both roads go through a definer.
drop policy if exists account_erasure_requests_own_select on public.account_erasure_requests;
create policy account_erasure_requests_own_select on public.account_erasure_requests
  for select using ((select auth.uid()) = subject_user_id or (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- 4. The retention identity's privileges — enumerated, because a definer runs with the OWNER's
-- ---------------------------------------------------------------------------
--
-- `bbldn_retention` starts with none (`0000:171-189`): `BYPASSRLS` lets it see rows, it does not grant it any.
-- So every table `erase_account()` writes is named here, which is also the reviewable list of what an erasure is
-- allowed to touch — the reason this is not a blanket `grant … on all tables`.

-- Postgres requires the incoming owner to hold `create` on the schema at the moment of `alter … owner to`, so it
-- is taken here and given straight back at the end of section 6 — `0027`'s rule, and its reason: a standing
-- schema-wide `create` on the one role whose whole design is a tightly enumerated privilege set would be an
-- oversight wearing the shape of a decision. Section 7c asserts it went back.
grant usage, create on schema public to bbldn_retention;

grant usage on schema storage to bbldn_retention;

grant select on table public.parent_subscriptions  to bbldn_retention;
grant select on table storage.objects              to bbldn_retention;
grant select, update on table public.nanny_positions        to bbldn_retention;
grant select, update on table public.connection_requests    to bbldn_retention;
grant select, update on table public.nanny_placements       to bbldn_retention;
grant select, update on table public.precheck_notifications to bbldn_retention;
grant select, update on table public.bookings               to bbldn_retention;
grant select, update on table public.child_client           to bbldn_retention;
grant select, update on table public.user_profiles          to bbldn_retention;
grant select, update on table public.email_logs             to bbldn_retention;
grant select, delete on table public.position_children      to bbldn_retention;
grant select, delete on table public.position_schedule      to bbldn_retention;
grant select, delete on table public.children               to bbldn_retention;
grant select, delete on table public.bloombot               to bbldn_retention;
grant select, delete on table public.chat_draft_locks       to bbldn_retention;
grant select, delete on table public.inbox_messages         to bbldn_retention;
grant select, delete on table public.nanny_contact_state    to bbldn_retention;
grant select, delete on table public.lead_contacts          to bbldn_retention;
grant select, delete on table public.lead_notes             to bbldn_retention;
grant select, delete on table public.parents                to bbldn_retention;
grant select, delete on table public.nannies                to bbldn_retention;
grant select, insert on table public.file_retention_log     to bbldn_retention;
grant select, update on table public.account_erasure_requests to bbldn_retention;

-- ★ 07 §6.1 step 5 CANNOT be reached from `bbldn_retention`, and that is a property of the platform rather than
-- a choice. **Measured on the first run of this file**, which is why 7e calls the job instead of reading a
-- catalogue: the `auth` schema is owned by `supabase_auth_admin`; the deploying role (`postgres`) holds USAGE and
-- UPDATE on `auth.users` but holds them **without grant option**, so `grant usage on schema auth to
-- bbldn_retention` reports `GRANT`, emits a warning, and grants nothing — `has_schema_privilege` stays false.
-- A migration that trusted the statement's success would have shipped a job that scrubbed every table it owned
-- and then failed on the one statement that stops the person signing in again.
--
-- So step 5 is its own definer, owned by the deploying role (which does hold those privileges) and **executable
-- by `bbldn_retention` alone** — not by `service_role`, not by `authenticated`, not by `public`. It is reachable
-- only from inside `erase_account()`, which is what makes an escalation this narrow safe to have: its whole body
-- is the tombstone and the ban of one named row, it takes no other argument, and it can do nothing else.
-- Writing `auth.users` through the Auth Admin API instead was the alternative and is rejected: it is an HTTP call,
-- so the one step that prevents a sign-in would land outside the transaction that erased everything else.

create or replace function public.scrub_auth_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.users u
     set email = 'deleted+' || p_user_id::text || '@invalid',
         encrypted_password = null,
         phone = null,
         raw_user_meta_data = '{}'::jsonb,
         email_change = null,
         phone_change = null,
         banned_until = 'infinity'::timestamptz
   where u.id = p_user_id;
end
$$;

comment on function public.scrub_auth_user(uuid) is
  '07 §6.1 step 5: tombstone the email, drop the password and ban the row for ever, leaving it as the stable pseudonymous subject the money (§6.2 row 9) and consent (row 11) rows still reference. Owned by the deploying role because `auth` is owned by supabase_auth_admin and its privileges are not re-grantable; EXECUTE is bbldn_retention''s alone, so erase_account() is the only caller that exists.';

revoke all on function public.scrub_auth_user(uuid) from public;
revoke all on function public.scrub_auth_user(uuid) from anon, authenticated, service_role;
grant execute on function public.scrub_auth_user(uuid) to bbldn_retention;

-- ★ `is_privileged_writer()` named the retention jobs and did not admit them. `0002:96` says in as many words
-- that the writers a column guard lets through — "the auth callback re-syncing `email`, admin-on-behalf, the
-- upload action, **the retention jobs**" — "are recognised by `is_privileged_writer()` (0000)", and `0000:284`
-- reads `current_user in ('service_role', 'postgres', 'supabase_admin')`. The retention identity is not on that
-- list, so `guard_user_profiles_protected_columns()` refused 07 §6.1 step 4 — the tombstone on `user_profiles`
-- — with `user_profiles.profile_picture_path is written by the upload action only`. Latent until now, because
-- until now no retention job existed to be refused; **measured** the first time this file's suite ran the job.
--
-- Adding `bbldn_retention` widens nothing in practice: the predicate already admits `service_role`, `postgres`
-- and `supabase_admin` — every role an application or an operator can actually arrive as — while
-- `bbldn_retention` is NOLOGIN and is not granted to `service_role` (`0000:181`), so it is reachable only from
-- inside a definer this schema owns. It is the narrowest of the four, added last.

create or replace function public.is_privileged_writer()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user in ('service_role', 'postgres', 'supabase_admin', 'bbldn_retention');
$$;

comment on function public.is_privileged_writer() is
  '0000 / 0002 §96: the writers a column guard lets through. `bbldn_retention` added by 0028 because 0002 already named the retention jobs as one of them and the predicate did not admit the role they run as (07 §6.1 step 4).';

-- ---------------------------------------------------------------------------
-- 5. `collect_erasure_objects()` — the paths, read before anything is written
-- ---------------------------------------------------------------------------
--
-- Read-only and outside the erasure transaction, because removing an object is an HTTP call to the storage API
-- (`0015` refuses a direct DELETE on `storage.objects` for every role) and an HTTP call cannot be in a
-- transaction. It reads `storage.objects` by prefix rather than the `*_ref` columns on purpose: a ref column that
-- drifted from the object would leave the object behind for ever, and the prefix is the thing `0015`'s policies
-- already treat as the truth.

create or replace function public.collect_erasure_objects(p_user_id uuid)
returns table (bucket text, path text, entity_kind text, entity_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  -- profile-pictures/<role>/<user_id>/… (0015:51)
  select o.bucket_id::text, o.name::text, 'user'::text, p_user_id
    from storage.objects o
   where o.bucket_id = 'profile-pictures'
     and (o.name like 'parent/' || p_user_id::text || '/%'
       or o.name like 'nanny/'  || p_user_id::text || '/%')
  union all
  -- verification-documents/<user_id>/<section>/… (0015:98)
  select o.bucket_id::text, o.name::text, 'user'::text, p_user_id
    from storage.objects o
   where o.bucket_id = 'verification-documents'
     and o.name like p_user_id::text || '/%'
  union all
  -- development-images/chat/<user_id>/… (0015:137)
  select o.bucket_id::text, o.name::text, 'user'::text, p_user_id
    from storage.objects o
   where o.bucket_id = 'development-images'
     and o.name like 'chat/' || p_user_id::text || '/%'
  union all
  -- development-images/children/<child_id>/… for every child this parent owns, because step 3 deletes them
  select o.bucket_id::text, o.name::text, 'child'::text, c.id
    from public.children c
    join storage.objects o
      on o.bucket_id = 'development-images'
     and o.name like 'children/' || c.id::text || '/%'
   where c.parent_user_id = p_user_id;
$$;

comment on function public.collect_erasure_objects(uuid) is
  '07 §6.1 step 3 / §6.2 row 16: every storage object belonging to this subject, by prefix (0015''s own convention). Read-only and called BEFORE erase_account(), because object removal is an HTTP call and cannot be in the transaction.';

alter function public.collect_erasure_objects(uuid) owner to bbldn_retention;
revoke all on function public.collect_erasure_objects(uuid) from public;
revoke all on function public.collect_erasure_objects(uuid) from anon, authenticated;
grant execute on function public.collect_erasure_objects(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 6. `erase_account()` — 07 §6.1 steps 1 and 3–6, in one transaction
-- ---------------------------------------------------------------------------
--
-- The schema-wide `create` taken in section 4 is still held here, and is revoked at the end of this section.

create or replace function public.erase_account(
  p_user_id          uuid,
  p_request_id       uuid,
  p_deleted_objects  jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- 07 §6.2 rows 9, 11 and 4 — the classes that survive an erasure. `config/legal.ts`'s `LEGAL.erasureRetains`
  -- carries the same three names and the sentence each one is owed; `check:retention-classes` joins them, so a
  -- class added on one side and not the other fails `config-gates` (ADR-179).
  v_retained  constant text[] := array['money', 'consent', 'safeguarding'];
  v_tombstone constant text   := 'deleted+' || p_user_id::text || '@invalid';
  v_parent_id uuid;
  v_nanny_id  uuid;
  v_email     text;
  v_tables    text[] := array[]::text[];
  v_n         integer;
  v_objects   integer := 0;
  v_reason    text;
begin
  if p_user_id is null then
    raise exception 'ERASURE_SUBJECT_REQUIRED' using errcode = 'null_value_not_allowed';
  end if;

  -- One erasure per subject at a time. `FOR UPDATE` on `auth.users` would serialise this too, but the advisory
  -- lock is the schema's own idiom for a read-decide-write critical section (`0017:290`) and it does not put us
  -- in a lock order with anything else. One lock, one direction.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('erasure:' || p_user_id::text)
  );

  -- The subject's identity is read through `user_profiles`, the mirror `0002` keeps of `auth.users.email` (C-8),
  -- because `auth` is not reachable from this owner — see section 4. The tombstone is written to both, so the
  -- mirror is a faithful test of whether the scrub has already run.
  select up.email::text into v_email
    from public.user_profiles up where up.user_id = p_user_id;
  if not found then
    raise exception 'ERASURE_SUBJECT_NOT_FOUND' using errcode = 'no_data_found';
  end if;

  -- (b) Idempotent. An already-erased subject is a success that changes nothing — including the request row,
  -- which is marked completed so a repeated ask is not left open for ever.
  if v_email = v_tombstone then
    update public.account_erasure_requests r
       set state = 'completed', completed_at = coalesce(r.completed_at, now())
     where r.id = p_request_id and r.state = 'requested';
    return jsonb_build_object(
      'outcome', 'already-erased',
      'retainedClasses', to_jsonb(v_retained),
      'scrubbedTables', to_jsonb(array[]::text[]),
      'objectCount', 0
    );
  end if;

  select p.id into v_parent_id from public.parents p where p.user_id = p_user_id;
  select n.id into v_nanny_id  from public.nannies n where n.user_id = p_user_id;

  -- (c) Step 1's recorded refusals: policy, not contention. The person ends the placement or cancels the
  -- subscription first, so the refusal is an instruction and the row that carries it is committed.
  if v_parent_id is not null and exists (
    select 1 from public.nanny_placements pl
     where pl.parent_id = v_parent_id and pl.state <> 'ENDED'
  ) then
    v_reason := 'live-placement';
  elsif v_nanny_id is not null and exists (
    select 1 from public.nanny_placements pl
     where pl.nanny_id = v_nanny_id and pl.state <> 'ENDED'
  ) then
    v_reason := 'live-placement';
  elsif exists (
    select 1 from public.parent_subscriptions s
     where s.parent_user_id = p_user_id and s.status in ('active', 'past_due')
  ) then
    v_reason := 'live-subscription';
  end if;

  if v_reason is not null then
    update public.account_erasure_requests r
       set state = 'refused', refusal_reason = v_reason
     where r.id = p_request_id;
    return jsonb_build_object(
      'outcome', 'refused',
      'reason', v_reason,
      'retainedClasses', to_jsonb(v_retained),
      'scrubbedTables', to_jsonb(array[]::text[]),
      'objectCount', 0
    );
  end if;

  -- Step 3, first half: the free text on rows that SURVIVE. The party ids are not nulled here — the six
  -- `on delete set null` keys of section 2 do that when the `parents` / `nannies` row goes, which is what makes
  -- "the other party's history keeps ids" true without this function having to remember it per table.
  if v_parent_id is not null then
    delete from public.position_children pc
     where pc.position_id in (select np.id from public.nanny_positions np where np.parent_id = v_parent_id);
    get diagnostics v_n = row_count;
    if v_n > 0 then v_tables := v_tables || 'position_children'::text; end if;

    delete from public.position_schedule ps
     where ps.position_id in (select np.id from public.nanny_positions np where np.parent_id = v_parent_id);
    get diagnostics v_n = row_count;
    if v_n > 0 then v_tables := v_tables || 'position_schedule'::text; end if;

    update public.nanny_positions np
       set title = null, description = null, schedule_details = null,
           other_requirements = null, language_preference_details = null,
           qualification_requirement = null, details = null
     where np.parent_id = v_parent_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_tables := v_tables || 'nanny_positions'::text; end if;
  end if;

  update public.connection_requests cr
     set message = null, availability_slots = null, meeting_bracket = null
   where (v_parent_id is not null and cr.parent_id = v_parent_id)
      or (v_nanny_id  is not null and cr.nanny_id  = v_nanny_id);
  get diagnostics v_n = row_count;
  if v_n > 0 then v_tables := v_tables || 'connection_requests'::text; end if;

  update public.nanny_placements pl
     set end_notes = null, nanny_notes = null, parent_notes = null, roster = null
   where (v_parent_id is not null and pl.parent_id = v_parent_id)
      or (v_nanny_id  is not null and pl.nanny_id  = v_nanny_id);
  get diagnostics v_n = row_count;
  if v_n > 0 then v_tables := v_tables || 'nanny_placements'::text; end if;

  -- Step 4's bookings clause (07 §6.2 row 7 is the same columns on a timer).
  -- `booking_subject_type` is `position | nanny` — there is no `parent` subject, so a parent's bookings are
  -- reached through the positions she owns. Measured, not assumed: the first draft filtered on a value the enum
  -- does not have, which Postgres would have raised on but which no catalogue read would have shown.
  update public.bookings b
     set call_note = null, notes = null
   where b.booked_by_user_id = p_user_id
      or (b.subject_type = 'nanny' and v_nanny_id is not null and b.subject_id = v_nanny_id)
      or (b.subject_type = 'position' and v_parent_id is not null
          and b.subject_id in (select np.id from public.nanny_positions np where np.parent_id = v_parent_id));
  get diagnostics v_n = row_count;
  if v_n > 0 then v_tables := v_tables || 'bookings'::text; end if;

  -- Step 3, second half: the content the subject owns outright. `children` cascades to its development records,
  -- images, feed posts and progress rows; `bloombot` cascades to Katie's chat, summaries, memory and schedules.
  delete from public.children c where c.parent_user_id = p_user_id;
  get diagnostics v_n = row_count;
  if v_n > 0 then v_tables := v_tables || 'children'::text; end if;

  -- 07 §6.1 step 3: "the nanny's `child_client` links ended not deleted" — the family keeps its record of who
  -- cared for the child; what ends is the access.
  update public.child_client cc
     set state = 'ended', ended_at = coalesce(cc.ended_at, now()), end_reason = 'account_erased'
   where cc.nanny_user_id = p_user_id and cc.ended_at is null;
  get diagnostics v_n = row_count;
  if v_n > 0 then v_tables := v_tables || 'child_client'::text; end if;

  delete from public.bloombot b where b.user_id = p_user_id;
  get diagnostics v_n = row_count;
  if v_n > 0 then v_tables := v_tables || 'bloombot'::text; end if;

  delete from public.chat_draft_locks l where l.user_id = p_user_id;

  delete from public.inbox_messages m where m.user_id = p_user_id;
  get diagnostics v_n = row_count;
  if v_n > 0 then v_tables := v_tables || 'inbox_messages'::text; end if;

  delete from public.lead_notes ln where ln.nanny_user_id = p_user_id;
  delete from public.lead_contacts lc where lc.nanny_user_id = p_user_id;

  delete from public.nanny_contact_state ncs where ncs.nanny_user_id = p_user_id;
  get diagnostics v_n = row_count;
  if v_n > 0 then v_tables := v_tables || 'nanny_contact_state'::text; end if;

  -- The S4 half of step 3: evidence refs and extracted fields go; `level`, `dbs_outcome`, the decision dates and
  -- the decision-maker stay, because §6.2 row 4 keeps them and ADR-170 is why the row survives at all.
  if v_nanny_id is not null then
    update public.verifications v
       set identity_document_ref = null, identity_selfie_ref = null, identity_extracted = null,
           identity_ai_reasoning = null, identity_ai_issues = null, identity_user_guidance = null,
           surname = null, given_names = null, date_of_birth = null, nationality = null,
           dbs_certificate_ref = null, dbs_certificate_number = null, dbs_extracted = null,
           dbs_ai_reasoning = null, dbs_user_guidance = null,
           rtw_document_ref = null, rtw_share_code = null, rtw_extracted = null, rtw_user_guidance = null,
           cross_check_note = null
     where v.nanny_id = v_nanny_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_tables := v_tables || 'verifications'::text; end if;
  end if;

  -- Step 3's "pointers first": the party rows go last of the domain writes, so the six `set null` keys fire over
  -- rows this function has already scrubbed. Removing the `nannies` row fires
  -- `pseudonymise_safeguarding_subject()` (`0027`), which stamps the pseudonym and — if a DBS decision is being
  -- recorded right now — raises `lock_not_available` and takes this whole transaction with it. That is the
  -- intended answer: a safeguarding decision in flight beats an erasure, and the sweep retries.
  if v_parent_id is not null then
    delete from public.parents p where p.id = v_parent_id;
    v_tables := v_tables || 'parents'::text;
  end if;
  if v_nanny_id is not null then
    delete from public.nannies n where n.id = v_nanny_id;
    v_tables := v_tables || 'nannies'::text;
  end if;

  -- Step 4.
  -- No explicit cast to `citext`: the type lives in the `extensions` schema, which this owner has no USAGE on,
  -- and an assignment from `text` coerces on its own. Measured — naming the type was a `permission denied for
  -- schema extensions`, which is the same class of platform fact as section 4's `auth` grant.
  update public.user_profiles up
     set first_name = 'Deleted', last_name = 'user', email = v_tombstone,
         mobile = null, date_of_birth = null, district = null, area = null, profile_picture_path = null
   where up.user_id = p_user_id;
  get diagnostics v_n = row_count;
  if v_n > 0 then v_tables := v_tables || 'user_profiles'::text; end if;

  update public.email_logs el
     set recipient_email = v_tombstone
   where el.recipient_user_id = p_user_id;
  get diagnostics v_n = row_count;
  if v_n > 0 then v_tables := v_tables || 'email_logs'::text; end if;

  -- Step 5. The row REMAINS: it is the stable pseudonymous subject the money rows (§6.2 row 9), the consent trail
  -- (row 11) and `events.actor_id` all still reference, and `0026` made those references `restrict` so that a
  -- hard delete is refused rather than silently destroying the evidence.
  perform public.scrub_auth_user(p_user_id);
  v_tables := v_tables || 'auth.users'::text;

  -- Step 6, first half: one row per object the storage API confirmed it removed, written in the same transaction
  -- as the scrub so the evidence and the erasure commit together or not at all.
  if p_deleted_objects is not null and jsonb_typeof(p_deleted_objects) = 'array' then
    insert into public.file_retention_log (bucket, path_hash, entity_kind, entity_id, reason, job)
    select o->>'bucket',
           pg_catalog.encode(
             pg_catalog.sha256(pg_catalog.convert_to((o->>'bucket') || '/' || (o->>'path'), 'UTF8')),
             'hex'
           ),
           coalesce(o->>'entityKind', 'user'),
           nullif(o->>'entityId', '')::uuid,
           'account-erasure',
           'delete-account'
      from jsonb_array_elements(p_deleted_objects) o
     where o->>'bucket' is not null and o->>'path' is not null;
    get diagnostics v_objects = row_count;
    if v_objects > 0 then v_tables := v_tables || 'file_retention_log'::text; end if;
  end if;

  update public.account_erasure_requests r
     set state = 'completed', completed_at = now(),
         object_count = v_objects, scrubbed_tables = v_tables
   where r.id = p_request_id;

  return jsonb_build_object(
    'outcome', 'erased',
    'retainedClasses', to_jsonb(v_retained),
    'scrubbedTables', to_jsonb(v_tables),
    'objectCount', v_objects
  );
end
$$;

comment on function public.erase_account(uuid, uuid, jsonb) is
  '07 §6.1 / ADR-127 / B-46: the whole of an Art 17 erasure in ONE transaction — refuse (recorded), scrub, remove, pseudonymise, tombstone, log. Idempotent: an already-erased subject succeeds and changes nothing. Owned by bbldn_retention, which is the authorisation (0000:138-169); service_role may EXECUTE it and can do none of it directly.';

alter function public.erase_account(uuid, uuid, jsonb) owner to bbldn_retention;
revoke all on function public.erase_account(uuid, uuid, jsonb) from public;
revoke all on function public.erase_account(uuid, uuid, jsonb) from anon, authenticated;
grant execute on function public.erase_account(uuid, uuid, jsonb) to service_role;

revoke create on schema public from bbldn_retention;

-- ---------------------------------------------------------------------------
-- 7. Verify
-- ---------------------------------------------------------------------------
--
-- `0019`'s standing lesson is the reason the last block here is an INVOCATION and not a catalogue read: 151
-- metadata assertions once passed over a function that could not insert a row. Metadata proves the shape; only
-- calling it proves the owner can reach what the body names.

do $$
declare
  v_pair  text[];
  v_pairs text[][] := array[
    array['nanny_positions',        'parent_id'],
    array['connection_requests',    'parent_id'],
    array['connection_requests',    'nanny_id'],
    array['nanny_placements',       'parent_id'],
    array['nanny_placements',       'nanny_id'],
    array['precheck_notifications', 'nanny_id']
  ];
  v_sig   text;
  v_sigs  text[] := array[
    'public.collect_erasure_objects(uuid)',
    'public.erase_account(uuid, uuid, jsonb)'
  ];
  v_action text;
  v_null   text;
begin
  -- 7a. The six keys are `set null` and the six columns are nullable — one without the other is a half change.
  foreach v_pair slice 1 in array v_pairs loop
    select c.confdeltype::text into v_action
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f'
       and c.conrelid = ('public.' || v_pair[1])::regclass
       and a.attname = v_pair[2];
    if v_action is distinct from 'n' then
      raise exception '0028: public.%.% must be ON DELETE SET NULL, found %', v_pair[1], v_pair[2], coalesce(v_action, 'no such key');
    end if;
    select c.is_nullable into v_null
      from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = v_pair[1] and c.column_name = v_pair[2];
    if v_null is distinct from 'YES' then
      raise exception '0028: public.%.% is still NOT NULL — the set-null key could never fire', v_pair[1], v_pair[2];
    end if;
  end loop;

  -- 7b. Both functions are definers owned by the retention identity, with the search path pinned.
  foreach v_sig in array v_sigs loop
    if to_regprocedure(v_sig) is null then
      raise exception '0028: % does not exist', v_sig;
    end if;
    if not exists (
      select 1 from pg_proc p
        join pg_roles r on r.oid = p.proowner
       where p.oid = to_regprocedure(v_sig)
         and p.prosecdef
         and r.rolname = 'bbldn_retention'
         and 'search_path=""' = any(p.proconfig)
    ) then
      raise exception '0028: % must be SECURITY DEFINER owned by bbldn_retention with search_path="" (ADR-180; 0000:138-169)', v_sig;
    end if;
    if has_function_privilege('anon', to_regprocedure(v_sig), 'execute')
       or has_function_privilege('authenticated', to_regprocedure(v_sig), 'execute') then
      raise exception '0028: % is executable by a client role', v_sig;
    end if;
    if not has_function_privilege('service_role', to_regprocedure(v_sig), 'execute') then
      raise exception '0028: service_role cannot EXECUTE % — no road could call it', v_sig;
    end if;
  end loop;

  -- 7c. `bbldn_retention` holds no standing `create` on the schema (0027's rule, re-asserted because this file
  -- took it again for the two `alter … owner to` statements).
  if has_schema_privilege('bbldn_retention', 'public', 'create') then
    raise exception '0028: bbldn_retention was left holding CREATE on schema public';
  end if;

  -- 7d. `file_retention_log` is append-only by behaviour, not by comment. Inserted and then updated inside this
  -- block: the insert must succeed (the table is writable at all) and the update must be refused.
  insert into public.file_retention_log (bucket, path_hash, entity_kind, reason, job)
  values ('profile-pictures', 'verify-block-probe', 'user', 'migration-verify', 'delete-account');
  begin
    update public.file_retention_log set reason = 'rewritten' where path_hash = 'verify-block-probe';
    raise exception '0028: an UPDATE on file_retention_log was ACCEPTED — the append-only guard is not attached';
  exception
    when restrict_violation then null; -- expected: the guard refused it
  end;
  begin
    delete from public.file_retention_log where path_hash = 'verify-block-probe';
    raise exception '0028: a DELETE on file_retention_log was ACCEPTED — the append-only guard is not attached';
  exception
    when restrict_violation then null; -- expected, and the probe row therefore stays; see below
  end;

  -- 7e. ★ The job actually runs. An unknown subject must reach the `not found` arm, which means the owner could
  -- reach everything the body names before that point. This block is not decoration: on the first run of this
  -- file it failed with `permission denied for schema auth`, which is how section 4's escalation came to exist
  -- at all — a catalogue read would have reported a grant that had granted nothing.
  begin
    perform public.erase_account('00000000-0000-0000-0000-000000000000'::uuid, null, '[]'::jsonb);
    raise exception '0028: erase_account() accepted an unknown subject';
  exception
    when no_data_found then null; -- expected: ERASURE_SUBJECT_NOT_FOUND
    when insufficient_privilege then
      raise exception '0028: erase_account() is refused a privilege it needs — 07 §6.1 would fail at run time: %', sqlerrm;
  end;

  -- 7f. The step-5 escalation is reachable by the retention identity and by nobody else. An application role that
  -- could call it could ban any account in the product.
  if not has_function_privilege('bbldn_retention', 'public.scrub_auth_user(uuid)', 'execute') then
    raise exception '0028: bbldn_retention cannot EXECUTE scrub_auth_user() — 07 §6.1 step 5 has no caller';
  end if;
  foreach v_sig in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_sig, 'public.scrub_auth_user(uuid)', 'execute') then
      raise exception '0028: % can EXECUTE scrub_auth_user() — that role could ban any account in the product', v_sig;
    end if;
  end loop;
end;
$$;

-- The verify block's probe row cannot be deleted (that is what it proved), so it is left and named: one row in
-- `file_retention_log` on every fresh database, `reason = 'migration-verify'`. Naming it here is cheaper than
-- weakening the guard to clean it up, and a reader who finds it knows what it is.
comment on index public.file_retention_log_path_idx is
  'Also the index the verify block''s probe row is found by. That row (reason = migration-verify) exists on every database this migration has been applied to and cannot be deleted — which is the point of the table.';
