# Review sweep — 2026-09-18 — Phase 2's first four units (`17ea66a..dada284`)

> **What this is.** The **ADR-123 checkpoint** over everything that merged to `main` since REVIEW-2 closed Phase 1: **`2a`** (PR #38 — nanny entry, the `/apply` funnel, registration, invited-nanny isolation, apply-from-portal, `0021`), **S5e** (#39 — `0020`: `apply_payment_event`'s `ignored` outcome, `parent_leads.email`, the clear-slot subject check), **`2b`** (#40 — the verification wizard S-N-03…S-N-10 behind `vetting-providers`, `0022`, ADR-155's storage writer) and **`2g`** (#41 — S-N-01 add-family-child + mint, S-N-02's commission explainer and book-a-call). 300 files, +19,709 / −7,504.
>
> **Run by** `BB-LDN-Planner-070926/REVIEW-3` on `review-180926-3`, off `origin/main` `dada284`, in its own worktree. Battery: `code-reviewer` + `typescript-reviewer` + `silent-failure-hunter` in one parallel batch over the diff; then `security-reviewer` over every new server action, route, store and boot wiring; then `database-reviewer` **read-only** over `0020` / `0021` / `0022`. **Every finding below was re-verified by hand before it was acted on or recorded** — and this time that was load-bearing in both directions: it killed one of my own HIGHs (§7) and it corrected the stated mechanism of an agent's HIGH into a different and worse defect (H-3).
>
> **What was different about this sweep.** REVIEW-2 could reason only from source. This one had **the applied migration set on a live local stack**, so the headline finding is not an argument about SQL — it is a measured read of another family's data, and the fix that closes it was applied to the database and watched to turn the pin green before being reverted. The integration project — eleven suites at the baseline, twelve with this sweep's — ran against `0000..0022` at every step.

---

## 1. Counts

| Severity | Found | Fixed in this sweep | Pinned (`it.fails`) | Recorded for another unit |
| -------- | ----- | ------------------- | ------------------- | ------------------------- |
| CRITICAL | 1     | 0                   | 1                   | 1 (same finding)          |
| HIGH     | 3     | 2                   | 1                   | 0                         |
| MEDIUM   | 11    | 0                   | 0                   | 11                        |
| LOW      | 5     | 0                   | 0                   | 5                         |

**Bottom line.** Phase 1's theme was _controls declared and never called_. Phase 2's is narrower and sharper: **a control asserted in a migration header and an ADR, in a sentence naming the three reads it holds for, where it holds for two of them.** ADR-147 is a good ruling and its reasoning is right; it just rests on a conjunction that `is_active_nanny()` does not carry. Because `2a` is also the unit that built the first road in the London tree to `is_isolated = false`, the gap stopped being free the moment `2a` merged — and anyone who finishes the public `/apply` funnel now reads every open position and every child's care-needs text on it, at verification level 0.

The second theme is more encouraging and worth saying plainly. **Where these units could be checked against behaviour, they were, and they hold.** `int.rpc-0021` and `int.rpc-0022` drive the definers as real sessions; `int.storage-rls` drives the bucket policies per role; the static column allow-lists are genuinely static; the biometric-consent gate is genuinely scoped to the caller and genuinely doubled in SQL. The defects this sweep found are almost all in the **seam between a mock and a column** — the place a unit suite cannot see and this sweep could.

---

## 2. CRITICAL

### C-1 — **PINNED + RECORDED** — ADR-147's conjunction is false of `is_active_nanny()`, so an applied, unverified nanny reads every family's open position and every child's care needs

|              |                                                                                                                                                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity** | CRITICAL (latent — nothing is deployed and the database is empty; the same qualifier REVIEW-2's C-1 carried)                                                                                                                                                                   |
| **Files**    | `supabase/migrations/0005_marketplace-parties.sql:153-164` · `0021_nanny-onboarding.sql:29-34` (the claim) · `src/modules/onboarding-nanny/actions/sign-up-nanny-action.ts:123` (the road) · seven policies: `0006_positions.sql:240,261,285` · `0016_rls.sql:211,235,247,259` |
| **Owner**    | 02 §4.2 / 03 §2.6 I-5, with `2c` — **a migration, so not this sweep's to write.** Pinned in `supabase/__tests__/rls-isolation-conjunction.test.ts`                                                                                                                             |

ADR-147 is the ruling that makes `nannies.is_isolated` "the record of not having applied" rather than a visibility switch, and it rests the safety of that on one stated conjunction. `0021`'s own header states it verbatim:

> "Pool visibility is the conjunction `NOT is_isolated AND verification_level >= config` in every read (`nannies_matching_idx`, `is_active_nanny()`, `nanny_public`), so a Path-A nanny at level 0 and an invited nanny who has applied at level 0 are equally invisible; the flag records _having applied_."

It is true of two of the three reads it names. `nanny_public` (`0016:59-66`) carries `not n.is_isolated` **and** `verification_level in ('L3_PROVISIONALLY_VERIFIED','L4_FULLY_VERIFIED')`. `nannies_matching_idx` (`0005:78`) is a partial index on `profile_visible and not is_isolated` **keyed by** `verification_level`, so every query that uses it supplies the level. **`is_active_nanny()` carries no level term at all:**

```sql
select exists (
  select 1 from public.nannies n
  where n.user_id = auth.uid() and not n.is_isolated and n.suspended_at is null
);
```

That is the **inbound** half of the marketplace — what a nanny may read — and seven RLS policies key on it. `0016:230`'s own comment names the stake: `position_children.needs_details` is "potentially Art 9 child health data".

**Why it was free before `2a` and is not now.** Nothing in the London tree ever wrote `is_isolated = false`; `lift_nanny_isolation()` arrives in `0021` too. ADR-147 consequence (1) makes `/apply` create the account with the flag clear **explicitly** — `sign-up-nanny-action.ts:123`, `isolated: path !== "apply"` — and `nannies.verification_level` defaults `L0_SIGNED_UP` (`0005:50`). So the funnel now mints exactly the account the missing term fails to exclude.

**Measured, not argued.** Against the applied migration set (`0000..0022`) on the local stack, a session in precisely the state `/apply` creates — `is_isolated = false`, `verification_level = 'L0_SIGNED_UP'`, `profile_visible = false` — reads:

| surface                   | what she gets                                                 |
| ------------------------- | ------------------------------------------------------------- |
| `nanny_positions`         | `Parent A position`, district `SW4` — the whole open board    |
| `position_children`       | `age_months 18`, `needs_details 'private care needs'`         |
| `position_schedule`       | the family's requested hours                                  |
| `nanny_public` (outbound) | **correctly absent** — the half the conjunction does hold for |

No document, no identity check, no admin, no invite. The asymmetry is the whole finding: she is invisible to families and families are visible to her.

**A second road to the same place, and why it is not the fix.** The `database-reviewer` reached the same consequence from the other end: `create_nanny_account(p_isolated boolean)` (`0021:40-49,115,142`) takes the flag as a **raw argument** and is `grant execute … to authenticated`, so any signed-in caller with no `nannies` row — which is every invited nanny between Supabase `signUp` and the app's RPC — can call it directly with `p_isolated => false` and skip S-N-19 entirely. Verified by hand: the argument goes straight into the `INSERT`, and the function is idempotent (`on conflict (user_id) do nothing`, `0021:121-127`), so it bites **only** at creation and cannot be replayed against an existing row. Real, and worth closing.

But its suggested fix — "default `true` unconditionally at creation" — **does not close this finding and contradicts ADR-147**, which requires `/apply` to create `false`. The load-bearing fix is the level term:

```sql
and n.verification_level in ('L3_PROVISIONALLY_VERIFIED', 'L4_FULLY_VERIFIED')
```

regenerated from `MATCHING.minVerificationLevel` the way `0016`'s view is. **Applied to the live database and measured: both pins turn green, the board closes, `is_active_nanny()` answers `false`.** Then reverted, and the pins are red again.

**Why pinned rather than fixed.** Two reasons, and only the second is about scope. (1) `0005`'s own comment ties `is_active_nanny()` to "I-5 / AC-N-22..26 — a nanny who may see the marketplace **at all**", which is a _different question_ from pool visibility; the level at which the jobs board opens to a nanny is 04 §4.2 b5's and `2c`'s (level derivation), and this sweep may not touch `2c`'s areas. (2) It is a migration, and migrations are merged by the time a checkpoint runs. So: three cases in `supabase/__tests__/rls-isolation-conjunction.test.ts`, one passing (the state is exactly `/apply`'s, and the outbound half is clean) and two `it.fails` — the exposure itself, and the header's own claim about `is_active_nanny()`. **Wants a ruling: R-1 and R-2 in §8.**

---

## 3. HIGH

### H-1 — **FIXED** — the image re-encoder's outage was indistinguishable from a bad photo, and silent

`src/modules/verification/lib/re-encode-image.ts:25-27` · `lib/upload-evidence.ts:45` · **Owner: REVIEW-3 (fixed); originally `2b`**

One `catch { return null }` wrapped the whole `sharp` road — the dynamic `import()`, the decode, the rotate, the resize, the encode — while the header argued only the decode case ("a file `sharp` cannot decode … is `null` — refused as unreadable"). Every other failure folded into the same `null`, and `prepare()` turns `null` into **"We couldn't read that image. Try another photo."**

So a runtime where `sharp` will not load refuses **every image in the whole wizard** — identity document, selfie, DBS certificate, right-to-work document — with a sentence blaming the nanny's camera, **no log line, no alert, and no way for anyone on call to tell it from one corrupt upload.** That is REVIEW-2's H-8 shape exactly, on the one road every nanny must pass to reach level 1. It is not a hypothetical runtime: `sharp` is native, it is carried by `serverComponentsExternalPackages` (`next.config.mjs:10`) and imported past the bundler with `webpackIgnore` on purpose — which is the arrangement where a missing platform binary shows up at call time rather than at build time.

**Fix.** The two causes are separated, and only the second is new behaviour. An unreadable file is still `null` and still "try another photo" — plus a `warn`, because a _flood_ of these is our problem and the one sentence she sees cannot tell one from a thousand. A loader failure is `"encoder-unavailable"`, logged `error` with `ALERT_PROVIDER_DOWN`, and `prepare()` maps it onto the **same** `PROVIDER_ERROR` / `storage_failure` arm the scanner's `unavailable` verdict already takes eight lines below — an outage is an outage whichever provider is down. No new vocabulary and no new user state. Three cases in `verification.encoder-outage.test.ts`, two RED first against the shipped file.

### H-2 — **FIXED** — a lead store that is down looks exactly like a nanny who never applied

`src/modules/onboarding-nanny/lib/read-lead-cookie.ts:24` · **Owner: REVIEW-3 (fixed); originally `2a`**

`if (!lead.ok || lead.value === null) return NO_LEAD;` — a refused read and an absent row shared the sentence **and the silence**. The header argues the caller-facing half correctly and deliberately ("every miss is the one `no-lead` refusal … and nothing about which miss it was reaches the form"); that rule is right and this change does not touch it. What it never argued is the operator-facing half.

`readLeadCookie` gates all three steps after the application is captured — `saveNannyPortfolioAction` (N3), `saveNannyBioAction` (N4) and `signUpNannyAction` (S-X-18, where the lead becomes the account). A transient `nanny_leads` outage therefore tells **every nanny in flight** "Let's start your application again — we couldn't find the one you began", drops her to N1 and orphans the row she had already filled in, while the only trace of an outage at the top of the entire nanny acquisition funnel is a drop-off curve indistinguishable from people changing their minds.

**Fix.** The refusal alerts (`ALERT_PROVIDER_DOWN`), an absent row stays quiet, and the caller is told the same thing either way — all three pinned, one RED first. The lead id never reaches the line: it is a bearer (ADR-150), so only the fact of the failure is logged. Same shape as this module's own limiter helpers, which already separate "refused" from "could not answer".

### H-3 — **PINNED** — the one road that lifts isolation is closed to the population it exists for

`src/modules/onboarding-nanny/actions/apply-from-portal-action.ts:51` · `types.ts:84` · `supabase/migrations/0014_leads.sql:54-55` · **Owner: 03's `NannyLeadStore` row + `2a`**

**The `typescript-reviewer` found this line and got the consequence wrong, which is why the hand check matters.** Its report says `"" as never` writes a fake E.164 into `nanny_leads.phone`. It does not. `0014:54-55` carries

```sql
constraint nanny_leads_phone_e164_gb_check
  check (phone is null or phone ~ '^\+44[1-9][0-9]{8,9}$')
```

and against the applied migration set, measured: `null` inserts, `'+447700900123'` inserts, `''` is **refused, 23514 `nanny_leads_phone_e164_gb_check`**. The data is safe. The journey is not.

`NannyProfile.mobile` comes from `NannyContactPatch`, a `Partial<>`, so it is `E164 | undefined`; S-N-19's schema (`nanny-portal-schema.ts:10-16`) _deliberately_ strips `mobile` from the questions because "the account holds it". The account does not always hold it: ADR-152 (1) creates an invited nanny (S-X-07) **with no mobile and no district**, which `int.rpc-0021` asserts in those words — and an invited nanny is exactly who S-N-19 exists for. So `capture` is refused, `apply()` returns `lead-not-captured`, `liftIsolation()` is never reached, and by ADR-147 `lift_nanny_isolation()` is the **one** writer of `is_isolated → false`. **An invited nanny with no mobile can never apply, never leave isolation, and is shown a generic refusal naming nothing she could fix.**

**Why every existing test passes.** `memoryNannyLeadStore` has no CHECK. `onboarding-nanny.isolation.test.ts` creates its nanny with no mobile, runs the whole happy path green, and asserts `email`, `firstName` and `source` — never the phone. The defect lives precisely in the gap between the mock and the column.

**Why pinned rather than fixed.** `NannyApplicationInput.mobile` (`types.ts:84`) is `E164` — not optional, not nullable — so this module has **no legal value to pass**; `"" as never` is the cast that hid that from the compiler. `NannyLead.mobile` is already `E164 | null` (`types.ts:116`) and the column is nullable, so the connector is the odd one out and the fix is one word on it — a contract change, and REVIEW-2's H-10 settled how this sweep treats those. Pinned in `onboarding-nanny.portal-mobile.test.ts` against **what the column will accept**, so it flips on either fix (`E164 | null` on the input, or S-N-19 asking for the mobile when the account has none). Verified both ways: red on the shipped tree, green when the action passes `null`.

---

## 4. MEDIUM

| #    | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | File                                                                                                                                | Owner                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| M-1  | **Three new authenticated write actions have no limiter at all** — `save-verification-contact-action`, `record-biometric-consent-action`, `process-verification-action`. Verified: zero `consume*` calls on any of the three paths, while all three sibling submits take `consumeVerificationSubmitLimit`. Blast radius is the caller's own rows, hence MEDIUM. **The point that outlives it is R-3 (§8):** ADR-140's `check:limiter-call-sites` catches _declared-and-uncalled_, and this is _undeclared-and-unlimited_ — the inverse, and on this evidence the commoner one.                                                             | `src/modules/verification/actions/{save-verification-contact,record-biometric-consent,process-verification}-action.ts`              | `2b`                        |
| M-2  | **`0021`'s verify block is weaker than `0022`'s, and `0022` says why.** `0021:308` asserts `c like 'search_path=%'`; `0022:566-571` asserts `'search_path=""' = any(p.proconfig)` with the comment "the exact value, not a wildcard (database-reviewer H1): `search_path=public` would pass a LIKE". `0021` also omits the overload-count, `BYPASSRLS`-ownership and positive-grant assertions that `0020` and `0022` both carry. All three functions are correctly pinned **today** — so this is a safety net that would not catch a `create or replace` drift, not a live hole.                                                          | `supabase/migrations/0021_nanny-onboarding.sql:294-327`                                                                             | `2a`, in a later migration  |
| M-3  | **The `nannyApplications` allow-list reason is now false.** It excuses the policy with "No Phase 1 surface lets a nanny apply", and `2a` shipped `/apply`. The _substance_ survives — row 12 is a nanny applying to a **position**, which ADR-148 (3) leaves to `2d` — but the sentence a reader checks it against is untrue, and `check:limiter-call-sites` cannot see that (it only detects a stale entry when the constant acquires a code reference). A gate whose allow-file drifts is ADR-142 (2)'s own failure mode in miniature.                                                                                                   | `scripts/ci/limiter-call-sites.allow.json:7`                                                                                        | `2d`, or a one-line reword  |
| M-4  | **Three new functions over the 50-line rule** — `createAccount` 72 (92–163), `apply` 59 (41–99), `uploadEvidence` 58 (56–113). Measured, all new in this diff. Graded MEDIUM to stay consistent with REVIEW-2's M-11 (eleven components, same rule), and that consistency **is** the finding: this is M-11's second appearance in two sweeps, and L1 (one export per file) is enforced by `verification.repo.test.ts` while the function-length rule is enforced by nothing. See R-4.                                                                                                                                                      | `onboarding-nanny/actions/sign-up-nanny-action.ts:92` · `apply-from-portal-action.ts:41` · `verification/lib/upload-evidence.ts:56` | `2a` / `2b`                 |
| M-5  | **`dbs_update_service_consent_at` is a raw client-supplied timestamp.** The `dbs` branch of `verification_submission_columns()` passes it through verbatim, where `guard_consent_record_insert()` / `guard_biometric_consent_insert()` (`0004:249-251,294`) overwrite client-supplied `created_at` for the stated reason: "evidence a data subject can author is not Art 7(1) evidence." She can back- or post-date her own Update Service consent. Not an access grant; an evidentiary one.                                                                                                                                               | `supabase/migrations/0022_verification-wizard.sql:87-88,212-214,268`                                                                | `2c` (the sweep acts on it) |
| M-6  | **A failed auth read on the wizard resumes her at "nothing yet".** `if (!user.ok \|\| user.value === null) return null;` — `getCurrentUserId` distinguishes anonymous (`ok(null)`) from "we could not tell" (`err`), and this collapses them with no log, while the `getStatus` refusal three lines below **is** logged. The inconsistency is inside one 12-line function. (REVIEW-2's M-15 is the same shape in `app/parent/page.tsx`, closed by HARDEN-B.)                                                                                                                                                                               | `src/modules/verification/lib/load-verification-status.ts:10-11`                                                                    | `2b`                        |
| M-7  | **A missing provider binding leaves a section in `processing` for ever, silently.** `if (!provider.ok) continue;` — every sibling branch in the same function logs (`listed.ok` at :36, `checked.ok` at :50 with `ALERT_PROVIDER_DOWN`, and the `applied` branch below). Only `2c`'s stale-`processing` sweep would ever rescue it, and nothing would say why.                                                                                                                                                                                                                                                                             | `src/modules/verification/lib/process-sections.ts:38-39`                                                                            | `2b`                        |
| M-8  | **A `failed` ledger row mints `RejectReason` and `GuidanceKey` out of untyped JSON.** `(row.raw_response?.reject_reason ?? "mismatch") as never` and `(… ?? "") as never` over a `jsonb` column with no runtime check: an arbitrary stored string becomes a member of a closed 5-value union, and an absent `guidance_key` becomes an **empty `GuidanceKey`**, so a rejected nanny's screen has no copy key to render guidance from. Latent today — `apply_vetting_check_result` is `service_role` only and `stub-manual`'s only outcome is `needs-admin`, so no `failed` row can exist until `2c`.                                        | `src/boot/db-vetting-store.ts:74-75`                                                                                                | `2c`                        |
| M-9  | **The 10 MB upload cap has never been exercised against a transport.** `FileField` renders "up to 10 MB" from `UPLOADS.maxBytes`; no e2e covers a verification upload; `next.config.mjs` sets no `experimental.serverActions.bodySizeLimit`, and Next 14.2's default is `"1 MB"` (`node_modules/next/dist/server/app-render/action-handler.js:422,493`). **The 1 MB default does not in fact cap files** — busboy is given `limits: { fieldSize }` only, not `fileSize` (§7) — but the identity step posts _two_ files in one action and no one has measured what the deployed platform accepts. A promise on a screen that nothing tests. | `next.config.mjs` · `src/modules/config/uploads.ts:15` · `verification/components/wizard/FileField.tsx:62`                          | `2b` + B-item, see R-5      |
| M-10 | **The behavioural proof of every SQL-only control runs in a job no required check contains.** `int.rpc-0021`, `int.rpc-0022`, `int.rls`, `int.storage-rls` are the _only_ place the column allow-lists, the consent gate, the isolation writer and the bucket policies are tested against behaviour — and they live in the `test` job, which is not among the required checks (`typecheck lint gitleaks allowed-imports types-drift limiter-call-sites`) and is red for unrelated reasons (`--project contract` does not exist; the legacy Playwright journeys). Excellent tests, no teeth.                                                | `.github/workflows/ci.yml:194-217` · `vitest.config.ts`                                                                             | ADR-109's staging owner     |
| M-11 | **A correlated union is erased with `as never` between a schema and its own patch function.** `nannyProfileStepSchemas[step.id]` widens to a union of ten `{schema, toPatch}` pairs, so `toPatch(parsed.value as never)` forces the call through. Safe today because both halves are built by the same `step()` call; a reordering of the frozen map would type-check and fail only at runtime.                                                                                                                                                                                                                                            | `onboarding-nanny/actions/save-nanny-profile-step-action.ts:47` · `lib/nanny-profile-step-schemas.ts:38-41,156`                     | `2a`                        |

---

## 5. LOW

| #   | Finding                                                                                                                                                                                                                                                                                                                                                         | File                                                         | Owner  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------ |
| L-1 | A booking read's refusal is unlogged while the `slots.ok` read two lines below is — so an already-booked nanny is shown the slot picker again with no trace of why. I-10 (`ALREADY_BOOKED`) stops the double booking, so the cost is a confusing dead end.                                                                                                      | `onboarding-nanny/lib/load-commission-page.ts:50-63`         | `2g`   |
| L-2 | A `consent.hasConsent` **store failure** is told to the nanny as "Please read the notice and tick the box first." Fails in the safe direction (it blocks the biometric submission), unlogged.                                                                                                                                                                   | `verification/lib/submit-identity.ts:34-38`                  | `2b`   |
| L-3 | "AGR-14 was given and not recorded" is `log.error` with **no `alert`** — a consent record that was actually given and did not land is a GDPR evidence gap someone has to repair by hand. This is **REVIEW-2's L-6 recurring**: 01 §4b still has no `ALERT_NAMES` entry for "a downstream write refused and cannot be retried", so there is no true name to use. | `app/child-linking/actions/add-family-child-action.ts:70-77` | 01 §4b |
| L-4 | `columnsOf`'s switch handles 6 of `EvidenceType`'s 7 members and falls through `default: return {}` for `dbs-update-service`. Unreachable today (no submit action addresses it); no `assertNever` exists anywhere in the four units, so the type system will not catch it when Phase 2 wires one.                                                               | `src/boot/db-vetting-store.ts:101-129`                       | `2c`   |
| L-5 | `void poll();` in a `useEffect` with no `.catch` — `Result`-shaped failures are handled, but a transport rejection is an unhandled rejection. REVIEW-2's H-9 shape, client-side and cheap.                                                                                                                                                                      | `verification/components/wizard/ProcessingStep.tsx:60`       | `2b`   |

---

## 6. The specific checks the brief asked for

### 6.1 The four pins on `main` still fail for a live reason

Four before this sweep (down from REVIEW-2's eleven — HARDEN-B, S5d and `2g` closed seven). Each re-verified mechanically, not read:

| #   | File:line                                          | Pins                                                                | Verdict                                                                                                                                                                       |
| --- | -------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `payments/__tests__/payments.jobs.test.ts:266`     | AC-A-41: one open `admin_notifications.payment_due` per family      | **Honest.** `grep admin_notifications src/` outside tests and generated types returns only comments recording the gap — no writer exists.                                     |
| 2   | `payments/__tests__/payments.screens.test.ts:118`  | 03 §5.2 S-P-12 cancels in-app                                       | **Honest.** `PurchasePath` still has no `cancel`; `types.ts:211` carries the doc's sentence as a comment over a method that was never added.                                  |
| 3   | `app/__tests__/child-linking.pins.test.ts:162`     | the access window moves inside `connect_child_invite`'s transaction | **Honest.** `set_access_window` appears in `0010` (definition), `0019` and `0020` (`apply_payment_event`) — and **nowhere inside `connect_child_invite`**. Still a migration. |
| 4   | `positions/__tests__/positions.inside.test.ts:226` | 03 §2.5: all 44 transition rows resolve to a spec                   | **Honest.** `position-transitions.ts` declares exactly **7** ids, P-1…P-7. Unchanged.                                                                                         |

**None has quietly turned true, and none carries an expired reason** — the two that did (REVIEW-2 §6.2 rows 4 and 10) were closed by their owners rather than left to rot, which is the protocol working.

**`2g`'s pin flip is legitimate.** `child-linking.pins.test.ts`'s nanny-mint pin became a passing `it(...)`. The pin had named its own three conditions in writing — `ChildFacts` gains `createdByUserId`, `mayMint`'s `nanny_to_parent` arm accepts it, the store reads the column back — and all three landed (`invite-authorisation.ts:39-40,70`, `invite-methods.ts:97-98,162`, `db-child-linking-store.ts:117`), with `child-linking.nanny-mint.test.ts` as the end-to-end proof. Flipped by behaviour, not by a weakened assertion.

**This sweep adds three pins** (C-1 ×2, H-3 ×1), each verified red on the shipped tree **and** green under the fix it names.

### 6.2 `check:limiter-call-sites`' allow-file reasons

Gate green: 14 of 21 declared policies have a call site, 7 recorded. Each reason re-checked against the tree:

| entry               | reason still true?                                                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clientEvents`      | **Yes** — no `POST /api/events` in the London tree.                                                                                                              |
| `cookieConsent`     | **Yes** — the only route at that path is the legacy Sydney one.                                                                                                  |
| `katieChat`         | **Yes** — London Katie is not built.                                                                                                                             |
| `katieUploads`      | **Yes** — same surface.                                                                                                                                          |
| `agentRoute`        | **Yes** — `/api/agent` is legacy.                                                                                                                                |
| `nannyApplications` | **Substance yes, sentence no** — see M-3. Row 12 is applying to a _position_ (`2d`); the reason's words are now contradicted by the `/apply` route `2a` shipped. |
| `adminRoutes`       | **Yes** — verified: `find src/app/admin -name route.ts` returns nothing; the one admin surface is still a self-gating page.                                      |

`verificationSubmissions` and `childAdds` both left the list this cycle with real consumers — the gate did its job.

### 6.3 Does anything new fail **open** in production config?

**No — and the ground here is materially better than REVIEW-2 left it.** ADR-141 fully landed: `refine-env.ts:41-49` refuses `EMAIL_PROVIDER=stub-email` and `AREAS_SOURCE=stub` under production; `smoke-env.sh`'s production case now sets `resend` / `db` with placeholder credentials and says why; and `boot-guard.sh` grew the case REVIEW-2 §6.1 said it lacked. Measured, all eight:

```
boot-guard: OK — a valid preview env boots and serves /api/health: listening
boot-guard: OK — a missing server secret refuses the boot: exited-nonzero
boot-guard: OK — a malformed server value refuses the boot: exited-nonzero
boot-guard: OK — the dev bypass name refuses the boot outside development: exited-nonzero
boot-guard: OK — a valid production env boots and serves /api/health: listening
boot-guard: OK — the production boot report names no stub provider
boot-guard: OK — an off-Vercel production runtime refuses the boot (missing VERCEL_ENV): exited-nonzero
boot-guard: OK — the production env's writes reach the driver, not the unit-of-work refusal
```

`2b` binds `stub-manual` in every environment, production included, and that is **argued rather than overlooked**: its only outcome is `needs-admin → review`, so no section can reach `verified` without a person (ADR-154; REVIEW-1 M-9 answered by construction). `unwired-ports.ts` shrank honestly from four rows to two as `verification` and `vetting-providers` acquired real bindings — the disclosure list is being maintained, not decaying.

The four new limiters all fail **closed**; only `publicRead` is on ADR-140's allow-list. The gap is M-1: three new mutating actions that never acquired a policy to fail closed _with_.

### 6.4 ADR-147's isolation conjunction: behaviour or mocks?

**Mocks, and that is how C-1 shipped.** The claim's _outbound_ half is genuinely tested against behaviour — `int.rls:76` seeds a visible nanny (not isolated, L3) and an isolated one (L4) and asserts `nanny_public` shows the first and not the second. But the fixture set contains **no nanny at `is_isolated = false, verification_level = 'L0_SIGNED_UP'`** — which is precisely the account `2a` now mints, and precisely the arm of the conjunction that fails. The test that exists proves the term that was already there; the term that is missing had no test to miss it. `rls-isolation-conjunction.test.ts` adds that fixture and pins the gap.

### 6.5 `2b`'s storage RLS claims: behaviour or mocks?

**Behaviour, and genuinely well done — the best-argued work in this diff.** `int.storage-rls` drives the real `0015` policies per role through `asRole` (a `SET LOCAL ROLE` plus real JWT claims, i.e. what PostgREST does) and proves: a nanny inserts under her own prefix and one of the four admitted section names; a foreign prefix is `42501`; an unknown section (`passport-scan`) is `42501`; **no user may read the object — not another nanny, not a parent, not its own owner**; no user may update or delete it; an admin reads every object. The file even records two measurements that would otherwise look like bugs (why `RETURNING` is `42501`, and that `protect_objects_delete` refuses before RLS is consulted).

The TypeScript half matches it rather than contradicting it. `evidence-object-path.ts` builds `<user_id>/<section>/<uuid>.<ext>` from the session id, a fixed enum, a fresh uuid and the **sniffed** extension — nothing from the filename; `sniff-mime` is real magic-byte sniffing; `upload-evidence` checks the caller owns the id, caps size before and after re-encode, scans **before** the object is written, and fails closed when the scanner is unavailable. `removeObject` runs at service scope but `remove-evidence-objects.ts` independently re-asserts the `<nannyId>/` prefix before calling it — defence in depth, proved by a case in `verification.upload.test.ts`. The one defect on this road was H-1, which is about what happens when _our_ encoder breaks, not about what a caller can reach.

The consent gate is the same story: `submit_verification_evidence` (`0022:216-229`) requires `consent_records.id = biometric_consent_id and user_id = auth.uid() and purpose = 'biometric-notice' and consent_given`, the id is minted server-side in the same request and is not in `parseForm`'s field list, and both layers are real. Genuinely double, not a TypeScript check the SQL merely trusts.

---

## 7. What this sweep confirmed, and one thing it withdrew

- **A HIGH of my own, killed by measurement.** I had the wizard's 10 MB promise failing against Next's 1 MB Server Actions default and was ready to pin it. Reading `action-handler.js:422` instead of trusting the docs: the multipart branch hands busboy `limits: { fieldSize: limit }` — which caps **field values, not file parts** — and the non-fetch multipart branch applies no limit at all. The 1 MB default therefore does not bite file uploads, and the finding collapses to M-9, which claims only what is true: nothing anywhere measures it.
- **The definers are tight where it counts.** Both `jsonb` column bags are static `where e.key in (…)` filters — no `jsonb_populate_record` over a raw bag, no `EXECUTE format`, no loop over the caller's own keys. Every guarded column (`is_isolated`, `verification_level`, `suspended_at`, `lead_id`, `commission_pitch_opted_in_at`, `is_vaccinated`, `profile_visible`) is absent from `nanny_profile_columns()`, and `int.rpc-0021` proves it by behaviour ("the guarded columns cannot be reached through the profile road"). `apply_vetting_check_result` is `service_role` only by explicit revoke-then-grant and never writes `level`, `dbs_outcome`, the cross-check or the Update Service columns — enforced structurally by the migration's own regex check.
- **ADR-145 is fully closed and I checked both halves.** `clear-call-slot-action.ts:22` takes `positionBelongsTo` before the destructive lever and fails closed on a read failure; `open-position-from-lead.ts:57-63` compares the lead's captured email to the signup email case-insensitively, folds both sides rather than trusting either writer, and answers the **same sentence and the same reason** as the already-claimed refusal — so closing M-4's gap did not open an oracle.
- **Authority is session-derived on every one of the 21 new actions.** No surface takes a role, id or ownership claim from form input and acts on it; `parseForm` whitelists per action, so no extra field can smuggle one.
- **`0020` is clean.** The `ignored` branch touches no money — it stamps `processed_at`/`parent_user_id` and never reaches `parent_subscriptions` or `set_access_window` — and the `ON CONFLICT` replay guard runs before any outcome branch. ADR-156 already records the one thing it cannot say (an `ignored` and an `applied` delivery are indistinguishable in the row), owed to `0023`.
- **`2g`'s S-N-01 is well built.** Date validated at the boundary (closing REVIEW-2's L-2 for this action), 07 §8 row 17's limiter taken before any write _and_ before the consent record, the mint idempotent per child, and the AGR-14 continue-on-failure argued in the file rather than implied.
- **All three rollbacks reverse their migrations** and say honestly what data is lost.

---

## 8. Wants a ruling (no ADRs from this sweep)

| #   | Question                                                                                                                                                                                                                                                                                                                                                      | Raised by |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| R-1 | **Does `is_active_nanny()` gain the level term?** C-1's fix is one predicate, measured to work. But `0005` ties the function to "may see the marketplace **at all**", and 04 §4.2 b5's "lifted at level 3" is about being _seen_. Ruling needed on what an unverified-but-applied nanny may **read** — and it belongs with `2c`, which owns level derivation. | C-1       |
| R-2 | **Does `create_nanny_account` keep `p_isolated` as a caller argument?** ADR-147 requires `/apply` to pass `false`, so "always create isolated" is not available. Options: keep it and rely on R-1's fix (the flag stops being a capability), or derive the path server-side. Note R-1 alone closes the exposure; R-2 alone does not.                          | C-1       |
| R-3 | **Should the gate catch an unlimited action, not only an unconsumed policy?** ADR-142 (2) gates declared-and-uncalled; M-1 is undeclared-and-unlimited, which the gate is blind to by construction and which this sweep found three of. A `"use server"` file that writes and names no limiter is mechanically detectable.                                    | M-1       |
| R-4 | **Does the 50-line function rule get a gate?** Two sweeps, two crops of violations, and ADR-142 (2)'s own principle says a rule with no gate reads as protection it is not. L1 is gated per module by a repo test; this is not.                                                                                                                               | M-4       |
| R-5 | **What request-body size does the deployed platform actually accept, and does `UPLOADS.maxBytes` have to fit inside it?** The identity step posts two files in one action. Nothing in the repo measures this; the 10 MB on the screen is currently a promise no test keeps. Suggest a B-item before the first nanny is asked to upload anything.              | M-9       |
| R-6 | **Do the integration suites join the required checks?** M-10: the only behavioural proof of every SQL-only control is in a job that does not block a merge. C-1 is the worked example of what that costs.                                                                                                                                                     | M-10      |

---

## 9. Gates measured at this branch's head

Local exit codes, in this sweep's own worktree, with the applied migration set on a live stack.

| Gate                               | Result                                                   |
| ---------------------------------- | -------------------------------------------------------- |
| `typecheck`                        | **0**                                                    |
| `lint`                             | **0**                                                    |
| `prettier --check .`               | **0**                                                    |
| `vitest run` (`--project unit`)    | **0** — 280 files, **4,218 passed \| 5 expected fail**   |
| `vitest run --project integration` | **0** — 12 files, **307 passed \| 2 expected fail**      |
| `lint:boundaries`                  | **0**                                                    |
| `check:allowed-imports`            | **0**                                                    |
| `check:limiter-call-sites`         | **0** — 14 of 21 policies consumed, 7 recorded           |
| `check:config-literals`            | **0**                                                    |
| `check:env-reads`                  | **0**                                                    |
| `check:claude-md`                  | **0**                                                    |
| `check:pins`                       | **0**                                                    |
| `env:check` · `crons:check`        | **0** · **0**                                            |
| `check:boot-guard`                 | **0** — **8/8**, under `smoke_env` (was 6/6 at REVIEW-2) |
| `npm run build`                    | **0** — under `smoke_env production`                     |

Baseline at `dada284` before any change: identical, with 4,211 passed | 4 expected fail (unit) and 306 passed (integration). This branch adds 7 unit cases, 1 integration file, 3 pins, and no red.

`banned-literals` and the three legacy locale specs are red on `main` by construction (ADR-124) and are not this sweep's.

---

## 10. What this sweep changed

- **Amended (source) —** `verification/lib/re-encode-image.ts` (H-1: the loader and the pipeline are separate failures; both now speak) · `verification/lib/upload-evidence.ts` (H-1: the outage arm) · `onboarding-nanny/lib/read-lead-cookie.ts` (H-2: a refused read alerts; the sentence is unchanged).
- **New tests —** `verification/__tests__/verification.encoder-outage.test.ts` (3) · `onboarding-nanny/__tests__/onboarding-nanny.lead-outage.test.ts` (3) · `onboarding-nanny/__tests__/onboarding-nanny.portal-mobile.test.ts` (2, one pinned) · `supabase/__tests__/rls-isolation-conjunction.test.ts` (3, two pinned).
- **Nothing else.** No migration, no contract, no ADR, and nothing in `2c`'s areas — `verification` status/level writing, the silent hold, the admin queue, verification `comms`, the crons and `0023` were read for context and left alone. M-5, M-8 and L-4 are recorded **for `2c`'s owner** rather than acted on.

<!-- audit
Last edited: 2026-09-18T12:05+10:00 — BB-LDN-Planner-070926/REVIEW-3
Notes: created — the ADR-123 checkpoint sweep's finding register for Phase 2's first four units
(17ea66a..dada284, 300 files: 2a PR #38, S5e #39, 2b #40, 2g #41). 1 CRITICAL pinned + recorded (a migration,
so not this sweep's to write); 2 HIGH fixed in-unit test-first; 1 HIGH pinned because the connector has no legal
value to pass (REVIEW-2 H-10's precedent); 11 MEDIUM, 5 LOW recorded. The theme is a control asserted in a
migration header and an ADR in a sentence naming three reads, which holds for two of them: is_active_nanny()
carries no verification_level term, and 2a is the unit that built the first road to is_isolated = false, so a
public /apply account at level 0 reads every open position and every child's needs_details — measured against
the applied migration set, not argued, and the one-line fix was applied to the live database and watched to turn
both pins green before being reverted. Second theme, and the happier one: where these units could be checked
against behaviour they were, and they hold — int.rpc-0021/0022, int.rls and int.storage-rls are real per-role
drives of the real policies; the defects found live almost entirely in the seam between a mock and a column,
which is where a unit suite cannot look. One of my own HIGHs was withdrawn on measurement (§7) and one agent
HIGH's stated mechanism was wrong in a way that made the real defect worse (H-3). Six rulings wanted, no ADRs
written; the two load-bearing ones (R-1, R-2) belong with 2c.
-->
