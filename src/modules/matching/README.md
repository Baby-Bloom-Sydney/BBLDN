# matching

**What it does.** Quick match (the public widget), advanced match, the results page, the pre-auth wizard, and the
`autofire` pre-check task (03 §7.4). **Candidate loading lives here**, not in `scoring`: the loader pre-filters
(verified ≥ `config.matching.minVerificationLevel`, not isolated, not on silent hold) and `scoring` re-checks, so
the rule has one home and a loader bug cannot silently widen a candidate set.

`autofire` is the T-1.4 level-2 pre-check: the caller runs it after the P-2 commit (`onboarding-parent`, in-app
create, `admin-on-behalf`) and the waves cron sweeps any `OPEN` position with no `precheck_fired_at`. Tiers do not
exist — one full-engine pre-check per position (ADR-012).

**Phase 1 `1b` gave the module an inside and three screens.** `createMatching({ auth })` loads the candidate set
from the `nanny_public` view (07 §5.2 — the only road from a visitor to a nanny; reachable through the port since
ADR-129), hands it to `scoring`, saves and reads the advanced-wizard lead (02 §4.7 `parent_leads`), and owns the
one Connect entry point of ADR-126. The screens are S-X-02 (`QuickMatchResults`), S-X-03 (`Wizard` over
`WIZARD_QUESTIONS`, one question per screen, progressive save) and S-X-04 (`PreAuthResults`); `NannyPreviewCard`,
`DbsBadge` and the ARIA `AreaCombobox` are reused by `public-site` on S-X-01 / S-X-10 / S-X-11.

**Connector** (`index.ts` + `types.ts`, written and reviewed before the inside — L2):

| Area        | Values                                                                                                               | Types                                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| The module  | `matching` (module binding) · `configureMatching` · `createMatching`                                                 | `Matching` · `AutofireOutcome` · `MatchingErrorDetails` · `MatchingResult`                          |
| The stub    | `stubMatching` (`matching.stub.ts`)                                                                                  | `StubMatchingSeed`                                                                                  |
| Nannies     | —                                                                                                                    | `PublicNanny` · `MatchCard` · `VerificationLevel`                                                   |
| Quick match | `buildQuickMatchPage` · `quickMatchSchedule`                                                                         | `QuickMatchInput` · `QuickMatchPage` · `QuickMatchDay` · `QuickMatchPart`                           |
| The wizard  | `WIZARD_QUESTIONS` · `AGE_LABELS` · `parseWizardAnswers` · `saveParentLeadAction` · `buildPreAuthPage`               | `WizardQuestion` · `WizardAnswers` · `WizardChild` · `ParentLead` · `SaveLeadInput` · `PreAuthPage` |
| Connect     | `connectAction`                                                                                                      | `ConnectInput` · `ConnectDecision` · `ConnectSurface`                                               |
| Routes      | `FUNNEL_PATHS`                                                                                                       | —                                                                                                   |
| Screens     | `FunnelShell` · `QuickMatchResults` · `PreAuthResults` · `Wizard` · `NannyPreviewCard` · `DbsBadge` · `AreaCombobox` | —                                                                                                   |

Methods on `Matching`: `autofire` · `quickMatch` · `preAuthMatch` · `resultsFor` (03 §10.1) — plus, from `1b`,
`listPublicNannies` · `getPublicNanny` · `saveLead` · `getLead` · `connect`. **Each of the five is a connector
extension** the foundations do not spell (03 §10.1 names only the four); they are raised for ratification in the
L-007 `1b` PROGRESS entry, amend-first, exactly as S4 raised `needsPasswordSetup`.

**Errors.** `matching` **forwards** the failures of `scoring` and `positions` unchanged — a distance failure fails
the whole call (03 §7.3), it never becomes an empty match. So `MatchingResult<T>` is a plain `Result<T>`, and
`MatchingErrorDetails` names only the reasons this module itself produces. `resultsFor` and `autofire` answer
`INTERNAL { reason: 'not-built' }` from the real inside until `1e` builds them — never a fabricated result.

**What it may import.** `positions` · `scoring` · `areas` (S) · `auth` (S) · `platform` (S) (01 §2.3). The edge
direction R2 fixed runs this way: `matching ──► positions`, never the reverse (fix: A-1). Its legal callers are
`public-site`, `onboarding-parent` and `admin-on-behalf` (03 §10.1).

