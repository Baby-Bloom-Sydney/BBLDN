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

**★ The silent hold's read side (`2d`; ADR-158 (2)).** `0024` is the first migration that can write
`held_for_verification = true`, and it exposed that nothing on the read side enforced the hold. `0016`'s parent
SELECT policy hides a held row only for a query run **as the parent**; this module's store reads at
`{ scope: "service" }` by design (`0007` gives the table no client write policy and the cascades run as `system`,
with no session to read under), so RLS never fires on the application's own reads. **`visibleToParent` is the
gate**, at the two parent-facing consumption points — `loadParentConnections` and `positions`' `railRest` — and
**not** inside `forParent`, because the machinery must keep seeing held rows (P-7's close cascade closes them;
K-1's duplicate and pending-cap checks count them). `forParent` also does not look up a **name** for a held row,
so a consumer that forgets to filter still cannot name her. The rule is stage-blind, and absent is not held.

**The name (`2d`; kickoff debt 2).** `nannyNameOf` is a port, bound at boot to `matching.publicNannyName`
(`nanny_public`, session scope, first name only — 07 §5.1 rule 4 keeps contact detail out of that view). It
leaves by `connections.nannyNameOf` for the surfaces 04 §7.1 writes `{nanny}` on. **`admin`'s call drawer does
not use it**: 03 §3.2's subject for a nanny call is her `auth.users` id and `nanny_public` is keyed on
`nannies.id` and carries no `user_id`, so that lookup would match nothing silently — the admin surface uses
`admin-verification.nannyNameOf` over `user_profiles` instead.

<!-- audit
Last edited: 2026-09-19T16:20+10:00 — BB-LDN-Planner-070926/2d
Notes: the hold's write at K-row creation (0024) and its read side (visibleToParent — the security-reviewer
CRITICAL: the store reads at service scope, so 0016's parent policy is a second gate and the application is the
gate); the nannyNameOf port and why the admin drawer cannot use it.
Prior: Last edited: 2026-09-16T14:35+10:00 — BB-LDN-Planner-070926/F-a
Notes: initial authoring — the F-a connector, the K-row slice stub, `stubConnections` and the swap test. Two
recorded gaps: the handler type's home (03 §2.5 says `shared-types`) and the provisional read signatures.
-->
