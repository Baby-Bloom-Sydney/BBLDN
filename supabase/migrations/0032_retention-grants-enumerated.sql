-- 0032_retention-grants-enumerated.sql — ADR-185: the blanket retention grant goes (L-009 `3i`; `3h`'s Q-1).
--
-- **One blanket grant outranks every narrow one, so the blanket grant goes.**
--
-- `0016:288` reads:
--
--     grant select, insert, update, delete on all tables in schema public to bbldn_retention;
--
-- and that one line is the authority the retention identity has actually been running on ever since. Every
-- carefully enumerated grant list written afterwards — `0027`'s three tables, `0028`'s twenty-three, `0030`'s
-- eight, `0031`'s thirteen — re-granted what the role already held on every table that existed in `0016`. They
-- read as closed privilege sets. They were documentation.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT THAT COST, MEASURED BEFORE ANYTHING HERE WAS WRITTEN
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Read from `pg_class.relacl` and `pg_attribute.attacl` on `0000`–`0031` applied from empty — an `aclitem` is
-- what the database will act on; a grant line is only what somebody meant.
--
--   · **69** relations carried a table-level grant to `bbldn_retention`: 59 tables, **9 views**, and
--     `storage.objects`.
--   · **64** of those held the full `SELECT, INSERT, UPDATE, DELETE`, every one of them from `0016:288`.
--   · **5** had been narrowed since, and they are exactly the tables created *after* `0016` plus the two
--     `0031` explicitly revoked: `nanny_suspension_lifts` (`0025`), `file_retention_log` and
--     `account_erasure_requests` (`0028`), `verifications` and `vetting_submissions` (`0031`).
--   · **2** public tables held nothing at all — `rate_limit_buckets` (`0017`) and `position_call_mirror`
--     (`0018`) — which is the proof that the default for a new table is already nothing, and that the blanket
--     grant was a snapshot of one moment in migration order rather than a policy.
--
-- ★ **Two safeguarding holes were still standing when this file was written, and `3h` was right not to widen
-- into them unasked:**
--
--   (a) The identity held table-level **INSERT** on `verifications` and `vetting_submissions`. `0031` revoked
--       UPDATE and DELETE and re-granted the columns by name; INSERT was never in its brief and stood from
--       `0016:288`. So the retention identity could **create** a vetting decision — a DBS outcome no admin ever
--       made — which is the same class of defect as being able to rewrite one.
--   (b) The identity held table-level **UPDATE** on `nanny_suspension_lifts`. `0027` granted `select, update`
--       for the pseudonymiser and `0031`'s brief named the other two tables, so `decided_by`, the reason and
--       the date on the row recording who lifted a safeguarding bar were all writable. ADR-170 allows the
--       subject to be pseudonymised. It allows nothing else.
--
-- Neither was a live hole — no real data exists and no arm written today does either thing. Both are precisely
-- what ADR-185 means when it says the enumerated lists are not the authority.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ★ THE RULE THIS FILE ESTABLISHES, FOR WHOEVER WRITES THE NEXT MIGRATION
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- **A new table gets no retention privilege. The default is nothing, and it stays nothing until somebody asks
-- for it on purpose.**
--
-- Not "nothing unless it looks like it needs some", and never again `on all tables in schema public`. If a
-- retention job must reach a table you are adding, write the table into the enumerated set below **and** into
-- `ENUMERATED` in `supabase/__tests__/retention-grants.test.ts`, with the reason, and the two lists have to
-- agree or `integration` fails. Two deliberate acts, reviewed as a privilege change, is the point: it is how
-- the next `0016:288` gets noticed while somebody is still writing it.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- WHERE THE GATE LIVES, AND WHY NOT IN `config-gates`
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ADR-185 asks for a gate asserting the role holds no privilege on a table its enumerated set does not name.
-- That fact exists only in the catalogue of a database with every migration applied, so the gate needs a
-- database and `config-gates` has none: it lives in **`integration`** (`int.retention-grants`), which applies
-- `0000`→ from empty in the runner.
--
-- The verify block at the foot of this file asserts the same thing, and is **not** a substitute: a verify block
-- runs at its own migration's apply time and can say nothing about `0033`. A future blanket grant would apply
-- cleanly past this file and fail in `int.retention-grants`. Belt here, braces there.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
--
--   · **It does not narrow non-safeguarding UPDATEs to columns.** `0028` writes the erasure's pseudonymising
--     updates across many columns of `user_profiles`, `nanny_positions`, `connection_requests`, `bookings`,
--     `child_client` and `nanny_placements`; a column list there would be a second place for 07 §6.1 step 3's
--     column set to live, and a list that drifts silently breaks the right to erasure. The table is the unit
--     for those; the columns are the unit where ADR-170 says a *decision* must be unreachable, which is the
--     three safeguarding tables plus the two classes `0031` already wrote by column.
--   · **It does not touch `grant execute on all functions in schema public to bbldn_retention`** (`0016:291`).
--     That is the same *shape* of grant, and it is recorded as this unit's question rather than changed here:
--     ADR-185 rules on tables, the trigger functions every retention write fires are reached through it, and a
--     second blanket revoke riding in this PR is the thing ADR-185 itself forbids.
--   · **It changes no function, no policy, no constraint and no row.** It is a privilege change and nothing
--     else, so that what broke — if anything breaks — is unambiguous.
--
-- One transaction. A half-applied privilege change is a schema nobody can reason about.

begin;

-- ---------------------------------------------------------------------------
-- 1. The blanket grant goes.
--
-- `revoke all on all tables` also revokes the corresponding **column** privileges on every column of each
-- table (REVOKE's documented behaviour), which is why `0031`'s column grants are re-stated below rather than
-- left standing: after this statement the role holds nothing anywhere, and everything it holds afterwards is
-- on a line in section 2 with a reason beside it.
-- ---------------------------------------------------------------------------

revoke all privileges on all tables in schema public  from bbldn_retention;
revoke all privileges on all tables in schema storage from bbldn_retention;

-- USAGE on the two schemas stays: it is not a privilege on any table, and without it every grant below is
-- unreachable. `create` is not re-granted — `0027` and `0028` each take it for one `alter ... owner to` and
-- hand it straight back, and this file owns no function.

-- ---------------------------------------------------------------------------
-- 2. ENUMERATED SET — START
--
-- One line per table, each with the reason it is there, derived from what the three retention jobs actually
-- touch: `0028`'s erasure (`erase_account`, `collect_erasure_objects`, `0027`'s pseudonymiser trigger),
-- `0030`'s purge and `0031`'s sweep. A table no job touches has no line, and therefore no privilege.
--
-- The list is deliberately grouped by *which job needs it*, not alphabetically, because the question a reader
-- will have in six months is "why can this identity touch that" and the answer is the group heading.
-- ---------------------------------------------------------------------------

-- 2a. The erasure's ledger, and the tombstone 07 §6.1 step 5 writes ----------------------------------------

-- read the request, refuse it with a reason or complete it; `0030` stamps it purged; `0031`'s consent class
-- takes `completed_at` as its anchor
grant select, update on table public.account_erasure_requests to bbldn_retention;
-- 07 §6.1 step 5: the name, the email and the phone become the tombstone
grant select, update on table public.user_profiles           to bbldn_retention;
-- every removed object is recorded inside the erasure transaction; append-only to this role, which is why
-- there is no UPDATE and no DELETE on the evidence of its own work
grant select, insert on table public.file_retention_log      to bbldn_retention;

-- 2b. The erasure's pseudonymising updates (07 §6.1 step 3) -------------------------------------------------
--
-- Table-level UPDATE, not a column list, and section "what this file does not do" says why.

-- the free text a parent wrote into her own position
grant select, update on table public.nanny_positions         to bbldn_retention;
-- the message, the availability slots and the meeting bracket
grant select, update on table public.connection_requests     to bbldn_retention;
-- the call note and the notes on the erased party's bookings
grant select, update on table public.bookings                to bbldn_retention;
-- the link is ENDED rather than deleted — it is the other party's record too (ADR-181)
grant select, update on table public.child_client            to bbldn_retention;

-- 2c. The erasure's deletes (07 §6.1 step 3, pointers last) -------------------------------------------------

-- a child's row on the erased parent's own position
grant select, delete on table public.position_children       to bbldn_retention;
-- the schedule of the erased parent's own position
grant select, delete on table public.position_schedule       to bbldn_retention;
-- the erased parent's children
grant select, delete on table public.children                to bbldn_retention;
-- the subject's assistant, and everything cascading from it
grant select, delete on table public.bloombot                to bbldn_retention;
-- the subject's draft locks
grant select, delete on table public.chat_draft_locks        to bbldn_retention;
-- the subject's inbox
grant select, delete on table public.inbox_messages          to bbldn_retention;
-- the operator's notes about the erased nanny
grant select, delete on table public.lead_notes              to bbldn_retention;
-- the operator's contact attempts on the erased nanny
grant select, delete on table public.lead_contacts           to bbldn_retention;
-- the CRM contact state of the erased nanny
grant select, delete on table public.nanny_contact_state     to bbldn_retention;
-- step 3's "pointers last": the party rows go after the domain writes, so the `set null` keys fire over rows
-- that have already been scrubbed
grant select, delete on table public.parents                 to bbldn_retention;
-- the same, and the delete that fires `0027`'s pseudonymiser. `update (id)` is the row lock, not a write —
-- see section 2h.
grant select, delete, update (id) on table public.nannies    to bbldn_retention;

-- ★ **`precheck_notifications` is deliberately absent, and it is the case worth reading** (database pass, LOW).
-- `0028` granted it `select, update` and **no statement in any of the three jobs touches it.** It is reached
-- only by the `nannies.id → precheck_notifications.nanny_id` key, which `0028` itself moved to
-- `on delete set null` — and **a referential action runs with the privileges of the constraint, not of the
-- caller**, so the erasure needs no grant here at all. `0031`'s own comment says exactly this about the money
-- and placement deletes; the same reasoning had simply not been applied to this table. Driven rather than
-- reasoned: `int.account-erasure`'s existing precheck-notifications case passes with the grant gone. A future
-- reader diffing `0028`'s list against this one should read this paragraph and not go looking for a bug.

-- 2d. The money and consent rows: the purge counts them, the sweep removes them ------------------------------
--
-- `0028` only ever READS these — an erasure refuses while a subscription is live, and 07 §6.1 says money and
-- consent outlive the account with their `user_id` intact (ADR-176). The DELETE on each is `0031`'s, six years
-- after the anchor, and `0030` is what finally removes the `auth.users` row once they are gone.

-- §6.2 row 11; also `0028`'s refusal check on a live subscription (row 9)
grant select, delete on table public.parent_subscriptions    to bbldn_retention;
grant select, delete on table public.payment_events          to bbldn_retention;
grant select, delete on table public.refund_requests         to bbldn_retention;
grant select, delete on table public.guarantee_events        to bbldn_retention;
grant select, delete on table public.consent_records         to bbldn_retention;
grant select, delete on table public.biometric_consent_records to bbldn_retention;

-- 2e. The sweep's own classes (07 §6.2) ---------------------------------------------------------------------

-- §6.2 row 6: the placement is deleted six years after it ended; `0028` nulls its notes and roster first
grant select, update, delete on table public.nanny_placements to bbldn_retention;
-- §6.2 row 12: superseded at 30 days, the rest at 13 months. `update (id)` is the row lock — section 2h.
grant select, delete, update (id) on table public.cookie_consent_records to bbldn_retention;
-- §6.2 row 13: 12 months after acknowledgement. `update (id)` is the row lock — section 2h.
grant select, delete, update (id) on table public.admin_notifications    to bbldn_retention;
-- ★ §6.2 row 13, both halves, and the column list is the whole of the UPDATE. The bodies are nulled at 90 days
-- and the row is deleted at 24 months; `recipient_email` is `0028`'s tombstone. Table-level UPDATE is withheld
-- so that no arm, now or later, can rewrite a send's status or its timestamps.
grant select, delete, update (subject, body_html, body_text, recipient_email)
  on table public.email_logs to bbldn_retention;
-- ★ §6.2 row 14, identifier half only. **No DELETE**: row 14's delete half is ★ — BAI has not confirmed the
-- number — so `0031` defers it, and the privilege that would carry it is not granted either. A deferred class
-- that cannot be executed even by mistake is the honest shape of "deferred".
grant select, update (visitor_id, attribution, request_id)
  on table public.events to bbldn_retention;

-- 2f. Safeguarding: ADR-170 allows the subject to be pseudonymised, and allows nothing else ------------------
--
-- ★ All three tables, by column, with no table-level UPDATE, **no INSERT** and no DELETE. `0031` did this for
-- the first two after measuring that a column grant never narrows a pre-existing table-wide one; INSERT was
-- outside its brief and `nanny_suspension_lifts` was outside its brief, and both are closed here.
--
-- What is NOT granted, on any of the three, is the list that matters: `dbs_outcome`, every `*_status`, every
-- `*_decided_*`, `dbs_update_service_checked_by`, every `*_provider_key`, and on the lifts table `decided_by`,
-- `reason` and `decided_at` — the decision, when it was made, and who made it. `0030` reads these tables and
-- writes none of them.

-- `0027`'s pseudonymiser (`nanny_id`, `subject_pseudonym`) and `0028` step 3 (the evidence, the extracted
-- fields, the vendor handles and the rejection reasons) — exactly `0031`'s list, restated because section 1
-- revoked the column grants with the table ones
grant select, update (
  nanny_id, subject_pseudonym,
  identity_document_ref, identity_selfie_ref, identity_extracted, identity_ai_reasoning, identity_ai_issues,
  identity_user_guidance, surname, given_names, date_of_birth, nationality,
  dbs_certificate_ref, dbs_certificate_number, dbs_extracted, dbs_ai_reasoning, dbs_user_guidance,
  rtw_document_ref, rtw_share_code, rtw_extracted, rtw_user_guidance, cross_check_note,
  identity_provider_ref, dbs_provider_ref, rtw_provider_ref,
  identity_rejection_reason, dbs_rejection_reason, rtw_rejection_reason
) on table public.verifications to bbldn_retention;

