# Review sweep — 2026-09-19 — Phase 2's second five units (`dada284..6551ddc`)

> **What this is.** The **ADR-123 checkpoint** over everything that merged to `main` since REVIEW-3 closed: **`2c`** (PR #43 — the verification status model, the silent hold, the admin queue, the comms and crons, `0023`; ADR-157…163), **`2d`** (#45 — nanny profile and settings, the nanny's name on three parent surfaces, the held pair, `0024`; ADR-166), **`2f`** (#46 — the development seed and the dangling auto-seed default closed; ADR-167), **P2-HARDEN** (#44 — R-3…R-6: the action-limit gate, the 50-line gate, the upload cap, the integration job) and REVIEW-3's own merge (#42). 202 files, +15,492 / −3,580.
>
> **Run by** `BB-LDN-Planner-070926/REVIEW-4` on `review-190926-4`, off `origin/main` `6551ddc`, in its own worktree, sole unit in flight (ADR-164). Battery: `code-reviewer` + `typescript-reviewer` + `silent-failure-hunter` in one parallel batch over the diff; then `security-reviewer` over every new action, route, store, definer caller and boot wiring; then `database-reviewer` **read-only** over `0023` / `0024` and their twins. **Every finding below was re-verified by hand before it was acted on or recorded**, and that was load-bearing in both directions again: it demoted three of the agents' four HIGHs to recorded MEDIUMs on provenance alone (the lines predate this range), and it promoted one agent MEDIUM to a measured CRITICAL.
>
> **What was different about this sweep.** REVIEW-3 had the applied migration set. This one had that **plus the two things `2f` and P2-HARDEN built**: a seed whose refusals can be driven, and a `supabase db reset` from empty that is now a required check. So the headline is not an argument about SQL or about TypeScript — it is **a real nanny session submitting a real DBS certificate to the real definer and being refused**, and a real bar being lifted by a second click on the same row. Both were found by reading, and neither was believed until it was driven.

---

## 1. Counts

| Severity | Found | Fixed in this sweep | Pinned (`it.fails`) | Recorded for another unit |
| -------- | ----- | ------------------- | ------------------- | ------------------------- |
| CRITICAL | 3     | 1                   | 2                   | 2 (the same two)          |
| HIGH     | 4     | 2                   | 1                   | 1                         |
| MEDIUM   | 16    | 1                   | 1                   | 14                        |
| LOW      | 8     | 0                   | 0                   | 8                         |

**Bottom line.** REVIEW-3's theme was _a control asserted in a header that held for two of the three reads it named_. Phase 2's second half has a sharper one, and it is the same seam from the other side: **three of this sweep's four worst findings are places where a TypeScript adapter and a Postgres column disagree about what a value means, and every existing test passes because no test has ever put the two in one room.** A boolean marker in a `timestamptz` column stops every DBS submission dead. A `nannies.id` labelled `UserId` silently empties every read-back, event and outcome email on the admin decision road. And `record_vetting_decision` has no already-decided guard, so an adverse DBS bar comes off with one more click — measured `suspended t → f`, not argued.

The second theme is the happier one and it is the same as last sweep's: **where a claim could be checked against behaviour, it was, and it holds.** ADR-162's one predicate is genuinely one predicate — I drove seven nanny states through every road keyed on it, not the two REVIEW-3 measured, and an unverified, a held and an isolated nanny all read exactly nothing. The seed's three refusals all fire, all exit non-zero, and all write nothing. The 0023 twin really does keep the hole shut through a rollback. Those are the three biggest claims this phase makes, and all three survive being driven.

---

## 2. CRITICAL

### C-1 — **FIXED** — every DBS submission fails: a boolean marker cast into a `timestamptz` column

|              |                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity** | CRITICAL (latent in the sense REVIEW-2 and REVIEW-3's were — nothing is deployed — but total: the road it blocks is the only road to L3)               |
| **Files**    | `src/boot/db-vetting-store.ts:132-140` · `supabase/migrations/0022_verification-wizard.sql:85-88` · `0023_verification-decision-sync.sql:926, 980-982` |
| **Owner**    | REVIEW-4 (fixed); originally `2c`. Held by `supabase/__tests__/dbs-consent-marker.test.ts` (3) and `src/boot/__tests__/db-verification-stores.test.ts` |

REVIEW-3's M-5 said the Update Service consent instant must be the server's and not the client's. `2c` answered it in two halves that never met:

- `0023:980-982` takes the **presence** of the key in the raw `p_columns` as the consent and stamps `now()`;
- `db-vetting-store.ts:134` marks that presence with the value `true`.

But `verification_submission_columns` filters **keys** and passes **values** through verbatim, and `0022:85-88` keeps `dbs_update_service_consent_at` in the `dbs` allow-list. `submit_verification_evidence` then builds its update row with `jsonb_populate_record(v_row, …)` (`0023:926`), which casts every admitted key through the column's own type. The column is `timestamptz`.

**Driven end to end, as the wizard calls it** — a real nanny session, the exact object `columnsOf` builds:

```
ERROR:  invalid input syntax for type timestamp with time zone: "true"
CONTEXT:  PL/pgSQL function public.submit_verification_evidence(...) line 95 at assignment
```

It is not an edge. `dbs-schema.ts:20` makes the Update Service tick mandatory (`z.literal("on")`), so `submit-dbs.ts:63` always sets `updateServiceConsent: "true"` and the marker is always emitted. **Every DBS certificate submission fails.** `port.run` turns the driver throw into `INTERNAL`, `submit-evidence.ts` runs `undo(uploaded)` so her certificate is deleted from storage again, and she reads "We couldn't save that just now." The `dbs` section never leaves `not_started`, no nanny reaches L3, and the matching pool cannot be filled at all.

**Why nothing caught it.** `db-verification-stores.test.ts:148` pinned the marker `true` against a **fake port**. `rpc-0022` and `rpc-0023` drive the definer with a **timestamptz string**. The mock and the column were never in the same room — which is exactly the seam `.github/workflows/ci.yml`'s new `integration` job was added in this same diff to close, and which it does not yet reach because no integration test drives the application adapters against the database.

**Fix.** The marker is `null`. `p_columns ? 'dbs_update_service_consent_at'` is true for a key whose value is JSON null, so REVIEW-3 M-5's "presence is the consent, the instant is the server's" survives **exactly** — measured: the submit succeeds, `dbs_update_service_consent_at` is stamped by `now()`, `dbs_status` moves to `pending`. The new integration file asserts the constraint from **both** sides — a boolean is refused `22007`, a null is accepted and stamped, and an omitted key leaves the instant alone — so neither half can drift again.

### C-2 — **PINNED + RECORDED** — a bar is not terminal: re-deciding the same submission lifts it

|              |                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity** | CRITICAL (safeguarding; needs an admin session, but a browser-back-and-resubmit is one)                                                       |
| **Files**    | `supabase/migrations/0022_verification-wizard.sql:429, 445-456` · `0023_verification-decision-sync.sql:301, 308, 427-433`                     |
| **Owner**    | **`2c` / the migration's author — a migration, so not this sweep's to write.** Pinned in `supabase/__tests__/decision-road-integrity.test.ts` |

Found independently by this sweep's `database-reviewer` (H1) and its `security-reviewer` (HIGH-3), which is why it got driven rather than recorded.

03 §4.3 is "adverse → barred → level 0 + account suspended", and I-V5 is what keeps a barred nanny out of the pool. Three things together undo it:

1. **`record_vetting_decision` has no already-decided guard.** `apply_vetting_check_result`'s only recency check (`0022:445-456`) fires on a _newer_ submission of the same evidence type; re-deciding the newest row is not that.
2. **Its else-branch resets the outcome from any value.** `0023:427-433` sets `dbs_outcome = 'unset'` for every rejection whose reason is not the exact string `adverse`.
3. **The sync derives the suspension from the outcome alone.** `0023:301, 308` — `suspended_at = case when v_suspend then coalesce(v.suspended_at, now()) else null end`, and `v_suspend` is `dbs_outcome = 'barred'` read fresh.

**Measured on the applied set**, same submission id both times:

| step             | level          | suspended | `dbs_outcome` |
| ---------------- | -------------- | --------- | ------------- |
| after `adverse`  | `L0_SIGNED_UP` | **t**     | `barred`      |
| after `mismatch` | `L0_SIGNED_UP` | **f**     | `unset`       |

She is un-barred and un-suspended. `submit_verification_evidence`'s `SUSPENDED` gate (`0022:180`) now passes, so she resubmits and climbs back to L3. The submission id is on the queue screen and in `SubmissionPanel`'s hidden field; `decided_by` is overwritten on the same row, so **nothing anywhere records that a bar was lifted**. `verifications_barred_is_suspended_check` constrains only _entering_ barred, never leaving it.

Worth saying separately, because it outlives this finding: `suspended_at` today has exactly one writer. The day an admin-suspend button or a safeguarding suspension writes that column, the next verification event of any kind silently lifts it (M-12).

**Why pinned rather than fixed.** It is a migration, and migrations are merged by the time a checkpoint runs — REVIEW-3 C-1's precedent exactly. Which of the two guards is wanted is a ruling, not a review agent's call: **R-3 in §8.**

### C-3 — **PINNED + RECORDED** — the ledger hands the application a `nannies.id` and every `2c` admin road reads it as an `auth.users` id

|              |                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity** | CRITICAL (the admin verification road is non-functional, and the barred alert is silent)                                                      |
| **Files**    | `src/boot/db-vetting-store.ts:98` · `src/boot/db-verification-store.ts:283-292, 311-315, 405-418, 426-434, 443` · `0008_verification.sql:156` |
| **Owner**    | **`2c` / 03 §4.2's connector shape** — a contract, and REVIEW-2 H-10 settled that a checkpoint pins one. Pinned in the same file as C-2.      |

`vetting_submissions.nanny_id` is `references public.nannies (id)` (confirmed in the live catalogue: `vetting_submissions_nanny_id_fkey … REFERENCES nannies(id)`), and `submit_verification_evidence` writes it as `select n.id from public.nannies n where n.user_id = v_user_id` (`0023:865`). `nannies.id` defaults `gen_random_uuid()` and is **not** the `auth.users.id`. `db-vetting-store.ts:98` labels it `UserId` with no join.

The cast predates this range. **This diff is what makes it load-bearing**, because every road `2c` built consumes `entry.value.nannyId` as a session user id, and `db-verification-store.ts` resolves every one of them through `nannies.user_id = $1` — a lookup whose own comment at :311 says so in as many words ("the view keys on the party row (`nannies.id`), the wizard on the user (R-7)"). A `nannies.id` matches nothing there:

| call site                                        | what happens against the real database                                                                                                             |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `read-queue-record.ts:32-33` → `readAdminRecord` | null → `"That check is not available"`. **No queue row in S-A-16 ever opens.**                                                                     |
| `open-evidence.ts:92-97`                         | the same. **No document is ever revealed.**                                                                                                        |
| `record-update-service-check.ts:35`              | `db-verification-store.ts:443` **throws**. **L4 is unreachable** — so `sync_nanny_verification_state`'s L4 release of held connections never fires |
| `decide.ts:63-64` → `getStatus`                  | null → `fromLevel` forced to `L0_SIGNED_UP`                                                                                                        |
| `decide.ts:88` → `syncLevel`                     | `nannyIdOf` null → the **fabricated** `{L0 → L0, suspended: false, released: 0}` at `:426-434`, without ever calling the RPC                       |
| `emit-level-events.ts`                           | `from === to` → **no `verification.level-changed`, no `held`, no `released` is ever recorded for an admin decision** (07 §9.2 (f)'s audit trail)   |
| `send-verification-outcome.ts:106`               | `sync.suspended` always false → `onBarred` never runs: **no `verification-barred` to her, no `admin-nanny-barred`, no `nanny_barred` row**         |
| `admin-verification/lib/nanny-name-of.ts`        | every queue row renders `Nanny 5eed0200` rather than a name                                                                                        |

The database stays correct throughout — `record_vetting_decision` uses its own `v_sub.nanny_id` — so what is broken is the entire read-back, event and comms layer above it. Read C-2 and C-3 together and the shape is stark: an adverse DBS writes a correct barred row that **nobody is told about**, and that one more click reverses.

**Why nothing caught it.** `memory-verification-store` and `memory-vetting-store` use one opaque string for both id spaces, so the two are indistinguishable there; the integration suites drive the SQL and never the adapters. Nothing in the tree wires `dbVettingStore` and `dbVerificationStore` to each other. The pin is therefore written at the schema — _the id the ledger hands the application is one a `nannies.user_id` lookup can resolve_ — so it flips on either fix: a join in `entryOf`, or a distinct `NannyPartyId` brand with the conversion made explicit at the seam. **R-4 in §8.**

---

## 3. HIGH

### H-1 — **FIXED** — the 5-minute run launders a refused sweep into a plausible `skipped`

`src/app/api/cron/send-delayed-emails/route.ts:27, 38, 42` · **Owner: REVIEW-4 (fixed); originally `2c`**

Found by all three battery agents independently, which is a good sign about the shape rather than about any one of them. Four sweeps, one handler. `stale` and `reminders` return their error, which `runCron` turns into `log.error` + `ALERT_CRON_FAILED` and a non-200. `holds` did neither: `skipped: … + (holds.ok ? 0 : 1)`, and the run answered `ok`.

So a refused `scheduling.expireHolds` — which returns `err` with no logging of its own (`scheduling-booking-writes.ts:224-246`) — produced HTTP 200 and `log.info("cron run", { handled, skipped })`, where `skipped: 1` is indistinguishable from a hold that simply was not due. Slot holds stop expiring, abandoned checkouts lock scheduling slots for ever, and a parent is shown times that are not free. `run-cron.ts:57-58`'s own comment names the failure this line reintroduced: _"a thrown-away error is how a silent cron becomes a week of unswept rows."_

**Fix.** `if (!holds.ok) return holds;`, beside its two siblings. All four sweeps still **run** before any refusal is returned, so one sweep being down never costs the others their pass. One RED case first, against the shipped handler's 200.

### H-2 — **PINNED** — the hold's third road: a held connection emails the family

`src/modules/connections/lib/send-row-messages.ts:16-59` · `lib/connection-messages.ts:22-52` · `lib/create-connections-slice.ts:172` · **Owner: `connections` / ADR-158 (2)'s owner.** Pinned in `connections.held-notification.test.ts`

The brief asked for a third road past `2d`'s CRITICAL fix. This is it, and it is the **notification** half of R-14's own sentence: _"held rows withhold parent **notification** until L4."_

`2d`'s own `security-reviewer` found that a held row reached both parent **screens** and closed it properly in `visibleToParent`, at the two consumption points, with `connections.held-invisible.test.ts` holding both halves. That fix is sound and this finding does not touch it. But `sendRowMessages` runs unconditionally after every committed K row and reads only `fillInitiatedBy` — I grepped `heldForVerification` across `connections`, `positions`, `comms`, `matching` and `boot`: it appears in the store, the slice, the types, `visibleToParent` and `namesFor`, and **nowhere in the comms path**. `MESSAGES_OF` carries six parent-addressed templates: `K-5 connection-accepted`, `K-6 connection-declined`, `K-8`/`K-10 connection-expired-parent`, `K-9`/`K-11 meeting-scheduled`, `K-17 confirm-nanny`, `K-20`'s pair.

**And held is the main line, not an edge.** `MATCHING.minVerificationLevel` is L3, so a nanny enters the pool at L3 and `heldPair` holds _every_ connection made for anyone below L4 — which is every nanny between entering the pool and her Update Service check. Driven in the test: parent Connects, nanny accepts, `posted` carries `{ templateId: "connection-accepted", to: "parent" }`, and `visibleToParent` then hides the row from both of her screens. She is told, and then finds nothing. `recipientOf` is wired in production (`wire-connections.ts:44-56`), so the address resolves and the message goes.

**Why pinned rather than fixed, and the reason is judgement not scope.** The early return is one line and for K-5 it is unambiguously what R-14 asks. It is not obviously right for all six: `K-20`'s `placement-confirmed-parent` and `hire-confirmation-family` are the hire itself, and swallowing those to honour a hold would be a worse failure than the one being fixed. Which of the six a hold silences — and whether a held row should reach K-20 at all — is 03 §8.3's and ADR-158's owner's call. **R-5 in §8.** The file carries a passing control (at L4 the family **is** told) and a passing boundary (K-1 already tells only the nanny), so the pin cannot be misread as "comms are broken".

### H-3 — **FIXED** — ADR-165 (3) had no implementation anywhere in the tree

`supabase/__tests__/rollback-security-clauses.test.ts` (new, 4 cases, 1 pinned) · **Owner: REVIEW-4 (fixed)**

ADR-165 was ratified in this very phase, off `2c`'s own finding, and its third clause is testable and specific: _"every twin whose forward file carried a security clause ships a test that applies forward → twin → and asserts the hole is still closed, which is how this was caught."_

Measured at `6551ddc`: **no file under `supabase/__tests__/`, `src/`, `scripts/` or `.github/` reads anything from `supabase/rollbacks/`.** Every "rollback" in the test tree is a `db.query("rollback")` transaction rollback. The twins were checked by a person reading them, which is exactly how the defect ADR-165 exists to prevent got into `0023`'s twin in the first place.

**Fix.** The first such test, for `0023` — the one migration in the tree whose forward file carries both a measured security fix (ADR-162's level term) and a measured narrowing (ADR-163's grant). It runs inside the suite's own transaction and strips the twin's own `begin;`/`commit;` (asserting that exactly one of each was removed, so a twin that grows a second pair fails loudly rather than half-running). Its cases:

- the twin really ran, and `nanny_visible` / `nanny_is_visible` are gone — **passes**;
- **ADR-165 (1) holds in fact, not only in prose**: after the twin, an applied unverified nanny still reads no position, no `needs_details` and no `position_schedule`, and `is_active_nanny()` still answers `false` — **passes**. REVIEW-3's CRITICAL stays shut through a rollback;
- ADR-165 (2) — **pinned**, see M-3.

### H-4 — **RECORDED** — the reminder funnel drops the entire cohort it was built for

`src/boot/db-verification-store.ts:499-508` · `src/modules/verification/lib/memory-verification-store.ts:325-342` · **Owner: `2c`**

`listRemindable` computes `lastChangeAt` from the three `*_status_at` columns and returns `[]` when all three are null. All three are nullable with **no default** (`0008:39, 63, 85`), and `save_verification_contact` sets only `contact_saved_at` (`0022:335`) — verified against the live schema. So a nanny who signs up, saves her contact details and stops has all three `NULL`. She passes the "has something she can act on" gate (`not_started` is in `OPEN`) and is then silently dropped — and that is the single largest group the LCY-1…4 funnel targets. None of the four nudges is ever scheduled, and `sweepReminders` reports counts that never mention her.

`0023`'s own SQL already knows this can be null and coalesces to `updated_at` in all three statements of `sweep_stale_verification_processing` (`:566, 570, 574`). The TypeScript reader does not.

**Why recorded rather than fixed.** The fix is two lines in the adapter (`AdminRow` gains `updated_at`, the fallback mirrors the SQL) **and** a model change in `memory-verification-store`, whose section shape carries no row-level timestamp at all — and the double is the module's contract (03 §4.2), which REVIEW-2's H-10 settled a checkpoint does not change. It is also fully latent: `comms` has no template renderer, every send fails closed with `renderer-not-configured`, and ADR-161 records the delivery gap as Phase 4a's — so no reminder is missed in fact today, only in the rows that would be scheduled. Note the same file treats the same missing timestamp the **opposite** way 40 lines up (`memory-verification-store.ts:282-283` sweeps a null `statusAt` to `review` as stale), which is the evidence that nobody decided this.

---

## 4. MEDIUM

| #    | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | File                                                                                               | Owner                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------- |
| M-1  | **REVIEW-3's M-3 is unchanged and the sentence is still false.** `nannyApplications`' allow-file reason still reads "No Phase 1 surface lets a nanny apply", and `/apply` has shipped since `2a` (`src/app/(funnel)/apply/page.tsx` exists). One cycle on, a recorded reason that a reader checks against the tree is still untrue.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `scripts/ci/limiter-call-sites.allow.json:7`                                                       | `2d`, or a one-line reword   |
| M-2  | **FIXED — ADR-160's operator row was lost when no admin address is configured.** `notifyAdmin` was appended **below** an `adminEmail === undefined` early return that predates it, so a nanny books her commission call and nothing anywhere says so. ADR-160's own words are "the email is the delivery, the row the state", and the state is the half that must survive a missing address. Misconfiguration path (`ADMIN_EMAIL` is required in the three real environments) but a modelled one. RED first.                                                                                                                                                                                                                                                                                                                                                                                | `src/modules/call-layer/lib/send-nanny-call-messages.ts:45-48`                                     | REVIEW-4 (fixed); `2c`       |
| M-3  | **PINNED — the `0023` twin accepts the ADR-163 regression where ADR-165 (2) requires a refusal.** The twin restores EXECUTE on `create_nanny_account` to `authenticated` — measured after applying it: `authenticated=X/postgres` — and asks the operator to revoke it by hand in a comment. ADR-165 (2) rules that a twin in exactly that position must end in `RAISE EXCEPTION` naming the roll-forward, _"so a half-informed operator cannot re-open the hole at 3 a.m."_ A comment is not a control. The twin is otherwise exemplary about arm (1).                                                                                                                                                                                                                                                                                                                                     | `supabase/rollbacks/0023_verification-decision-sync.rollback.sql:34-41, 145-146`                   | `2c`. **R-2 in §8**          |
| M-4  | **`integration` is a required check that a fork PR passes by skipping.** Confirmed both halves: branch protection lists `["typecheck","lint","gitleaks","allowed-imports","types-drift","limiter-call-sites","integration"]`, and the job carries `if: …head.repo.full_name == github.repository \|\| github.event_name == 'push'`. A job skipped by a job-level `if` reports **skipped**, which branch protection counts as success — so on a fork PR the one gate guarding the mock-versus-column seam reports green without running. The repo is public. The fork reasoning in the comment is sound; the consequence is not named.                                                                                                                                                                                                                                                       | `.github/workflows/ci.yml:202`                                                                     | P2-HARDEN / ADR-109. **R-6** |
| M-5  | **`check:action-limits`' six "consumed one boundary in, in `<file>`" reasons are unverifiable prose.** Proved by measurement: I replaced `decide.ts`'s `consumeAdminRouteLimit` call with a literal and the gate stayed **green**, because `decide-submission-action.ts` is allow-listed and the gate never checks the delegate the reason names. The gate is honest about what it asserts — and it does work: removing an unlisted action's limiter fails it correctly, and `code-only.mjs` correctly refuses a commented-out call. But 6 of 25 entries name a file **and** a helper, which is mechanically checkable and is not checked.                                                                                                                                                                                                                                                  | `scripts/ci/check-action-limits.mjs` · `limiter-call-sites.allow.json`                             | P2-HARDEN. **R-7**           |
| M-6  | **The 50-line allow-list is growing, and it has no staleness check while both limiter allow-files do.** 106 entries when the rule landed (`fb9851c`), **109** now. The mechanism does work in one direction — `2d` touched `db-connection-store.ts`, split it, and removed its entry, which is "split when touched" honoured. But `2c`'s four `admin-verification` components were added in the same merge as "pre-gate", so four of the 109 recorded offenders are code this range wrote. And a renamed or deleted path stays for ever as a silent no-op `overrides` entry, unlike `check-limiter-call-sites.mjs:120-128` and `check-action-limits.mjs:139-147`, which both fail on a stale entry by design.                                                                                                                                                                               | `eslint.long-functions.json` · `.eslintrc.js:47-55`                                                | P2-HARDEN. **R-8**           |
| M-7  | **The seed's allow-list substring-matches the whole connection string, password included.** `allowedRefs(env).some((ref) => host.includes(ref) \|\| dbUrl.includes(ref))` — `BBLDN_SEED_ALLOWED_PROJECT_REFS=postgres` matches every Postgres URL on the planet and disables gate 1's target arm against any target. The file's own rationale is "an allow-list is wrong loudly"; a substring match over a string containing the scheme and the credentials makes it wrong quietly. Found by two agents independently.                                                                                                                                                                                                                                                                                                                                                                      | `supabase/seed/lib/target-refusals.ts:56-58`                                                       | `2f`                         |
| M-8  | **The seed disables TLS verification for exactly the targets that need it, and disagrees with its own gate about "local".** `ssl: url.includes("127.0.0.1") ? undefined : { rejectUnauthorized: false }` — the only non-local targets gate 1 permits are allow-listed remote projects reached over the internet with the database password in the URL. Separately, `target-refusals.ts:17` treats `localhost`, `::1` and `db.localhost` as local while this line matches only the literal `127.0.0.1`, so seeding via `localhost:54322` passes the gate and then attempts SSL against a stack that offers none.                                                                                                                                                                                                                                                                             | `supabase/seed/run.mts:40`                                                                         | `2f`                         |
| M-9  | **REVIEW-3's M-6 is unchanged, and `2d`'s new consumers make it worse.** `if (!user.ok \|\| user.value === null) return null;` is still unlogged three lines above a `getStatus` refusal that **is** logged, in the same 12-line function. What is new is the consequence: `2d` routes S-N-17 and S-N-21 through `NOT_STARTED_VERIFICATION`, and `nanny-verification-summary.ts` turns all-`not_started` into _"Something needs another look — it won't take long."_ An **L4** nanny reads that during an outage and is invited to re-upload her passport and DBS certificate. The fail-closed reasoning in `not-started-verification.ts:5-7` is genuine and holds for the _level_; it does not hold for the call to action, and neither arm carries an `alert:`.                                                                                                                           | `src/modules/verification/lib/load-verification-status.ts:10-18` · `nanny-verification-summary.ts` | `2b`, with `2d`              |
| M-10 | **`p_required` refuses an emptied list but accepts a partial one.** The validation checks shape, known levels, known sections and non-empty L2–L4 (`0023:238-263`), but not monotonicity and not a floor. `{"L2":["dbs"],"L3":["dbs"],"L4":["dbs"]}` passes every check and grants L4 to a nanny whose `identity_status` was never `verified`. The hardcoded conjuncts at `:280-288` bound the damage — no L3/L4 without `cleared` + `passed`, no L4 without an admin's `no_change` — but identity is droppable, and the function's own docstring claims "a malformed or emptied list refuses rather than grants", which is true for empty and false for partial. `REQUIRED` is computed at module load from config and no request data reaches it, so this is latent.                                                                                                                      | `supabase/migrations/0023_verification-decision-sync.sql:238-263`                                  | `2c`                         |
| M-11 | **`payment_events_unprocessed_idx` re-keyed to `outcome is null` strands the rows the runbook reconciles from.** `0020:146` states the contract in the file: an `unresolved` patch _"keeps its error and stays on `payment_events_unprocessed_idx`, where the runbook reconciles from"_, and `db-spine-store.ts:113`, `wire-payments.ts:44` and `payments/README.md:51` all name `processed_at IS NULL`. After `0023` an `unresolved` row carries `outcome='unresolved'` and leaves the index, so money events that could not be applied disappear from the queue that exists to catch them — and the documented predicate loses its index entirely. The `0023` twin restores `where processed_at is null`, i.e. the twin agrees with the runbook and the forward file does not.                                                                                                            | `supabase/migrations/0023_verification-decision-sync.sql:67-70, 117`                               | `2c` / payments              |
| M-12 | **The sync is a universal un-suspender.** `suspended_at = … else null end` (`0023:301, 308`) clears the column on **every** path where `dbs_outcome <> 'barred'`, whatever put it there. Today that column has exactly one writer, so this is latent — it is also the second half of C-2's mechanism, and it is the half that outlives C-2's fix. The day an admin-suspend button, a safeguarding suspension or a payment suspension writes it, the next identity decision or expiry sweep silently lifts it.                                                                                                                                                                                                                                                                                                                                                                               | `supabase/migrations/0023_verification-decision-sync.sql:301, 308`                                 | `2c`                         |
| M-13 | **`0023`'s verify block asserts almost nothing about the five objects it re-creates.** For its six new functions the block is exemplary and matches the house standard exactly — `'search_path=""' = any(p.proconfig)`, overload count, anon/authenticated denial, `service_role` grant, owner `BYPASSRLS`. For `submit_verification_evidence`, `apply_payment_event`, `is_active_nanny`, `nanny_visible`/`nanny_is_visible` it asserts no overload count, no exact `search_path`, no grants and no `SECURITY DEFINER`. `submit_verification_evidence` is the sharp one: `0022` asserted its overload count and its grant, `0023` re-creates it and asserts only a `prosrc` regex. A one-character signature drift would have left two overloads — two roads into the same write — and the block would have passed. (Live catalogue confirmed correct; the _assertion_ is what is missing.) | `supabase/migrations/0023_verification-decision-sync.sql:1010-1162`                                | `2c`                         |
| M-14 | **`0024`'s verify block uses the exact `LIKE` wildcard `0022` named as the defect, and its twin copied it.** `array_to_string(coalesce(p.proconfig,'{}'), ',') like '%search_path=%'` — `search_path=public` passes. `0022` annotates the correct form and why (REVIEW-3's M-2, now closed everywhere else); `0023:1052` uses it. `0024` is the one file in the pair that regressed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `supabase/migrations/0024_connection-hold-write.sql:212` · its twin `:186`                         | `2d`                         |
| M-15 | **`sweep_stale_verification_processing`'s third statement is a guaranteed sequential scan, on the 5-minute cron, for ever.** `verifications` carries partial indexes on `identity_status` and `dbs_status` and **none on `rtw_status`**; confirmed with `enable_seqscan=off` — the identity statement plans an index scan, the rtw statement still plans a seq scan at cost 10000000000. Linear in the nanny table, 288 times a day. A partial index matching its two siblings closes it.                                                                                                                                                                                                                                                                                                                                                                                                   | `supabase/migrations/0023_verification-decision-sync.sql:573-574`                                  | `2c`                         |
| M-16 | **The `0023` twin has no verify block at all.** It drops six functions, a column and an index and re-creates five objects across three tables, and asserts none of it — while `0024`'s twin has one. Given that it _deliberately_ diverges from a bit-for-bit inverse (it keeps ADR-162's level term), a block asserting "the level term is still in `is_active_nanny`'s source, `nanny_visible` is gone, `decided_by` is gone" is precisely what would stop a partial re-apply going unnoticed.                                                                                                                                                                                                                                                                                                                                                                                            | `supabase/rollbacks/0023_verification-decision-sync.rollback.sql`                                  | `2c`                         |

Folded rather than listed, because each is a second instance of a shape already above and all were hand-checked: a failed `syncLevel` dropped without a word in `process-sections.ts:112` while `decide.ts:89` treats the identical call as fatal; `getProvider`'s refusal unlogged at three call sites where every sibling branch logs; the evidence reveal's `vetting.evidence-viewed` emit best-effort for Article 9 data while the _decision_'s attribution was given a durable column for exactly that reason; six `comms` failures in `send-verification-outcome.ts` at `warn` with no `alert:`, including all three arms of the barred path, while `ALERT_EMAIL_SEND_FAILED` has **zero** production call sites anywhere in the repo; four unbounded service-scope full-table reads (`admin-overview`'s whole `vetting_submissions` on every queue page load, a second one in `listQueue` on the same load, `readAll`'s `verifications × nannies` every five minutes, `db-comms-store`'s whole history per notification kind); REVIEW-3's M-8 `RejectReason` mint from unconstrained `jsonb` unchanged; and two memory-double divergences from the real store (the suspension filter in `listRemindable`, and `decide`'s double sync making `released` always 0 in production and non-zero in the double).

