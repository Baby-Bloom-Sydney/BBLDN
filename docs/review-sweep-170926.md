# Review sweep — 2026-09-17 — the whole of Phase 1 (`62b3e36..ce82ffe`)

> **What this is.** The **ADR-123 overnight checkpoint** over every unit that merged to `main` since REVIEW-1: **1a, 1b, 1c, 1d, 1e, 1g, P1-FIX, P1-WIRE, P1-WIRE-2, BUILD-FIX, S5b, P1-STORES** with **no review battery at all**, and **AUTH-2, 1f, 1h, 1i** with a single reviewer only. 654 files, +45,313 / −12,372.
>
> **Run by** `BB-LDN-Planner-070926/REVIEW-2` on `review-170926-2`, off `origin/main` `ce82ffe`, in its own worktree. Battery: `code-reviewer` + `typescript-reviewer` + `silent-failure-hunter` in one parallel batch over the whole diff, then `security-reviewer` over every Phase 1 server action and route shell, the invite token flow, the access-gate consumers, the `admin-on-behalf` levers and every `configure*` / `wire-*.ts`. Every finding below was re-verified by hand against the tree before it was acted on or recorded — no agent's word is load-bearing here on its own.
>
> **What the sweep changed.** Unlike REVIEW-1, which changed only tests, this sweep changed **source**: eleven CRITICAL/HIGH fixes in-unit, each written RED first, each confined to `src/modules/**` · `src/app/**` · `src/boot/**` and their tests. Everything else is recorded for the unit that should own it. GitHub Actions was unavailable for most of the run (B-42); every gate below is a local exit code.

---

## 1. Counts

| Severity | Found | Fixed in this sweep | Pinned (`it.fails`) | Recorded for another unit |
| -------- | ----- | ------------------- | ------------------- | ------------------------- |
| CRITICAL | 2     | 2                   | 0                   | 0                         |
| HIGH     | 13    | 9                   | 1                   | 3                         |
| MEDIUM   | 17    | 0                   | 0                   | 17                        |
| LOW      | 6     | 0                   | 0                   | 6                         |

**Bottom line, and it is not the same bottom line as REVIEW-1.** The five laws hold: zero `any` in application code, `check:config-literals` clean over 883 files, `check:env-reads` clean over 888, every allowed-imports row honoured, no source file over 800 lines, and the fail-closed defaults are real — thirteen of them proved against the factory default by `ports.fail-closed.test.ts`. What Phase 1 got wrong is **the controls it declared and never called**. `config/security.ts` names fifteen rate-limit policies; four of the surfaces those policies exist for had **no limiter at all**, and one of them — the invite claim — is the single control the enumeration argument for an un-expiring token rests on. That is a different failure mode from REVIEW-1's ("claims with no evidence"): these are **claims with no code**, sitting in a config file that reads as if the control is in force.

The second theme is narrower and worth naming separately: **four privileged ports were invisible**. `admin-on-behalf`, `verification`, `vetting-providers` and `hire-docs` are never configured from `src/boot/`, and `BootPort` was a closed union that could not name them — so `wire-ports.ts`'s own stated invariant ("a port left on its fail-closed default carries its reason on the report, never silence") was broken by a type. That is fail-closed on safety and fail-**silent** on operability, and it is why a shipped admin screen has four buttons that cannot work and no log line saying so.

---

## 2. CRITICAL

### C-1 — **FIXED** — the invite **claim** bypassed the enumeration defence entirely

|              |                                                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity** | CRITICAL (latent — nothing is deployed and the database is empty)                                                                       |
| **Files**    | `src/modules/app/child-linking/actions/claim-invite-action.ts` · `lib/claim-invite-method.ts:56` · `lib/consume-invite-lookup-limit.ts` |
| **Owner**    | REVIEW-2 — **fixed in this sweep**                                                                                                      |

`consume-invite-lookup-limit.ts` says in its own header, correctly, that the limit "**is the enumeration defence, and it is the whole of it**": a child invite has **no expiry column and no rotation** (02 §4.6), so a pending token is live for weeks, and 32⁸ ≈ 1.1 × 10¹² is only infeasible to walk if walking it is rate-limited.

It was consumed in exactly one place — `load-invite-landing.ts`, the server-component **GET**. `claimInviteAction` is a `"use server"` export, which is an HTTP endpoint of its own, and it reached `store.invitePreview(token)` through `childLinking.claimInvite` with **no counter at all**.

What makes it worth a CRITICAL rather than a HIGH is that the claim path is a _readable_ oracle. `carry-link-store-error.ts` answers with five distinguishable sentences:

| guess                                  | what the caller is told                       |
| -------------------------------------- | --------------------------------------------- |
| dead / revoked / already-claimed token | "That link is no longer open."                |
| **live**, wrong side of the app        | "That link is for the other side of the app." |
| **live**, addressed to someone else    | "That link was sent to someone else."         |
| **live**, child already taken          | "Another family already has this child."      |
| **live**, child already has a nanny    | "This child already has a nanny in the app."  |

So an authenticated caller — and account creation was itself unlimited, see H-2 — could walk the token space with one bit of "is this live" plus a category, at whatever rate the network allowed, against records whose payload is a child's first name and a family member's first name (07 §3 class H).

