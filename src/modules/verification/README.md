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

**What `2c` must know.** (1) `deriveLevel` / `syncNannyVerificationState` — nothing here writes `level`,
`level_changed_at`, `dbs_outcome`, the cross-check or the sweep-owned Update Service columns (`0022`'s verify
block asserts it); `VETTING.requiredChecksByLevel` is the gate and right-to-work is in no level's list
(ADR-153). (2) `verification.override` and `VettingSubmissionStore.recordDecision` refuse by name
(`not-built` / `decision-not-built`); `stub-manual.record` and the memory double already carry the shape.
(3) The queue's reads: `listSubmissions({ status: "needs-admin" })` answers every ledger row awaiting a person,
with `nannyId`, `section`, `evidenceType`, `submittedAt`; `readSubmission(id)` one; the section's own state is
`verification.getStatus(nannyId)` (the view answers an admin too). (4) `apply_vetting_check_result()` is the write
`record` needs (status + reason + guidance + expiry + `checked_by = 'admin'`); the stale-`processing` sweep and
`vetting-expiry` are named jobs still to write. (5) Guidance keys: `SectionCard` maps the **rejection reason**
to a line today; 04 §8 owns the final copy (☐).

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

<!-- audit
Last edited: 2026-09-18T12:10+10:00 — BB-LDN-Planner-070926/2b
Notes: the inside built (L-008 2b): the wizard, the status page, the notice consent, the upload road, the four submit paths, processing; ADR-153/154/155; data handled, service-scope uses, limits, the consent gate, resume, what 2c must know, six gaps.
Prior: 2026-09-16T13:55+10:00 — BB-LDN-Planner-070926/F-b
Notes: created at F-b — ADR-117 Tier A, so connector + types only; the binding fails closed and every inside is a recorded gap for the inline-reviewed unit.
-->
