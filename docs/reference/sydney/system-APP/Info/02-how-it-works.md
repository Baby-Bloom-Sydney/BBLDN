> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# 02 — How It Works

> End-to-end mechanics of the development app — from the first sign-up through trial → conversion → commission → renewal → eventual closure. Distillation of [`USER-FLOWS.md`](../USER-FLOWS.md), [`ONBOARDING-LOGIC.md`](../ONBOARDING-LOGIC.md), [`PAYMENTS/16-parent-user-journey.md`](../PAYMENTS/16-parent-user-journey.md), [`PAYMENTS/17-nanny-user-journey.md`](../PAYMENTS/17-nanny-user-journey.md).

---

## The two entry paths

Every child on Baby Bloom enters via one of two paths. Both paths are onboarded by phone call — a human-led process that doubles as a learning mechanism. Automated onboarding is intentionally deferred until the model is proven.

### Path A — Matched nanny (nanny found by Baby Bloom matchmaking)

1. Nanny signs up via the matchmaking website to find work.
2. Baby Bloom matches her with a parent.
3. A placement is created. Behind the scenes, the system auto-generates a `child_client` row for every child on the position — `under_three = true` for any under 36 months at creation. Children under 3 appear in the Education tab as **shells** (approximate age + "Set up" prompt; no name or DOB yet).
4. Baby Bloom calls the nanny to onboard her onto the development app. She is told about the commission incentive (~A$1,000 per converted family — see "The commission" below).
5. The nanny opens the Education tab, taps the shell child card, confirms the child's name + DOB, and the development app opens for that child.

**Status at this point:** `child_client.status = 'setup'` (after onboarding) → moves to `'active_nanny'` on the nanny's first app action (planning an activity, logging an observation, recording a diary entry).

### Path B — Bring your own parent (BYO)

1. Nanny signs up via the matchmaking website.
2. No suitable match is available immediately. Baby Bloom calls the nanny and offers an alternative: sign up her existing clients — parents she already works for outside of Baby Bloom.
3. The nanny is told about the commission incentive.
4. The nanny opens the Education tab, taps "Add New", and enters the child's name + DOB + the parent's email address. (Email validation runs: if the email belongs to a parent with an existing active placement on the platform, the flow blocks with a clear message and directs the parent to add the child themselves.)
5. The development app opens for this child. The nanny begins using it as normal. A `child_invites` row exists, waiting for the parent to be pulled in.

**Status at this point:** `child_client.status = 'created_manual'` → moves to `'active_nanny'` on the nanny's first app action.

In both paths, the nanny is **using the app immediately** — well before the parent has signed up. This is the critical "building value" phase. The nanny accumulates content (activities, observations, photos, diary entries) that the parent will eventually walk into.

---

## The nanny → parent pull-in

The parent is *not* the entry point. The nanny is. The parent is *pulled in* by the nanny's activity.

In Path A (matched): the parent already exists on the platform — they were the one who used matchmaking. They receive a welcome email + child-was-added notification + invitation to view the child's developmental record in the BB-app.

In Path B (BYO): the parent does not yet have an account. The nanny entered the parent's email when she created the child. As the nanny uses the app, notifications fire to that email — showing what's happening with the child. These prompt the parent to sign up using the email the nanny registered them with.

**The exact notification cadence is currently being designed**; the principle is fixed: nanny activity → outreach to parent → parent signs up. The trial begins the moment the parent connects.

