# app

**What it does.** The paid product (ADR-019; 00-glossary §3) — three sub-modules, each a folder with its own
`index.ts` (01 §2.5):

| Sub-module          | What it owns                                                                                                                                                                   | State today                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| `child-linking`     | children, invites, the family ↔ nanny link; calls `payments.startTrial` on a self-serve family's first child (ADR-093); records the link consents (`platform/consent`, 02 R-4) | connector + fail-closed reads |
| `child-development` | the child's feed and milestones; `feed-post` (03 §8.2 row 36)                                                                                                                  | types only                    |
| `katie`             | the assistant; tools re-check access per call, cost cap, proactive + daily compaction (Phase 4)                                                                                | types only                    |

**Connector** (`index.ts` + `types.ts` — L2). The outside imports `@/modules/app` and nothing deeper; the parent
re-exports the three sub-module vocabularies plus the one runtime surface that exists today.

| Area          | Values                                   | Types                                                    |
| ------------- | ---------------------------------------- | -------------------------------------------------------- |
| Child linking | `childLinking` · `configureChildLinking` | `ChildLink` · `ChildLinkingReads` · `ChildLinkingResult` |
| Feed          | —                                        | `FeedPost` · `FeedAuthor`                                |
| Katie         | —                                        | `KatieScope` · `KatieTurn` · `KatieJobName`              |
| The stub      | `stubApp` (`app.stub.ts`)                | `StubAppSeed` · `AppSubModule` · `AppResult`             |

**What it may import.** `comms` (S) · `auth` (S) · `platform` (S) (01 §2.3).

**RLS scope (01 §6.3).** None yet — this unit writes no query. When the inside lands, every child read and write
goes through `user_has_child_access` and the invite RPC is the **only** anon path (07 §10.1 row `app/*`); no
`scope: 'service'` opt-out is expected on this module, and any that appears must be named here.

**Fail-closed default.** `childLinking` answers `INTERNAL { reason: 'child-linking-not-configured' }` until boot
wires it. That is deliberate: the youngest linked child's date of birth is what bounds a family's access
(ADR-083 / 084), so a confident "no children" from an unconfigured module would silently mis-bound every grant.

**What this module does _not_ do yet (F-c boundaries).** No screens, no Katie tools, no feed, no invites, no
consent calls — all Phase 4 and beyond. **Recorded gaps** (L-005 F-c PROGRESS entry): no foundation section
states a connector signature for `katie` or `child-development`, so both ship as types only rather than as
invented interfaces; and `ChildLinkingReads.youngestChildDateOfBirth` is a **provisional** shape — ADR-083 / 084
state the rule and 03 §5.2 puts `accessUntil` on `AccessState`, but no section names the method that computes it.

**Suites.** `src/modules/app/__tests__/app.swap.test.ts` — the fail-closed default and the youngest-child read
over `stubApp`.

<!-- audit
Last edited: 2026-09-16T16:15+10:00 — BB-LDN-Planner-070926/F-c
Notes: initial authoring — the parent connector, the three sub-module folders, `stubApp` and the swap test.
-->
