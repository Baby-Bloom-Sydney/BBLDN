# onboarding-nanny

**What it does.** The nanny apply funnel, registration, profile completeness, and the invited-nanny isolation
/ apply-from-portal pair (ADR-017, ADR-058). S-N-02 books the commission call through
`call-layer.openNannyCall`.

**What it may import.** `config` (+ `config/server`), `shared-types`, `platform`, `auth`, `areas`, `comms`,
`call-layer`, `verification` (01 §2.3 row). **Never `scheduling`** (03 §3.6 R3) — this is the arrow the fix
pass removed, and the boundary lint now enforces it.

**Connector.** Types only in this unit: `NannyApplyPath` (03 §9.3's `path` prop of `nanny.applied`, values
verbatim) and `NannyWelcomeTemplate` (03 §8.2 row 4).

**Gaps (recorded, not hidden).**

1. **No apply funnel.** S-N-01…S-N-03 and their copy are `04 §4`'s, which this unit did not read.
2. **Isolation lift** (`nannies.isolated`, I-5 of 03 §2.6) is a stage-model write and belongs with the
   funnel, not with a type file.

<!-- audit
Last edited: 2026-09-16T13:55+10:00 — BB-LDN-Planner-070926/F-b
Notes: created at F-b — folder shape + the two stated types; the funnel waits on 04 §4. The "never scheduling" rule is stated here because it is the arrow most likely to be re-added by hand.
-->