-- `0027`'s pseudonymiser, plus §6.2 row 5's `raw_response` — the provider's payload, which §6.2 names
-- explicitly and which is not the decision
grant select, update (raw_response, nanny_id, subject_pseudonym)
  on table public.vetting_submissions to bbldn_retention;

-- ★ `0027`'s pseudonymiser writes exactly these two on this table, and `0030` counts the rows. Nothing else:
-- an audit row whose author can be rewritten is not an audit row, which is this table's own written
-- justification for `decided_by` being `restrict` (quoted in ADR-176), applied to the privilege rather than to
-- the foreign key. ADR-176 noted that the reasoning had been applied to the author and not to the subject; this
-- is the same gap one layer down — applied to the key and not to the grant.
grant select, update (nanny_id, subject_pseudonym)
  on table public.nanny_suspension_lifts to bbldn_retention;

-- 2h. ★ `update (id)` on three tables, and it is a row lock rather than a write ------------------------------
--
-- **Found by running the jobs after the revoke, not by reading.** `erase_account()` and three of `0031`'s arms
-- take `for update nowait` on the rows they are about to delete — the house idiom, ADR-182's fail-fast shape.
-- Measured on the local stack: **`SELECT ... FOR UPDATE` requires an UPDATE privilege, and DELETE does not
-- satisfy it** — `select 1 from public.admin_notifications for update nowait` as this role answered
-- `42501 permission denied` with `select, delete` held. So `0031`'s own `grant select, delete` lines were, on
-- this point, another thing that only worked because of `0016:288`; the arms would have failed the first time
-- anyone narrowed the grant, which is exactly what happened here.
--
-- Postgres has no "may lock a row" privilege, so the choice was table-level UPDATE — the widest thing in this
-- file, and on `nannies` it would reach `suspended_at`, `verification_level` and `is_isolated`, which is
-- ADR-168's surface — or **the narrowest column grant that satisfies the lock**, measured to be any single
-- column. `id` is that column: no job, arm or trigger writes it, it carries no personal data and no decision,
-- and where the row matters the foreign keys referencing it refuse the update outright (`ON UPDATE NO ACTION`
-- is the default on every one of them). The verify block asserts the data columns stayed unwritable.
--
-- The alternative is to stop locking — a `delete ... where id in (select ... limit n)` needs no UPDATE at all —
-- and that is a change to `0031`'s and `0028`'s contention behaviour, not to a grant. It is this unit's
-- question, not its change.

