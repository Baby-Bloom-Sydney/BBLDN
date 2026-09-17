# scoring

**What it does.** The match engine's connector (03 §7): the three-layer score — quality base, hard-requirement
penalties, over-qualified bonuses — mapped to a display range, and `topN`, the one pre-check list autofire fires
at (ADR-012). The same pipeline serves the authenticated position, the pre-auth lead form and the public quick
match. **Scoring is pure**: no stage move, no message, no row, no `Date.now()` (03 §7.1, §7.3).

`scoring/distance` is the swappable underneath it: plain great-circle today, transport-reach later (T-4.2, N-8).
Only `distanceKm` and the location points move when it is replaced.

**Connector** (`index.ts` + `types.ts`, written and reviewed before the inside — L2):

| Area       | Values                                          | Types (`types.ts`)                                                                   |
| ---------- | ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| The engine | `scoring` (module binding) · `configureScoring` | `Scoring` · `ScoringDeps` · `MatchingConfig`                                         |
| Inputs     | —                                               | `PositionInput` · `Candidate` · `LeadForm` · `Requirements` · `Schedule` · `AreaRef` |
| Outputs    | —                                               | `Ranked` · `Layers` · `Excluded` · `ExclusionReason` · `QuickMatchResult`            |
| The stub   | `stubScoring` (`scoring.stub.ts`)               | `ScoreResult` · `ScoreErrorDetails`                                                  |
| `distance` | `haversineProvider` · `stubDistanceProvider`    | `DistanceProvider` · `DistanceFixtures`                                              |

Methods: `scorePosition` · `quickMatch` · `preAuthMatch` · `topN` (03 §7.2).

**Errors** (03 §7.3): `VALIDATION { reason: 'invalid-input' }` (schema, `n <= 0`, an age label not in config) ·
`PROVIDER_ERROR { reason: 'distance-failed' }` (the whole call fails — never a silent middle score) ·
`INTERNAL { reason: 'scoring-not-configured' }`. `details.layer` / `details.nannyId` narrow a failure to where it
happened.

**What it may import.** `config` · `shared-types` · `areas` (S) · `platform` (S) — nothing else (03 §7.5).
Candidate loading is `matching`'s; `activeConnectionWithFamily` arrives on `positions.getForMatching`.
`scoring/distance` is reached from outside only through `scoring/index.ts`.

**Two deviations from 03 §7.2, both deliberate and both recorded in the L-005 F-a PROGRESS entry.**

1. **The four engine functions return `Promise<Result<…>>`, not `Result<…>`.** The contract writes them
   synchronous while `DistanceProvider.distanceKm` is `Promise`-returning — a synchronous function cannot await
   its own distance provider, so the contract as written is not implementable. The async shape is the only one
   that is; the owning section (03 §7.2) should be amended to match.
2. **`RoleType` is left as an open string.** 03 §7.2 names it inside `Requirements`, but no foundation section,
   02 enum or `config` key states its values. Narrowing it here would be inventing a business rule.

**Boot wiring — and the gap this unit leaves.** `scoring` fails closed until `configureScoring` installs an
engine, because the three-layer engine is Phase 1 and a default that answered would put a made-up score on a
parent's results page. Nothing calls `configureScoring` yet — that belongs in `src/instrumentation.ts`, which
this repo still does not have (S4's recorded gap).

**What this module does _not_ do yet (F-a boundaries).** No engine: no layer maths, no distance brackets applied,
no schedule curve, no qualification ladder reading, no `createScoring`. `stubScoring` honours the parts of the
contract callers depend on (exclusion order, ordering and tie-break, `topN` as a prefix, distance failure
propagation, determinism) and nothing more — it is not a cheap engine and must not be mistaken for one.

**Suites.** `src/modules/scoring/__tests__/scoring.swap.test.ts` — swap test 6 (03 §11): the engine swapped, the
distance provider swapped underneath it, the fail-closed seam, and the table test over `MATCHING` (brackets
ascending, weights sum to one).

**The engine (Phase 1 `1b`, row `04.01`).** `createScoring(deps)` is the three-layer engine of 03 §7.1: quality
base (location × schedule × experience × role fit × qualifications × support fit, `MATCHING.weights`) ×
requirement penalties (floored at `penaltyFloor`, unmet keys reported) × over-qualified bonuses (capped at
`bonusCap`, names reported), mapped to `displayRange`; exclusions before any layer; ordered score desc, distance
asc, `nannyId`; a failed distance fails the whole call. Role fit and support fit read the snapshot's `attributes`
only — the `RoleType` vocabulary is still the recorded gap above, so they score full marks with no stated need and
the floor with one. `__tests__/scoring.engine.test.ts` pins each claim.

<!-- audit
Last edited: 2026-09-16T14:20+10:00 — BB-LDN-Planner-070926/F-a
Notes: initial authoring — the F-a connector, `scoring/distance` (haversine + stub), `stubScoring` and swap
test 6. Two recorded contract deviations (async engine signature; open `RoleType`) and the no-engine boundary.
-->
