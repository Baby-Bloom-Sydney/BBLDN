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

**⚠ The gate is missing on purpose — this is the one boundary to read before using this module.** Every method
takes the admin `Actor` explicitly instead of reading a session, so the role check has exactly one home. That home
is `auth.requireRole('admin')` with the `mfaVerified` (`aal2`) requirement of 07 §5.4 row 2 — an auth surface,
which ADR-117 puts in **Tier A** (inline security review) and which this Tier B unit therefore did not write.
`stubAdminOnBehalf`'s `actor.kind === 'admin'` test is a **shape, not a gate**: it trusts the `Actor` it is
handed. Nothing may wire this module to a request until the real gate is in front of it. Recorded in the L-005
F-a PROGRESS entry as the item that hit Tier A.

**What this module does _not_ do yet (F-a boundaries).** Beyond the gate: no `onBehalfOf` enrichment of the actor
before it reaches `advance` (03 §2.5 records it on the event), no `scheduling.book`-on-behalf path (it goes
through `call-layer.openNannyCall` here), no `app` levers, and no admin UI. `configureAdminOnBehalf` is not called
anywhere — that is `src/instrumentation.ts`, still absent.

**Suites.** `src/modules/admin-on-behalf/__tests__/admin-on-behalf.swap.test.ts` — the same-move property (a
lever's result is the owning module's result), the refusal path, the levers rendered from `positions.listAllowed`,
and the fail-closed seam.

<!-- audit
Last edited: 2026-09-16T14:35+10:00 — BB-LDN-Planner-070926/F-a
Notes: initial authoring — the F-a connector, the delegating lever set, `stubAdminOnBehalf` and the swap test.
The admin gate (`auth.requireRole` + `mfaVerified`, 07 §5.4 row 2) is ADR-117 Tier A and is deliberately absent;
flagged here, in the stub, in the test header and in PROGRESS.
-->