-- 2g. Storage ------------------------------------------------------------------------------------------------
--
-- SELECT only. `collect_erasure_objects()` reads the subject's paths by prefix and the removal is an HTTP call
-- outside the transaction — `0015` refuses a direct DELETE on `storage.objects` to every role, this one
-- included, so there is nothing to grant even if the job wanted it.
grant select on table storage.objects to bbldn_retention;

-- ENUMERATED SET — END
-- ---------------------------------------------------------------------------

commit;

-- ---------------------------------------------------------------------------
-- 3. Verify — what this file claims, asserted rather than described.
--
-- Outside the transaction on purpose: it reads the committed state, so a claim that passes here is a claim
-- about the database an operator will find, not about one that might still roll back.
-- ---------------------------------------------------------------------------

do $$
declare
  v_named  text[] := array[
    'public.account_erasure_requests', 'public.admin_notifications', 'public.biometric_consent_records',
    'public.bloombot', 'public.bookings', 'public.chat_draft_locks', 'public.child_client', 'public.children',
    'public.connection_requests', 'public.consent_records', 'public.cookie_consent_records',
    'public.email_logs', 'public.events', 'public.file_retention_log', 'public.guarantee_events',
    'public.inbox_messages', 'public.lead_contacts', 'public.lead_notes', 'public.nannies',
    'public.nanny_contact_state', 'public.nanny_placements', 'public.nanny_positions',
    'public.nanny_suspension_lifts', 'public.parent_subscriptions', 'public.parents', 'public.payment_events',
    'public.position_children', 'public.position_schedule', 'public.refund_requests', 'public.user_profiles',
    'public.verifications', 'public.vetting_submissions', 'storage.objects'
  ];
  v_held   text[];
  v_extra  text[];
  v_missing text[];
  v_views  int;
