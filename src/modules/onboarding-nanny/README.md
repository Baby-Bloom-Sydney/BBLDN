# onboarding-nanny

**What it does.** The nanny apply funnel (S-X-15…S-X-19; 04 §4.1 rows 1–7), the invite-path account form (S-X-07),
the ten-step profile completion (S-N-18; `03.17` / `03.18`), the hub's three states (S-N-11, S-N-22 being the
isolated one) and apply-from-portal (S-N-19; `02.07`) — ADR-017, ADR-058, and the `2a` rulings ADR-147…ADR-152.
S-N-02 books the commission call through `call-layer.openNannyCall` (`2g`, not this unit).

**What it may import.** `config` (+ `config/server`), `shared-types`, `platform`, `auth`, `areas`, `comms`,
`call-layer`, `verification` (01 §2.3 row). **Never `scheduling`** (03 §3.6 R3) — the boundary lint enforces it.

**Connector.** Types (`types.ts`); the two store bindings + their `configure*` hooks and memory doubles; six
actions (`saveNannyApplication` · `saveNannyPortfolio` · `saveNannyBio` · `signUpNanny` · `applyFromPortal` ·
`saveNannyProfileStep`); two server reads (`loadNannyHub` · `loadNannyProfile`); the carried-token cookie helper
(ADR-150); the pure lists (`FUNNEL_STEPS` · `PROFILE_STEPS`) and the completeness rule; five screens.

**Data handled** (07 §3): class **M** (`nanny_leads` — S3: name, email, mobile, district, right-to-work status,
the DBS yes/no, years, age bands, role types, availability, rate band, bio) and class **A/B** (`nannies`,
`user_profiles`, `nanny_contact_state` — S2/S3). Nothing S4: the funnel asks _whether_ she holds an Enhanced DBS
certificate and _which_ right-to-work status she has; the evidence is `verification`'s (`2b`), never captured here.

**Service-role use, named (07 §5.1 rule 5).** `nanny_leads` is service-role only, so the lead capture runs at
service scope: `onboarding-nanny.captureLead` (S-X-15 page 8 and S-N-19: reads `user_profiles.email` for the
"sign in instead" answer, reads / inserts / updates one `nanny_leads` row), `onboarding-nanny.readLead` (N3 / N4 /
N5: the row the lead cookie names), `onboarding-nanny.patchLead` (N3 / N4 / S-N-19), and — since `2d` — `onboarding-nanny.readLeadSignal`: one
boolean off her own lead row (`lead_signals.under_three`), for S-N-01's active / passive variant (kickoff debt 14;
04 §4.1 row 8). It is asked only when the account carries a `lead_id`, it answers nothing else off that row, and
a refusal leaves the signal absent so the screen reads the active wording. Every account-side write is
one of `0021`'s definers at **session** scope (`create_nanny_account` · `update_nanny_profile` ·
`lift_nanny_isolation` — ADR-152), and the profile read is the nanny's own rows under RLS. The adapters live in
`src/boot/db-nanny-lead-store.ts` and `src/boot/db-nanny-account-store.ts`; boot binds both in
`src/boot/wire-nanny-onboarding.ts`.

**Rate limits consumed** (07 §8): row 2 — `funnelStep` on every anonymous funnel step and on S-N-19,
`signupPerEmail` + `signupPerIp` on both signup roads; row 16 — `funnelLeadPerEmail` on the N1 capture (the
"sign in instead" answer bounded per address) and `profileSteps` on every S-N-18 write (per user). All fail
closed on a limiter outage (ADR-134).

**Isolation (ADR-147).** `nannies.is_isolated` records _not having applied_: `/apply` creates the row with `false`,
S-X-07 (with or without an invite) with `true`; only `lift_nanny_isolation()` clears it, called by
`applyFromPortalAction`. Pool visibility is the reads' conjunction with the verification level — this module never
reads or writes the level.

**`create_nanny_account()` at service scope (ADR-163; `2c`).** REVIEW-3 measured that a nanny's own session could
call the definer with `p_isolated = false` and skip the apply road, so `0023` made it `service_role` only, acting
for `p_user_id`: `signUpNanny` passes the user id `auth.signUp` just minted and decides `isolated` by road (`/apply`
→ `false`, S-X-07 → `true`); the boot adapter's `create` runs at service scope — a named use (07 §5.1 rule 5). The
profile and isolation writes stay at session scope.

**Gaps (recorded, not hidden).**

1. **N3's photo upload is still open.** ADR-148 (1) parked it on S-N-17; `2d` built S-N-17 as a **view** over
   S-N-18's ten steps (04 §6.3's two states and one exit), so there is no second write road on it to hang an
   upload from — the photo belongs to a new S-N-18 step, with `07 §5.3`'s signed-URL rules and an upload cap.
   Owner: the unit that takes `07 §5.3` for nanny photos (Phase 4). The funnel and the stepper carry no photo
   field today, and `nanny_public.profile_picture_object` is therefore null for every London nanny.
2. **The AI bio (`02.05`) is a typed bio** (ADR-148 (2)); `nanny_leads.ai_*` stay unused until a provider is
   documented and its key is in Vercel.
3. **The positions board on S-N-11 is NOT built, and is not `2d`'s** (`07.29`; ADR-148 (3)). `2d`'s scope was
   S-N-17 and S-N-21; `07.29` is the job-search module behind S-N-12's positions read, which S-N-17 and S-N-21
   do not touch — neither screen reads a position, a connection or a placement. Re-owned: **Phase 4**, with
   S-N-12…S-N-16. The hub's `open` state still says so in its own words.
