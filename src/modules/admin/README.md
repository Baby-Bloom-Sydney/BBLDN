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

**Built (`1f`): `call-queue` and `calendar` — S-A-03 and S-A-04.** The call list is
`scheduling.listSchedule` decorated per row from the `positions` connector (03 §3.6: "scheduling returns ids,
`admin` decorates"), grouped overdue / due / upcoming / waiting-for-a-time / done. `due` is taken from
`scheduling`, which computes it at read (I-12), and is never recomputed here; a `no-answer` row sits with the
calls still waiting for a time, because that is where the call went (R5; ADR-073). Every write goes through
**`admin-on-behalf`'s gated levers** — mark done with an outcome from 03 §2.7's enum, no answer (which
`call-layer` turns into C-5, not C-3), move, clear, book on her behalf — so the session is what grants the
authority and `onBehalfOf` is stamped on the event (FIX-1; 07 §5.4 rows 1–2, 6). The calendar half blocks time
and reports how many calls the block **flagged**; it cancels none (I-4 / ADR-077).

The F-c gap this README recorded — that no section states a panel's read signature — is closed for these two by
building them: `call-queue/types.ts` and `calendar/types.ts` derive their shapes from 04 §6.4's rows and 03
§3.2's `CallListItem`, cited per field. The other six panels still carry their descriptors alone.

**Two things S-A-03 / S-A-04 state on the screen rather than hide.** (1) A call that has **never** had a
booking is not listed: 03 §3.6 says awaiting-slot calls "come from `call-layer`", 03 §2.7's `CallLayer` has no
method that enumerates them, and the call mirror has no table (02 R-1 is `bookings`). (2) Lifting a block is
not available — see `scheduling`'s README gap 1. (3) The family's **name and number** are not on the drawer:
04 §6.4 asks for "parent + contact", `admin` may not read a table (fix: A-11 / A-24) and neither `auth` nor
`positions` exposes a person by id. All three are owed, none is faked.

**`callTimelineRows` is built and exported, not mounted.** S-A-19 is keyed on a `userId` and
`scheduling.listForSubject` on a position; no connector answers "which positions does this parent have", so
`1g` mounts it where a position id is already in hand (S-A-06).

**Suites.** `admin.swap.test.ts` — the panel set: eight, named, each with the route and screens 04 §6.4 gives
it. `admin.call-queue.test.ts` — grouping, the state derivation, the decoration, the three read outcomes, and
the outcome vocabulary. `admin.call-queue.screens.test.tsx` — S-A-03's table semantics, the announced count,
the drawer's focus contract, and the calendar's block message.

<!-- audit
Last edited: 2026-09-17T18:40+10:00 — BB-LDN-Planner-070926/1f
Notes: 1f — call-queue and calendar built (S-A-03 / S-A-04): the decorated list, the four on-behalf levers, the block that flags, and the three absences the screens state out loud.
Prior: 2026-09-16T16:25+10:00 — BB-LDN-Planner-070926/F-c
Notes: initial authoring — the parent connector, the eight panel folders and the panel-set test.
-->