begin
  select coalesce(array_agg(distinct rel order by rel), '{}')
    into v_held
    from (
      select c.relnamespace::regnamespace::text || '.' || c.relname as rel
        from pg_class c, lateral aclexplode(c.relacl) a
       where c.relkind in ('r','p','v','m','f')
         and a.grantee = 'bbldn_retention'::regrole
    ) s;

  -- 1. ★ ADR-185's whole claim: the set held is the set named, in both directions.
  select coalesce(array_agg(x), '{}') into v_extra   from unnest(v_held)  x where x <> all (v_named);
  select coalesce(array_agg(x), '{}') into v_missing from unnest(v_named) x where x <> all (v_held);
  if array_length(v_extra, 1) is not null then
    raise exception '0032: bbldn_retention still holds privilege on a table the enumerated set does not name: %', v_extra;
  end if;
  if array_length(v_missing, 1) is not null then
    raise exception '0032: the revoke took a table a retention job needs: %', v_missing;
  end if;

  -- 2. ★ No view. A retention job works on rows; a DML grant on a view is a road nobody meant to open, and
  --    `0016:288` opened nine of them without anyone deciding to.
  select count(*) into v_views
    from pg_class c, lateral aclexplode(c.relacl) a
   where c.relkind in ('v','m') and a.grantee = 'bbldn_retention'::regrole;
  if v_views <> 0 then
    raise exception '0032: bbldn_retention holds a privilege on % view(s)', v_views;
  end if;

  -- 3. ★ Safeguarding, the negatives — ADR-170 as a privilege rather than as a sentence. INSERT is the half
  --    `0031` could not reach: a retention job that can create a vetting record can create a DBS outcome.
  if has_table_privilege('bbldn_retention', 'public.verifications', 'insert')
     or has_table_privilege('bbldn_retention', 'public.vetting_submissions', 'insert')
     or has_table_privilege('bbldn_retention', 'public.nanny_suspension_lifts', 'insert') then
    raise exception '0032: the retention identity can create a safeguarding record';
  end if;
  if has_table_privilege('bbldn_retention', 'public.verifications', 'delete')
     or has_table_privilege('bbldn_retention', 'public.vetting_submissions', 'delete')
     or has_table_privilege('bbldn_retention', 'public.nanny_suspension_lifts', 'delete') then
    raise exception '0032: the retention identity can delete a safeguarding record (ADR-170)';
  end if;
  if has_column_privilege('bbldn_retention', 'public.verifications', 'dbs_outcome', 'update')
     or has_column_privilege('bbldn_retention', 'public.vetting_submissions', 'status', 'update')
     or has_column_privilege('bbldn_retention', 'public.vetting_submissions', 'decided_by', 'update')
     or has_column_privilege('bbldn_retention', 'public.nanny_suspension_lifts', 'decided_by', 'update')
     or has_column_privilege('bbldn_retention', 'public.nanny_suspension_lifts', 'reason', 'update') then
    raise exception '0032: the retention identity can rewrite a safeguarding decision';
  end if;

  -- 4. ★ And the three jobs can still do their work, or this file broke the right to erasure to tidy a grant.
  if not has_column_privilege('bbldn_retention', 'public.verifications', 'subject_pseudonym', 'update')
     or not has_column_privilege('bbldn_retention', 'public.vetting_submissions', 'subject_pseudonym', 'update')
     or not has_column_privilege('bbldn_retention', 'public.nanny_suspension_lifts', 'subject_pseudonym', 'update')
     or not has_column_privilege('bbldn_retention', 'public.verifications', 'dbs_certificate_number', 'update')
     or not has_column_privilege('bbldn_retention', 'public.email_logs', 'recipient_email', 'update')
     or not has_column_privilege('bbldn_retention', 'public.events', 'visitor_id', 'update')
     or not has_table_privilege('bbldn_retention', 'public.nannies', 'delete')
     or not has_table_privilege('bbldn_retention', 'public.payment_events', 'delete')
     or not has_table_privilege('bbldn_retention', 'public.file_retention_log', 'insert') then
    raise exception '0032: the revoke took a privilege one of the three retention jobs needs';
  end if;

  -- 4b. ★ The three `update (id)` grants are a row lock and nothing else: the lock works, and not one data
  --     column of those tables is writable by this role.
  if not has_column_privilege('bbldn_retention', 'public.nannies', 'id', 'update')
     or not has_column_privilege('bbldn_retention', 'public.admin_notifications', 'id', 'update')
     or not has_column_privilege('bbldn_retention', 'public.cookie_consent_records', 'id', 'update') then
    raise exception '0032: an arm''s `for update nowait` has no UPDATE privilege and will raise 42501';
  end if;
  if has_column_privilege('bbldn_retention', 'public.nannies', 'suspended_at', 'update')
     or has_column_privilege('bbldn_retention', 'public.nannies', 'verification_level', 'update')
     or has_column_privilege('bbldn_retention', 'public.nannies', 'is_isolated', 'update')
     or has_column_privilege('bbldn_retention', 'public.admin_notifications', 'acknowledged_at', 'update')
     or has_column_privilege('bbldn_retention', 'public.cookie_consent_records', 'superseded_by', 'update') then
    raise exception '0032: the row-lock grant widened into a data column';
  end if;

  -- 5. The two deferred halves stay unreachable: `events` may not be deleted from (§6.2 row 14's ★ half) and
  --    `email_logs`' non-content columns may not be rewritten.
  if has_table_privilege('bbldn_retention', 'public.events', 'delete') then
    raise exception '0032: the retention identity can delete an event row — §6.2 row 14''s delete half is deferred';
  end if;
  if has_column_privilege('bbldn_retention', 'public.email_logs', 'status', 'update') then
    raise exception '0032: the retention identity can rewrite an email send''s status';
  end if;

  -- 6. Schema USAGE survived and `create` did not, because section 1 is a revoke of table privileges and must
  --    not have been read as anything wider.
  if not has_schema_privilege('bbldn_retention', 'public', 'usage')
     or not has_schema_privilege('bbldn_retention', 'storage', 'usage') then
    raise exception '0032: bbldn_retention lost USAGE and every grant above is unreachable';
  end if;
  if has_schema_privilege('bbldn_retention', 'public', 'create') then
    raise exception '0032: bbldn_retention was left holding CREATE on schema public';
  end if;
end;
$$;
