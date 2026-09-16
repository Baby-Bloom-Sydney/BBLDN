# matching

**What it does.** Quick match (the public widget), advanced match, the results page, the pre-auth wizard, and the
`autofire` pre-check job (03 §7.4). **Candidate loading lives here**, not in `scoring`: the loader pre-filters
(verified ≥ `config.matching.minVerificationLevel`, not isolated, not on silent hold) and `scoring` re-checks, so
the rule has one home and a loader bug cannot silently widen a candidate set.

`autofire` is the T-1.4 level-2 pre-check: the caller runs it after the P-2 commit (`onboarding-parent`, in-app
create, `admin-on-behalf`) and `dfy-waves` sweeps any `OPEN` position with no `precheck_fired_at`. DFY tiers do
not exist — one full-engine pre-check per position (ADR-012).

**Connector** (`index.ts` + `types.ts`, written and reviewed before the inside — L2):

| Area       | Values                                            | Types                                     |
| ---------- | ------------------------------------------------- | ----------------------------------------- |
| The module | `matching` (module binding) · `configureMatching` | `Matching` · `AutofireOutcome`            |
| The stub   | `stubMatching` (`matching.stub.ts`)               | `MatchingErrorDetails` · `MatchingResult` |

Methods: `autofire` · `quickMatch` · `preAuthMatch` · `resultsFor`.

**Errors.** `matching` **forwards** the failures of `scoring` and `positions` unchanged — a distance failure fails
the whole call (03 §7.3), it never becomes an empty match. So `MatchingResult<T>` is a plain `Result<T>`, and
`MatchingErrorDetails` names only the reasons this module itself produces.

**What it may import.** `positions` · `scoring` · `areas` (S) · `platform` (S) (01 §2.3). The edge direction R2
fixed runs this way: `matching ──► positions`, never the reverse (fix: A-1). Its legal callers are `public-site`,
`onboarding-parent` and `admin-on-behalf` (03 §10.1).

**A derived signature, recorded as a gap.** `autofire(positionId, actor)` is spelled in 03 §7.4. The other three
methods are named in 03 §10.1 only as the calls `matching` makes **on `scoring`**; their `matching`-side
signatures are derived here — the same arguments minus the candidate list, because `matching` loads its own. The
owning section should confirm them.

**What this module does _not_ do yet (F-a boundaries).** No loader (it needs the nanny tables, S5), no
`positions.recordPrecheck` write, no `comms.sendMany(precheck-nanny)` blast, no wave or expiry handling, no
`precheck.fired` / `precheck.failed` emission. `stubMatching` takes the candidate list from its caller and
delegates every exclusion to `scoring` — so the filtering rule is not duplicated even in the stub — and reports
what it ranked without writing anything.

**Suites.** `src/modules/matching/__tests__/matching.swap.test.ts` — the inside swapped and `scoring` swapped
underneath it: quick match, pre-auth, an unknown position, what `autofire` reports (the props `precheck.fired`
carries), exclusions counted rather than dropped, and a `scoring` failure forwarded unchanged.

<!-- audit
Last edited: 2026-09-16T14:35+10:00 — BB-LDN-Planner-070926/F-a
Notes: initial authoring — the F-a connector, `stubMatching` and the swap test. Recorded gap: three derived
method signatures (03 §10.1 names them only as calls onto `scoring`).
-->
