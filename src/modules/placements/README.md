# placements

**What it does.** Confirm a placement (hours, rate, start date), start it, end it (03 §2.2: `CONFIRMED → ACTIVE →
ENDED`). Hours, rate, start date, roster and notes move by `amend()`, never by a transition. On `placement.started`
(L-1b) it opens done-for-you app access through `payments.openDfyAccess` — the app switches on with no trial, the
30-day satisfaction window starts and `paymentDueAt` is set; **nothing is charged at placement** (ADR-093 /
ADR-094; fix: offer-1).

It is a **slice** of `positions`, not a caller of it: its L-row handlers are registered with the stage model at
boot (03 §2.1).

**Connector** (`index.ts` + `types.ts`, written and reviewed before the inside — L2):

| Area           | Values                                                | Types                                              |
| -------------- | ----------------------------------------------------- | -------------------------------------------------- |
| The stage seam | `stubPlacementsSlice`                                 | `PlacementsSlice` · `StageTransitionHandler`       |
| The reads      | `placements` (module binding) · `configurePlacements` | `PlacementsReads` · `PlacementRead`                |
| The stub       | `stubPlacements` (`placements.stub.ts`)               | `PlacementsErrorDetails` · `PlacementsResult`      |
| Vocabulary     | —                                                     | `PlacementState` (re-exported from `shared-types`) |

**What it may import.** `hire-docs` · `payments` · `comms` (S) · `auth` (S) · `platform` (S) (01 §2.3) — **not
`positions`**, for the same reason `connections` may not, and with the same consequence: the boot file registers
the slice and the handler type is declared locally. Recorded in the L-005 F-a PROGRESS entry.

**What this module does _not_ do yet (F-a boundaries).** No L-row insides: L-1's atomic cascade from K-20, L-1b's
`payments.openDfyAccess` and its window, L-2's pointer clearing and its cascades into P-6 / K-23, the
`placement.*` events and the `hire-docs` render are Phase 1f. `activeForPosition` is the read invariant I-3 needs
and its signature is provisional — 01 §2.3 gives `positions` the arrow, but no section names the method.

**Suites.** `src/modules/placements/__tests__/placements.swap.test.ts` — the `placements` part of swap test 1
("with `placements` stubbed, cascades hit the stub slice"), plus the I-3 read over `stubPlacements`.

<!-- audit
Last edited: 2026-09-16T14:35+10:00 — BB-LDN-Planner-070926/F-a
Notes: initial authoring — the F-a connector, the L-row slice stub, `stubPlacements` and the swap test. Recorded
gaps: the handler type's home and the provisional `activeForPosition` signature.
-->
