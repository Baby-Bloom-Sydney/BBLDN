# public-site

**What it does.** The public pages: home, about, pricing, contact, browse, nanny profile and the legal pages.
It owns the browse **Connect** action (K-1) — through the `connections` stage-model connector, never by
writing a stage itself — and sends the contact form through `comms`.

**What it may import.** `config` (+ `config/server`), `shared-types`, `platform`, `auth`, `areas`, `comms`,
`connections`, `matching` (01 §2.3 row). **Never `scheduling`** (03 §3.6 R3).

**Connector.** Types only in this unit: `ResultsSurface` (03 §9.3's `surface` prop of `results.viewed`,
values verbatim) and `ContactTemplate` (03 §8.2 rows 37–40, `replyTo` = the submitter).

**Gaps (recorded, not hidden).**

1. **No pages, no Connect action, no `/api/areas`.** The screen inventory is `04`'s and the thin route files
   are F-c's; both are outside this unit.
2. **Eight legacy client components still fetch `/api/sydney-postcodes`** and swallow the 404 into an empty
   list (recorded in `docs/build-progress.md` since S1). They are legacy-tree files, not this module.

<!-- audit
Last edited: 2026-09-16T13:55+10:00 — BB-LDN-Planner-070926/F-b
Notes: created at F-b — folder shape + the two stated types; pages and routes wait on 04 and F-c.
-->