---

## 5. LOW

| #   | Finding                                                                                                                                                                                                                                                                                                                                          | File                                                  | Owner |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ----- |
| L-1 | The signed evidence URL carries the nanny's `auth.users` id in its path — the same identifier `0023:681-692` went to some trouble to strip out of `nanny_public`. Admin-only audience, so LOW; the same fix applies (an opaque key, the prefix rebuilt server-side).                                                                             | `evidence-object-path.ts:22` · `open-evidence.ts:104` | `2b`  |
| L-2 | `nanny_is_visible(uuid)` is granted to `anon` and has no caller anywhere in the tree — an anon-reachable `SECURITY DEFINER` over a `FORCE RLS` table with no consumer. Thin information, but the grant should be `authenticated, service_role` until something needs it.                                                                         | `0023_verification-decision-sync.sql:613-630`         | `2c`  |
| L-3 | `EVIDENCE_OF` maps each section to **one** evidence type, but right-to-work has three. A nanny who submitted a passport or a share code has `vetting.expiry-approaching` / `vetting.expired` emitted naming `right-to-work-document` — the audit log records evidence that was never submitted. The true type is on the row.                     | `src/modules/verification/lib/sweep-expiry.ts:18-22`  | `2c`  |
| L-4 | `0024` is the only migration in the tree with explicit `begin;`/`commit;` (`0000`–`0023` let the runner wrap them). Harmless as written, and it is what forced this sweep's twin test to strip two lines — but it breaks atomicity the day migrations are batched.                                                                               | `0024_connection-hold-write.sql:32, 228`              | `2d`  |
| L-5 | `nanny_public` gets `grant select` with no preceding `revoke all`, so `anon` keeps the schema-wide `arwdm` from `0000`. Not exploitable — the view joins two tables and is not auto-updatable — but it becomes so the day anyone simplifies it to one `FROM` entry, and `security_invoker = off` then means anon writes with the owner's rights. | `0023_verification-decision-sync.sql:697`             | `2c`  |
| L-6 | A failed `rollback` in the seed is swallowed (`.catch(() => undefined)`), so `run.mts:9-10`'s promise that "a refusal or a failure leaves the database exactly as it found it" can be false while the operator sees only the original error.                                                                                                     | `supabase/seed/run.mts:60`                            | `2f`  |
| L-7 | `expiresAt` on the admin decision is validated only as a datetime and flows to `dbs_expires_at` / `identity_document_expiry`, so an admin can set an expiry decades out and remove a section from the expiry sweep for ever. Within admin authority; bound it to a config maximum.                                                               | `admin-verification/lib/parse-decision-form.ts:24`    | `2c`  |
| L-8 | The seed's synthetic-mobile allocation wraps into the admin block at index ≥ 800 (`line = (space.block + index) % 1000`). Unreachable at the current plan size (~48 people) and every number stays inside the Ofcom drama range, so this is a note rather than a defect.                                                                         | `supabase/seed/lib/synthetic-person.ts:81`            | `2f`  |

