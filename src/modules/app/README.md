# app

**What it does.** The paid product (ADR-019; 00-glossary §3) — three sub-modules, each a folder with its own
`index.ts` (01 §2.5):

| Sub-module          | What it owns                                                                                                                                                                   | State today                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| `child-linking`     | children, invites, the family ↔ nanny link; calls `payments.startTrial` on a self-serve family's first child (ADR-093); records the link consents (`platform/consent`, 02 R-4) | connector + fail-closed reads |
| `child-development` | the child's feed and milestones; `feed-post` (03 §8.2 row 36)                                                                                                                  | types only                    |
| `katie`             | the assistant; tools re-check access per call, cost cap, proactive + daily compaction (Phase 4)                                                                                | types only                    |

**Connector** (`index.ts` + `types.ts` — L2). The outside imports `@/modules/app` and nothing deeper; the parent
re-exports the three sub-module vocabularies plus the one runtime surface that exists today.

| Area          | Values                                   | Types                                                    |
| ------------- | ---------------------------------------- | -------------------------------------------------------- |
| Child linking | `childLinking` · `configureChildLinking` | `ChildLink` · `ChildLinkingReads` · `ChildLinkingResult` |
| Feed          | —                                        | `FeedPost` · `FeedAuthor`                                |
| Katie         | —                                        | `KatieScope` · `KatieTurn` · `KatieJobName`              |
| The stub      | `stubApp` (`app.stub.ts`)                | `StubAppSeed` · `AppSubModule` · `AppResult`             |

**What it may import.** `comms` (S) · `auth` (S) · `platform` (S) (01 §2.3).

**RLS scope (01 §6.3).** None yet — this unit writes no query. When the inside lands, every child read and write
goes through `user_has_child_access` and the invite RPC is the **only** anon path (07 §10.1 row `app/*`); no
`scope: 'service'` opt-out is expected on this module, and any that appears must be named here.

**Fail-closed default.** `childLinking` answers `INTERNAL { reason: 'child-linking-not-configured' }` until boot
wires it. That is deliberate: the youngest linked child's date of birth is what bounds a family's access
(ADR-083 / 084), so a confident "no children" from an unconfigured module would silently mis-bound every grant.

**What this module does _not_ do yet (F-c boundaries).** No screens, no Katie tools, no feed, no invites, no
consent calls — all Phase 4 and beyond. **Recorded gaps** (L-005 F-c PROGRESS entry): no foundation section
states a connector signature for `katie` or `child-development`, so both ship as types only rather than as
invented interfaces; and `ChildLinkingReads.youngestChildDateOfBirth` is a **provisional** shape — ADR-083 / 084
state the rule and 03 §5.2 puts `accessUntil` on `AccessState`, but no section names the method that computes it.

**S-N-01 (`2g`; 04 §4.4 c1).** `child-linking` now owns the nanny's "add a family you already work for" surface:
`NannyAddChildPitch` (London copy — no bonus, no figure, ADR-099 / N-2) over `addFamilyChildAction`, which is
one submit for one decision — the AGR-14 guardian tick, the unclaimed child, the AGR-14 record against that
child, and the `nanny_to_parent` token, in that order. **The nanny-mint pin is flipped** (kickoff debt 8):
`ChildFacts` carries `0019`'s `created_by_user_id`, `mayMint`'s `nanny_to_parent` arm reads it beside the links,
`invite-methods` passes it, and `createChild` gained the unclaimed branch (`child-creator-of.ts`). Neither the
trial nor the access window moves on that branch — there is no family until the token is claimed.

**The ADR-142 pass (`2g`).** 0 CRITICAL · **1 HIGH** (`addFamilyChildAction` had no limiter: a `"use server"`
export doing three writes, with idempotency on the mint but **not** on the creation) · 0 MEDIUM · **1 LOW** (the
`dateOfBirth` cast — a malformed value is `NaN` in `ageInMonths`, and `NaN >= cap` is `false`, so the age cap
passed silently and the `date` column was the only refusal). Both closed in-unit, RED first: 07 §8 gains **row
17** (amend-first) and `SECURITY.rateLimits.childAdds` (user, 10 / day, fails closed) consumed before any write;
`lib/is-iso-date.ts` validates the day at the boundary, round-tripped so `2025-02-30` is refused too.

**Recorded, for the planner.** 03 §9.3's event taxonomy has **no name** for "a nanny added an unclaimed child",
and it is append-only, so `2g` emits none rather than borrowing `app.family-in` (whose subject is a parent who
does not exist yet). The observable fact is the `invite.sent` that follows one line later. Owner: 03 §9.3.

**Suites.** `app.swap.test.ts` (the fail-closed default and the youngest-child read over `stubApp`) ·
`child-linking.nanny-mint.test.ts` (S-N-01's rules end to end) · `child-linking.add-family-child.test.ts` (the
action: the tick, the order, every refusal).

**S-N-01's active / passive variant (`2d`, kickoff debt 14).** `addChildPitchCopy(worksWithUnderThrees)` is the
whole of it: two frozen sets of words, chosen by the under-3 signal N1 captured and never shows her (04 §4.1
row 5), which `nannyAccountStore.get()` now answers off her own lead row. Two rules are pinned in
`child-linking.add-child-variant.test.ts` — **active is the default** (`undefined` means "we do not know", which
is every account made before the funnel captured the signal and every invited nanny, who has no lead at all), and
**neither variant is a gate** (the form, the heading and the offer are identical; only the framing moves).

<!-- audit
Last edited: 2026-09-19T12:35+10:00 — BB-LDN-Planner-070926/2d
Notes: S-N-01's active / passive variant built (kickoff debt 14) — `addChildPitchCopy`, the two rules pinned.
Prior: Last edited: 2026-09-18T16:20+10:00 — BB-LDN-Planner-070926/2g
Notes: S-N-01 built (L-008 2g) — the pitch, `addFamilyChildAction`, AGR-14, the ADR-142 pass's HIGH + LOW closed (07 §8 row 17 + the boundary date parse); the nanny-mint pin flipped by behaviour (ChildFacts.createdByUserId, mayMint, invite-methods, createChild's unclaimed branch). The missing event name recorded for 03 §9.3.
Prior: 2026-09-16T16:15+10:00 — BB-LDN-Planner-070926/F-c
Notes: initial authoring — the parent connector, the three sub-module folders, `stubApp` and the swap test.
-->