4. **S-N-22's line says "your family"** — `child-linking` has no nanny-keyed read for the linked family's name
   (`loadChildrenCard` answers only a parent); 04 §8's "{family}" waits on that read (Phase 5 — it is a
   `child-linking` read, not a profile one, so `2d` did not close it). Draft ☐ (B-25).
5. ~~**The nanny-mint pin**~~ — **closed by `2g`**: S-N-01 is built in `app/child-linking` and the pin is
   flipped by behaviour (see that module's README).
6. `start-invite-signup-action.ts` (`app`) sets the invite cookie by hand rather than through `carriedTokenCookie` —
   01 §2.3 gives `app` no arrow to `onboarding-nanny`; the helper belongs in `platform` when a third caller appears.
7. The N1 capture's "has-account" branch returns after one query where the write branches run two — a timing
   side-channel narrower than the per-address budget already bounds; recorded, not padded.
8. Three copies of the hashed rate-limit key helpers now exist (`api/_lib/ip-key.ts`, `onboarding-parent`, here) —
   the M-10 shape; one `platform/rate-limit` helper then a mechanical pass, for the checkpoint.

**S-N-02 (`2g`; `03.37` NEW; 04 §4.4 c2 / c3).** `/nanny/commission` is `loadCommissionPage` + `NannyCommissionPage`:
the explainer (no figure — D0.2; no ledger, no payout, no bonus — N-2 / ADR-099) and the book-a-call section on
the same page. The calendar is reached **only** through `call-layer` (`listSlots` / `openNannyCall`, R3) and the
picker is `call-layer`'s S-P-02 reused, not forked (04 §6.2). The hub (S-N-11) gained the two links to S-N-01 and
S-N-02; an isolated nanny (S-N-22) sees neither, and `loadCommissionPage` answers `isolated` so the page says the
same thing the hidden link does (ADR-147).

9. ~~**S-N-01's active / passive variant**~~ — **closed by `2d`** (kickoff debt 14): `nannyAccountStore.get()`
   answers `worksWithUnderThrees` off her own lead row and `addChildPitchCopy` chooses the words (see the `app`
   README). Absent still means active.
10. **Closing an account is a conversation, not a road.** S-N-21's "Close your account" points at `/contact`;
    nothing deletes a nanny account in code, and 07 §6's retention schedule is what the person on the other end
    follows. Owner: the erasure unit (Phase 3, with `10.39` / `10.01`).
11. **S-N-17 has no "hide me from families" switch.** `nannies.profile_visible` is the database's own
    completeness answer (`03.18`), not a preference, and nothing in 04 §6.3 gives her a control over it. If she
    should be able to pause herself, that is a document change first.

**S-N-17 and S-N-21 (`2d`; `03.22` / `03.24` Rejig).** `/nanny/profile` is `loadNannyProfilePage` +
`NannyMyProfile`, `/nanny/settings` is `loadNannySettings` + `NannySettings`; both read her own rows and
`verification.getStatus`, and nothing else. Four things are deliberate. **S-N-17 is a view, not a second
editor** — 04 §6.3 gives it two states and one exit (incomplete → S-N-18), so every "Edit" is a link into the
stepper at the step that owns the field and `update_nanny_profile()` keeps its one caller. **S-N-21's contact
fields are S-N-18's own location step**, rendered in place through `saveNannyProfileStepAction` — one schema,
one action, one 07 §8 row 16 ceiling, no second road. **The commission pay section is dropped** (N-2; T-2.5):
no payout, no ledger, no figure, asserted. And **neither screen names the hold** (ADR-157): every word either
one says about verification comes from `nannyVerificationSummary`, whose whole input is the level `getStatus`
answered — read, never derived — and the four section statuses, so a held nanny at L3 reads exactly what a
nanny mid-check reads. `onboarding-nanny.my-profile.test.ts` sweeps every level × every section status for the
words.

<!-- audit
Last edited: 2026-09-19T14:10+10:00 — BB-LDN-Planner-070926/2d
Notes: S-N-17 + S-N-21 built (03.22 / 03.24 Rejig) — the two loaders, the two pure views and the one
verification summary that never names the hold; gap 1 re-scoped (the photo wants an S-N-18 step, not S-N-17),
gap 3 re-owned to Phase 4 with S-N-12 (07.29 is a positions read neither screen makes), gap 9 closed, gaps
10-11 recorded. The Sydney nanny profile screen moved to its one remaining caller, the admin viewer.
Prior: 2026-09-19T12:30+10:00 — BB-LDN-Planner-070926/2d
Notes: the fourth named service-scope read (`readLeadSignal`) — the under-3 signal off her own lead row for
S-N-01's variant (kickoff debt 14); `NannyProfile.worksWithUnderThrees`, absent meaning "we do not know".
Prior: Last edited: 2026-09-18T19:30+10:00 — BB-LDN-Planner-070926/2c
Notes: 2c — create_nanny_account at service scope with p_user_id (ADR-163); nothing else.
Prior: 2026-09-18T16:20+10:00 — BB-LDN-Planner-070926/2g
Notes: S-N-02 built (L-008 2g) — the explainer + book-a-call section over call-layer, the hub's two pitch links, gap 5 closed by 2g, gap 9 (the under-3 variant) recorded.
Prior: 2026-09-18T09:40+10:00 — BB-LDN-Planner-070926/2a
Notes: the inside built (L-008 2a): funnel + signup + profile + hub + portal; stores, adapters, service-role uses named; gaps 1–6.
Prior: 2026-09-16T13:55+10:00 — BB-LDN-Planner-070926/F-b
Notes: created at F-b — folder shape + the two stated types; the funnel waits on 04 §4. The "never scheduling" rule is stated here because it is the arrow most likely to be re-added by hand.
-->