---

## 6. The six checks the brief asked for

### 6.1 ADR-162's one predicate — **HOLDS, measured on every road**

REVIEW-3's C-1 was that `is_active_nanny()` carried no level term. `0023` replaced it with `nanny_visible(is_isolated, verification_level)`, read by the function, the view and the index alike. The brief asked for this to be proved empirically on a stack built from `0000`–`0024` from empty, across **every** road rather than the two REVIEW-3 measured. `supabase db reset --no-seed` applied the whole ordered set clean in **27 s** — which is itself the first measurement, since nothing checked that before P2-HARDEN.

I enumerated the seven RLS policies keyed on `is_active_nanny()` from the live catalogue (`nanny_positions` ×2, `position_children` ×2, `position_schedule` ×2, `parents`) and drove seven nanny states through all of them as real `authenticated` sessions with real JWT claims:

| nanny state                         | `nanny_positions` | `position_children` (`needs_details`) | `position_schedule` | `parents` | `is_active_nanny()` | in `nanny_public` |
| ----------------------------------- | ----------------- | ------------------------------------- | ------------------- | --------- | ------------------- | ----------------- |
| L0, applied (the `/apply` account)  | 0                 | 0                                     | 0                   | 0         | **false**           | absent            |
| L1 registered                       | 0                 | 0                                     | 0                   | 0         | **false**           | absent            |
| L2 id-verified                      | 0                 | 0                                     | 0                   | 0         | **false**           | absent            |
| **L3 in the pool**                  | 1                 | 1                                     | 1                   | 0         | true                | present           |
| **L4 fully verified**               | 1                 | 1                                     | 1                   | 0         | true                | present           |
| L3 **suspended** (the barred shape) | 0                 | 0                                     | 0                   | 0         | **false**           | absent            |
| L4 **isolated** (the invited nanny) | 0                 | 0                                     | 0                   | 0         | **false**           | absent            |

