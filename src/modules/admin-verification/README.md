# admin-verification

**What it does.** The verification queues and reference for admins (S-A-16). It imports `verification` and
**never** `vetting-providers`: every provider call goes through `verification` (03 §4.2).

## Held back

The queue's reads and its per-tab decision actions open signed URLs over verification evidence — the opens
`07 §4.32` audits as `vetting.evidence-viewed`. That is the same personal-data path as the ADR-117 Tier A
verification insides, so it is built and reviewed with them, not here. This unit shipped the **types only**.

**Connector.** `export type * from "./types"` — `QueueTab` (the three tabs of 03 §4.3), `QueueFilter`
(`needs-admin` | `stale-pending`), `QueueQuery`, `QueueEntry` (ids only: the admin panel decorates them from
the `auth` / `verification` connectors, the pattern 03 §3.6 sets for the call list).

**What it may import.** `config` (+ `config/server`), `shared-types`, `platform`, `auth`, `areas`, `comms`,
`verification` (01 §2.3 row).

**Gaps (recorded, not hidden).**

1. **No queue methods.** The foundations name the three tabs, the two filters and the decision routing
   (03 §4.3) but no connector signature; S-A-16's contract is `04 §5`, which this unit did not read. Inventing
   a method here would be inventing a business rule.
2. **`vetting.evidence-viewed` auditing** (07 §4.32) lands with the reads.

<!-- audit
Last edited: 2026-09-16T13:55+10:00 — BB-LDN-Planner-070926/F-b
Notes: created at F-b — types only; the queue reads and decisions travel with the Tier A verification insides because they open evidence.
-->
