# verification

**What it does.** Nanny verification (03 §4.3): the wizard S-N-03…S-N-08 (`/nanny/onboarding-verification`), the
status page S-N-09 (`/nanny/verification`), the standalone biometric-notice consent S-N-10 (`/nanny/verify`),
the one upload road (07 §5.3 rule 3), the four submit paths and the processing step — all behind the
`vetting-providers` connector with `stub-manual` bound to every evidence type (03 §4.4; kickoff §4.4). Parent
verification does not exist (ADR-071). Built by L-008 `2b` under ADR-153 (right-to-work is a parallel section,
no level effect), ADR-154 (`0022`) and ADR-155 (the data port's object writer). `verification` decides
statuses; the providers extract and check; **the level rule, the silent hold, the admin decision and the sweeps
are `2c`'s** and are named below.

**What it may import.** `config` (+ `config/server`), `shared-types`, `platform`, `auth`, `areas`, `comms`,
`vetting-providers` (01 §2.3 row). `sharp` (already a dependency) for the image re-encode, loaded lazily.

**Connector.**

| Values                                                                                                                                                                                          | Types                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `verification` · `configureVerification` · `unconfiguredVerification` · `createVerification` · `memoryVerificationStore`                                                                        | `Verification` · `VerificationStore` · `VerificationDeps` · `ContactWriter` · `VerificationState` · `SectionState` · `WizardSection` · the four inputs |
| actions `saveVerificationContactAction` · `submitIdentityAction` · `submitDbsAction` · `submitRightToWorkAction` · `processVerificationAction` · `recordBiometricConsentAction`                 | the action types · `WizardOptions` · the three prop types                                                                                              |
| reads `loadVerificationStatus` · `loadBiometricNotice` · `wizardOptions`; pure `firstIncompleteStep` · `WIZARD_STEPS` · `uploadEvidence` · `sniffMime` · `evidenceObjectPath`; the four schemas |                                                                                                                                                        |
| screens `VerificationWizard` · `VerificationStatusPage` · `BiometricNoticeConsent`                                                                                                              |                                                                                                                                                        |

**Data handled** (07 §3): class **C** (identity document + selfie — S4 biometric, 07 §2.6), **D** (the DBS
certificate — S4 criminal-offence data, 07 §2.5) and **E** (right-to-work evidence — S4-adjacent). Nothing S4
leaves the module: the events carry a nanny id and a check name (03 §9.2 rule 3), the logs carry reasons and
never a path, a name or a number, and the nanny's own read is the `verification_status` view (07 §5.2), never
the base table. Objects are stored by bucket + path, never a URL (I-V7); the signed URL the provider gets is
minted per submit with the bucket's 1 h TTL (07 §10.1).

**The upload road** (`lib/upload-evidence.ts`; 07 §5.3 rule 3, in this order): session → size cap → MIME from
the **bytes** (`sniffMime`: JPEG · PNG · WebP · HEIC · PDF, never the file name) → images re-encoded to JPEG with
`sharp` (EXIF gone, ≤ `UPLOADS.maxImageEdgePx`) → the scanner (`platform/upload-scan`; `infected` → refused +
`ALERT_UPLOAD_MALWARE`, `unavailable` → **fail closed** for this bucket) → `auth.data.putObject` at session scope
with `{ uploaded_by, entity_kind, entity_id, scan }` (ADR-155). The scan runs before the write, so an infected
file is never at rest. A submission that fails after its uploads removes them (`removeEvidenceObjects`).

**Named service-scope uses** (01 §6.3 / 07 §5.1 rule 5): `auth.data.removeObject` — the undo of an uploaded
object whose submission failed (no user role holds DELETE on the bucket); `verification.applyCheckResult` →
`apply_vetting_check_result()` (`service_role` only) through `src/boot/db-verification-store.ts`. The ledger reads
are `vetting-providers`' (its README).

**Rate limits consumed** (07 §8): row 11 — `verificationSubmissions` on every submit, keyed per section per user,
consumed before any upload; fails closed on a limiter outage (ADR-134). The identity attempts cap
(`VETTING.attemptsCap`) is judged on the section's `attempts`.

**The consent gate** (07 §2.6; I-V3; `10.01`): S-N-05's tick and S-N-10 share one recorder
(`recordBiometricNoticeConsent`: a `biometric_consent_records` row with the scroll-gated evidence and the two
config disclosures, then a `consent_records` row with purpose `biometric-notice`). No current notice document →
`notice-unavailable`, the tick stays closed, nothing is uploaded (kickoff §6). `submitIdentity` re-checks
`consent.hasConsent` before it touches Storage; `0022` re-checks the row is the caller's own.

**Resume** (`03.21`): `firstIncompleteStep` — contact first, then the first open evidence section (`not_started`
· `rejected` · `failed` · `expired`); anything `pending` → the processing step; everything settled → S-N-09.
`?step=` may name an open step, never skip one.

**A bar is terminal (ADR-168).** `sync_nanny_verification_state()` may SET `suspended_at` and may never clear it:
re-deciding the same submission with any non-`adverse` reason used to walk the pair back (REVIEW-4 C-2, measured
`suspended t → f`), so the derivation lost the clearing branch entirely in `0025`. Lifting is its own act —
`verification.liftSuspension` on the admin road, its own reason, its own `nanny_suspension_lifts` row naming who
authorised it, its own comms — and it writes **no level**: she stays where I-V5 left her until her next decision
re-derives it through the one writer. An adverse DBS outcome is never re-derivable to safe; the lift unsets it,
and a correction to the evidence is a new submission.

**Two id spaces, named apart (ADR-169).** `vetting_submissions.nanny_id` and `verifications.nanny_id` are
`nannies.id` — the **party** row — and carry the `NannyId` brand through the ledger, the queue, the admin record
and the decision store. The wizard's own reads key on her `auth.users.id` (`UserId`, R-7). The boundary is where
`auth.uid()` resolves to `nannies.id`: inside each session-scope definer, and — for the reads, which have no
definer — once and named, in `partyIdOf` / `AdminRecord.userId`. Never in a caller, and never by passing
whichever id was to hand: that was REVIEW-4 C-3, and it emptied the queue, made L4 unreachable and silenced the
barred alert while the database stayed correct throughout.

**The level, the queue and the jobs (`2c`; ADR-157 · ADR-158 · ADR-159 · ADR-161).** The level has ONE writer —
`sync_nanny_verification_state()` (`0023`), a definer run inside the decision's transaction and asked again
(idempotently) by the connector so the from → to reaches the events; `deriveLevel` is the same rule in TypeScript,
pinned equal to the SQL over the whole matrix by `int.rpc-0023`, and it is what the memory double writes. Which
sections a level requires is `VETTING.requiredChecksByLevel` → `requiredSectionsByLevel` → the sync's `p_required`
(validated; an emptied L2–L4 list refuses). **The silent hold** is two arms: below `MATCHING.minVerificationLevel`
she is out of every pool read (ADR-147's conjunction, now `nanny_visible()` — ADR-162) and nothing on S-N-09 says
so; at L4 the sync releases her `held_for_verification` rows (the write of the flag at K-row creation is
`connections`', pinned). **The queue's road** — `listQueue` · `readQueueRecord` · `openEvidence` · `decide` ·
`recordUpdateServiceCheck` · `liftSuspension` · `adminOverview` — re-checks `auth.requireRole('admin')` (`aal2`) on every call,
consumes `SECURITY.rateLimits.adminRoutes` before every write and every reveal, takes the audit subject from the
**submission**, and routes the decision through `getProvider(type).record()` (`stub-manual` → `record_vetting_decision()`:
the admin _is_ the check — a DBS `verified` is the outcome and the cross-check; `adverse` bars). Every reveal mints
1 h signed URLs through `auth.data.signUrl` and emits `vetting.evidence-viewed`. **The comms** (03 §8.2 rows 28–32):
`verification-pending` once per day of submitting (the processing step), `verification-approved` on reaching L3 and
L4, `verification-action-needed` +`VETTING.actionNeededDelayMinutes` keyed per section and cancelled by a
resubmission, `verification-barred` + `admin-nanny-barred` + a `nanny_barred` queue row (`comms.notifyAdmin`, ADR-160),
`verification-suspension-lifted` + `admin-nanny-suspension-lifted` when a bar is lifted (ADR-168 (b); no second
`admin_notifications` row — the open `nanny_barred` one is what an operator acknowledges),
`verification-reminder` LCY-1…4 from the last change while below the pool (`sweepReminders`), cancelled at L3.
**The named jobs:** `sweepStaleProcessing` (I-V4, `VETTING.staleProcessingMinutes`) and `sweepReminders` in the
5-minute run, `sweepExpiry` in `vetting-expiry` (warn inside `VETTING.expiryLeadDays`, expire past the date).

**Named service-scope uses** (01 §6.3 / 07 §5.1 rule 5), beyond the two above: `sync_nanny_verification_state()` ·
`record_vetting_decision()` (through `vetting-providers`' adapter) · `record_update_service_check()` ·
`expire_verification_section()` · `sweep_stale_verification_processing()` · `lift_nanny_suspension()` (`0025`,
ADR-168 (b) — the ONE road that clears `suspended_at`; the definer validates the decider against `user_roles`,
refuses a blank reason and a nanny who is not suspended, and writes the `nanny_suspension_lifts` audit row in the
same transaction) — all `service_role` only, every one
behind the connector's own `requireAdmin` or a cron shell; the sweeps' reads of `verifications` + `nannies`
(`listExpiries`, `listRemindable`). The admin's record read (`readAdminRecord`) and the level count run at
**session** scope under an admin's RLS, deliberately.

**Gaps (recorded, not hidden).**

1. **`field-styles.ts`, `ErrorSummary`, `StepForm` and `parse-form.ts` are the fourth copies** of `onboarding-nanny`'s
   (the M-10 shape): 01 §2.3 gives this module no arrow to that one. One `platform`/shared-ui home, then a
   mechanical pass — for the checkpoint.
2. **The notice body is rendered as plain paragraphs** from `legal_documents.body_md` (07 §4.3: no unsanitised
   HTML) — a markdown renderer with a sanitiser is Phase 3's, with the seeds.
3. **HEIC**: `sharp` decodes HEIC only where libvips carries libheif; a HEIC it cannot decode is refused as
   unreadable with a plain line ("try another photo"), never stored raw.
4. **The Update Service consent is a timestamp**, not a `consent_records` row: 02 §3's `consent_purpose` has no
   Update Service purpose, so `dbs_update_service_consent_at` (02 §4.3) is the record — 02's owner may add a
   purpose.
5. **Admin "view as"** (`/admin/viewer/[id]/verification`) now renders S-N-09 read-only through
   `verification.getStatus`; its "Fix it now" links point at the queue route `2c` builds.
6. **`selfie` is its own submission** under the identity section (03 §4.3's two evidence types), so a queue tab
   sees two ledger rows per identity attempt; the section's state is one.
7. **A non-barring adverse disclosure has no reject reason of its own** (`2c`): 03 §4.2's `adverse` reads
   "barred-list / adverse disclosure" and 03 §4.3 says "adverse → barred", so every `adverse` rejection bars and
   suspends; a caution that should not bar needs a second reason — 03 §12, BAI (with B-19).
8. **`override` stays refused** (03 §4.3's arm for a provider that is not a `ManualDecisionProvider`); none is
   bound, so no road reaches it.
9. **The hold at K-row creation** (ADR-158 (2)) is `connections`' — `connections.hold.pin.test.ts` names it.
10. **One signed-URL TTL for every kind of evidence** (`security-reviewer` L-5). `openEvidence` mints every reveal at
    `SECURITY.signedUrlTtlSeconds.verification` (1 h) — the identity document, the selfie, the right-to-work document
    and the **DBS certificate image**, which is the one most likely to carry conviction detail. The TTL is 07 §6's to
    split; a second key (`…verification.dbs`) and one lookup by section is the whole change. Not taken here because a
    security config value is not a build unit's to re-rule.
11. **`adminOverview` reads the whole ledger** (`security-reviewer` L-6). The counters behind the queue's header call
    `listSubmissions({})` with no filter and no limit, so every render of the tab scans `vetting_submissions`. Correct
    today (a handful of rows, and the numbers must count every state), wrong at volume: the fix is a counts-by-status
    read on the store rather than a filter here, which is a `VettingSubmissionStore` contract change — owner: whoever
    next opens 03 §4.2. Bound it before the ledger is large.

<!-- audit
Last edited: 2026-09-18T19:30+10:00 — BB-LDN-Planner-070926/2c
Notes: 2c — security-reviewer pass: H-3 closed (vetting_submissions.decided_by, written and validated inside the
decision's transaction — the best-effort event is no longer the only record of who decided) and M-4 closed (the
limiter now precedes the first read on decide(), as on the other two roads); L-5 and L-6 recorded as gaps 10–11.
Prior: 2c — the level's one writer, the silent hold's two arms, the queue's road, the outcome comms, the three named jobs; service-scope uses named; gaps 7–9.
Prior: 2026-09-18T12:10+10:00 — BB-LDN-Planner-070926/2b
Notes: the inside built (L-008 2b): the wizard, the status page, the notice consent, the upload road, the four submit paths, processing; ADR-153/154/155; data handled, service-scope uses, limits, the consent gate, resume, what 2c must know, six gaps.
Prior: 2026-09-16T13:55+10:00 — BB-LDN-Planner-070926/F-b
Notes: created at F-b — ADR-117 Tier A, so connector + types only; the binding fails closed and every inside is a recorded gap for the inline-reviewed unit.
-->
