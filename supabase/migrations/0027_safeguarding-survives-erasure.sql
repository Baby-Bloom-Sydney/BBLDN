-- 0027_safeguarding-survives-erasure.sql — the ordered migration set (02-data-model.md §6 row 0027; **ADR-170**)
--
-- ADR-170's **safeguarding half**, which `3c` audited across all 131 foreign keys and deliberately did not
-- change (ADR-176). Four person-cascades erased a nanny's entire vetting history; this file ends them, keeps the
-- rows pseudonymised, and makes them unmodifiable by every role but the retention identity.
--
-- Rollback twin: supabase/rollbacks/0027_safeguarding-survives-erasure.rollback.sql
--
-- ★ SECURITY CLAUSE, FORWARD-ONLY (ADR-165 (1), as ADR-177 generalised it). **Three clauses of this file are
--   forward-only and the twin does not undo them**, named here so the twin can name them back:
--     (1) the four foreign keys stay off `cascade` — re-arming a cascade that deletes a DBS decision in the
--         middle of an incident is not a rollback, it is the incident;
--     (2) `prevent_safeguarding_row_modification()` and `prevent_safeguarding_record_loss()` stay attached —
--         handing UPDATE and DELETE on a safeguarding audit row back to `service_role` is an access hole;
--     (3) `verifications.nanny_id`, `vetting_submissions.nanny_id` and `nanny_suspension_lifts.nanny_id` stay
--         nullable, because (1) is what makes them nullable and a NOT NULL restored over a pseudonymised row
--         would fail to apply anyway.
--   What the twin DOES undo, and what that costs, is stated in its own header.
--
-- WHY (`3c`'s §4 audit, measured against the applied stack — not argued).
--
--   | FK                                        | file      | on delete |
--   |-------------------------------------------|-----------|-----------|
--   | `verifications.nanny_id` → `nannies`      | `0008:29` | cascade   |
--   | `vetting_submissions.nanny_id` → `nannies`| `0008:156`| cascade   |
--   | `vetting_submissions.verification_id`     | `0008:155`| cascade   |
--   | `nanny_suspension_lifts.nanny_id`         | `0025:64` | cascade   |
--
--   `nannies.user_id` is itself `on delete cascade` from `auth.users` (`0005:33`), so **one**
--   `delete from auth.users` propagated `auth.users → nannies → verifications → vetting_submissions` and
--   `→ nanny_suspension_lifts`: which admin approved a DBS check, what the outcome was, who lifted a bar and
--   why — gone in one statement, with nothing recording that it had ever existed. **None of those three tables
--   carried an append-only trigger**, so nothing stood in the way for ANY role, including `supabase_admin`, the
--   role behind the Supabase dashboard's "delete user" button. The policy was also inverted relative to risk: a
--   parent's deletion was refused by three `restrict`s in `0010` (money) while a nanny's succeeded.
--
--   `nanny_suspension_lifts` did this while its OTHER person key, `decided_by`, was already `restrict` with the
--   written justification "an audit row whose author can be deleted is not an audit row" (`0025:83`). The
--   reasoning had been applied to the **author** of the lift and not to its **subject**.
--
-- THE SHAPE (ADR-170, literally: "no `on delete cascade` from a person to a safeguarding record —
--            `on delete set null` on the subject with the pseudonym written by the erasure job").
--
--   (a) **`set null`, not `restrict`** — and that is the opposite of the consent half (ADR-176), on purpose.
--       07 §6.1 step 3 says the product path **hard-deletes the `nannies` row** ("`parents` / `nannies` rows,
--       pointers first") while §6.2 row 4 says the DBS decision record is kept for the life of the account plus
--       12 months. `restrict` would make those two sentences contradict each other and the erasure job would
--       refuse on its own product path. Consent is different because 07 §6.1 says of it, in its own words, that
--       those rows "must outlive the account **with their `user_id` intact**", and `auth.users` survives the
--       scrub as the stable pseudonymous subject. `nannies.id` does not survive — so the subject has to be
--       carried somewhere, which is (b).
--
--   (b) **The pseudonym is the `nannies.id` itself, captured before the row goes.** It is already a random
--       `gen_random_uuid()` bearing no relation to the person: after her `nannies` row, her `user_profiles` row
--       and her identity evidence are gone, it identifies nobody. What it still does is **correlate** — it is
--       what lets "these three decisions and that lift were about the same person" survive, which is exactly
--       the question an Art 5(2) accountability request asks and the thing a bare `null` destroys. Same
--       pattern, same reason, as 07 §6.1 step 5 keeping the scrubbed `auth.users` id for consent.
--
--   (c) **The pseudonym cannot be forgotten.** ADR-170 says the erasure job writes it. A job that has to
--       remember is a convention, so this file makes the database do it and the CHECK makes forgetting fail
--       loudly: `pseudonymise_safeguarding_subject()` is a BEFORE DELETE trigger on `nannies` that stamps the
--       pseudonym and nulls the subject in the same statement, before the referential action runs; and
--       `<table>_subject_present_check` refuses any row that names neither a live subject nor a pseudonym. Drop
--       the trigger and the FK's own `set null` trips the CHECK, so the delete **refuses** rather than quietly
--       detaching a decision from its subject. The `delete-account` job (`/api/cron/delete-account`, still
--       handler-less — 01 §4e) therefore inherits this for free and cannot get it wrong; what it still owes is
--       the confirmation text, and 07 §6.1's promise that the user is told is amended in this change to name
--       the safeguarding record alongside money and consent.
--
--   (d) **`vetting_submissions.verification_id` becomes `restrict`, not `set null`.** It is the second path to
--       the same deletion and it is not a person key: a submission's section state is meaningless detached from
--       the verification it belongs to, and nothing in the tree deletes a `verifications` row (section 4 now
--       refuses one). `restrict` says so; `set null` would leave an unreadable orphan.
--
--   (e) **Immutability, and the `supabase_admin` exemption CLOSED — with one honest limit.**
--       `prevent_row_modification()` (`0000:214`) passes for `is_retention_job()`, which is
--       `current_user in ('bbldn_retention', 'supabase_admin')` — "a true operator at the console". For a
--       safeguarding decision that operator is precisely the threat the row exists to answer, so these tables
--       get `is_safeguarding_retention_job()` instead: **`bbldn_retention` and nothing else**. The limit, stated
--       rather than left to be discovered: `0000:184` makes the migration role a member of `bbldn_retention` (it
--       must be, to own a definer), so a session that is already `postgres` can `set role bbldn_retention`.
--       `service_role` deliberately cannot — `0000:181` refuses it that membership for this exact reason — so no
--       application path, no PostgREST role and no dashboard role reaches the exemption. Closing it against the
--       migration role as well would mean a database nobody can migrate.
--
--       `nanny_suspension_lifts` takes the **full** append-only guard: it is written once by
--       `lift_nanny_suspension()` and never updated by any road (`0025:84`), so nothing legitimate loses.
--       `verifications` and `vetting_submissions` **cannot** be append-only and this file does not pretend
--       otherwise — they are live state (`verifications` carries `set_updated_at`; a submission moves
--       `pending → processing → needs_admin`). They take the narrower guard that matches what they actually
--       are: **a safeguarding record may not be destroyed or detached** — DELETE and TRUNCATE refused, and an
--       UPDATE that re-points `nanny_id` or touches `subject_pseudonym` refused. Which *columns* of a decision
--       may move after it is recorded is ADR-168's question, already ruled there, and is deliberately not
--       re-opened here.
--
-- Forced by: `0008` (`verifications`, `vetting_submissions`), `0025` (`nanny_suspension_lifts`), `0005`
-- (`nannies`), `0000` (`bbldn_retention`). Additive over `0000`–`0026`: three nullable columns, three CHECKs,
-- two indexes, four foreign keys replaced, three NOT NULLs dropped, four functions, five triggers. The set
-- still applies forwards from an empty database in one pass.

-- ---------------------------------------------------------------------------
-- 1. The pseudonym column, and the invariant that a safeguarding row always names a subject
-- ---------------------------------------------------------------------------

alter table public.verifications
  add column if not exists subject_pseudonym uuid;
alter table public.vetting_submissions
  add column if not exists subject_pseudonym uuid;
alter table public.nanny_suspension_lifts
  add column if not exists subject_pseudonym uuid;

comment on column public.verifications.subject_pseudonym is
  'ADR-170: the erased subject''s former nannies.id, stamped by pseudonymise_safeguarding_subject() before the row is detached. Null while the subject is live — verifications_subject_present_check requires exactly one of the two to be set. It correlates this decision with the same person''s other safeguarding rows and identifies nobody once her profile is gone (07 §6.1 step 5''s pattern).';
comment on column public.vetting_submissions.subject_pseudonym is
  'ADR-170: as verifications.subject_pseudonym — the erased subject''s former nannies.id.';
comment on column public.nanny_suspension_lifts.subject_pseudonym is
  'ADR-170: as verifications.subject_pseudonym. decided_by (the lift''s AUTHOR) is a separate key and stays `restrict` — 0025:83.';

-- The invariant, and the reason it is a CHECK rather than a comment: it is what turns "the job must remember to
-- write the pseudonym" into "a delete that does not write it fails". See the header, (c).
alter table public.verifications
  drop constraint if exists verifications_subject_present_check;
alter table public.verifications
  add constraint verifications_subject_present_check
  check (nanny_id is not null or subject_pseudonym is not null);

alter table public.vetting_submissions
  drop constraint if exists vetting_submissions_subject_present_check;
alter table public.vetting_submissions
  add constraint vetting_submissions_subject_present_check
  check (nanny_id is not null or subject_pseudonym is not null);

alter table public.nanny_suspension_lifts
  drop constraint if exists nanny_suspension_lifts_subject_present_check;
alter table public.nanny_suspension_lifts
  add constraint nanny_suspension_lifts_subject_present_check
  check (nanny_id is not null or subject_pseudonym is not null);

-- Correlation reads ("every safeguarding row about the person behind this pseudonym") are the whole point of
-- keeping the value, so they get an index rather than three sequential scans. Partial: the column is null for
-- every live subject, which is almost every row.
create index if not exists verifications_subject_pseudonym_idx
  on public.verifications (subject_pseudonym)
  where subject_pseudonym is not null;
create index if not exists vetting_submissions_subject_pseudonym_idx
  on public.vetting_submissions (subject_pseudonym)
  where subject_pseudonym is not null;
create index if not exists nanny_suspension_lifts_subject_pseudonym_idx
  on public.nanny_suspension_lifts (subject_pseudonym)
  where subject_pseudonym is not null;

-- ---------------------------------------------------------------------------
-- 1a. REVIEW-4 **M-15**, taken because this is the unit that next opens `verifications` (ADR-123's standing
--     model, L-009 kickoff §2 debt 2).
-- ---------------------------------------------------------------------------
-- The register measured it with `enable_seqscan=off`: `sweep_stale_verification_processing`'s third statement
-- (`0023:573`) plans a **sequential scan at cost 10000000000**, because `verifications` carries partial indexes
-- on `identity_status` and `dbs_status` (`0008:141-144`) and none on `rtw_status` — linear in the nanny table,
-- 288 times a day, for ever. One index matching its two siblings exactly closes it. It is unrelated to ADR-170
-- and is here for one reason: the debt lands with the unit that touches the file, and leaving a measured,
-- one-line defect in a table this migration is rewriting would be a choice to leave it.
create index if not exists verifications_rtw_status_idx
  on public.verifications (rtw_status)
  where rtw_status in ('pending', 'processing', 'review');

-- ---------------------------------------------------------------------------
-- 2. ★ The four cascades (ADR-170; this is the clause the twin keeps)
-- ---------------------------------------------------------------------------
-- `set null` needs to FIND the child rows, so every one of these keys needs an index leading with its column.
-- `verifications.nanny_id` has one (the UNIQUE constraint); `nanny_suspension_lifts` has
-- `nanny_suspension_lifts_nanny_idx`; `vetting_submissions.verification_id` has
-- `vetting_submissions_section_idx`. `vetting_submissions.nanny_id` had none — a nanny deletion would have
-- seq-scanned the whole ledger — so it gets one here.
create index if not exists vetting_submissions_nanny_idx
  on public.vetting_submissions (nanny_id)
  where nanny_id is not null;

alter table public.verifications alter column nanny_id drop not null;
alter table public.vetting_submissions alter column nanny_id drop not null;
alter table public.nanny_suspension_lifts alter column nanny_id drop not null;

-- The UNIQUE on verifications.nanny_id is kept and still does its job: `on conflict (nanny_id) do nothing`
-- (0022:176, 0022:331, 0023:888) infers this index, and in Postgres two NULLs are never equal, so any number of
-- pseudonymised rows coexist while a live nanny still gets exactly one verification row.
alter table public.verifications
  drop constraint if exists verifications_nanny_id_fkey;
alter table public.verifications
  add constraint verifications_nanny_id_fkey
  foreign key (nanny_id) references public.nannies (id) on delete set null;

alter table public.vetting_submissions
  drop constraint if exists vetting_submissions_nanny_id_fkey;
alter table public.vetting_submissions
  add constraint vetting_submissions_nanny_id_fkey
  foreign key (nanny_id) references public.nannies (id) on delete set null;

alter table public.nanny_suspension_lifts
  drop constraint if exists nanny_suspension_lifts_nanny_id_fkey;
alter table public.nanny_suspension_lifts
  add constraint nanny_suspension_lifts_nanny_id_fkey
  foreign key (nanny_id) references public.nannies (id) on delete set null;

-- Header (d): the second path to the same deletion, and it is not a person key.
alter table public.vetting_submissions
  drop constraint if exists vetting_submissions_verification_id_fkey;
alter table public.vetting_submissions
  add constraint vetting_submissions_verification_id_fkey
  foreign key (verification_id) references public.verifications (id) on delete restrict;

-- ---------------------------------------------------------------------------
-- 3. `pseudonymise_safeguarding_subject()` — the pseudonym the job cannot forget
-- ---------------------------------------------------------------------------
-- Owned by `bbldn_retention` so that section 4's guards let it through by identity rather than by a session
-- setting a statement could forge (`0000:196`'s reasoning, applied to a second class of table). It therefore
-- needs its own privileges on the three tables — a SECURITY DEFINER runs with the OWNER's, and `bbldn_retention`
-- had none. It also needs `create` on the schema, because Postgres will not let a role own an object in a schema
-- it cannot create in; `bbldn_retention` is NOLOGIN and `service_role` is not a member of it (`0000:181`), so the
-- only way to reach this privilege is to already be the migration role.
grant usage, create on schema public to bbldn_retention;

grant select, update on table public.verifications to bbldn_retention;
grant select, update on table public.vetting_submissions to bbldn_retention;
grant select, update on table public.nanny_suspension_lifts to bbldn_retention;

create or replace function public.pseudonymise_safeguarding_subject()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- ★ LOCK ORDER, and the reason this is `nowait` rather than a plain lock (database pass, HIGH — driven, not
  -- argued). A `delete from nannies` holds the `nannies` row lock BEFORE any row trigger fires, so this
  -- function unavoidably takes the children **after** the parent — the reverse of the order every other writer
  -- uses. `record_vetting_decision` locks `vetting_submissions` (`0023:393`), then `verifications`, then
  -- `nannies` through the sync; `0025:196-204` had to be corrected once for exactly this reason and calls
  -- children-then-parent "the schema's effective global order". An erasure racing an admin recording a DBS
  -- decision on the same nanny is therefore a textbook AB-BA deadlock, and it is not a theoretical race: the
  -- incident in which someone is deleting an account is precisely when an admin may be deciding her case.
  --
  -- The fix is not a lock, it is a **refusal to wait**. Probing the children `for update nowait` means the
  -- erasure never becomes the waiting side of a cycle, so no cycle can form — and it makes the winner
  -- deterministic rather than whichever side Postgres's detector picks: **a safeguarding decision in flight
  -- always beats an erasure**, which is also the right policy. The erasure fails loudly with a retryable error
  -- instead of silently aborting somebody's DBS decision.
  begin
    perform 1 from public.verifications where nanny_id = old.id for update nowait;
    perform 1 from public.vetting_submissions where nanny_id = old.id for update nowait;
    perform 1 from public.nanny_suspension_lifts where nanny_id = old.id for update nowait;
  exception
    when lock_not_available then
      raise exception
        'erasure of nanny %: a safeguarding decision is being recorded right now — retry (ADR-170)', old.id
        using errcode = 'lock_not_available';
  end;

  -- `coalesce(subject_pseudonym, old.id)` rather than a bare assignment: a row that already carries a pseudonym
  -- belonged to an earlier subject and must not be re-stamped. `nanny_id` is nulled HERE, in the same statement,
  -- so the foreign key's own `set null` finds nothing left to do — which is what keeps the referential action
  -- from arriving at section 4's guard as an unattributable UPDATE.
  update public.verifications
     set subject_pseudonym = coalesce(subject_pseudonym, old.id),
         nanny_id          = null
   where nanny_id = old.id;

  update public.vetting_submissions
     set subject_pseudonym = coalesce(subject_pseudonym, old.id),
         nanny_id          = null
   where nanny_id = old.id;

  update public.nanny_suspension_lifts
     set subject_pseudonym = coalesce(subject_pseudonym, old.id),
         nanny_id          = null
   where nanny_id = old.id;

  return old;
end;
$$;

alter function public.pseudonymise_safeguarding_subject() owner to bbldn_retention;

-- ...and the `create` half of that grant goes straight back (database pass, MEDIUM). Postgres needs the NEW
-- owner to hold `create` on the schema **at the moment of** `alter ... owner to`; it needs nothing afterwards.
-- Leaving a standing schema-wide `create` on the one role whose whole design is a tightly enumerated privilege
-- set would be an oversight wearing the shape of a decision. `usage` stays: the definer resolves
-- `public.verifications` and friends every time it runs. Re-applying this file re-grants and re-revokes, so it
-- is still idempotent.
revoke create on schema public from bbldn_retention;

-- ★ The operator's escape hatch, made explicit rather than inherited (database pass, MEDIUM). `0000:184` grants
-- `bbldn_retention` to `current_user` — whichever role happened to run that migration. Section 4 excludes
-- `supabase_admin` from the safeguarding exemption on purpose, so if the role a human uses at the console is
-- ever NOT the role that ran `0000`, there is no path at all to a legitimate correction of a bad audit row —
-- not a security property, a trap. `postgres` is the role Supabase's SQL editor connects as, so it is named
-- here instead of being assumed. Guarded, because the role name is Supabase's convention and not a law.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'postgres') then
    execute 'grant bbldn_retention to postgres';
  end if;
end
$$;

comment on function public.pseudonymise_safeguarding_subject() is
  'ADR-170: before a nannies row is deleted — by the delete-account job, by an admin, or by the auth.users cascade — every safeguarding record about her keeps its decision and swaps its subject for the pseudonym. Owned by bbldn_retention, which is what exempts it from the guards in section 4; nothing else is.';

drop trigger if exists nannies_pseudonymise_safeguarding on public.nannies;
create trigger nannies_pseudonymise_safeguarding
  before delete on public.nannies
  for each row execute function public.pseudonymise_safeguarding_subject();

-- ---------------------------------------------------------------------------
-- 4. ★ The guards (header (e); the twin keeps these too)
-- ---------------------------------------------------------------------------

create or replace function public.is_safeguarding_retention_job()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user = 'bbldn_retention';
$$;

comment on function public.is_safeguarding_retention_job() is
  'ADR-170: the authorisation test for writing a safeguarding record. Deliberately NARROWER than is_retention_job() — `supabase_admin` is excluded, because for a DBS decision "a true operator at the console" is the threat the row exists to answer. service_role is not a member of bbldn_retention (0000:181), so no application path reaches this.';

-- `nanny_suspension_lifts` only: written once by lift_nanny_suspension(), never updated by any road.
create or replace function public.prevent_safeguarding_row_modification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_safeguarding_retention_job() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception
    'safeguarding record %.%: % refused (ADR-170)', tg_table_schema, tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;

comment on function public.prevent_safeguarding_row_modification() is
  'ADR-170: append-only for a safeguarding audit row. Same shape as prevent_row_modification() (0000) with one difference that is the whole point — the exemption is is_safeguarding_retention_job(), so supabase_admin is refused too.';

-- `verifications` / `vetting_submissions`: live state, so the guard is about LOSS, not about editing. See the
-- header, (e).
create or replace function public.prevent_safeguarding_record_loss()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_safeguarding_retention_job() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception
      'safeguarding record %.%: % refused — a vetting decision outlives its subject (ADR-170)',
      tg_table_schema, tg_table_name, tg_op
      using errcode = 'restrict_violation';
  end if;

  -- An UPDATE is ordinary work on these tables (a section moves, a decision lands) and is allowed. What is not
  -- ordinary is moving the row to a different subject, detaching it from one, or touching the pseudonym: each
  -- of those is a deletion wearing an UPDATE's clothes.
  if new.nanny_id is distinct from old.nanny_id then
    raise exception
      'safeguarding record %.%: nanny_id may not be re-pointed or detached outside the erasure path (ADR-170)',
      tg_table_schema, tg_table_name
      using errcode = 'restrict_violation';
  end if;
  if new.subject_pseudonym is distinct from old.subject_pseudonym then
    raise exception
      'safeguarding record %.%: subject_pseudonym is written once, by the erasure path (ADR-170)',
      tg_table_schema, tg_table_name
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

comment on function public.prevent_safeguarding_record_loss() is
  'ADR-170 for a table that cannot be append-only: verifications and vetting_submissions are live state, so DELETE and TRUNCATE are refused and an UPDATE may not re-point nanny_id or touch subject_pseudonym. Which decision COLUMNS may move after a decision is recorded is ADR-168''s question, not this one''s.';

drop trigger if exists nanny_suspension_lifts_append_only on public.nanny_suspension_lifts;
create trigger nanny_suspension_lifts_append_only
  before update or delete on public.nanny_suspension_lifts
  for each row execute function public.prevent_safeguarding_row_modification();

drop trigger if exists nanny_suspension_lifts_no_truncate on public.nanny_suspension_lifts;
create trigger nanny_suspension_lifts_no_truncate
  before truncate on public.nanny_suspension_lifts
  for each statement execute function public.prevent_safeguarding_row_modification();

drop trigger if exists verifications_safeguarding_guard on public.verifications;
create trigger verifications_safeguarding_guard
  before update or delete on public.verifications
  for each row execute function public.prevent_safeguarding_record_loss();

drop trigger if exists verifications_no_truncate on public.verifications;
create trigger verifications_no_truncate
  before truncate on public.verifications
  for each statement execute function public.prevent_safeguarding_record_loss();

drop trigger if exists vetting_submissions_safeguarding_guard on public.vetting_submissions;
create trigger vetting_submissions_safeguarding_guard
  before update or delete on public.vetting_submissions
  for each row execute function public.prevent_safeguarding_record_loss();

drop trigger if exists vetting_submissions_no_truncate on public.vetting_submissions;
create trigger vetting_submissions_no_truncate
  before truncate on public.vetting_submissions
  for each statement execute function public.prevent_safeguarding_record_loss();

-- 07 §5.1 rule 2: PUBLIC keeps EXECUTE on a new function by default.
revoke all on function public.is_safeguarding_retention_job() from public;
revoke all on function public.prevent_safeguarding_row_modification() from public;
revoke all on function public.prevent_safeguarding_record_loss() from public;
revoke all on function public.pseudonymise_safeguarding_subject() from public;

-- ...but the TEST itself is named back, because a trigger function is not SECURITY DEFINER: it runs as whoever
-- fired it, and calling a function it may not execute raises `permission denied for function
-- is_safeguarding_retention_job` instead of the guard's own sentence. Two reasons that matters, and the first
-- is not cosmetic: `bbldn_retention` is the ONE identity the guard is meant to let through, and without EXECUTE
-- the pseudonymiser's own UPDATE dies inside the erasure — measured, on the first run of this file. The second
-- is that an operator who trips the guard should read why, not read a privilege error that looks like a bug.
-- The function discloses nothing: it answers a boolean about the caller's own `current_user`.
grant execute on function public.is_safeguarding_retention_job()
  to bbldn_retention, service_role, authenticated, anon, authenticator;

-- ---------------------------------------------------------------------------
-- 5. Verify — the house standard (0025 §4's shape, applied to everything this file touches)
-- ---------------------------------------------------------------------------

do $$
declare
  v_pair  text[];
  v_pairs text[][] := array[
    array['verifications', 'nanny_id', 'n'],
    array['vetting_submissions', 'nanny_id', 'n'],
    array['nanny_suspension_lifts', 'nanny_id', 'n'],
    array['vetting_submissions', 'verification_id', 'r']
  ];
  v_tbl   text;
  v_action text;
begin
  -- 5a. ★ The clause itself: not one of the four person paths may be `c`, and each takes the action the
  --     header names. Asserted inside the transaction that would otherwise commit it.
  foreach v_pair slice 1 in array v_pairs loop
    select c.confdeltype::text into v_action
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_attribute a on a.attrelid = t.oid and a.attnum = c.conkey[1]
     where n.nspname = 'public' and t.relname = v_pair[1] and c.contype = 'f'
       and array_length(c.conkey, 1) = 1 and a.attname = v_pair[2];
    if v_action is null then
      raise exception '0027: public.%.% has no single-column foreign key', v_pair[1], v_pair[2];
    end if;
    if v_action = 'c' then
      raise exception '0027: public.%.% still cascades from a person — ADR-170 forbids it', v_pair[1], v_pair[2];
    end if;
    if v_action <> v_pair[3] then
      raise exception '0027: public.%.% is on delete "%", expected "%"', v_pair[1], v_pair[2], v_action, v_pair[3];
    end if;
  end loop;

  -- 5b. The pseudonym column, the invariant and the index, on all three tables.
  foreach v_tbl in array array['verifications', 'vetting_submissions', 'nanny_suspension_lifts'] loop
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = v_tbl and column_name = 'subject_pseudonym'
    ) then
      raise exception '0027: public.%.subject_pseudonym is missing (ADR-170)', v_tbl;
    end if;
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = v_tbl and column_name = 'nanny_id'
         and is_nullable = 'YES'
    ) then
      raise exception '0027: public.%.nanny_id must be nullable for `set null` to be reachable', v_tbl;
    end if;
    if not exists (
      select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
       where n.nspname = 'public' and t.relname = v_tbl and c.contype = 'c'
         and c.conname = v_tbl || '_subject_present_check'
    ) then
      raise exception '0027: public.%_subject_present_check is missing — the pseudonym would be forgettable', v_tbl;
    end if;
  end loop;

  -- 5b'. REVIEW-4 M-15: the rtw index exists and is the SAME shape as its two siblings. Asserted on the
  --      definition rather than on a plan, because a plan on an empty database says nothing — the register's
  --      measurement (`enable_seqscan=off`, cost 10000000000) is the evidence, and this keeps the fix in place.
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and tablename = 'verifications'
       and indexname = 'verifications_rtw_status_idx'
       and indexdef like '%rtw_status%' and indexdef like '%WHERE%'
  ) then
    raise exception '0027: verifications_rtw_status_idx is missing or is not partial (REVIEW-4 M-15)';
  end if;

  -- 5c. ★ The exemption is the NARROW one. A guard that called is_retention_job() would leave
  --     `supabase_admin` — the dashboard's delete-user role — able to edit a DBS decision, which is the whole
  --     defect. Asserted on the SOURCE, because that is the half a later `create or replace` can quietly move.
  -- ★ Anchored on the EXPRESSION, not on the bare string (database pass, LOW): `prosrc` carries the body's
  --   comments too, so banning `supabase_admin` anywhere in it would redden the day someone wrote
  --   `-- never supabase_admin` above the select. What must be true is that the comparison names one role.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'is_safeguarding_retention_job'
       and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ~ 'current_user\s*=\s*''bbldn_retention'''
       and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') !~ 'supabase_admin'
  ) then
    raise exception '0027: is_safeguarding_retention_job() must be bbldn_retention alone (ADR-170)';
  end if;

  -- The operator's escape hatch exists (the grant above). Without it, a genuinely bad audit row — a typo in a
  -- lift's reason — would be uncorrectable by anyone, which is not the control this file is trying to build.
  if not pg_has_role('postgres', 'bbldn_retention', 'MEMBER') then
    raise exception '0027: postgres is not a member of bbldn_retention — a legitimate correction would have no path';
  end if;
  foreach v_tbl in array array['prevent_safeguarding_row_modification', 'prevent_safeguarding_record_loss'] loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = v_tbl
         and p.prosrc ~ 'is_safeguarding_retention_job'
    ) then
      raise exception '0027: %() must gate on is_safeguarding_retention_job(), not is_retention_job()', v_tbl;
    end if;
  end loop;

  -- 5d. The pseudonymiser is owned by the retention identity — without that, its own UPDATE trips the guard it
  --     is supposed to be exempt from, and the first erasure fails in production instead of here.
  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_roles r on r.oid = p.proowner
     where n.nspname = 'public' and p.proname = 'pseudonymise_safeguarding_subject'
       and p.prosecdef and r.rolname = 'bbldn_retention'
       and 'search_path=""' = any(p.proconfig)
  ) then
    raise exception '0027: pseudonymise_safeguarding_subject() must be SECURITY DEFINER owned by bbldn_retention with search_path=""';
  end if;

  -- 5e. Every trigger this file attaches is actually attached. A guard function nobody fires is a comment.
  if (select count(*) from pg_trigger g join pg_class t on t.oid = g.tgrelid
       join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public' and not g.tgisinternal
        and g.tgname in ('nannies_pseudonymise_safeguarding', 'nanny_suspension_lifts_append_only',
                         'nanny_suspension_lifts_no_truncate', 'verifications_safeguarding_guard',
                         'verifications_no_truncate', 'vetting_submissions_safeguarding_guard',
                         'vetting_submissions_no_truncate')) <> 7 then
    raise exception '0027: one of the seven triggers this file attaches is missing (ADR-170)';
  end if;

  -- 5f. ★ The guards fire, proven by INVOCATION rather than by reading their source — this is the assertion
  --     that would have caught the defect `3c` found, because `0008` and `0025` both read as if they were safe.
  --     TRUNCATE is the one verb that needs no fixture: the statement trigger fires on an empty table. The
  --     migration role is a member of `bbldn_retention` (header (e)) but is not currently acting as it, so it
  --     is refused here exactly as `service_role` would be.
  --
  --     `verifications` is deliberately NOT in this loop and the reason is worth a line: it is the only one of
  --     the three that another table references, and Postgres refuses a TRUNCATE of a referenced table
  --     (`0A000`) BEFORE the statement trigger runs — so including it would assert the foreign key, not the
  --     guard, and would read as a passing check of something never checked. Its DELETE refusal is proven by
  --     invocation against a real fixture in `int.safeguarding-erasure`, where a savepoint makes that possible.
  foreach v_tbl in array array['vetting_submissions', 'nanny_suspension_lifts'] loop
    begin
      execute format('truncate table public.%I', v_tbl);
      raise exception '0027: truncate of public.% was ACCEPTED — the safeguarding guard is not attached', v_tbl;
    exception
      when restrict_violation then null;  -- expected: the guard refused it
    end;
  end loop;
end;
$$;