**Fix.** The two counters the landing page uses, keyed the same way, consumed in the action: the ordinary rate before the claim, and a **miss** spent on any refusal that is not an `INTERNAL` (our fault is not the caller's guess). Same keys as the GET road, so a guesser cannot buy a second budget by switching road. Four cases in `src/modules/app/__tests__/child-linking.claim-limit.test.ts`, three of them RED against the shipped action.

**Left open, recorded:** collapsing those five sentences to one for a caller who does not hold the invite is a **copy and contract** change (04 §6.1 / 03 §5.3 own the wording), not a review agent's to make. The rate limit removes the _budget_; the oracle itself is M-1 below. Owner: `1i` + the 04 owner.

### C-2 — **FIXED** — a paid done-for-you family's app could silently never open

|              |                                                       |
| ------------ | ----------------------------------------------------- |
| **Severity** | CRITICAL                                              |
| **File**     | `src/modules/placements/lib/placement-cascades.ts:60` |
| **Owner**    | REVIEW-2 — **fixed in this sweep**                    |

`await deps.openDfyAccess({ … })` — no `.ok` check, no log, no alert. The comment beside it said a refusal "is left to `1h`'s own retry". **There is no retry.**

The failure is perfectly camouflaged: L-1b lands, K-21 fires on the connection, `placement.started` is emitted, the request returns 200 — and `accessGate.hasAccess` answers `{ open: false, reason: "none" }` for that family for ever, with nothing in any log to correlate it to. By ADR-097 the deposit is already taken at this point, so the money is in and the product is off, and no one finds out except the parent.

**Fix.** The row still lands — a payments failure must not roll back the fact that the nanny started, and that reasoning was right. The refusal now alerts, because a human has to finish what the port could not. Pinned by a case that installs a refusing `openDfyAccess`, asserts the placement still reaches `ACTIVE`, and asserts an `error`-level line with an alert was emitted.

Note the _separate_ and **correct** decision this sits on: `wire-placements.ts` deliberately does not bind `openDfyAccess` at all, and says why (a fail-closed binding would take a nanny's recorded first day down with it). That is sound and was left alone. The defect was only ever the discarded `Result`.

---

## 3. HIGH

### H-1 — **FIXED** — sign-in had no rate limit, so ADR-134 had nothing to be true of

`src/modules/onboarding-parent/actions/sign-in-action.ts` · **Owner: REVIEW-2 (fixed); originally `1c`**

`auth.signIn` was called straight after the zod parse. 07 §8 row 3 asks for 5 / 15 min per email hash plus a lockout; `SECURITY.rateLimits.authPerEmail` existed with exactly **one** call site (the reset request) and none here. Password guessing against a known address had no ceiling this application imposed.

The sharper point is about ADR-134. "Auth routes fail **closed** on a limiter outage" is a statement about a route that _has_ a limiter; it says nothing at all about a route with none. A policy declared in `config/security.ts` and never consumed reads, to anyone auditing the config, exactly like a control in force.

**Fix.** `lib/consume-sign-in-limit.ts`, taken **ahead of** the credential check so a spent burst refuses the right password too — a limit taken after the check would still hand the attacker the answer. The verdict never changes the sentence: `REFUSED` is the form's one refusal, so a throttle cannot become ADR-132's enumeration oracle. Three cases, two RED first.

### H-2 — **FIXED** — signup had no rate limit

`src/modules/onboarding-parent/actions/sign-up-parent-action.ts` · **Owner: REVIEW-2 (fixed); originally `1c`**

An anonymous `"use server"` POST ran `auth.signUp` → `recordSignupConsent` → `parentProfileStore.create` → `sendParentWelcome`, unbounded. 07 §8 row 2 asks for 3 a day per email hash; `SECURITY.rateLimits.signupPerEmail` and `signupPerIp` had **zero** call sites. Every account created this way is also a valid actor for C-1.

**Fix.** `lib/consume-signup-limit.ts`, ahead of every write, refusing through the same generic `INTERNAL` line every other failure in that action uses — so a throttle cannot be read as "that address already has an account" (ADR-132). Four cases, three RED first. The suite's own `beforeEach` now installs a fresh limiter, because the action acquired a module-state dependency and every test of it must supply one.

### H-3 — **FIXED** — the contact form was an unauthenticated, unlimited email relay

`src/modules/public-site/actions/send-contact-message-action.ts` · **Owner: REVIEW-2 (fixed); originally `1a`**

An anonymous `"use server"` POST → `comms.send` to `SENDERS.support`, with `replyTo` and the whole rendered body attacker-controlled, and no ceiling. 07 §8 row 10 asks for 3/h + 10/day on `ip+email-hash` **and a honeypot**; `SECURITY.rateLimits.contactForm` had zero call sites and the schema has no honeypot field.

The consequence that makes it HIGH rather than MEDIUM is the shared resource: flooding this does not just fill S-A-20, it **spends the project's outbound email quota**, and the flow that dies with it is password reset — the one flow a locked-out parent needs.

**Fix.** `lib/contact-form-key.ts` (both halves of the declared `ip+email-hash` key, both hashed) + `lib/consume-contact-form-limit.ts`, failing **closed** — ADR-134 lets only named public _reads_ fail open, and this is a send. Four cases, all RED first. The action's header read is wrapped so it still never throws outside a request scope (its standing contract): no scope degrades to the shared bucket, which is the strict answer, not the lax one.

**Not fixed, recorded:** the honeypot half of row 10 is a change to the form component and its schema. Owner: `public-site`.

### H-4 — **FIXED** — four privileged ports could not appear on the boot report

`src/boot/types.ts` · `src/boot/wire-ports.ts` · `src/instrumentation.ts` · **Owner: REVIEW-2 (fixed); originally P1-WIRE / P1-WIRE-2**

`configureAdminOnBehalf`, `configureVerification`, `configureVettingStore` and `configureHireDocs` are never called from `src/boot/` — and `BootPort` was a closed union of 18 names that did not contain any of them, so a `PortWiring` row for them was **not representable**. `wire-ports.ts`'s own header states the invariant that breaks: _"a port left on its fail-closed default carries its reason on the report, never silence."_

The visible cost: `src/app/admin/calls/page.tsx` renders the shipped S-A-04 screen with four levers (`bookCallSlotAction`, `moveCallSlotAction`, `clearCallSlotAction`, `recordCallOutcomeAction`), all of which reach `adminOnBehalf`, whose unconfigured default refuses every method. **Every admin button on that page returns `INTERNAL` for ever and the boot log has no line saying why.** Compounding it, `listAllowed` answers `[]` rather than an error (deliberate — 03 §2.5 gives it no `Result`), so that one fails silently even to the operator using it.

**Fix.** `src/boot/unwired-ports.ts` — four rows on the report, each with its reason and its owner. **It configures nothing**, deliberately: `admin-on-behalf` being unbound is still the standing safety argument REVIEW-1's C-1 left in place, and wiring it here is precisely the change that finding told the boot-file unit not to make. The rows are a disclosure, not a binding. Three cases in `boot.test.ts`, one RED first.

### H-5 — **FIXED** — `instrumentation.ts`'s "deliberately NOT wired" list was false in both directions

`src/instrumentation.ts:12-16` · **Owner: REVIEW-2 (fixed); originally S5b / P1-STORES**

It still named the `"shared"` rate limiter and the stage-model slices as unwired — `wire-rate-limiter.ts:45` and `wire-connections.ts:55` / `wire-placements.ts:24` wire all three — while omitting three of the four ports from H-4 that genuinely are left open. This is the only place an operator reads to learn what boot leaves open, so a stale list here is worse than no list.

**Fix.** A hand-maintained list of open gaps drifts the moment a gap closes, so it is replaced by a pointer to the report, which is generated from the wiring itself and pinned by a test.

### H-6 — **FIXED** — `book_slot()`'s `Json` answer was asserted, and the throw escaped the `Result` contract

`src/modules/scheduling/lib/scheduling-booking-writes.ts:140` · **Owner: REVIEW-2 (fixed); originally `1g`**

`database.types.ts:4118` declares `book_slot.Returns: Json` and `RpcResult` forwards it verbatim, so the answer may be `null`, a scalar or an array. The code was `answer.value as unknown as BookSlotResult`, then `bookingFromRow(result.booking)` on the very next line — which on any non-object answer is `bookingFromRow(undefined)` and a `TypeError` on `row.booked_by_role`, **thrown out of a function whose declared type is `Promise<Result<BookOutcome, SchedulingErrorDetails>>`**. Every caller checks `if (!booked.ok)`; none wraps in `try`. So the failure skipped the coded-error registry entirely and surfaced as a 500, on the path that books a family's introduction call.

**Fix.** `lib/book-slot-result-of.ts` — a deliberately shallow shape check (is `booking` an object; is `displaced` an object or null), enough to make the next two dereferences safe without duplicating `bookingFromRow`'s reading of the row. An unreadable answer goes through `schedulingFailure`, which already owns this module's "a failure this module cannot name is not one it may translate" rule. Six cases, all verified RED by reverting the fix and re-running.

### H-7 — **FIXED** — a cast disabled the fail-closed completeness check on `app/child-linking`

`src/modules/app/child-linking/lib/child-linking-registry.ts:27` · `src/modules/app/app.stub.ts:47` · **Owner: REVIEW-2 (fixed); originally `1i`**

Both unconfigured objects ended `}) as unknown as ChildLinking`, which removes the missing-property check. All eleven methods are present **today**, so this was not a live bug — the unsoundness is structural: a twelfth method added to `ChildLinkingLookups` compiles with no error and the unconfigured slot answers `TypeError: x is not a function` instead of `child-linking-not-configured`. That is the exact opposite of the registry header's stated reason for existing ("answering 'no children' from nowhere would silently unbound every family's grant"). `admin-on-behalf-registry.ts` annotates rather than casts and gets the guarantee for free.

**Fix.** Annotated (`const unconfigured: ChildLinking = …`). Verified the annotation actually bites by deleting `pendingInvites` and watching `tsc` refuse with TS2322, then restoring. `src/modules/app/__tests__/app.fail-closed.test.ts` is the run-time half, reaching the real factory default by never calling `configure*`.

### H-8 — **FIXED** — two reads whose refusal was invisible on a live screen

`src/modules/admin/call-queue/lib/load-call-queue.ts:85` · `src/modules/app/child-linking/lib/load-children-card.ts:37,46` · **Owner: REVIEW-2 (fixed); originally `1f` / `1i`**

- `awaitingRows()` returned `[]` on a `call-layer` refusal with no log, and `loadCallQueue` still answered `kind: "queue"` with `total: rows.length + awaiting.length` — **a smaller number that looks real**. S-A-03 renders normally with an empty "awaiting" section, so families who asked for a call are never called and no signal exists anywhere. The sibling failure path twelve lines below correctly distinguishes `forbidden` from `unavailable`; this one did not.
- `loadChildrenCard` dropped a refused `invitesForChild` per child (`if (found.ok) invites.push(...)`) and a refused `linkedChildren` wholesale (`links.ok ? … : []`) — while the `!children.ok` branch three lines above handles its own refusal correctly. A parent with three pending invites is shown "no invites" **and prompted to invite again**, and `child_invites` carries no expiry, so the encouraged retry mints a second live token for the same child.

**Fix.** Both now alert. Neither blanks its screen: an additive read failing is not worth failing the whole surface, and that judgement is now stated rather than implied by a silent `[]`.

### H-9 — **FIXED** — a floating promise turned a rejected server action into an unhandled rejection

`src/modules/matching/components/Wizard.tsx:116` · **Owner: REVIEW-2 (fixed); originally `1e`**

`void save(next, false)`. `void` suppresses the lint signal **without attaching a handler**, so a rejected server-action transport became an unhandled promise rejection.

Worth recording what the sweep concluded _against_ the reviewer here: the dropped `Result` is defensible. `finish()` re-sends the whole `answers` object and owns the visible failure, so an autosave refusal costs nothing and must not interrupt a parent mid-question. The fix is therefore to swallow the rejection **explicitly** — which is a different thing from never attaching a handler — and to say why in the code, rather than to raise a banner the UX does not want.

### H-10 — **PINNED, not fixed** — an absent booker is reconstructed as a branded empty string

`src/modules/scheduling/lib/booking-from-row.ts:28,32,44` · **Owner: 03 §3.2 + 02 §4.4 (foundations), then `1g`**

`(row.booked_by_user_id ?? "") as AdminId`, and `parentId: "" as UserId` for a position subject whose booker was not the parent. A well-typed id belonging to nobody then travels into `schedulingEvents` and the admin call queue as the acting party. This is the "authority from a non-authority value" class that 1f, 1g and 1i each found once — reached this time with a value the type system approves of, so no cast and no `any` is involved and nothing catches it.

**It is reachable, which is what lifts it above hygiene.** `0009:129` declares `booked_by_user_id uuid references auth.users (id) **on delete set null**`. So 07 §6's own account-deletion path turns every booking a departed admin made into `booked_by_role = 'admin'` with a NULL user id, and every one reads back as an admin whose id is `""`.

**Why it is pinned rather than fixed.** 03 §3.2's `Actor` and `Subject` have no "booker absent" arm, so _any_ value this module picks is an invention, and this sweep's brief forbids contract changes. ADR-123 rule 2 is explicit about what to do when code and document disagree: pin the documented behaviour as a failing test and record it. Pinned in `scheduling.inside.test.ts`; it pairs with the pre-existing pin at `:623` ("a position booked on behalf reads back carrying its parent"), which asks 02 §4.4 for the same missing column.

### H-11 — **RECORDED** — `EMAIL_PROVIDER=stub-email` is legal in the production column

`src/modules/config/lib/env-schema.ts:171-180` · `src/modules/config/lib/refine-env.ts:22-31` · **Owner: `config` + `comms`**

The schema marks `EMAIL_PROVIDER` `prod: "●"` with `values: ["resend", "stub-email"]`, and `refineEnv` guards **only** `PURCHASE_PROVIDER` / `STUB_EVENT_SECRET`. `stub-email` returns `{ ok: true, providerMessageId: "stub-email-<id>" }` and, by its own header, writes `email_logs` rows and log lines "identical to Resend's except the provider id". A production deployment with that value set reports every password-reset, invite and app-ready email as sent, and nothing leaves the building.

Masked today only because the template renderer is itself fail-closed (`boot/unconfigured-template-renderer.ts`), so this is a trap that **arms itself the day the first template lands**. The same shape applies to `AREAS_SOURCE=stub` (M-9), which fails closed but for an invisible reason.

**Not fixed here** because the fix is a `refineEnv` guard mirroring the `PURCHASE_PROVIDER` one **plus** a change to `scripts/ci/lib/smoke-env.sh`, which exports `EMAIL_PROVIDER=stub-email` in `smoke_env_base` and does not override it in the `production` case — i.e. CI's production positive control currently _certifies_ a stub transport as an acceptable production boot. `scripts/**` is outside this sweep's scoped files. Owner should fix both halves in one change, or the boot guard goes red.

### H-12 — **RECORDED** — P-7 never cascades K-24, and `connections` already has the arm for it

`src/modules/positions/lib/create-positions-slice.ts:343` · `src/modules/connections/lib/connection-cascades.ts:242` · **Owner: `1e` + `1g`**

Closing a position fans out to exactly one cascade: `const transition = input.transition === "P-2" ? "C-a" : "C-4";`. 03 §2.4's P-7 also cascades **K-24** onto every live connection. `connections` is already built to receive it — `connection-transitions.ts:218` defines K-24 and `runCascades` takes a `fromPositionClose` flag documented as "K-24's 'and not from P-7'" — but no caller can set it true, because `positions` dispatches only C-4.

Outcome: an admin closes a position and every live connection on it stays in a live stage; both parties keep a connection pointing at a closed position, and `liveCountForPosition` keeps counting them. Two halves of one seam, built by two units, never joined. Already pinned `it.fails` at `positions.inside.test.ts:333` — the pin is honest in _what_ it pins; its stated owner ("`1g` owns the K rows") has since landed and built the receiving half, so the pin's reason is now stale.

### H-13 — **RECORDED** — `payments.prices()` answers `[]` when unconfigured

`src/modules/payments/lib/payments-registry.ts:22` · **Owner: `payments` / `1h`**

The one method in that unconfigured object that is not a coded refusal. It flows to `src/app/parent/subscribe/page.tsx:43` and then `SelfServePage.tsx:59`'s `{shapes.length === 0 ? null : …}`, so the pay page renders HTTP 200 with a correct-looking standing panel and **no way to pay** — no log, no alert, no 5xx, indistinguishable from "we removed self-serve". Documented only as a passing remark in a prop comment.

**Not fixed** because `prices()` has no `Result` in its contract (03 §5.2), so making it refuse is a contract change. Owner needs a ruling: either `prices()` returns a `Result`, or the page treats an empty list as an outage rather than as an answer.

---

## 4. MEDIUM

| #    | Finding                                                                                         | File                                                                                                                   | Why it matters                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Owner                              |
| ---- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| M-1  | The invite claim's five distinguishable refusals are still an oracle, now a rate-limited one    | `app/child-linking/lib/carry-link-store-error.ts:15-41`                                                                | C-1 removed the budget, not the signal. A caller who does not hold the invite should get **one** sentence; today a live token is distinguishable from a dead one, and three sub-reasons are distinguishable from each other. Copy + contract change, so not a review agent's.                                                                                                                                                                                                    | `1i` + 04 §6.1 owner               |
| M-2  | ADR-134's fail-open allow-list **does not exist** — 1i's report is accurate                     | `config/security.ts` (no key) · `app/api/_lib/consume-public-read-limit.ts:27,42`                                      | The fail-open decision is hard-coded in one file and acquired by **importing** it. Its own header tells future callers not to copy it — a comment, not a gate. So "fail open" is today exactly the thing ADR-134 says it must not be: a property a route claims for itself. Two callers today (`/api/areas`, `/api/public/quick-match`); nothing stops a third.                                                                                                                  | `config` + `1i`                    |
| M-3  | `onBehalfOf` is required but never checked against the subject                                  | `admin-on-behalf/lib/gated-admin-actor.ts:76` · `admin/call-queue/lib/on-behalf-actor.ts:9`                            | Presence is tested, membership is not. `book-call-slot-action.ts:21` passes a caller-supplied `parentId` beside an independently caller-supplied `positionId` with no check that the two belong together. Not escalation (the caller is already an MFA'd admin) — but 07 §5.4 row 6's **audit subject** is the control, and it is forgeable.                                                                                                                                     | `1g`                               |
| M-4  | Lead takeover at signup                                                                         | `onboarding-parent/lib/open-position-from-lead.ts:29`                                                                  | `leadId` arrives on the signup form and is shape-validated only: no check that the lead is unclaimed or that its captured contact matches the submitting email. Anyone holding another family's `leadId` — it travels in wizard URLs and form state — converts their area, children's ages and schedule into a position owned by the submitter.                                                                                                                                  | `1c`                               |
| M-5  | `saveParentLeadAction` is an unauthenticated unlimited write                                    | `matching/actions/save-parent-lead-action.ts:38`                                                                       | 07 §8 row 2 names 10/min for exactly this. Anonymous callers write unbounded PII rows into `parent_leads`. Not fixed with H-1..H-3 only because it is `matching`'s surface and the same pattern applies cleanly; it should land with the honeypot work.                                                                                                                                                                                                                          | `1b` / `matching`                  |
| M-6  | An admin with no `onBehalfOf` can read any child's live invite **token**                        | `app/child-linking/lib/invite-methods.ts:59`                                                                           | Security review M1 added `actor.onBehalfOf !== undefined` to mint and revoke (`invite-authorisation.ts:54,67`); the **read** was not changed. `invitesOf` returns the full share URL including the token for any `childId`. Same class, left open on one side.                                                                                                                                                                                                                   | `1i`                               |
| M-7  | A raw token is spliced into a redirect without normalisation or encoding                        | `app/child-linking/actions/claim-invite-action.ts:20`                                                                  | `redirect(\`/login?redirect=/invite/connect/${token}\`)`where`token`is the raw form string —`normaliseInviteToken`runs later, inside`claimInvite`. A value containing `?`, `#`or`&`reshapes the parameter`safeNextPath`later consumes. Same-origin-anchored, so not a full open redirect; the sibling`post-signup-destination.ts:19` does encode.                                                                                                                                | `1i`                               |
| M-8  | The live token travels in a query string                                                        | `app/child-linking/lib/load-invite-landing.ts:96`                                                                      | `?redirect=` puts it in browser history and in whatever `/signup` and `/login` log. The file records this as owed and names 07 §4.6's signed-cookie pattern as the fix — correctly, and it spans two modules' surfaces.                                                                                                                                                                                                                                                          | `1i` + `onboarding-parent`         |
| M-9  | `AREAS_SOURCE=stub` is legal in production                                                      | `config/lib/env-schema.ts:191-200`                                                                                     | No `refineEnv` guard. The 20-area seed then answers `false` for 271 of 291 real London outward codes, and that feeds P-2's service-area precondition. Fails **closed**, but for an invisible reason: a real family in a real area is told she is out of area.                                                                                                                                                                                                                    | `config` (fold into H-11)          |
| M-10 | 19 modules hand-roll the registry slot because `platform` exports the type but not the factory  | `platform/index.ts` (no `export { createRegistry }`)                                                                   | **REVIEW-1's H-3, unchanged and now worse** — it was 13 copies, it is 19. Each is a place the `set` semantics can drift. The fix is one line in `platform/index.ts` plus a mechanical follow-up. The single largest duplication the unreviewed merges introduced.                                                                                                                                                                                                                | `platform`, then a mechanical pass |
| M-11 | Eleven React components exceed the 50-line function limit; two exceed it fourfold               | `public-site/components/NannyProfile.tsx:37` (226) · `onboarding-parent/components/ParentSignupForm.tsx:17` (212) · +9 | L5 says "split before, never after", and **no gate enforces it** — `lint:boundaries` checks deep imports and one-export-per-file, not body length. A rule with no gate is a rule that decays, which is what the measurement shows.                                                                                                                                                                                                                                               | `1a` · `1c` · `1e` · `1f` · `1g`   |
| M-12 | Ten production sites use `as never` at an argument position                                     | `scheduling/lib/scheduling-admin-writes.ts:110,144,206,211,260` · `boot/event-envelope-from-row.ts:33,35,58` · +2      | `never` is assignable to _every_ type, so this is strictly more permissive than `as unknown as`, and it greps for nothing. `auth/lib/supabase-query.ts:29` claims these were centralised into "one documented place instead of nine undocumented ones"; there are now ten outside it. **Judged MEDIUM, not CRITICAL as the agent rated it**: every site is a brand crossing between two string brands over the same value, so no live defect follows — the cost is auditability. | `1g` · S5b                         |
| M-13 | `settle` discards the update result; settling a non-existent message succeeds                   | `boot/db-comms-store.ts:115-124`                                                                                       | A patch matching zero rows is indistinguishable from one that matched, so a settle against an unknown `messageId` reports `ok`.                                                                                                                                                                                                                                                                                                                                                  | `1h`                               |
| M-14 | Burst-alert counter failure swallowed, and `===` disarms it permanently                         | `platform/rate-limit/lib/create-rate-limiter.ts:33`                                                                    | `if (trips.ok && trips.value.count === deps.burstAlertMultiple)`. A failing burst bucket means `ALERT_RATE_LIMIT_BURST` never fires, silently; and the `===` (not `>=`) means **one lost increment disarms the alert for that key for the rest of the hour**. The second half is the sharper bug.                                                                                                                                                                                | `platform`                         |
| M-15 | An auth-read failure on the parent dashboard is indistinguishable from signed-out               | `src/app/parent/page.tsx:52-58`                                                                                        | A failed `getCurrentUserId` yields `familyId === null`, which skips the gate entirely and renders the logged-out page, with no log. The gate itself below it is handled correctly and commented; the read above it is not.                                                                                                                                                                                                                                                       | route / `1i`                       |
| M-16 | `default:` on a discriminated union re-narrows the discriminant with a lying cast               | `matching/components/wizard/QuestionBody.tsx:80-82`                                                                    | Adding a sixth `kind` compiles silently and renders `ChoiceChips` with `options ?? []` — a blank, unanswerable question. A `const _exhaustive: never = question` would have made the addition a compile error.                                                                                                                                                                                                                                                                   | `1e`                               |
| M-17 | `noUncheckedIndexedAccess` is off, so every index access in the new code is typed non-undefined | `tsconfig.json:6`                                                                                                      | Not a change in this diff, but it is what makes the whole class unenforceable. Live examples in new code: `Wizard.tsx:101` (`questions[index]` dereferenced unguarded at :176), `QuestionBody.tsx:94-95`. Turning it on is a repo-wide change and a task of its own.                                                                                                                                                                                                             | foundations / a dedicated unit     |

---

## 5. LOW

| #   | Finding                                                                                                                                                                                                                                                                                                                      | File                                                       | Owner         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------- |
| L-1 | `matching/README.md:77` asserts an `it.fails` in `matching.autofire.test.ts` that ADR-136 removed — that file's case is a **passing** `it(...)`. The code records the history correctly; only the README makes a false current claim, and a module README is what the next agent reads to decide whether to build something. | `matching/README.md`                                       | P1-WIRE-2     |
| L-2 | `createChildAction` casts a raw form string `as ISODate`. `ageInMonths` on a non-date yields `NaN`, and `NaN >= APP.maxChildAgeMonths` is `false`, so the third-birthday cap silently passes and the refusal falls to the Postgres `date` type. Same shape on the `ChildId` / `InviteId` casts in the two sibling actions.   | `app/child-linking/actions/create-child-action.ts:20`      | `1i`          |
| L-3 | `actorOf`'s switch has four cases and no `default`, returning `undefined` as a non-optional `EventActor` for an out-of-enum `actor_kind`. Exhaustive today; a row written before a migration falls off the end.                                                                                                              | `boot/event-envelope-from-row.ts:20-37`                    | S5b           |
| L-4 | `database.types.ts` is 5,138 lines — the only changed file over 800. Generated, so the rule reads as not applying, but **nothing records that exemption**, so a reader has no way to tell it from a violation. One comment closes it.                                                                                        | `shared-types/database.types.ts`                           | S5b           |
| L-5 | `verification` and `onboarding-parent`'s `parentProfileStore` expose a `configure*` + registry (so they are swappable under L3) with no `*.swap.test.ts`, where 17 sibling modules ship one.                                                                                                                                 | `verification/__tests__/` · `onboarding-parent/__tests__/` | `1c` / Tier A |
| L-6 | 01 §4b's `ALERT_NAMES` has no name for "a downstream port refused a write we cannot retry", which is what C-2 needed. `ALERT_PROVIDER_DOWN` was used as the closest true one rather than adding a name code-first.                                                                                                           | `platform/log/lib/alert-names.ts` + 01 §4b                 | 01 §4b owner  |

---

## 6. The five specific checks the brief asked for

### 6.1 Does anything fail **open** in production config?

**Two things do, and neither is what `check:boot-guard` measures.**

`boot-guard.sh:70-71`'s production case runs `smoke_env production` and asserts `BOOT_OUTCOME == listening` — the process binds a port and `/api/health` answers. It asserts **nothing about which stores or providers were bound**. And `smoke-env.sh:33,35` exports `EMAIL_PROVIDER=stub-email` and `AREAS_SOURCE=stub` in `smoke_env_base`, which the `production` case does not override — so CI's production positive control **actively certifies that a production boot with a stub email transport and a stub areas provider is acceptable**. The only production stub it refuses is `PURCHASE_PROVIDER` (via `refine-env.ts:26` + `check:prod-guard`). See H-11 and M-9.

**On the three things the brief named specifically — all three are clean:**

| Port                 | Production binding                                       | Memory reachable in prod?                                                                                        |
| -------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **1d's call mirror** | `dbCallMirrorStore(auth.data)` — `wire-call-layer.ts:28` | **No.** The memory store is gone; one shared instance serves both the reads and the slice.                       |
| **1e's positions**   | `dbPositionStore(auth.data)` — `wire-positions.ts:52`    | **No** — P1-STORES closed it; same single-instance shape.                                                        |
| **`openDfyAccess`**  | not bound at all — absent from `wire-placements.ts`      | n/a, and **deliberately so**, with the reason on the wiring row. The defect was the discarded `Result`, now C-2. |

Also clean: `rate-limit` keeps a memory store **only** when `environment === "development"`, and `assert-shared-store.ts:35` keys on `NODE_ENV === "production"` — true on Vercel preview too — so a preview that failed to declare a shared store **denies** rather than silently multiplying limits by instance count. That is the best-argued guard in the diff.

### 6.2 Every `it.fails` pin still failing on `main`

**Eleven now** (ten inherited, one added by this sweep). `vitest run` reports **3,540 passed | 11 expected fail** — so none has quietly turned true in the vitest sense; a pin whose body stopped throwing would report as a _failure_, not a pass.

| #      | File:line                                              | Pins                                                                                                                                     | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | `boot/__tests__/boot.test.ts:399`                      | ADR-127: a `nanny_positions` write inside a uow is not refused                                                                           | **Honest.** Migrations stop at `0018`; S5c's `0019` is what flips it.                                                                                                                                                                                                                                                                                                                                                      |
| 2      | `payments/__tests__/payments.screens.test.ts:111`      | 03 §5.2 S-P-12 cancels in-app                                                                                                            | **Honest.** The doc names a behaviour `PurchasePath` gives no method for; refusing to invent one on a money path is right.                                                                                                                                                                                                                                                                                                 |
| 3      | `payments/__tests__/payments.jobs.test.ts:266`         | AC-A-41: one open `admin_notifications.payment_due` per family                                                                           | **Honest.** No module owns `admin_notifications`.                                                                                                                                                                                                                                                                                                                                                                          |
| 4      | `call-layer/__tests__/call-layer.inside.test.ts:736`   | 03 §3.5 seq 3 parent-over-nanny displacement                                                                                             | **Honest in what it pins, STALE in why.** Displacement _is_ built (`scheduling-booking-writes.ts:117-156` computes `displaceTo` and passes `p_displace_to`). The pin is red only because the test wires `createSchedulingStub`, so its own promise — "the day it is built this `it.fails` turns red" — is already false. It now pins test scaffolding, not a doc/code disagreement. **Owner should re-wire or retire it.** |
| 5–7    | `app/__tests__/child-linking.pins.test.ts:50,96,140`   | nanny-minted invite for her own new child · mint/revoke through definers · the access window inside `connect_child_invite`'s transaction | **All three honest.** `children` has no creator column; `grep create_child_invite supabase/` returns no hits; `set_access_window` is defined in `0010` and called after the RPC returns.                                                                                                                                                                                                                                   |
| 8      | `scheduling/__tests__/scheduling.inside.test.ts:623`   | 03 §3.2: a position booked on behalf reads back carrying its parent                                                                      | **Honest.** `bookings` stores `subject_type` + `subject_id` only.                                                                                                                                                                                                                                                                                                                                                          |
| 9      | `positions/__tests__/positions.inside.test.ts:163`     | 03 §2.5: all 44 transition rows resolve to a spec                                                                                        | **Honest.** Only the 7 P rows live in `POSITION_TRANSITIONS`.                                                                                                                                                                                                                                                                                                                                                              |
| 10     | `positions/__tests__/positions.inside.test.ts:333`     | 03 §2.4 P-7 cascades K-24 on every live connection                                                                                       | **Honest in what it pins, STALE in why.** The gap is real and shipped (H-12); the stated owner (`1g`) has landed and built the receiving half.                                                                                                                                                                                                                                                                             |
| **11** | `scheduling/__tests__/scheduling.inside.test.ts` (new) | 03 §3.2: an absent booker is never a branded empty id                                                                                    | **Added by this sweep** — H-10.                                                                                                                                                                                                                                                                                                                                                                                            |

So: **nine of the eleven are honest document-wins pins. None has become quietly false.** Two (#4, #10) are honest about the gap but carry a _reason_ that has expired — they now pin scaffolding or name a landed owner, which is the decay ADR-123 rule 2 exists to prevent, and both should be re-argued by their owners rather than left to accumulate.

### 6.3 ADR-133's client entry points and the client/server boundary

**Green.** `src/__tests__/client-server-boundary.test.ts` — 4 cases, all passing; `npm run build` completes. No `"use client"` module reaches `server-only` or a `node:` builtin.

Worth noting for the record: **no `*/client` entry point exists yet** — `find src -name "*.client.ts*"` returns nothing. ADR-133 says the entry is added "when a client component first needs it, not speculatively", so that is conformance, not a gap. The two modules that cite it (`payments/components/MoneyStandingPanel.tsx:3`, `positions/components/PositionPage.tsx:2`) do so to explain why they are **server** components and need no such entry. The rule is real; it simply has not been needed since BUILD-FIX.

### 6.4 Copy

**No Phase 1 surface renders a banned word without an allowlist row.** Measured mechanically: `check:banned-words` reports 969 lines across the tree; intersecting that list with the 654 files in `62b3e36..ce82ffe` yields **zero**. Every hit is in legacy Sydney surfaces (`src/app/parent/settings`, `src/app/parent/request/renderers`, `suburb` / `subscription` / `Continue`), which ADR-124 makes an accepted red until the wording sweep. Two banned words that the sweep's _own_ new files introduced (`unlimited`, `job`) were caught by the per-module copy suites and removed before commit.

**No surface shows self-serve as free**, and **no surface shows a trial countdown.** The no-countdown ruling is enforced in code at three levels, and I re-read all three: `positions/lib/journey-rows-4-to-8.ts:183` returns `"Your app is open"` with no day count; `journey-rows-7-8.test.ts:44` asserts `detail` matches no digit at all (`not.toMatch(/\d/)`); `app/child-linking/lib/app-access-view.ts:20` states there is no countdown anywhere and the paywall says what the next step is. The T-5 email is the only place urgency lives (`api/cron/trial-reminders/route.ts:4`).

**Amendment (e) was owed precisely because the document disagreed with all of that:** 04 §7.1 row 7 still gave the line as `"Your app is open — {n} days"`. Now corrected — see §8.

### 6.5 Rate limits (ADR-134)

**Money and auth fail closed — now.** Before this sweep, four of the surfaces 07 §8 names had **no limiter at all**, so the question did not arise for them:

| Surface                                              | On limiter **error**                  | Correct per ADR-134?                               |
| ---------------------------------------------------- | ------------------------------------- | -------------------------------------------------- |
| `/api/areas`, `/api/public/quick-match`              | **OPEN** — logs `ALERT_PROVIDER_DOWN` | Yes on the merits; **not** via an allow-list (M-2) |
| invite token lookup (GET) — `.before` / `.afterMiss` | **CLOSED**                            | Yes, argued explicitly                             |
| **invite claim (POST)**                              | **CLOSED** — _added by this sweep_    | Was **absent** (C-1)                               |
| password-reset request                               | **CLOSED**                            | Yes                                                |
| money actions (checkout + portal)                    | **CLOSED** → `fail("E_PROVIDER")`     | Yes, explicit                                      |
| **sign-in**                                          | **CLOSED** — _added by this sweep_    | Was **absent** (H-1)                               |
| **signup**                                           | **CLOSED** — _added by this sweep_    | Was **absent** (H-2)                               |
| **contact form**                                     | **CLOSED** — _added by this sweep_    | Was **absent** (H-3)                               |
| `saveParentLead`, funnel steps                       | **no limiter**                        | **No** — M-5, left for `matching`                  |
| `/api/webhooks/stripe`, `/api/cron/*`                | no limit by design                    | Yes — 07 §8 row 13                                 |

**The allow-list: 1i's report is accurate — it does not exist.** `config/security.ts` has no `failOpen*` key of any kind. The fail-open decision lives at `app/api/_lib/consume-public-read-limit.ts:27,42` and is acquired by **importing that file**. Its header tells future callers not to copy it, which is a comment and not a gate. So ADR-134's own words — "not a property a route claims for itself" — describe exactly the state of the code. Recorded as M-2; not fixed here, because writing the allow-list means deciding which surfaces are on it, which is a ruling.

One thing worth flagging beside it (the code-reviewer found it and I confirmed): `consume-public-read-limit.ts`'s fail-open is argued on the grounds that "the edge layer (Vercel Firewall, keyed by IP) … never depends on our database". **There is no edge rule anywhere in the repo** — `vercel.json` carries `regions` and `crons` only. So today the fallback control is empty, and one Supabase blip removes all rate limiting from both public reads.

---

## 7. What the sweep confirmed rather than found

- **Authority is session-derived everywhere.** The `security-reviewer` built a table of every Phase 1 server action and route and found **no surface** taking authority from a caller-supplied actor, role or id. The two placeholders that look like the 1f/1g/1i class — `admin/call-queue/lib/on-behalf-actor.ts:12` and `nanny-call-actor.ts:9`, both `"session" as AdminId` — are provably discarded at `gated-admin-actor.ts:86`, which rebuilds the actor from `auth.requireRole("admin")`.
- **FIX-1 holds on this tree.** `configure-admin-on-behalf.ts:12` calls `gateAdminOnBehalf(inside)` unconditionally, the stub self-gates, all eight levers route through `gatedCall`, `requireRole` carries `aal2`, and Phase 1 added **no route in front of the levers** — the only new admin surface (`app/admin/calls/page.tsx:33`) calls `requireRole("admin")` and `notFound()`s itself. The residual is M-3.
- **The access gate fails closed on every path.** `decide-access.ts:20-52` is exhaustive with an `assertNever` arm; `:62` closes on an expired `accessUntil` regardless of standing; `default-access-gate.ts:21` returns `payments`' error rather than a defaulted `{ open: false }`; and the three-valued consumers preserve **unknown ≠ closed**. No caller reaches a gated surface around it.
- **The wrong-user invite claim is closed in SQL**, not in the module: `0012_app.sql:692,697,709,722` (`INVITE_NOT_YOURS`, `INVITE_WRONG_ROLE` ×2, `INVITE_SELF_CLAIM`). The TypeScript layer performs no role or direction check and relies wholly on the definer. Fine as written — but it is **single-layered**, and worth knowing.
- **No secrets, and `process.env` appears only in `config/env.ts` / `config/public-env.ts`** across 888 files (`check:env-reads` OK). `api/test-email/route.ts` and `api/analytics/visit/route.ts` were **deleted** in this diff, which removes the most obvious Sydney-inherited hole.
- **PII discipline on the invite path is genuinely good:** the token never reaches `props`, the rate-limit keys are hashed, `carry-link-store-error` replaces every driver message with a fixed sentence, and `db-child-linking-store.ts:10` names operations for what they do rather than what they were given. One dependency worth naming because it is load-bearing: `sign-up-parent-action.ts:53` and `create-position-action.ts:25` log `cause: <raw provider error>`, so `platform/log/lib/scrub-pii.ts` is the only thing between a driver error carrying an email address and the log line.
- **REVIEW-1's H-4 is still open and still true:** the legacy Sydney **WWCC** identity pipeline (`src/app/api/run-verification`, `src/lib/ai/verification-pipeline.ts`) is reachable through real authenticated routes. It is also why `npm run build` is env-dependent — it constructs a Resend client at module scope, so a bare `npm run build` with no `RESEND_API_KEY` fails at page-data collection and takes `check:boot-guard`'s two positive controls down with it. Both gates are green under `smoke_env`; measuring them without it is what makes `main` look red when it is not.
- **Scope discipline held.** `git diff --name-only` on this branch returns nothing outside `src/modules/**`, `src/app/**`, `src/boot/**`, `docs/`, and the four delegated `SPECS/00-foundations/` lines. `supabase/migrations/0019*`, `02-data-model.md` §6/§7 and the three stores' write paths — S5c's surface — were not touched.

---

## 8. Document amendments made (delegated by the planner)

Six, in `../SPECS/00-foundations/`, each with an audit-footer bump, and nothing else in those files touched.

| #   | File · §                                | Change                                                                                                                                                                                                                                                                                                                                   | Authority            |
| --- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| a   | `01-architecture.md` §2.4               | One sentence: auth mail (reset, magic link, confirmation) is sent by Supabase Auth — the one scoped exception to `comms` owning every send; copy lives in the dashboard.                                                                                                                                                                 | ADR-137, B-41        |
| b   | `01-architecture.md` §4c                | New rule 7: `/api/health` is a probe, exempt from the envelope, builds its response directly, **503** when the `db` probe is failed.                                                                                                                                                                                                     | ADR-135 over ADR-130 |
| c   | `03-interface-contracts.md` §10.1       | The `public-site` row's K-1 cell, replaced **in place**: `advance(K-1)` → `matching.connect(K-1)`. `public-site` still owns the browse Connect but reaches K-1 through `matching`. **Net zero — the file is still 799 lines at the cap**, achieved by folding the prior footer note into one line.                                       | ADR-126 (B-39 (a))   |
| d   | `04-journeys-and-screens.md` §6.1       | S-X-08's two cells: a known passwordless email and a duplicate-email signup both become the **same neutral outcome**, no enumeration.                                                                                                                                                                                                    | ADR-132, ADR-137     |
| e   | `04-journeys-and-screens.md` §7.1 row 7 | Both `{n} days` day counts deleted; the no-in-app-countdown ruling stated as beating this row's own earlier wording, with the pinning test named.                                                                                                                                                                                        | the 1i pin, 04 §3    |
| f   | `02-data-model.md` §3                   | The `consent_purpose` register row S5b recorded as owed: cluster `shared`, the eleven `legal_documents` slugs in §4.1's order then the three non-document purposes, ordinals frozen. **Count 79 → 80**, which is what `shared-types.test.ts`'s `ENUM_COUNT` and `enum-ordinals.test.ts` already assert. §6 and §7 **not** touched (S5c). | ADR-131 (2)          |

**One residual, flagged rather than exceeded:** §6.1's **S-X-05 and S-X-06** rows still say `duplicate email → S-X-08`, which is the same oracle S-X-08's own row now refuses. It is outside the delegated line scope, so it is recorded here and in 04's footer for the 04 owner. Amendment (d) says so explicitly in the cell itself, so the two cannot be read as agreeing.

---

## 9. Gates measured at this branch's head

Exit codes, in this sweep's own worktree, all local (B-42 — GitHub Actions was down for most of the run).

| Gate                            | Result                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------- |
| `typecheck`                     | **0**                                                                                                   |
| `lint`                          | **0**                                                                                                   |
| `prettier --check .`            | **0**                                                                                                   |
| `vitest run` (`--project unit`) | **0** — 252 files, \*\*3,540 passed                                                                     | 11 expected fail\*\* |
| `lint:boundaries`               | **0**                                                                                                   |
| `check:allowed-imports`         | **0**                                                                                                   |
| `check:config-literals`         | **0**                                                                                                   |
| `check:claude-md`               | **0**                                                                                                   |
| `check:boot-guard`              | **0** — 6/6, **under `smoke_env`** (see §7: it needs the env, and needs `.next` from a completed build) |
| `npm run build`                 | **0** — **under `smoke_env`**; a bare shell fails on the legacy Resend module-scope client              |

`banned-literals` was not chased, per the brief and ADR-124.

**CI came back mid-run (B-42 closed, ADR-138), so the three red checks are measured rather than assumed. All three are red on `main` itself; this branch adds none.** Job-for-job against `main`'s own run at `ce82ffe` (`35205654691`) vs this PR (`35210019968`): `typecheck` · `lint` · `allowed-imports` · `types-drift` · `gitleaks` pass on both; `banned-literals` fails on both (ADR-124); `test` fails on both with **the same three files and only those three** — `components/bapp/ConnectExistingChildSheet.test.tsx`, `components/payments/CancelledInPeriodBanner.test.tsx`, `components/payments/PastDueBanner.test.tsx`, all legacy `src/components/**`, all green locally — with 249 passing here against `main`'s 246, the difference being this sweep's new suites.

`build` fails on both, and the reason is worth recording because **it is not the same reason it fails locally**. Locally a bare build dies on `/api/verification-status` constructing a Resend client at module scope; in CI it dies on `Dynamic server usage: no-store fetch https://placeholder.supabase.co/...` from the legacy `/nanny/team` route at page-data collection. **Two independent legacy Sydney routes each break the build on their own**, which is why "is `main` build-green?" has had different answers depending on who measured it and how. Both belong to REVIEW-1's H-4 and want one decommission-or-gate decision, not three. Neither is in this sweep's scoped files.

---

## 10. What this sweep changed

**Source, not only tests** — the first sweep to do so.

- **New —** `onboarding-parent/lib/consume-sign-in-limit.ts` · `consume-signup-limit.ts` · `public-site/lib/contact-form-key.ts` · `consume-contact-form-limit.ts` · `boot/unwired-ports.ts` · `scheduling/lib/book-slot-result-of.ts`.
- **Amended —** `onboarding-parent/actions/sign-in-action.ts` · `sign-up-parent-action.ts` · `public-site/actions/send-contact-message-action.ts` · `app/child-linking/actions/claim-invite-action.ts` · `app/child-linking/lib/load-children-card.ts` · `app/child-linking/lib/child-linking-registry.ts` · `app/app.stub.ts` · `admin/call-queue/lib/load-call-queue.ts` · `placements/lib/placement-cascades.ts` · `matching/components/Wizard.tsx` · `scheduling/lib/scheduling-booking-writes.ts` · `boot/types.ts` · `boot/wire-ports.ts` · `instrumentation.ts`.
- **New tests —** `app/__tests__/child-linking.claim-limit.test.ts` (4) · `app/__tests__/app.fail-closed.test.ts` (1) · `public-site/__tests__/public-site.contact-limit.test.ts` (4); and new cases in `onboarding-parent.sign-in.test.ts` (3) · `onboarding-parent.signup.test.ts` (4) · `boot.test.ts` (3) · `placements.inside.test.ts` (1) · `scheduling.inside.test.ts` (6 + 1 pin). **27 new assertions of behaviour, every one verified RED first** (the six `book_slot` cases retroactively, by reverting the fix and re-running).

---

<!-- audit
Last edited: 2026-09-17T23:55+10:00 — BB-LDN-Planner-070926/REVIEW-2
Notes: created — the ADR-123 checkpoint sweep's finding register for the whole of Phase 1 (62b3e36..ce82ffe,
654 files, 18 units of which 12 merged with no review at all). 2 CRITICAL and 9 HIGH fixed in-unit test-first;
1 HIGH pinned it.fails rather than invented (03 §3.2 has no absent-booker arm); 3 HIGH recorded because the fix
is a contract ruling or lives outside the scoped files; 17 MEDIUM, 6 LOW recorded. The theme is not REVIEW-1's
(claims with no evidence) but claims with no CODE: config/security.ts declares fifteen rate-limit policies and
four of the surfaces they exist for had no limiter at all, including the invite claim, which is the whole of the
enumeration defence for a token with no expiry. Second theme: four privileged ports could not appear on the boot
report because BootPort could not name them. Six delegated document amendments made with footers bumped; 03 held
at 799 lines by folding its prior footer note. One residual flagged, not exceeded: 04 §6.1's S-X-05 / S-X-06
rows still carry the duplicate-email oracle that S-X-08's row now refuses.
-->
