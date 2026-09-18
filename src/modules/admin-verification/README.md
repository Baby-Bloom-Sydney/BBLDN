# admin-verification

**What it does.** The verification queue **S-A-16** (`/admin/users?tab=verification`; `/admin/verifications`
redirects there — 04 §6.4) and the reference crib **S-A-17** (`/admin/verification-reference`). Built by L-008
`2c` under **ADR-159**. It imports `verification` and **never** `vetting-providers`: every provider call goes
through `verification` (03 §4.2). It decorates rather than decides — the rows are `verification`'s `QueueEntry`s
with a name from `auth` beside each (03 §3.6's pattern for the call list), the decision is `verification.decide`,
the reveal `verification.openEvidence`, the level-4 step `verification.recordUpdateServiceCheck`.

**Connector.**

| Values                                                                                                                                                                                            | Types                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| reads `loadVerificationQueue` · `parseQueueQuery` · actions `decideSubmissionAction` · `openEvidenceAction` · `recordUpdateServiceAction` · screens `VerificationQueue` · `VerificationReference` | `QueueTab` · `QueueQuery` · `QueueRow` · `OpenRecord` · `VerificationQueueView` · the three action types · `VerificationQueueActions` · the three prop types |

**What it may import.** `config` (+ `config/server`), `shared-types`, `platform`, `auth`, `areas`, `comms`,
`verification` (01 §2.3 row).

**Authority and audit (07 §5.4; ADR-159).** The route gates on `auth.requireRole('admin')` and every road on
`verification`'s connector gates again (`aal2`), so the module itself holds no authority check to get wrong. The
subject of a decision or a reveal is the **submission's** nanny, read from the ledger inside `verification` —
no action here takes a nanny id for a decision, and the Update Service action's `nannyId` names the open row,
never the checker (the checker is the session's admin, written as `checked_by`). Every action consumes
`SECURITY.rateLimits.adminRoutes` inside the road (07 §8 row 14 — its first consumer).

**Data handled (07 §3).** S4 by design: the reveal returns the declared fields of ONE section and 1 h signed URLs,
and each reveal is one `vetting.evidence-viewed` (07 §4.32). The list carries the person's name and the evidence
type only; the open row's record carries paths, never URLs; nothing S4 reaches a log line (01 §4a — the refusal
helper logs a code and a reason, never a field value).

**The name beside a row** (`lib/nanny-name-of.ts`): `user_profiles` keyed on the user id at **session** scope —
an admin reads every profile under 07 §5.2, so RLS is the second gate and no service-role use is named here.
`nanny_public` cannot answer it: it excludes exactly the nannies the queue is about.

**Copy (ADR-124 folded).** Admin screens may use the team's own words (kickoff §4.5 binds the nanny list to nanny
surfaces), but no Sydney check name, city or currency sign appears; the screen says a person decides and that a
reveal is recorded (`admin-verification.copy.test.ts`).

**Gaps (recorded, not hidden).**

1. **The Sydney users tab is still Sydney** (`src/app/admin/users/{page,UsersTab,UserDetailDrawer,ContactUserModal}.tsx`
   read legacy columns through `createAdminClient`): `09.10` is 2d's or a fix unit's; this unit deleted only the
   verification half (`VerificationTab`, `IDCheckModal`). The leads panel (`09.08` / `02.28`) likewise — the
   queue's people read did not need it.
2. **No admin-assisted identity route** (04 §10 item 32, a11y-5): the admin attaching evidence on a nanny's behalf
   needs an upload road on this side; the wizard's is the nanny's own. Recorded for the a11y unit.
3. **The `expiresAt` field on the decision form is a raw ISO instant** — a date control is a design pass.

<!-- audit
Last edited: 2026-09-18T19:30+10:00 — BB-LDN-Planner-070926/2c
Notes: the inside built (L-008 2c; ADR-159): the read, the three actions, the two screens; authority/audit, data handled, the name read, copy, three gaps.
Prior: 2026-09-16T13:55+10:00 — BB-LDN-Planner-070926/F-b
Notes: created at F-b — types only; the queue reads and decisions travel with the Tier A verification insides because they open evidence.
-->