When the parent signs up + claims the invite (or accepts the nanny's invite-to-parent), the system creates the placement, sets `child_client.parent_user_id`, sets `child_client.placement_id`, transitions `child_client.status` from `'active_nanny'` to `'trial'`, and the 30-day free trial begins.

---

## What the parent walks into

By the time the parent connects, the nanny has often already been using the app for days or weeks. The feed is not empty. The progress radar already shows movement. There are observations with photos, completed activities with reports, diary entries.

This is by design. The parent's first experience of Baby Bloom is **rich** — they do not see an empty app asking them to set things up. They see what their nanny has been doing with their child. That is the hook.

The parent immediately has identical app capabilities to the nanny — full FAB access, Plan Activity, Log Observation, Diary Entry, Katie, the lot. There is no read-only restriction. The child's developmental record is co-authored. See [`BUSINESS-LOGIC.md`](../BUSINESS-LOGIC.md) §Both Roles Get Full Access for the rationale.

---

## The 30-day free trial

From the moment the parent connects, both the parent and the nanny have full access to the dev app for the next 30 days. No credit card has been collected. No charge will fire automatically at the end of the trial — **trial → paid is not auto-renewal**. The parent has to actively choose to subscribe.

During the trial:

- The nanny continues using the app daily. She is incentivised to do so by the commission opportunity.
- The parent sees the daily contributions, the milestone movements, the activities Katie plans, the diary entries, the photos.
- Katie speaks to both — proactively surfacing patterns, summarising the week, prompting the parent to look at specific developmental moments.
- Email reminders fire at T-14, T-7, T-3, T-1, T-0 before trial expiry (and per the COPY-AND-FRAMING doc, the language is **honest loss-frame** — "here's what stops if you don't continue", not manufactured urgency). See [`PAYMENTS/COPY-AND-FRAMING.md`](../PAYMENTS/COPY-AND-FRAMING.md) §3 for the canonical drafts.

The nanny sees a visible counter: A$100 / A$100 of potential commission for this family, locked. The locked counter explains "[Parent] needs to subscribe to convert these earnings." This is loss-aversion engineered on the nanny side, balanced with full honesty. See [`PAYMENTS/COPY-AND-FRAMING.md`](../PAYMENTS/COPY-AND-FRAMING.md) §9.

> **In-app guidance.** During the trial, the dev app does **not** display ambient countdown banners. The product surface stays focused on the child. Email handles the time-based urgency. (Memory: `feedback_no_ambient_banners_during_trial`.)

At trial-end, if the parent has not subscribed:

- The family loses access (per the access-gate `family_has_access`).
- The nanny's trial-period commission row transitions to **frozen** — reclaimable if the parent ever subscribes later.
- The parent receives a "trial wrapped" email (graceful goodbye — see [`PAYMENTS/COPY-AND-FRAMING.md`](../PAYMENTS/COPY-AND-FRAMING.md) §3 T+1).
- The child's records are preserved. The parent can sign in and look back at what was captured.

---

## Conversion to paid

The parent has two options to convert:

### Monthly subscription — A$200/month

Pay-as-you-go. Cancel anytime. Charged monthly via Stripe.

### Upfront — A$2,000 one-time

Covers the child's full 0–3 window. Best math for parents of younger children (a 6-month-old's parent gets ~30 months of development for A$2,000 — effectively ~A$67/month). Framed as "Pay once. Done until {{child_first_name}} is 3."

The pricing page is designed to present **upfront first** as the high anchor + the recommended option for young children, with monthly as the second option. See [`PAYMENTS/COPY-AND-FRAMING.md`](../PAYMENTS/COPY-AND-FRAMING.md) §1 for the canonical pricing-page draft and the psychology behind the framing order.

**Trial → paid is immediate.** Picking a plan during the trial charges the card and activates the paid subscription right away. (Memory: `project_trial_to_paid_immediate`.) Nanny commission accrual moves from "potential trial earnings" to "active cycle earnings" at this moment.

Of every A$200/month subscription:
- A$100 supports Baby Bloom's developmental work for the child.
- A$100 accrues to the nanny as part of her work with the family.

This redistribution is made **visible** in the first-bill receipt and in the nanny's earnings dashboard — see [`PAYMENTS/COPY-AND-FRAMING.md`](../PAYMENTS/COPY-AND-FRAMING.md) §5. The parent sees that half their payment goes to someone they know. The nanny sees that her work is generating real income.

---

## The commission

The nanny earns approximately A$1,000 per converted family across the trial-to-paid horizon. The exact mechanics:

- The trial-period potential commission (A$100 / A$100 visible on the nanny's earnings dashboard during the trial) is released 14 days after the subscription starts, provided the parent has not refunded or cancelled in that window.
- Each subsequent cycle (30 days), a new A$100 commission row is created with a release date of cycle-end + 14 days. The 14-day safeguard window protects against late refund requests.
- The nanny must complete a Stripe Connect Express onboarding (ABN, legal name, DOB, address, ID document, bank details) before any commission can be paid out. The onboarding is embedded into the BB-app — about 5 minutes for the nanny.
- The "$1,000" framing in `WHY/01_THE_WHY` and `02_WHO_WE_SERVE` is the ballpark figure for the first conversion cycle (initial subscription + first few months). Beyond that, the relationship continues to generate commission as long as the family stays subscribed.

The full 15-stage nanny journey — from signup through Stripe Connect onboarding, multi-family scenarios, frozen earnings, blocked payouts, and account closure — is documented in [`PAYMENTS/17-nanny-user-journey.md`](../PAYMENTS/17-nanny-user-journey.md). The parent's mirror journey (14 stages) is in [`PAYMENTS/16-parent-user-journey.md`](../PAYMENTS/16-parent-user-journey.md).

---

## Status pipelines

The platform maintains an integer status code for every parent and every nanny — `parents.bbapp_status` and `nannies.bbapp_status`. The codes drive what surfaces the user sees, what automations fire, what financial events are valid.

### Parent status codes (summary)

| Code | Meaning |
|---|---|
| 0 | Signed up |
| 1 | Active session, no children |
| 10 | Has child, no nanny |
| 11 | Invite sent to nanny |
| 12 | Connected (transient) |
| 20 | In trial (30 days) |
| 30 | Active paying |
| 40 | Past due (7-day grace) |
| 41 | Cancelled (in paid period) |
| 42 | Refund requested |
| 50 | Lapsed |
| 51 | Trial expired |
| 52 | Refunded |
| 80 / 81 | Test account (financial bypassed) |
| 99 | Closed |

Full state transitions, what the parent sees at each stage, what the system does, what emails fire — see [`PAYMENTS/16-parent-user-journey.md`](../PAYMENTS/16-parent-user-journey.md).

### Nanny status codes (summary)

| Code | Meaning |
|---|---|
| 0 | Signed up |
| 1 | Active session, no children |
| 10 | Has unparented child |
| 11 | Invite sent |
| 12 | Soft-locked (30 days no parent) |
| 20 | Connected, family in trial |
| 30 | Family paying, no Connect started |
| 31 | Application in progress |
| 32 | Approved, awaiting first payout |
| 33 | Receiving payouts |
| 34 | Payouts blocked |
| 40 | All families lapsed (frozen earnings) |
| 41 | Connect rejected |
| 50 | All families ended |
| 80 / 81 | Test account |
| 99 | Closed |

Full state transitions: [`PAYMENTS/17-nanny-user-journey.md`](../PAYMENTS/17-nanny-user-journey.md).

The multi-family rule: a nanny's `bbapp_status` reflects the **highest tier** across all their families. A nanny serving three families (one in trial, one paying, one cancelled) shows as `33` (paying somewhere — highest tier with active payouts), with per-family detail on the earnings dashboard.

---

## The feed hierarchy (context system)

A single user action can create multiple records in `bapp_logs`. When the nanny submits an activity report, for example, the system creates:

1. The Report row itself (with the mastery ratings).
2. A child observation row per targeted milestone (context = `'activity'`).
3. A progress score recalculation for the affected domains.
4. A history snapshot for `bapp_progress_history`.

Without filtering, the feed's "All" tab would show the Report tile + N duplicate observation tiles for the same action — noise. The **context system** prevents this:

- `context = 'adhoc'` → standalone entry. Shows in the "All" feed.
- `context = 'activity'` → child of an activity report. Hidden from "All" but visible in domain-specific filters.
- `context = 'assessment'` → child of a bulk progress update. Same.

Type-specific filter tabs (Activities, Obs, Growth, Insights) show everything regardless of context. Only the "All" tab applies the context filter.

This is invisible to the user as a *concept* — they just see a clean feed. It is visible in the *quality* of the experience.

See [`BUSINESS-LOGIC.md`](../BUSINESS-LOGIC.md) §Feed Hierarchy for the rationale and [`USER-FLOWS.md`](../USER-FLOWS.md) §Feed Filtering Logic for the exact rules.

---

## AI activity generation

The Plan Activity flow is the only AI-heavy feature on the activity side (Katie is the AI-heavy feature on the platform side).

When the user selects up to three milestones and taps "Create Activity":

1. The server action `generateActivity` runs.
2. A pending log entry is created in the feed (status `'pending'`, AI still generating).
3. The OpenAI client is called directly with a prompt that includes child age, child name, the targeted milestone IDs, and a structured response schema.
4. The response includes: `creativeName`, `recommendedLine`, `activityDescription`, `objectivesList[]`, `intention`, `supplies[]`, `suppliesDisclaimer`, `activityGuide[]`, `encouragementTips[]`, `keyObservations[]` (per-domain observation guides with descriptions for each of the 4 mastery levels).
5. The pending entry is updated to `status='ready'` with the full activity JSON.
6. The feed surfaces the resolved Activity tile with a "Complete & Report" CTA.

If the AI call takes longer than expected, the frontend polls every 10 seconds until the activity resolves. The pending tile shows a spinner and "Generating…" message. Once resolved, it becomes a full Activity tile.

The decision to call OpenAI directly from a Next.js server action (rather than via the prior Make.com webhook used in the GAS prototype) is documented in [`BUSINESS-LOGIC.md`](../BUSINESS-LOGIC.md) §AI Activity Generation. Prompt design is controlled in our codebase, not locked in a third-party automation tool.

---

## Refunds, cancellations, and account closure

Three off-ramps, each with deliberate design choices:

### Cancellation

Available via the Stripe Customer Portal or in-app. The parent retains access until `paid_period_ends_at` (the date Stripe already charged for). Frozen commission rows are created for any in-flight cycle. The cancellation copy emphasises **what stops** (developmental work, milestone progression, Katie's daily insights) and offers a final summary of what was captured — peak-end optimisation for the exit narrative. See [`PAYMENTS/COPY-AND-FRAMING.md`](../PAYMENTS/COPY-AND-FRAMING.md) §4.

### Refunds

**Refunds flow through Contact Us — no self-serve.** A parent who wants a refund submits via the in-app Subscription page; the request lands in an admin review queue with a 14-day response window. Friction is by design. (Memory: `feedback_refunds_via_contact_us`.)

The handling is ACL-compliant: pro-rata refund amount is calculated server-side, the parent is told the calculation, and admin reviews and decides. Approval or denial each comes with a real reason and (on denial) a real alternative — never templated denial. See [`PAYMENTS/COPY-AND-FRAMING.md`](../PAYMENTS/COPY-AND-FRAMING.md) §7 and [`PAYMENTS/07-refund-policy.md`](../PAYMENTS/07-refund-policy.md).

### Account closure

A two-step roundtrip — on-site confirmation modal + emailed link with 24-hour expiry — prevents accidental destructive action. The closure permanently deletes the child's records on Baby Bloom (the platform owns the record; the parent took the developmental journey with us, not in their own backup). Most users who *think* they want to close their account actually want to cancel their subscription; the closure flow surfaces that alternative prominently. See [`PAYMENTS/COPY-AND-FRAMING.md`](../PAYMENTS/COPY-AND-FRAMING.md) §6 and [`PAYMENTS/CHANGE-REQUEST-ACCOUNT-CLOSURE.md`](../PAYMENTS/CHANGE-REQUEST-ACCOUNT-CLOSURE.md).

---

## What governs every interaction

Three rules that quietly shape every flow described above:

1. **Co-managed care.** Parent and nanny are equal contributors to the child's record. Author attribution is always visible. The product is collaborative, not surveillance.
2. **Aligned self-interest.** Every party's incentive serves every other party's incentive. The nanny earning commission requires her to use the app well, which requires the parent to see value, which requires the child to actually benefit. Nobody has to be convinced. See [`03-why-it-works.md`](./03-why-it-works.md).
3. **Honest framing.** The 30-day trial really is no-card-required. The redistribution to the nanny really is half the subscription. The cancellation copy really does name what stops. The math on upfront really does favour parents of younger children. Manipulative framing would not just be unethical — it would fail the moment users compare notes (which they do, in nanny WhatsApp groups and parent Facebook groups). See [`30-presentation-principles.md`](./30-presentation-principles.md).

---

## Cross-references

- [`01-the-product.md`](./01-the-product.md) — the product surface (Feed, Progress, FAB, Katie, milestones).
- [`03-why-it-works.md`](./03-why-it-works.md) — the incentive architecture in detail.
- [`10-for-families.md`](./10-for-families.md) — parent psychology + journey.
- [`11-for-nannies.md`](./11-for-nannies.md) — nanny psychology + journey.
- [`../PAYMENTS/16-parent-user-journey.md`](../PAYMENTS/16-parent-user-journey.md) · [`../PAYMENTS/17-nanny-user-journey.md`](../PAYMENTS/17-nanny-user-journey.md) — full state machines.
- [`../USER-FLOWS.md`](../USER-FLOWS.md) — in-app interaction flows.
- [`../ONBOARDING-LOGIC.md`](../ONBOARDING-LOGIC.md) — the Path A / Path B onboarding rationale.

---

<!-- audit
Last edited: 2026-05-22T14:45+10:00 — bbInfo220526
Notes: Info/02-how-it-works authored. Covers: Path A vs Path B, nanny → parent pull-in, 30-day trial mechanics, conversion to paid (monthly + upfront), commission (~A$1,000 with mechanics + Stripe Connect), parent + nanny status pipelines (14 + 15 codes summarised), feed hierarchy / context system, AI activity generation, refunds + cancellations + closure. Embeds the three governing rules — co-managed care, aligned self-interest, honest framing.
-->
