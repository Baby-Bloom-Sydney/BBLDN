# connections

**What it does.** The connection stage model (`00-glossary` §1.2; 03 §2.2): request, accept, meeting, outcome,
and the branch stages carried from Sydney (`NANNY_APPLIED`, the expiries, `TRIAL_*`, `NOT_HIRED` /
`NOT_SELECTED`, the cancellations). One row per nanny per position.

It is a **slice** of `positions`, not a caller of it: its K-row `TransitionHandler`s are registered with the
stage model at boot and nothing outside calls a slice directly (03 §2.1).

**Connector** (`index.ts` + `types.ts`, written and reviewed before the inside — L2):

| Area           | Values                                                  | Types                                               |
| -------------- | ------------------------------------------------------- | --------------------------------------------------- |
| The stage seam | `stubConnectionsSlice`                                  | `ConnectionsSlice` · `StageTransitionHandler`       |
| The reads      | `connections` (module binding) · `configureConnections` | `ConnectionsReads`                                  |
| The stub       | `stubConnections` (`connections.stub.ts`)               | `ConnectionsErrorDetails` · `ConnectionsResult`     |
| Vocabulary     | —                                                       | `ConnectionStage` (re-exported from `shared-types`) |

**What it may import.** `placements` · `comms` (S) · `auth` (S) · `platform` (S) (01 §2.3) — **not `positions`**.
That direction is the cycle R2 closed, and it has a consequence this unit had to design around: `registerSlice`
lives in `positions`, so `connections` cannot call it. The handlers are therefore **handed to the boot file**,
which may import both, and the handler type is declared locally (structurally identical to 03 §2.5's
`TransitionHandler`). Both are recorded as gaps in the L-005 F-a PROGRESS entry; the fix is to move
`TransitionHandler` / `registerSlice` into `shared-types/stage-model.ts`, where 03 §2.5 already says they live.

**What this module does _not_ do yet (F-a boundaries).** No K-row insides: the 25 rows of 03 §2.4, their
preconditions (verification level, isolation I-5, duplicate and pending caps), their cascades into P-3 / P-4 /
P-5, their `connection.*` and `meeting.*` events and their templates are Phase 1f. `stubConnectionsSlice` echoes
a move back and emits nothing. The two reads are the minimum 03 §7.5 and §2.6 imply and their signatures are
provisional — also recorded.

**Suites.** `src/modules/connections/__tests__/connections.swap.test.ts` — the `connections` part of swap test 1:
the stub slice registered by the test playing the boot file's part, `advance(K-1)` reaching it, and the reads over
`stubConnections`.

<!-- audit
Last edited: 2026-09-16T14:35+10:00 — BB-LDN-Planner-070926/F-a
Notes: initial authoring — the F-a connector, the K-row slice stub, `stubConnections` and the swap test. Two
recorded gaps: the handler type's home (03 §2.5 says `shared-types`) and the provisional read signatures.
-->
