# onboarding-parent

**What it does.** Parent signup — UK mobile + the promise line — and the post-signup route to the call page
(`03.36`). It calls `positions.advance(P-2)`, then `matching.autofire` after the commit (03 §7.4),
`areas.isInServiceArea`, and `comms.send(welcome-*)`. It owns no stage of its own.

**What it may import.** `config` (+ `config/server`), `shared-types`, `platform`, `auth`, `areas`, `comms`,
`call-layer`, `matching`, `positions` (01 §2.3 row). **Never `scheduling`** (03 §3.6 R3) — the slot picker is
`call-layer`'s.

**Connector.** Types only in this unit: `SignupSource` (03 §9.3's `signupSource` prop, values verbatim) and
`ParentWelcomeTemplate` (the three `welcome-parent*` templates of 03 §8.2 rows 1–3).

**Gaps (recorded, not hidden).**

1. **No signup action.** The foundations state what this module _calls_, not what it _exposes_; S-P-01 and
   its copy belong to `04 §3`, which this unit did not read. A connector method invented here would be an
   invented business rule.
2. **`signUp` cannot yet write the `user_profiles` row 02 §4.1 requires** — S4's recorded gap
   (`SignUpInput` carries no name, mobile or district). Whatever resolves it lands with the signup action.

<!-- audit
Last edited: 2026-09-16T13:55+10:00 — BB-LDN-Planner-070926/F-b
Notes: created at F-b — folder shape + the two stated types; no action invented, the surface waits on 04 §3.
-->
