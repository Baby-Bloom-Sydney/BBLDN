# vetting-providers

**What it does.** The swappable mechanism behind `verification` (03 §4; T-3.1, ADR-026): a provider _checks_
evidence a nanny supplies. BabyBloom verifies, it does not issue. **Importer: `verification` only** —
`admin-verification` reaches providers through `verification` (03 §4.2). Day one every `EvidenceType` is bound
to **`stub-manual`** by `config/vetting.ts` (03 §4.4; kickoff §4.4; ADR-154): its only outcome is `needs-admin`,
it reads no document, extracts nothing and never answers `verified` — so binding it cannot make a nanny look
verified (REVIEW-1 M-9 answered by construction); the admin drives every decision from the queue (`2c`).

**Connector** (03 §4.2).

| Values                                                                                                                                                                                                | Types                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getProvider` · `listProviders` · `stubManualProvider` · `configureVettingStore` · `unconfiguredVettingStore` · `memoryVettingStore` · `listSubmissions` · `readSubmission` · `sectionOfEvidenceType` | `VettingProvider` · `ManualDecisionProvider` · `ProviderSummary` · `VettingSubmissionStore` · `VettingSubmissionInput` · `VettingLedgerEntry` · `VettingLedgerFilter` · `VettingErrorDetails` · the memory world's `MemoryVettingStore` · `MemoryVerificationRow` |

The evidence, submission, status and extraction types are `shared-types/vetting.ts`.

**The ledger port** (02 §4.3 row 2; ADR-154): `upsert` takes the **evidence** and is
`submit_verification_evidence()` at **session** scope — one transaction writes the ledger row and the section's
submission columns (the F-b README's "the four-method split returns with the wizard, where its inputs are
known"); a known evidence id answers the existing row (03 §4.2 idempotency; 07 §4.20). `findByEvidence` · `read` ·
`list` are **service-scope** reads, because `vetting_submissions` is service-role only — named here as 07 §5.1
rule 5 asks; the callers are the wizard's processing step and the admin queue (`2c`). The adapter is
`src/boot/db-vetting-store.ts`; the memory double (`memoryVettingStore`) is the one world `verification`'s memory
store shares, so the two doubles move together the way the definer does.

**Events** (03 §4.4): `vetting.submitted` · `vetting.needs-admin` on every stub submit; `vetting.decision-recorded`
on `record`; a failed emit is logged and never fails the submission it describes.

**What it may import.** `config` (+ `config/server`), `shared-types`, `platform` — and the service modules its
01 §2.3 row allows. Third-party SDKs will live inside `providers/<id>/` when they land; none exist.

**Gaps (recorded, not hidden).**

1. **`recordDecision` on the boot adapter refuses `decision-not-built`** (`2c`): the write it needs exists
   (`apply_vetting_check_result()`, `checked_by = 'admin'`), the actor, the note and the level derivation do not.
   The memory double implements it so `stub-manual.record` is testable now.
2. **No real provider.** `ai-id-check`, `admin-manual`, `dbs-update-service`, `home-office-share-code` are Phase 2
   (03 §4.4) and are not installed; asking for one fails loudly (`unsupported-evidence`).
3. **`vetting.extracted` · `vetting.checked` · `vetting.expiry-approaching` · `vetting.expired` ·
   `vetting.provider-unavailable`** land with the provider that raises them; the stub raises none.
4. **The retry budget** (`VETTING.retryBudget`) is applied by `verification`, which today leaves a section
   `processing` on a provider failure for the stale sweep (`2c`) rather than retrying.

<!-- audit
Last edited: 2026-09-18T12:10+10:00 — BB-LDN-Planner-070926/2b
Notes: the ledger port built over 0022 (ADR-154): upsert takes the evidence, the reads at service scope named, the memory world shared with verification, events; stub-manual's only outcome stated; four gaps.
Prior: 2026-09-16T13:55+10:00 — BB-LDN-Planner-070926/F-b
Notes: created at F-b — ADR-117 Tier A, so the connector, `getProvider` / `listProviders` from config, and the `stub-manual` shell over a fail-closed store. No evidence handling anywhere in the module.
-->
