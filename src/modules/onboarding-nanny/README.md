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
N5: the row the lead cookie names), `onboarding-nanny.patchLead` (N3 / N4 / S-N-19). Every account-side write is
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

**Gaps (recorded, not hidden).**

1. **N3's photo upload is S-N-17's** (`2d`; ADR-148 (1)). The funnel and the stepper carry no photo field.
2. **The AI bio (`02.05`) is a typed bio** (ADR-148 (2)); `nanny_leads.ai_*` stay unused until a provider is
   documented and its key is in Vercel.
3. **The positions board on S-N-11 is `2d`'s** (`07.29`; ADR-148 (3)); the hub's `open` state says so.
4. **S-N-22's line says "your family"** — `child-linking` has no nanny-keyed read for the linked family's name
   (`loadChildrenCard` answers only a parent); 04 §8's "{family}" waits on that read (`2d` / Phase 5). Draft ☐ (B-25).
5. **The nanny-mint pin** (`app/__tests__/child-linking.pins.test.ts`) stays RED and named: S-N-01 (the mint
   surface) is `2g`'s, so `2a` did not own it.
6. `start-invite-signup-action.ts` (`app`) sets the invite cookie by hand rather than through `carriedTokenCookie` —
   01 §2.3 gives `app` no arrow to `onboarding-nanny`; the helper belongs in `platform` when a third caller appears.
7. The N1 capture's "has-account" branch returns after one query where the write branches run two — a timing
   side-channel narrower than the per-address budget already bounds; recorded, not padded.
8. Three copies of the hashed rate-limit key helpers now exist (`api/_lib/ip-key.ts`, `onboarding-parent`, here) —
   the M-10 shape; one `platform/rate-limit` helper then a mechanical pass, for the checkpoint.

<!-- audit
Last edited: 2026-09-18T09:40+10:00 — BB-LDN-Planner-070926/2a
Notes: the inside built (L-008 2a): funnel + signup + profile + hub + portal; stores, adapters, service-role uses named; gaps 1–6.
Prior: 2026-09-16T13:55+10:00 — BB-LDN-Planner-070926/F-b
Notes: created at F-b — folder shape + the two stated types; the funnel waits on 04 §4. The "never scheduling" rule is stated here because it is the arrow most likely to be re-added by hand.
-->
