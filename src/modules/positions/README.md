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

**What `1e` added (the inside).** The seven P rows of 03 §2.4 as `TransitionHandler`s (`createPositionsSlice`)
over a store port (`PositionStore`; `memoryPositionStore` ships, the one over `nanny_positions` is owed with the
marketplace migration set), the read models over the same port (`createPositions`), the parent rail as a read
model (`journeySteps`), and S-P-05 (`loadPositionPage` · `positionPageView` · `PositionPage` ·
`closePositionAction`). The P rows register through `registerPositionsSlice` — the same one mechanism every
other slice uses (§12 item 35), so boot has no special case for the module that owns `advance`.

**Two cascades are a P row's own** and run here through `advance`, never by importing the slice that owns them:
**P-2 → C-a** (the call the parent lands on — 04 §3.3 triggers a / b) and **P-7 → C-4**. A position with no call
mirror is not an error; only `NOT_FOUND` from the call slice is tolerated.

**Connector extensions raised for ratification (L-007 `1e` PROGRESS entry).**

- `PositionForMatching.detail` (`PositionMatchDetail`) — without it 03 §7.4's sentence cannot be executed:
  `matching` has no other road to a position row, and `positions` may not import `scoring` to spell
  `PositionInput`, so the shape is declared structurally here.
- `findLive(parentId)` — "the position this parent holds", which S-P-05 needs and §2.5 does not name. It answers
  a `PositionSummary`, never the row: the recipient and the lead id stay inside the module.
- The connector's methods answer a plain `Result`, not `StageResult` — the inside forwards the store's, the unit
  of work's and the slices' failures unchanged, the reading `matching` recorded for `MatchingResult`.

**What this module still does _not_ do (recorded, not faked).**

- **No full `TRANSITIONS` table.** `POSITION_TRANSITIONS` is the P third; the C rows are `call-layer`'s and the
  25 K + 3 L rows are `1f` / `1g`'s. The §2.5 table test is pinned `it.fails` in `positions.inside.test.ts`.
- **No boot call.** `configurePositions` + `registerPositionsSlice` belong in `src/boot/wire-ports.ts`, which
  `S5b` held while this unit ran; the wiring is owed (`1e` PROGRESS entry), exactly as `1d`'s was before
  `P1-WIRE-2`.
- **Rail rows 4–8 read `pending`.** They need the connection stages, the placement, `payments.getAccess` and the
  child-linking read model — `1f` / `1g` / `1h`. Row 3 arrives whole from the `JourneyRowSource` port, because
  its words are `call-layer`'s. Row 2's ✓ is K-2's.
- **P-3 / P-4 / P-5 / P-6 preconditions on the _other_ entity** (live connections, one `CONFIRMED`, a placement)
  belong to the K / L row that fires the cascade; P-7's K-24 cascade is pinned `it.fails`.
- **`getJourneySteps` is keyed by `ParentId` while a session carries a `UserId`** — the seam `1d` opened is still
  a one-line pass-through in two places (`loadParentJourney`, `loadPositionPage`).
- ~~**`amend` does not apply `AmendableFields` to the row.**~~ **Closed by `P1-EDIT`.** The table landed with the
  marketplace set and `0019` gave it a writer, so the gap became a live defect rather than a recorded absence:
  `amend` bumped the version, emitted `position.amended` and answered success while the fields went nowhere. It
  now validates the payload at the boundary (`amend-fields.ts` — a position's one amendable fact is its
  `detail`; an unknown key fails the amend rather than being dropped), checks the 03 §2.5 actor rule and gates
  the stage (`may-amend.ts` — a parent edits at `DRAFT` / `OPEN`, before anyone has been put in front of her;
  past that the matchmaker does, and she is not stage-gated), then writes. The stage and the pre-check lever
  are untouched: 04 §6.2 gives S-P-04 the state "edit (no re-fire)".

**Suites.** `positions.swap.test.ts` — the part of swap test 1 F-a could prove (dispatch, unit-of-work handling
both ways, the two refusals, re-registration as the swap, the read half over `stubPositions`).
`positions.inside.test.ts` (`1e`) — the P rows end to end: the table against §2.4, P-2's preconditions (I-1, the
areas table, the mobile) and its C-a cascade, P-7 and its C-4 cascade, the actor rule, the two idempotency
behaviours, and the read models including the rail. `positions.copy.test.ts` — the 05 §5.2 word list over
`components/` and the two owned route files; `lib/` and `types.ts` carry the stage contract's own vocabulary
(`job-not-named`, `close-no-candidates`, `no_candidates`) and are reported under the accepted `banned-literals`
red (ADR-124).

<!-- audit
Last edited: 2026-09-17T18:05+10:00 — BB-LDN-Planner-070926/1e
Notes: the inside — the P-row slice, the store port, the reads, the rail read model, S-P-05, and the three
connector extensions raised for ratification. Boot wiring still owed.
Previously: 2026-09-16T14:35+10:00 — BB-LDN-Planner-070926/F-a
Notes: initial authoring — the F-a connector, the slice-registration seam (`registerSlice` + `advance` dispatch),
`stubPositions` and the swap-test-1 subset. Four recorded boundaries: no `TRANSITIONS`, no boot call, the
handler-type home, and the provisional `getForMatching` / `recordPrecheck` shapes.
-->
