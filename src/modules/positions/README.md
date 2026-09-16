# positions

**What it does.** The aggregate root of the stage model (03 §2.1). One `advance()` moves every entity —
positions, connections, placements and the position's call mirror — for all three movers (`user` · `admin` ·
`system`), with the same preconditions and side effects (T-5.2, ADR-031). `amend()` moves facts without a
transition. The read models (`getStage` · `getJourneySteps` · `listAllowed`) are pure: no lazy sweeps, expiries
are named jobs (ADR-070).

It owns the **slice-registration seam**. `connections`, `placements` and `call-layer` hand their
`TransitionHandler`s in at boot and `advance` dispatches into them, which is why `positions` imports no
`call-layer` and no `matching` (fix: A-1 / A-2 / R2) and why nothing outside the stage model calls a slice
directly.

**Connector** (`index.ts` + `types.ts`, written and reviewed before the inside — L2):

| Area            | Values                                              | Types                                                        |
| --------------- | --------------------------------------------------- | ------------------------------------------------------------ |
| The stage move  | `advance`                                           | `AdvanceInput` · `StateAfter` · `TransitionId` · `EntityRef` |
| The slice seam  | `registerSlice`                                     | `TransitionHandler` · `SliceRegistration`                    |
| The read models | `positions` (module binding) · `configurePositions` | `PositionsReads` · `StageRead` · `JourneyStep`               |
| For `matching`  | (on the binding)                                    | `PositionForMatching` · `PrecheckRecord`                     |
| The stub        | `stubPositions` (`positions.stub.ts`)               | `StageErrorDetails` · `StageResult`                          |

The stage **vocabulary** (`PositionStage` · `ConnectionStage` · `PlacementState` · `CallState` · `CallType` ·
`CallOutcome` · `EndReason` · `CloseReason` · `Stage`) lives in `shared-types/stage-model.ts` (03 §2.5) and is
re-exported here, so a caller reads the stage model through `positions` rather than reaching for the type module.

**Errors** (03 §2.5): `E_TRANSITION_UNKNOWN` [VALIDATION] · `E_ENTITY_NOT_FOUND` [NOT_FOUND] ·
`E_SLICE_NOT_REGISTERED` [INTERNAL] — a boot defect, deliberately not dressed up as a `CONFLICT` the caller could
have caused. The rest of the union (`E_TRANSITION_NOT_ALLOWED` · `E_ACTOR_FORBIDDEN` · `E_PRECONDITION_FAILED` ·
`E_PAYLOAD_INVALID` · `E_STALE_STATE` · `E_INVARIANT_VIOLATION`) is typed here and **raised by the slices**.

**What it may import.** `connections` · `placements` · `comms` (S) · `areas` (S) · `auth` (S) · `platform` (S)
(01 §2.3). Never `call-layer`, never `matching`, never `scoring`.

**What `advance` does and does not do in this unit.** It is the **dispatch**: reject an unknown transition id,
report a missing slice as a boot defect, and run the slice inside one unit of work — the caller's when one was
passed, otherwise one opened here, so 01 §4a rule 5 ("a stage never advances on a failed write") holds for every
caller. Everything else in 03 §2.4 — preconditions, cascades, invariants I-1…I-7, idempotency (`noop` / `reject`
/ `key`), the events row, the inbox row, the email enqueue — belongs to the slices and is Phase 1e–1g.

**What this module does _not_ do yet (F-a boundaries, all recorded in the L-005 F-a PROGRESS entry).**

- **No `TRANSITIONS` table.** The 44 rows of 03 §2.4 as `ReadonlyArray<TransitionSpec>` are Phase 1e, so the swap
  test's table test (every `TransitionId` ↔ §2.4, every `TemplateId` ∈ §8.2, every event name ∈ §9.3) cannot run
  yet. `TRANSITION_IDS` from `shared-types` is what `advance` validates against meanwhile.
- **No boot call.** `configurePositions` and `registerSlice` belong in `src/instrumentation.ts`, which this repo
  still does not have (S4's recorded gap, blocked on the transaction-opener ADR).
- **`TransitionHandler` / `registerSlice` live here, not in `shared-types`.** 03 §2.5 puts them in
  `shared-types/stage-model.ts`; they are not there yet, and adding them was not this unit's surface. The
  consequence is real and is recorded: `connections` and `placements`, which 01 §2.3 gives **no** arrow to
  `positions`, declare a structurally identical handler type locally and let the boot file do the registering.
- **`getForMatching` / `recordPrecheck` shapes are provisional** — 03 §12 item 36 still owes them to 01 §2.4 and
  to `02`'s writers column.

**Suites.** `src/modules/positions/__tests__/positions.swap.test.ts` — the part of swap test 1 this unit can
prove: dispatch into a registered slice, the unit-of-work handling both ways, the two refusals, re-registration
as the swap itself, and the read half over `stubPositions`.

<!-- audit
Last edited: 2026-09-16T14:35+10:00 — BB-LDN-Planner-070926/F-a
Notes: initial authoring — the F-a connector, the slice-registration seam (`registerSlice` + `advance` dispatch),
`stubPositions` and the swap-test-1 subset. Four recorded boundaries: no `TRANSITIONS`, no boot call, the
handler-type home, and the provisional `getForMatching` / `recordPrecheck` shapes.
-->
