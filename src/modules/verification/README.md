# verification

**What it does.** Nanny verification (03 §4.3): the wizard sections, the level model, the status sync and the
silent hold. Parent verification does not exist (ADR-071). `verification` decides levels and statuses;
`vetting-providers` extracts and checks (03 §4.1).

## Held back — ADR-117 Tier A

This module handles **criminal-record checks, identity documents and right-to-work evidence**. The F-b unit
built the **connector and the types only**: no evidence handling, no storage path, no provider call, no level
rule. The module-level `verification` answers `INTERNAL { reason: 'verification-not-configured' }` until the
later, inline-reviewed unit calls `configureVerification`. Nothing can begin moving evidence by accident.

**Connector.**

| Values                                                                | Types                                                                                           |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `verification` · `configureVerification` · `unconfiguredVerification` | `Verification` · `VerificationState` · `SectionState` · `VerificationSection` · `AdminDecision` |

**What it may import.** `config` (+ `config/server`), `shared-types`, `platform`, `auth`, `areas`, `comms`,
`vetting-providers` (01 §2.3 row).

**Gaps (recorded, not hidden).**

1. **Everything inside** — `submitContact` / `submitIdentity` / `submitDbs` / `submitRightToWork`, the
   processing step (S-N-08), `deriveLevel`, `syncNannyVerificationState`, the silent hold and the
   `vetting-expiry` sweep (03 §4.3). Tier A; a later unit, reviewed inline.
2. **The section → method shape is collapsed to one `submitSection(evidence)`** in the typed connector,
   because 03 §4.3 names four submit calls but no input shape for any of them; the four-method split returns
   with the wizard, where its inputs are known.
3. **Level effect of right to work is `[unverified]`** in `config/vetting.ts` (B-20) and is not read here.

<!-- audit
Last edited: 2026-09-16T13:55+10:00 — BB-LDN-Planner-070926/F-b
Notes: created at F-b — ADR-117 Tier A, so connector + types only; the binding fails closed and every inside is a recorded gap for the inline-reviewed unit.
-->