**Named service-role uses (07 §5.1 rule 5).** `matching.readParentLeads` and `matching.saveParentLead` — the
`parent_leads` table is service-role only (02 §4.7); a visitor has no session to scope by. The candidate read
(`matching.loadPublicNannies`) is **session** scope: the view carries its own predicate and `anon` has SELECT on
it, so no bypass is named for it.

**The Connect entry point (ADR-126).** `connect(input)` decides by session: a guest → S-X-03's first question with
the nanny remembered (04 §3.3 (d), T-1.8d); a signed-in parent → S-P-07 where the in-app Connect lives (04 §6.1
S-X-11); another role → its own dashboard. The `positions.advance(K-1)` branch lands with `1g` (`04.12`) behind this
same entry point, so `public-site` never learns a second road.

**Recorded, not hidden.**

- **No keyed read on `Query` (03 §1.4).** `getPublicNanny` and `getLead` read the whole view / table and pick in
  memory — fine at the launch supply gate, and the thing a keyed read (a 03 §1.4 amendment) replaces. P1-WIRE hit
  the same gap for the consent store.
- **Boot wiring is P1-WIRE's.** Nothing calls `configureMatching(createMatching({ auth }))` in this unit
  (`src/instrumentation.ts` is owned elsewhere); until it does, every screen fails closed through the registry
  and shows its error state with a retry.
- **`silentHold` is `false` on the public read** (`05.04`, Phase 2) and `activeConnectionWithFamily` needs a
  position (03 §7.5) — both are re-checked by `scoring` once a loader can supply them.
- **Funnel events.** `lead.created` and `wizard.completed` are emitted server-side from `saveLead` with an
  anonymous actor (03 §9.3); the client seam for `results.viewed` / `profile.viewed` / `quick-match.run` is
  `platform`'s `track` (`02.24`), not built.

**What `1e` added.** `autofire` (03 §7.4): the position read through `positions.getForMatching`, the pool ranked
by `scoring.topN` at `config.matching.precheckN`, the lever written through `positions.recordPrecheck` and
`precheck.fired` emitted — the pre-check that makes the call promise level 2 (T-1.4, 04 §3.1 step 12).
`positionDetailOf` converts the shared question bank's answers into the position P-2 opens, so the one-go signup
and S-P-04 cannot drift; `Wizard` takes an optional `onComplete` + `header` + `submitLabel` so S-P-04 reuses the
same component rather than a second copy.

**`autofire` does not run the blast (recorded, `it.fails` in `matching.autofire.test.ts`).** §7.4 also has it
notify each ranked nanny with `precheck-nanny`. A `comms` `Recipient` needs an `Email`; the only nanny read this
module has is the marketplace-safe `nanny_public` (07 §5.2 — first name, no address), and no document authorises
a service-scope read of nanny contact details. It wants a recipient port wired at boot.

**Suites.** `__tests__/matching.swap.test.ts` (the connector swapped, `scoring` swapped underneath it) ·
`matching.inside.test.ts` (the view read, the snapshot mapping, quick + pre-auth through `scoring`, the lead's
progressive save, the Connect decisions, `not-built`) · `matching.screens.test.tsx` (S-X-02 / S-X-03 / S-X-04
states and a11y claims) · `matching.copy.test.ts` (05 §5.2 over every surface, no allowlist) ·
`matching.fail-closed.test.ts` · `matching.autofire.test.ts` (`1e`: the lever, the rail row, the `precheckN`
cap, `precheck.failed`, and the blast pinned).

<!-- audit
Last edited: 2026-09-17T18:10+10:00 — BB-LDN-Planner-070926/1e
Notes: 1e — `autofire` built (lever + ranking + `precheck.fired`; the blast pinned), `positionDetailOf`, the `Wizard` generalisation S-P-04 reuses.
Prior: 2026-09-17T15:40+10:00 — BB-LDN-Planner-070926/1b
Notes: 1b — the inside (`createMatching` over `nanny_public` + `parent_leads`), the five connector extensions raised for ratification, the ADR-126 entry point, S-X-02 / S-X-03 / S-X-04, the shared card / badge / combobox, the recorded gaps (keyed read, boot wiring, silent hold, client event seam).
Prior: 2026-09-16T14:35+10:00 — BB-LDN-Planner-070926/F-a — initial authoring: the F-a connector, `stubMatching` and the swap test; recorded gap: three derived method signatures.
-->
