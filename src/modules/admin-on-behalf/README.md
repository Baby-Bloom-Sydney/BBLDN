# admin-on-behalf

**What it does.** The admin levers of T-5.2 rows 3–8. The principle is one line (P-1, ADR-001): **an on-behalf
move is the same move** — the same transition an ordinary mover fires, with `actor.kind = 'admin'` and
`onBehalfOf` recorded on the event. So every lever here forwards to the module that owns the move and returns
that module's result unchanged. A lever that invented its own answer would be a second stage model.

**Connector** (`index.ts` + `types.ts`, written and reviewed before the inside — L2):

| Area       | Values                                                      | Types                                               |
| ---------- | ----------------------------------------------------------- | --------------------------------------------------- |
| The levers | `adminOnBehalf` (module binding) · `configureAdminOnBehalf` | `AdminOnBehalf`                                     |
| The stub   | `stubAdminOnBehalf` (`admin-on-behalf.stub.ts`)             | `AdminOnBehalfErrorDetails` · `AdminOnBehalfResult` |

Methods (03 §10.1): `advance` (any row listing A) · `listAllowed` · `chooseSlot` · `moveSlot` · `clearSlot` ·
`recordOutcome` · `bookNannyCall` · `autofire`.

**What it may import.** `connections` · `placements` · `positions` · `call-layer` · `matching` · `app` ·
`scheduling` · `auth` (S) · `platform` (S) (01 §2.3). These edges are drawn top-down in the map but read as the
admin lever importing the module it moves (01 §2.2; R2) — the reverse would make `connections` depend on an admin
surface.

**⚠ The gate — the one section to read before using this module** (FIX-1, closing REVIEW-1's CRITICAL C-1; the
finding and its history are in `docs/review-sweep-160926.md` §2).

Authority is **session-derived and lives in one file**, `lib/gated-admin-actor.ts`:

1. `auth.requireRole('admin')` — the gate 01 §4d puts in `auth`, re-checked in the connector method and not only
   in middleware (07 §5.4 row 1). It refuses an admin session that never passed a second factor (row 2, Supabase
   `aal2`). Nothing here re-implements it; a locally-invented role test is what FIX-1 deleted.
2. `onBehalfOf` is **required** (07 §5.4 row 6; 03 §2.5): an on-behalf move that names no subject is refused
   before it moves, with `VALIDATION { reason: 'E_ON_BEHALF_OF_REQUIRED' }`.
3. The actor a lever runs with is **built from the session** — `{ kind: 'admin', id: <session user>, onBehalfOf }`.
   The `Actor` a caller passes is read for its `onBehalfOf` and for nothing else, so a caller can neither claim to
   be an admin nor name themselves as a different one.

`configureAdminOnBehalf` **wraps whatever inside it is handed** in that gate (`lib/gate-admin-on-behalf.ts`), so
no argument a boot file can pass reaches a lever ungated — `configureAdminOnBehalf(stubAdminOnBehalf())`, the
exact line REVIEW-1 said would hand full on-behalf power to anyone able to shape an `Actor`, is safe by
construction. Gating is idempotent, so the stub gating itself and the boot file gating again cost one session
read, not two. Refusals are `UNAUTHENTICATED` when there is no session and `FORBIDDEN` otherwise, both carrying
`{ reason: 'E_ACTOR_FORBIDDEN', which: 'session' | 'role' | 'mfa' | 'scope' }`; `listAllowed`, which 03 §2.5
gives no `Result`, refuses by offering no levers.

**Audit gap — recorded, not fixable here.** `onBehalfOf` now always reaches the module that owns the move,
`EventActor` carries it, and `events.on_behalf_of_id` exists (migration 0011). What does not exist is a
**writer**: no event sink persists an emitted actor's `onBehalfOf` into that column, because the stage slices
that emit (Phase 1e–1g) and the Postgres event sink are both unwritten. 07 §5.4 row 6 is therefore satisfied at
the connector and still owed at the sink. Whoever writes the sink owns it; it cannot be closed from inside this
module.

**What this module does _not_ do yet.** No `scheduling.book`-on-behalf path (it goes through
`call-layer.openNannyCall` here), no `app` levers, and no admin UI. `configureAdminOnBehalf` is not called
anywhere — that is `src/instrumentation.ts`, still absent.

**Suites.** `__tests__/admin-on-behalf.gate.test.ts` — the authority gate: no session, the wrong role, an admin
without MFA, the caller-written admin id that must not survive, the required `onBehalfOf`, and the seam that
cannot be configured into an ungated state (ADR-120). `__tests__/admin-on-behalf.swap.test.ts` — the same-move
property (a lever's result is the owning module's result), the session-driven refusal path, the levers rendered
from `positions.listAllowed`, and the fail-closed seam. `__tests__/admin-on-behalf.fail-closed.test.ts` — the
unconfigured registry default, reached by never calling `configureAdminOnBehalf`.

<!-- audit
Last edited: 2026-09-16T15:55+10:00 — BB-LDN-Planner-070926/FIX-1
Notes: the gate section rewritten — it is no longer absent. FIX-1 closes REVIEW-1's CRITICAL C-1: authority is
`auth.requireRole('admin')` (MFA enforced by `auth`, 07 §5.4 rows 1–2) in one file, applied to every lever by
`configureAdminOnBehalf`, with the actor rebuilt from the session and `onBehalfOf` required. The caller-supplied
`actor.kind === 'admin'` test is deleted. The `onBehalfOf` audit gap is narrowed to its real owner: the event
sink, which does not write `events.on_behalf_of_id` yet. Suites list gains the gate suite.
Prior: 2026-09-16T14:35+10:00 — BB-LDN-Planner-070926/F-a
Notes: initial authoring — the F-a connector, the delegating lever set, `stubAdminOnBehalf` and the swap test.
The admin gate (`auth.requireRole` + `mfaVerified`, 07 §5.4 row 2) is ADR-117 Tier A and is deliberately absent;
flagged here, in the stub, in the test header and in PROGRESS.
-->
