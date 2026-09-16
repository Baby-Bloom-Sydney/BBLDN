# vetting-providers

**What it does.** The swappable mechanism behind `verification` (03 §4; T-3.1, ADR-026): a provider _checks_
evidence a nanny supplies. BabyBloom verifies, it does not issue. **Importer: `verification` only** —
`admin-verification` reaches providers through `verification` (03 §4.2).

## Held back — ADR-117 Tier A

DBS, identity documents and right to work are criminal-record and personal-data paths. The F-b unit built the
**connector and the types only**: `supports` answers from `config/vetting.ts` (pure), and every other method
delegates to the `VettingSubmissionStore` port, whose default **refuses**
(`INTERNAL { reason: 'vetting-store-not-configured' }`). No evidence is read, no storage path is opened and
no provider is called.

**Connector** (03 §4.2).

| Values                                                                                                        | Types                                                                                                               |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `getProvider` · `listProviders` · `stubManualProvider` · `configureVettingStore` · `unconfiguredVettingStore` | `VettingProvider` · `ManualDecisionProvider` · `ProviderSummary` · `VettingSubmissionStore` · `VettingErrorDetails` |

The evidence, submission, status and extraction types are `shared-types/vetting.ts`.

**Day-one binding (03 §4.4).** `config/vetting.ts` maps **every** `EvidenceType` to `stub-manual`, so the
provider is chosen by config and never by editing an import (05 §3 rule 1). `getProvider` refuses any other
binding with `unsupported-evidence` rather than silently substituting the stub.

**What it may import.** `config` (+ `config/server`), `shared-types`, `platform` — and the service modules its
01 §2.3 row allows. Third-party SDKs will live inside `providers/<id>/` when they land; none exist.

**Gaps (recorded, not hidden).**

1. **The `vetting_submissions` store** — the whole evidence path. Tier A; a later, inline-reviewed unit.
2. **No real provider.** `ai-id-check`, `admin-manual`, `dbs-update-service`, `home-office-share-code` are
   Phase 2 (03 §4.4) and are not installed; asking for one fails loudly.
3. **No events.** `vetting.submitted` · `vetting.extracted` · `vetting.checked` · `vetting.needs-admin` ·
   `vetting.decision-recorded` · `vetting.expiry-approaching` · `vetting.expired` ·
   `vetting.provider-unavailable` (03 §4.4) land with the store.
4. **The retry budget and the attempts cap** (`config/vetting.ts`) are applied by `verification`, not here,
   and neither is wired yet.

<!-- audit
Last edited: 2026-09-16T13:55+10:00 — BB-LDN-Planner-070926/F-b
Notes: created at F-b — ADR-117 Tier A, so the connector, `getProvider` / `listProviders` from config, and the `stub-manual` shell over a fail-closed store. No evidence handling anywhere in the module.
-->
