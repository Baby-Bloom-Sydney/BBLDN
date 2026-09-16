# admin

**What it does.** The **eight** admin panels (00-glossary §3; 01 §2.3) — `call-queue` · `calendar` ·
`positions-panel` · `pipeline` · `leads` · `users` · `support` · `guarantees`. ADR-074 added the calendar (it
shares `/admin/calls` with the queue, because the list and the calendar are one screen — S-A-03); ADR-088 added
`guarantees` (S-A-29). Each panel is a sub-module folder with its own `index.ts`; the outside imports
`@/modules/admin` and nothing deeper (01 §2.5).

| Panel             | Route               | Screens (04 §6.4)               |
| ----------------- | ------------------- | ------------------------------- |
| `call-queue`      | `/admin/calls`      | S-A-03 · S-A-04                 |
| `calendar`        | `/admin/calls`      | S-A-03                          |
| `positions-panel` | `/admin/positions`  | S-A-05 · S-A-06                 |
| `pipeline`        | `/admin/pipeline`   | S-A-12                          |
| `leads`           | `/admin/leads`      | S-A-13                          |
| `users`           | `/admin/users`      | S-A-14 · 15 · 16 · 18 · 19 · 22 |
| `support`         | `/admin/support`    | S-A-20                          |
| `guarantees`      | `/admin/guarantees` | S-A-29                          |

**Connector** (`index.ts` + `types.ts` — L2): `ADMIN_PANELS` (the set, assembled from the eight descriptors so a
folder and the list can never disagree) plus each panel's own descriptor; types `AdminPanel` · `AdminPanelName`.

**What it may import.** `admin-on-behalf` · `admin-verification` · `call-layer` · `positions` · `connections` ·
`placements` · `payments` · `app` · `scheduling` · `auth` (S) · `comms` (S) · `platform` (S) (01 §2.3) —
**through their connectors only, never a table** (fix: A-11 / A-24). The money panels (S-A-10 / 18 / 19 / 29)
read `payments` only, never `purchase-paths` (03 §5.5).

**Security scope (07 §5.4, §10.1).** `is_admin()` is re-checked in **every** admin action and connector method,
not only in middleware; `requireRole('admin')` also requires `mfaVerified` (aal2), so an admin action gets the
MFA check even when the middleware did not run. Every on-behalf write carries `actor admin` + `onBehalfOf`. CSV
and export actions are rate-limited and logged (07 §8 row 14).

**What this module does _not_ do yet (F-c boundaries).** No panel insides, no screens, no queries. **Recorded
gap** (L-005 F-c PROGRESS entry): 03 §10.1 lists the connector methods `admin` calls as one set for the whole
module and no section splits them per panel, so each panel ships its descriptor and its types rather than an
invented read interface.

**Suites.** `src/modules/admin/__tests__/admin.swap.test.ts` — the panel set: eight, named, each with the route
and screens 04 §6.4 gives it, and no panel missing from the set.

<!-- audit
Last edited: 2026-09-16T16:25+10:00 — BB-LDN-Planner-070926/F-c
Notes: initial authoring — the parent connector, the eight panel folders and the panel-set test.
-->