The Art 9 read REVIEW-3 measured is shut, and it is shut on the two roads nobody had measured (`position_schedule`, `parents`) and in the two states nobody had tested (suspended, isolated). The inbound and outbound halves now agree, which is the whole of what ADR-147 claimed and ADR-162 made true. REVIEW-3's two pins flipped to passing `it(...)` by behaviour, and the flip is legitimate.

**And it survives a rollback** — see H-3: after applying `0023`'s twin, every row of that table is unchanged.

### 6.2 `2d`'s CRITICAL fix — **complete on the read side; one third road found on the write side**

The two parent-facing consumption points are genuinely covered (`load-parent-connections.ts:22`, `create-positions.ts:59`), the machinery path is correctly **not** filtered (`create-positions-slice.ts:393` — P-7's close cascade and K-1's cap and duplicate checks must still see held rows), and `namesFor` skips the `nanny_public` lookup for a held row entirely, which is real defence in depth. I looked for a third road along each axis the brief named:

- **comms / email templates** — **found: H-2.** Six parent-addressed templates, none gated on the hold, on the main line.
- **inbox messages** — clean. Every `createInboxMessage` call site is in the legacy Sydney tree (`src/lib/actions/**`), not the London module tree.
- **event payloads** — clean. The K-row emits carry stage and ids, not parent-facing copy.
- **exports** — none exist.
- **admin acting on behalf as a parent** — the admin call queue reads through `admin-verification.nannyNameOf` at admin scope, not through a parent read (ADR-166's split, and it is the right shape).
- **an API route or a server-rendered page** — one **inert** road worth recording rather than filing: `/parent/browse/[id]/page.tsx` is legacy Sydney, reads `connection_requests` at service scope filtered only by `parent_id` with no hold filter, and renders counts to the parent. It queries a `status` column and a `connection_stage` that do not exist in the London schema, so the query errors into a bare `catch {}` and the values stay at their defaults. Dead today; armed the day the schemas converge. Worth deleting rather than leaving.
- **a documented disclosure oracle, accepted rather than a defect** — `connection-preconditions.ts:114-119` counts held rows toward `PENDING_CAP_REACHED` and refuses a duplicate against one. A parent whose screen shows zero can be told "limit reached". `visible-to-parent.ts:11-13` reasons about exactly this and accepts it, because the alternative makes a held row un-closeable and lets a parent exceed her cap. Correct call; recorded so it is on the register rather than only in a comment.

### 6.3 ADR-165 in practice — **one twin exemplary, one partial, two silent, and no test anywhere**

| migration | carries a security clause?                                   | twin keeps it forward-only?                                                                         | says so?                    |
| --------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | --------------------------- |
| `0021`    | yes (definer grants, `search_path`)                          | **n/a — the twin only `drop`s its four functions**, which is strictly narrowing; no hole to restore | no (nothing owed)           |
| `0022`    | yes (five definers, the biometric gate)                      | **n/a — same, it only `drop`s**                                                                     | no (nothing owed)           |
| `0023`    | yes (**ADR-162's level term, ADR-163's grant**)              | **arm (1) yes — measured**; **arm (2) no** — it restores the `authenticated` grant (M-3)            | **yes, both, at length**    |
| `0024`    | **no** — no grant, no policy, no predicate, no `search_path` | n/a                                                                                                 | **yes, and argues why not** |

`0024`'s twin is the model: it states ADR-165, argues in five lines why `0024` carries no security clause and therefore owes no `RAISE EXCEPTION` gate, and is right. `0023`'s twin is half the model — it names both regressions loudly, refuses the one that matters, and then accepts the other with a prose instruction where ADR-165 (2) asks for a refusal. `0021`'s and `0022`'s twins say nothing, and owe nothing: a twin that only drops functions cannot restore a hole.

**The test half of ADR-165 (3) existed nowhere** — that is H-3, and it is now one file, with the `0023` case proved in both directions.

### 6.4 The new gates are honest — **yes, with three qualifications**

All four P2-HARDEN gates run green and I exercised each rather than reading it.

- **`check:action-limits`** — 21 of 46 server actions consume a policy, 25 recorded. The gate **works**: I removed an unlisted action's limiter (`hold-slot-action.ts`) and it failed with the right message, and `code-only.mjs` correctly refuses a commented-out call. Its blind spot is M-5: I deleted `decide.ts`'s `consumeAdminRouteLimit` and the gate **stayed green**, because the action is allow-listed and the reason's named delegate is never checked. I sampled the 25 reasons against the tree: the three `admin-verification` delegations are true (`decide.ts:45`, `open-evidence.ts:82`, `record-update-service-check.ts:25` all consume, all **before the first read**), the three `verification` submit delegations are true, the five admin call-queue reasons are freshly written and accurate, and **`nannyApplications` is still false** (M-1). `adminRoutes` left the policy allow-list this cycle with real consumers — the gate did its job.
- **`check:limiter-call-sites`** — 16 of 22 policies consumed, 6 recorded, up from 14 of 21 with 7.
- **`max-lines-per-function`** — **growing: 106 → 109** (M-6). One removed by being split when touched, four added as "pre-gate". And unlike both limiter allow-files it has no staleness check.
- **The `integration` job** — the real find is M-4: it is now a required check (confirmed against branch protection) that a fork PR passes by **skipping**. Everything else about it is right: `supabase db reset` applies `0000`–`0024` from empty (measured, 27 s, clean), and `[db.seed] enabled = false` means `2f`'s seed cannot load itself into that reset — which is the dangling default `2f` was opened to close. One cosmetic drift: the header block says `0000..0023`, the step says `0000..0024`.

### 6.5 Pins — **10 on this branch; 9 honest, 1 with an expired reason**

Seven at the baseline (`grep -c 'it.fails('` across `src`, `supabase`, `tests`; the ~49 figure in the brief counts textual mentions in prose, of which there are 58 repo-wide). Each re-verified mechanically, not read:

| #   | File:line                                    | Pins                                                           | Verdict                                                                                                                                                              |
| --- | -------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `verification-crons.route.test.ts:80`        | `08.20`'s delayed delivery, owner Phase 4a                     | **Honest.** `unconfigured-template-renderer.ts` exists and every send answers `renderer-not-configured`. No renderer.                                                |
| 2   | `payments.jobs.test.ts:266`                  | AC-A-41: one open `admin_notifications.payment_due` per family | **Reason EXPIRED — see below.**                                                                                                                                      |
| 3   | `payments.screens.test.ts:118`               | 03 §5.2 S-P-12 cancels in-app                                  | **Honest.** `PurchasePath` still has no `cancel`; `types.ts:211` still carries the sentence as a comment over a method nobody added.                                 |
| 4   | `child-linking.pins.test.ts:162`             | the access window moves inside `connect_child_invite`          | **Honest, and measured this time:** `select p.prosrc ~ 'set_access_window'` on the live catalogue is **false** for `connect_child_invite` and true for its siblings. |
| 5   | `connections.inside.test.ts:363`             | S-P-01 trigger (c) names the nanny — `2d`'s new pin            | **Honest and well argued.** The mechanism exists on both sides, nothing writes `about_nanny`, and the owner is named (Phase 4, with `call-layer`).                   |
| 6   | `positions.inside.test.ts:229`               | 03 §2.5: all 44 transition rows resolve to a spec              | **Honest.** `position-transitions.ts` declares exactly 7 ids. Unchanged.                                                                                             |
| 7   | `onboarding-nanny.portal-mobile.test.ts:128` | REVIEW-3's H-3 — the connector has no legal value to pass      | **Honest.** `NannyApplicationInput.mobile` is still `E164` at `types.ts:84`, not optional and not nullable.                                                          |

**Pin 2's stated owner has landed, which is what the brief asked me to flag.** Its comment reads _"No module owns `admin_notifications` (01 §2.3 names no writer, and `payments` may not reach past `comms`), so the row is not written … clears when `admin_notifications` gets a connector."_ ADR-160 gave it exactly that connector in this range: `comms.notifyAdmin()` exists on the port, has three live callers, `payment_due` is a member of the `admin_notification_kind` enum, ADR-160 names it in writing (_"`payment_due` stays payments' to call"_), and `payments` already imports `Comms` in four files. Every clause of the pin's reason is now false. The pin is still red, but only because nobody made the call — which is a different statement, and the one it should be making. This is REVIEW-2 §6.2's own failure mode recurring and it belongs to `payments`.

**This sweep adds three pins** (C-2, C-3, H-2), each verified red on the shipped tree, and the ADR-165 (2) pin, verified red **and** green under the fix it names (I revoked the grant inside the test's transaction and watched it flip). Ten in total.

### 6.6 The seed cannot reach production — **HOLDS, all three refusals driven**

Not read, not trusted from `2f`'s report — run, four ways:

| refusal                                        | how it was driven                                                                  | result                                                                                                      |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `PRODUCTION_ENVIRONMENT`                       | `VERCEL_ENV=production NODE_ENV=production npm run seed:dev`                       | refused, **exit 1**, nothing written                                                                        |
| `REMOTE_TARGET_NOT_ALLOWED`                    | `SUPABASE_DB_URL=…@db.abcdefghijklmnop.supabase.co…`                               | refused, **exit 1**, nothing written                                                                        |
| `REAL_PERSON_PRESENT` + `REAL_ACCOUNT_PRESENT` | a real `@gmail.com` profile with `is_test_user = false` planted on the local stack | refused, **exit 1**, `count(nannies) = 0` afterwards — the gate fires **before** `begin` and writes nothing |
| `ALREADY_SEEDED`                               | the happy path run twice                                                           | second run refused: _"36 seeded account(s) are already here"_                                               |

The happy path itself is sound: one transaction, 5 real London areas, 25 pool nannies, 7 state nannies, 1 isolated, 2 positions, 1 held connection — and `[db.seed] enabled = false` with empty `sql_paths` means nothing loads it for you, which is `2f`'s whole point. The two weaknesses are M-7 (the allow-list is a substring match over the whole URL) and M-8 (TLS verification off for every remote target); neither defeats gate 2, and gate 2 is the one a mistyped connection string cannot beat. Worth stating plainly for the record though: **gate 2 is a real-data check, not a production check.** An empty production project passes all three of its questions, and on the machine that actually poses the risk — a laptop with production credentials in the shell — `resolveEnvironment` answers `development`, so gate 1's environment arm does not fire either. The allow-list is genuinely the load-bearing gate, which is why M-7 matters more than its severity suggests.

---

## 7. What this sweep confirmed, and what it withdrew

- **Three of the agents' four HIGHs were demoted on provenance alone**, by `git diff dada284..HEAD` on the exact line. `create-positions.ts:59`'s `rows.ok ? … : []` is pre-existing — `2d` only added the filter inside it. `upload-evidence.ts:73`'s auth collapse is `2b`'s; this range changed only the size cap and added the encoder arm. `load-verification-status.ts:10` is REVIEW-3's own M-6, unchanged. All three are real and all three are recorded — but none is this range's, and a checkpoint that mis-attributes is a checkpoint nobody can act on.
- **And one agent MEDIUM was promoted to a measured CRITICAL.** The `expireHolds` laundering arrived as a MEDIUM from one agent and a HIGH from two others; the DBS marker arrived as a CRITICAL with a `psql` transcript attached, which is why it was believed enough to drive end to end, and driving it is what showed the tick is mandatory and therefore that it is _every_ submission rather than some.
- **Two agents converged independently on C-2**, from opposite ends — the `database-reviewer` from `sync_nanny_verification_state`'s `else null`, the `security-reviewer` from `record_vetting_decision`'s missing replay guard. Neither had driven it. Driving it took four minutes and turned an argument into a table.
- **ADR-159's three claims hold on all three admin write roads.** `auth.requireRole('admin')` re-reads `user_roles` per call and refuses without `aal2`; the audit subject is the submission's nanny from the ledger on every road and is never a form field; `adminRoutes` is consumed **before the first read** on all three (REVIEW-3's own security M-4, closed). `parse-decision-form` and `parse-queue-query` between them accept eight fields, every one enum- or UUID-constrained, and **not one of them can carry an identity, a role, a nanny id or an ownership claim**. The read roads take no limiter, which is M-6-adjacent and recorded.
- **The evidence reveal cannot be steered.** The caller supplies a UUID; the object path comes from `verifications.*_ref` read server-side; `signUrl` re-validates with `isSafeObjectPath` and enforces a per-bucket TTL ceiling before the driver is touched. Section-scoped object filtering and field minimisation are both real.
- **ADR-163 is genuinely closed.** `create_nanny_account` is one overload, `service_role`-only, takes `p_user_id`, and contains no `auth.uid()` — read from the live catalogue, not the file.
- **Every function `0023` and `0024` create or re-create carries `search_path=""` in the live catalogue**, every reference is schema-qualified, there is **no dynamic SQL** in either file, and both `jsonb` bags are followed by explicit column lists. The L4 held-row release is correctly indexed (`Index Scan using connection_requests_nanny_stage_idx`, confirmed by `EXPLAIN`) and takes its lock last.
- **`nanny_visible()`'s `IMMUTABLE` marking is mathematically sound**, so the partial index carrying it is valid today. The hazard is the comment that says "regenerated with the config": `create or replace` on an indexed function does not rebuild the index. `0023` gets the order right; the next migration is the one to watch.
- **The upload road is the best-argued code in this range**, and REVIEW-3's H-1 fix survived contact: the cap is measured on bytes before and after re-encode, the MIME is sniffed not declared, the path is 100 % server-derived, the scanner fails closed, and the encoder outage is split from a bad file. `uploads.ts:26-33` states the remaining two-file aggregate residual rather than hiding it, which is the right handling of a known gap.
- **One withdrawal of my own, on measurement.** My first `check:boot-guard` run reported 2 failures. It was my own environment: I had sourced `smoke_env production` into the shell before calling a script that sources it itself. Re-run clean, **8/8**. Recorded because a sweep that reports its own harness errors as findings is worse than one that reports nothing.

---

## 8. Wants a ruling (no ADRs from this sweep)

| #   | Question                                                                                                                                                                                                                                                                                                                                                                                                                              | Raised by |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| R-1 | **Does the `dbs` allow-list keep `dbs_update_service_consent_at` at all?** C-1's fix makes the marker a value the column accepts, which is minimal and correct. The stronger shape is to drop the key from `0022`'s `dbs` array entirely — `0023` reads its presence in the **raw** `p_columns`, before the filter, so presence still works and no client value ever reaches the column. That is a migration and so not this sweep's. | C-1       |
| R-2 | **Does `0023`'s twin get ADR-165 (2)'s `RAISE EXCEPTION`, or does the accepted-and-documented arm amend ADR-165?** The twin makes an honest, well-argued case for accepting the regrant. ADR-165 (2), ratified from this unit's own finding, says that case is exactly the one a twin must refuse instead. One of the two has to give.                                                                                                | M-3       |
| R-3 | **Which guard closes C-2 — a terminal-status refusal on an already-decided submission, or "only an `adverse` decision may move `dbs_outcome` off `barred`"?** Both work; they have different consequences for a genuine mistake an admin needs to correct. Safeguarding, so it wants a decision rather than an implementer's preference.                                                                                              | C-2       |
| R-4 | **Which id space does `VettingLedgerEntry.nannyId` carry?** A join in `entryOf` (the ledger speaks user ids, one extra read per entry) or a distinct `NannyPartyId` brand with the conversion explicit at the module seam (the type system catches the next one). 03 §4.2's connector shape is the place it is decided.                                                                                                               | C-3       |
| R-5 | **Which of `MESSAGES_OF`'s six parent-addressed templates does a hold silence, and may a held row reach K-20 at all?** K-5 is unambiguous under R-14. `placement-confirmed-parent` and `hire-confirmation-family` are the hire itself, and swallowing those would be a worse failure than the one being fixed.                                                                                                                        | H-2       |
| R-6 | **How does a required check that a fork PR skips get made honest?** A skipped job counts as a pass. Options: drop the `if` and accept fork runners, keep the `if` but add an always-running job that fails on a fork PR, or make `integration` non-required and gate on a different artefact. The repo is public, so this is not hypothetical.                                                                                        | M-4       |
| R-7 | **Should a "consumed one boundary in, in `<file>`" reason be machine-checkable?** Six of the 25 recorded actions name a file and a helper; a structured field (`{ "delegatesTo": "verification/lib/decide.ts", "helper": "consumeAdminRouteLimit" }`) would let the gate assert what the prose claims. Proved necessary: the gate stayed green with the call deleted.                                                                 | M-5       |
| R-8 | **Does `eslint.long-functions.json` get the staleness check both limiter allow-files have, and a direction?** It grew 106 → 109 in one cycle. Both sibling gates fail on a stale entry; this one silently keeps a dead path for ever, and nothing says the list may only shrink except a comment.                                                                                                                                     | M-6       |

---

## 9. Gates measured at this branch's head

Local exit codes, in this sweep's own worktree, against a stack built from `0000`–`0024` from empty.

| Gate                               | Result                                                               |
| ---------------------------------- | -------------------------------------------------------------------- |
| `typecheck`                        | **0**                                                                |
| `lint`                             | **0** — one pre-existing warning (`scheduling-booking-writes.ts:28`) |
| `prettier --check .`               | **0**                                                                |
| `vitest run` (`--project unit`)    | **0** — 296 files, **4,453 passed \| 8 expected fail**               |
| `vitest run --project integration` | **0** — 18 files, **384 passed \| 3 expected fail**                  |
| `lint:boundaries`                  | **0**                                                                |
| `check:allowed-imports`            | **0** — 26 rows match 01 §2.3                                        |
| `check:limiter-call-sites`         | **0** — 16 of 22 policies consumed, 6 recorded                       |
| `check:action-limits`              | **0** — 21 of 46 actions limited, 25 recorded                        |
| `check:config-literals`            | **0** — 1,140 files, 0 hits                                          |
| `check:env-reads`                  | **0** — 1,145 files                                                  |
| `check:claude-md` · `check:pins`   | **0** · **0**                                                        |
| `env:check` · `crons:check`        | **0** (51 names) · **0** (23 crons)                                  |
| `check:audit`                      | **0** — 16 allow-listed until expiry                                 |
| `check:boot-guard`                 | **0** — **8/8**, under `smoke_env` (see §7's withdrawal)             |
| `npm run build`                    | **0** — under `smoke_env production`                                 |
| `supabase db reset --no-seed`      | **0** — `0000`–`0024` applied forward from empty in 27 s             |

Baseline at `6551ddc` before any change: unit **295 files, 4,211 → 4,448 passed | 7 expected fail**; integration **15 files, 376 passed | 0 expected fail**. This branch adds 1 unit file, 3 integration files, 8 passing cases, 4 pins, and no red.

**CI on PR #47: all seven required checks pass** — `typecheck` · `lint` · `gitleaks` · `allowed-imports` · `types-drift` · `limiter-call-sites` · **`integration`** (3 m 25 s, the three new integration files run against a stack CI built from empty).

The three red jobs are `main`'s own, and this was measured rather than assumed. `banned-literals` fails on the legacy Sydney `subscription` / `suburb` literals under `src/app/parent/**` (ADR-124). `build` fails at its **size-limit** step, which the workflow itself labels _"red until the Phase-1-exit baseline lands a `.size-limit` config"_. `test` is not a required check and fails at five steps — and the failing-step list on `main`'s own run at `6551ddc` is **identical, step for step**:

```
unit + coverage (05 §9 stage 3)
changed-line coverage ≥ 80 % (05 §9 stage 3; 07 §10.2)
contract suites — red until S2 adds the `contract` vitest project
e2e — E1 shell smoke — green
e2e — legacy Sydney journeys — red until F-d / Phase 1 rewrites them
```

Not this branch's, and not this sweep's.

---

## 10. What this sweep changed

- **Amended (source) —** `src/boot/db-vetting-store.ts` (C-1: the consent marker is a value the column can hold) · `src/app/api/cron/send-delayed-emails/route.ts` (H-1: the fourth sweep fails the run like its siblings) · `src/modules/call-layer/lib/send-nanny-call-messages.ts` (M-2: the operator's row survives a missing admin address).
- **New tests —** `supabase/__tests__/dbs-consent-marker.test.ts` (3 — C-1 held from both sides) · `supabase/__tests__/rollback-security-clauses.test.ts` (4, one pinned — H-3, ADR-165 (3)'s first implementation) · `supabase/__tests__/decision-road-integrity.test.ts` (4, two pinned — C-2 and C-3) · `src/modules/connections/__tests__/connections.held-notification.test.ts` (4, one pinned — H-2). Amended: `src/boot/__tests__/db-verification-stores.test.ts` (the marker assertion, RED first) · `src/app/api/_lib/__tests__/verification-crons.route.test.ts` (+1) · `src/modules/call-layer/__tests__/call-layer.nanny-commission.test.ts` (+1).
- **Nothing else.** No migration, no contract, no ADR. `0023`, `0024` and both twins were read, driven and left alone; C-2, C-3, M-3 and M-10…M-16 are recorded **for their owners**. No change to `2f`'s seed beyond recording M-7 and M-8.

<!-- audit
Last edited: 2026-09-19T12:40+10:00 — BB-LDN-Planner-070926/REVIEW-4
Notes: created — the ADR-123 checkpoint sweep's finding register for Phase 2's second five units
(dada284..6551ddc, 202 files: 2c PR #43, P2-HARDEN #44, 2d #45, 2f #46, REVIEW-3's merge #42).
3 CRITICAL (1 fixed in-unit test-first, 2 pinned — one a migration, one a contract, both owned by 2c);
4 HIGH (2 fixed, 1 pinned, 1 recorded); 16 MEDIUM (1 fixed, 1 pinned, 14 recorded); 8 LOW. The theme is the
seam between a TypeScript adapter and a Postgres column, from three sides at once: a boolean marker cast into a
timestamptz column stops EVERY DBS submission and therefore the whole road to L3 (driven end to end, not read);
a nannies.id labelled UserId empties every read-back, event and outcome email on 2c's admin decision road; and
record_vetting_decision has no already-decided guard, so an adverse DBS bar comes off with one more click on the
same row (measured suspended t -> f). The happier half: every big claim this phase makes survives being driven —
ADR-162's one predicate holds across all seven policies and seven nanny states including the two roads and two
states nobody had measured; the seed's three refusals all fire, exit 1 and write nothing; the 0023 twin really
does keep REVIEW-3's hole shut through a rollback. Three of the agents' four HIGHs were demoted on provenance
(the lines predate this range) and one MEDIUM promoted to a measured CRITICAL; one of my own boot-guard
"failures" was withdrawn as my own harness error. ADR-165 (3) had no implementation anywhere in the tree and now
has one. Eight rulings wanted, no ADRs written; the load-bearing ones (R-3, R-4) belong with 2c.
-->
