# call-layer

**What it does.** The call page, the slot picker and the call state for all three call types — `matchmaking`,
`onboarding` and `nanny-commission` (`00-glossary` §1.3; ADR-073). It owns the semantics and the events of all
three (03 §2.2), and it is the **only** business module besides `admin` and `admin-on-behalf` that may import
`scheduling` (R3): `onboarding-nanny` and `public-site` reach the calendar through `listSlots` / `openNannyCall`,
never directly.

**The subject rule (03 §2.2; 02 R-1) is the thing to understand first.** There is no `calls` table and no
`CallId`. A matchmaking or onboarding call **is the position's call mirror**, keyed by `positionId`. A
nanny-commission call **is the booking row**, keyed by `bookingId`, and its state is _derived_: `booked` /
`rescheduled` → `slot-chosen`; `done` / `cancelled` → `done`; `no-answer` → `awaiting-slot`, terminal for that
row, retried as a **new** booking (R5).

**Connector** (`index.ts` + `types.ts`, written and reviewed before the inside — L2):

| Area           | Values                                              | Types                                                    |
| -------------- | --------------------------------------------------- | -------------------------------------------------------- |
| The call layer | `callLayer` (module binding) · `configureCallLayer` | `CallLayer` · `CallRef` · `CallResult` · `CallStateRead` |
| The stage seam | `registerCallLayerSlice`                            | `CallLayerSlice`                                         |
| The stub       | `stubCallLayer` (`call-layer.stub.ts`)              | `CallErrorDetails` · `CallLayerResult`                   |

Methods (03 §2.7): `listSlots` · `chooseSlot` · `moveSlot` · `clearSlot` · `openNannyCall` · `recordOutcome` ·
`getCallState`. `CallResult` is a **tagged** union, never `StateAfter | Booking` (fix: A-29).

**What it may import.** `positions` (the stage-model connector only) · `scheduling` · `comms` (S) · `auth` (S) ·
`platform` (S) (01 §2.3). Because this row _does_ allow `positions`, `registerCallLayerSlice` lives here — unlike
`connections` and `placements`, whose rows do not.

**What this module does _not_ do yet (F-a boundaries).** No inside: the C rows of 03 §2.4 (C-a…C-d, C-1…C-5), the
`scheduling` calls behind them, the reminders and the `call.*` events are Phase 1g. `stubCallLayer` holds an
in-memory mirror so the call surfaces can be built — it honours the shapes and the derived nanny-call state, and
it refuses `openNannyCall` outright because it has no calendar to book against. `configureCallLayer` and
`registerCallLayerSlice` are not called anywhere: that is `src/instrumentation.ts`, still absent.

**Suites.** `src/modules/call-layer/__tests__/call-layer.swap.test.ts` — the `call-layer` part of swap tests 1 / 2:
the mirror read and moved, the tagged `CallResult`, the derived nanny-call state including `no-answer` reading
back as `awaiting-slot`, the fail-closed seam, and `advance(C-1)` reaching a registered slice.

<!-- audit
Last edited: 2026-09-16T14:35+10:00 — BB-LDN-Planner-070926/F-a
Notes: initial authoring — the F-a connector (03 §2.7 verbatim), the C-row registration seam, `stubCallLayer` and
the swap test. Recorded boundary: no C-row insides, no `scheduling` calls, no boot wiring.
-->
