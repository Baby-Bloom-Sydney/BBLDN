> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# 40 — Feature Reference

> Per-feature catalogue of the development app. Each feature with the canonical description, a parent-lens framing (what she experiences), a nanny-lens framing (what she experiences), and pointers to the source spec. Use this as the reference when describing any feature in downstream content.

---

## Entry: The Education tab

**Canonical description:** The Education tab is the front door to the development app from either the parent's hub or the nanny's hub. The nanny's Education tab shows a grid of child cards (one per child she's responsible for where `under_three = true`) plus an "Add New" button for Path B child creation. The parent's Education tab shows a single child card — no selector, no "Add New". Tapping any child card enters that child's development app view.

**Parent lens:** She lands on a card with her child's name. One tap and she's inside. There is no decision to make, no setup to do — the nanny has already done the setup work. The simplicity is intentional.

**Nanny lens:** She lands on a grid of every child she's responsible for. She can add new children (Path B) directly. Shells (Path A children awaiting confirmation) are visually distinct so she knows what needs setting up.

**Source:** [`../USER-FLOWS.md`](../USER-FLOWS.md) §Education Tab (Hub).

---

## The two-deck layout

**Canonical description:** Once inside a child's development app, the screen is split into two equal decks side-by-side on wider viewports (or presented as a carousel on narrow viewports). The **Katie Deck** is on the left — a conversation surface, dark and minimal in a Gemini-style aesthetic. The **Main Deck** is on the right — the rest of the dev app (feed, progress, milestones, FAB). Both decks are first-class. Users work in either; the swap control in the Main Deck header switches focus on narrow viewports.

**Parent lens:** Katie greets her by name. The Main Deck shows what the nanny has been doing with her child. She can speak to Katie ("what did she do yesterday?") and see the answer rendered in the Katie Deck while the Main Deck displays the underlying record.

**Nanny lens:** Same layout. Katie is her quick way to log observations ("just logged a 90-minute nap, 1:30 to 3"), plan activities ("plan an activity for her this afternoon — focus on Numeracy"), get reminders ("she's due for an update on Communication; her last observation was 5 days ago").

**Source:** [`../BLOOMBOT/LAYOUT.md`](../BLOOMBOT/LAYOUT.md) · [`../BLOOMBOT/README.md`](../BLOOMBOT/README.md).

---

## The Feed

**Canonical description:** A reverse-chronological timeline of everything that has happened in this child's developmental record. Tiles include: Activities (AI-planned developmental activities + their Reports), Observations (General / Focused / Progress), Diary entries (Food / Sleep), Insights (Katie-generated patterns), and Custom tiles (anything Katie or the team produces outside predefined types). Five filter tabs: All / Activities / Obs / Growth / Insights. The "All" tab uses context filtering to suppress redundant child entries.

**Parent lens:** This is her primary view of what's happening. Photos, observations, milestone movements, Katie's surfaced patterns — all there in order. She scrolls it on the train home, at lunch, before bed. Each tile is author-attributed (nanny vs parent), so she always knows who logged what.

**Nanny lens:** This is the *output* of her work, made visible. Her observations, her completed activity reports, her diary entries — all in one place. The visible-work effect: the parent can see what she has been doing, every day. She is no longer invisible.

**Source:** [`../USER-FLOWS.md`](../USER-FLOWS.md) §Feed Filtering Logic · [`../BUSINESS-LOGIC.md`](../BUSINESS-LOGIC.md) §Feed Hierarchy.

---

## The Progress radar

**Canonical description:** A radar chart visualisation showing the child's standing across the seven EYLF-aligned developmental domains (CL, PSE, PD, LIT, NUM, UW, EAD). Each axis is calculated as `round((sum_of_scores / (milestone_count × 4)) × 100)`. The chart updates as observations and reports come in. Alongside the radar: a stats grid (total activities, total observations, days active, strongest domain).

**Parent lens:** This is the artefact her ambition has been looking for. Visible evidence that her decision is paying off. She compares the radar at month 3 to the radar at month 1 and sees her child moving. (See deferred amendment 2 in [`Psychology/.../deferred-product-amendments.md`](../../../Psychology/Thinking%20Fast%20and%20Slow/deferred-product-amendments.md) for the work to make the *movement itself* more visible — a future product investment.)

**Nanny lens:** This is the visible result of her structured work. When the radar moves, she did that. The parent can see it. The work has consequence.

**Source:** [`../USER-FLOWS.md`](../USER-FLOWS.md) §View Progress Dashboard · [`41-milestone-library.md`](./41-milestone-library.md).

---

## The FAB (Floating Action Button)

**Canonical description:** A floating action button anchored to the bottom-right opens a three-action menu: Plan Activity, Log Observation, Diary Entry. These are the three ways to contribute to a child's record.

**Parent lens:** Three clear actions when she wants to add something to her child's record. She can plan an activity for the weekend with her child, log an observation she made at bath time, record a diary entry of what they ate at dinner.

**Nanny lens:** Three clear actions she uses throughout the day. The activities she plans become the structure of her work. The observations she logs document the moments. The diary entries handle food and sleep — the operational data parents care about.

**Source:** [`../USER-FLOWS.md`](../USER-FLOWS.md) §Plan Activity / Log Observation / Log Diary Entry.

---

## Plan Activity

**Canonical description:** From the FAB → Plan Activity, the user enters the Plan Modal. They browse a milestone accordion (grouped by domain → age), select up to 3 milestones to target (max enforced; "Ready to Generate!" message at 3), and tap "Create Activity". The system creates a pending log entry in the feed, calls OpenAI directly from a Next.js server action with the child's age + targeted milestone IDs, and returns a structured response: `creativeName`, `recommendedLine`, `activityDescription`, `objectivesList[]`, `intention`, `supplies[]`, `suppliesDisclaimer`, `activityGuide[]`, `encouragementTips[]`, `keyObservations[]` (per-domain observation guides for each of the 4 mastery levels). The pending tile resolves into a full Activity tile when the AI returns. Smart polling at 10s intervals supports long-running generations (>50s timeout).

**Parent lens:** She doesn't usually plan activities — the nanny does — but when she does, the process is the same as the nanny's. She picks a few milestones, taps "Create Activity", and Katie's underlying engine produces a tailored activity in seconds. (Or, if she just wants to be involved on the weekend, she taps a milestone to ask Katie what to do — same engine, accessed via conversation.)

**Nanny lens:** This is her central tool. Instead of inventing developmental activities from scratch every morning, she picks 1-3 milestones the child needs work on and the system returns a full plan — objectives, supplies, step-by-step, observation guides. Her cognitive load drops dramatically.

**Source:** [`../USER-FLOWS.md`](../USER-FLOWS.md) §Plan Activity · [`../BUSINESS-LOGIC.md`](../BUSINESS-LOGIC.md) §AI Activity Generation.

---

## Complete & Report (Activity Reports)

**Canonical description:** Activity tiles in `status='ready'` show a "Complete & Report" CTA. Tapping opens a Review drawer (85vh): for each targeted milestone, a 2x2 grid of mastery buttons (Introduced / Assisted / Guided / Independent), an optional notes textarea, and an optional evidence photo upload. On submit, a **Report Cascade** runs: (1) Report row saved; (2) per-milestone child observation rows created with `context='activity'` (hidden from the "All" feed); (3) progress scores recalculated for affected domains; (4) history snapshot written to `bapp_progress_history`; (5) Activity marked completed. The feed + Progress views refresh.

**Parent lens:** When the nanny completes an activity, the Report appears in the feed with the mastery ratings inline. She sees: "Today, Tess worked through the colour-sorting activity. Mastery: Guided on UW-1218-A, Assisted on UW-1218-B, Introduced on UW-1218-C." Specific. Visible. Evidence-based.

**Nanny lens:** When she completes an activity, the Report is the moment she documents her work. Mastery ratings she chooses become the progress data the parent sees. The optional photo and notes give her room to capture the specific moment. The cascade runs invisibly; she just submits.

**Source:** [`../USER-FLOWS.md`](../USER-FLOWS.md) §Complete Activity (Report).

---

## Log Observation

**Canonical description:** Three observation types:

1. **General** — Freeform text + optional photo. No specific milestone, no domain. The "I just want to capture this moment" mode.
2. **Focused** — Domain dropdown (multi-select via repeated add). Optional milestone with mastery score. Optional photo. Observation text.
3. **Progress (bulk)** — Full milestone accordion. Tap milestones, choose mastery score per milestone, build a list. Then enter Summary + Note step (optional photo, optional note, "Skip Note" link). Submit as `logBulkProgress`.

All three create entries in `bapp_logs`. General + Focused use `context='adhoc'` (visible in "All" feed). Progress bulk updates create an `assessment` summary entry visible in "All" + child observation entries with `context='assessment'` hidden from "All".

**Parent lens:** Three ways to capture what she sees. A photo at the park + a paragraph (General). A note about how her child solved a puzzle (Focused, attached to a Numeracy milestone). A formal progress update across several milestones after a week of focused observation (Progress).

**Nanny lens:** Three modes for three kinds of observation. Quick General notes during the day. Focused observations tied to specific milestones when something developmentally noteworthy happens. Periodic Progress updates when she wants to formalise a batch of observations across multiple milestones.

**Source:** [`../USER-FLOWS.md`](../USER-FLOWS.md) §Log Observation.

---

## Diary Entry

**Canonical description:** Two diary types:

1. **Food** — Subtypes: Meal, Snack, Bottle. For Meal/Snack: "what did they have?" textarea + time input. For Bottle: quantity dropdown (30ml–240ml in 30ml increments) + time input.
2. **Sleep** — Start time, End time, auto-calculated duration (handles overnight), optional notes.

Both create entries in `bapp_logs` with `type='diary'` and the appropriate `entryData`.

**Parent lens:** The operational data she cares about most when she's not there. Did her child eat? What did she have? How long did she sleep? Diary entries are typically logged by the nanny throughout the day; the parent reads them.

**Nanny lens:** Quick, structured logging. The 30ml-increment bottle picker is faster than typing "120ml". The auto-calculated sleep duration removes a math step. Operational efficiency for the things she does many times a day.

**Source:** [`../USER-FLOWS.md`](../USER-FLOWS.md) §Log Diary Entry.

---

## Katie (the AI interface)

**Canonical description:** Katie is the user-facing name of BloomBot, the AI agent that powers the conversation surface and acts as the proactive intelligence layer for the platform. She has the full run of the platform (reads, curates, renders, writes tiles), a five-layer memory model with compaction and consolidation, a module system for capabilities, a proactive dispatcher (template / AI-minimal / AI-full tiers), and a restrained voice. Powered by Gemini 3 Flash with cost-capped budgets. Code calls her BloomBot; users see her as Katie. NEVER expose "BloomBot" to a user.

**Parent lens:** Katie is the first thing she sees when she opens the app. Katie answers questions — "what did she do yesterday?", "what milestone is she due for next?", "summarise this week" — and surfaces patterns unprompted ("she's been showing real interest in stacking toys; here's an activity to extend it"). Katie acknowledges effort specifically ("you logged three mealtimes this week and noticed something about texture each time"). Katie is the *thinking partner* a first-time parent has never had.

**Nanny lens:** Katie is her quick way to log + plan + ask. She can speak to Katie naturally ("just put her down for a nap, 1:30 to 2:45") and Katie creates the diary entry. She can ask Katie to plan an activity ("focus on Numeracy this afternoon — 30 minutes, low setup") and Katie does. Katie acknowledges her work specifically.

**Source:** [`../BLOOMBOT/`](../BLOOMBOT/) — the full architecture, modules, system prompt, memory model, cost model.

---

## Milestones + mastery scoring

**Canonical description:** The developmental content is a library of 41 milestones across 7 EYLF-aligned domains and 6 age brackets. Each milestone has an ID (`{DOMAIN}-{AGE_CODE}-{LETTER}` — e.g. `CL-03-A`, `PSE-2432-D`) and a concrete behavioural description. Mastery is recorded on a four-step ladder: Introduced → Assisted → Guided → Independent. Scores accumulate in `bapp_progress_history` and feed the Progress radar.

**Parent lens:** Her child has a profile against 41 specific behavioural markers. Over time, the markers move from Introduced through Assisted through Guided to Independent. The radar reflects this. She can see, milestone by milestone, where her child is and where they're moving.

**Nanny lens:** Her structured developmental work is targeted against these specific markers. When she plans an activity for "first words" she's targeting `CL-1218-A`. When she observes the child stacking three blocks, she's logging Independent on `PD-1218-B`. The library is the framework she works against.

**Source:** [`41-milestone-library.md`](./41-milestone-library.md) · [`../MILESTONE-LIBRARY.md`](../MILESTONE-LIBRARY.md).

---

## Insights (Katie-generated tiles)

**Canonical description:** Katie can generate **Insight** tiles that appear in the feed — patterns she has surfaced, summaries of the week, observations across multiple data points. These are first-class tiles with `type='insight'` and are excluded from the parent-notification email path (per the T-033 skip rule: `type='insight'` is auto-generated; we don't email parents about Katie's auto-generated content).

**Parent lens:** Sometimes a tile in the feed isn't from her or the nanny — it's from Katie, surfacing a pattern. *"This week, {{child}} moved from Assisted to Guided on three Communication milestones. She's in a verbal-leap phase right now."* Specific. Useful. Worth pausing over.

**Nanny lens:** Same — Katie's insights are visible to her too. They give her something to reference in conversation with the parent. *"Did you see Katie's note this morning about the texture pattern? She's right — I should write up what's happening with Sofia's eating."*

**Source:** [`../BLOOMBOT/`](../BLOOMBOT/) — module catalogue includes `insights` module · [`Notifications/FeedPosts/`](../Notifications/FeedPosts/) — defines the skip rule for emails on Katie-generated content.

---

## Notifications + emails

**Canonical description:** A multi-channel correspondence system. Email is the default (via Resend at `src/lib/email/resend.ts`). In-app banners/modals are immediate. Push notifications are post-launch. **Anti-spam:** max 1 marketing email per user per 7 days; transactional emails (receipts, payout receipts, status changes) are exempt. All emails are logged to `email_logs`; 3 hard bounces auto-disable marketing emails for the user.

For parents:
- Trial milestone reminders (T-7, T-3, T-1, T-0).
- Receipt + monthly recap.
- Cancellation graceful goodbye.
- Win-back sequence (T+7, T+30, T+90).
- Refund correspondence.
- Account closure flow.

For nannies:
- Application status updates.
- Commission release receipts (per family + summary).
- Payout blocked alerts.
- Trial-end family-state updates.
- Re-engagement nudges when families lapse.

For both:
- Feed-post notifications (T-033) — when a tile is added to the child's feed by the other party.

**Parent lens:** Emails arrive at meaningful moments — when something is captured for her child, when a milestone moves, when a trial nears its end. The frequency is calibrated to be useful, not annoying. The tone is dignified.

**Nanny lens:** Receipts when commission lands. Status updates as her families progress. Help when she needs it (application abandonment, blocked payouts). The structure she has lacked everywhere else.

**Source:** [`../PAYMENTS/16-parent-user-journey.md`](../PAYMENTS/16-parent-user-journey.md) §Appendix (correspondence schedule) · [`../PAYMENTS/17-nanny-user-journey.md`](../PAYMENTS/17-nanny-user-journey.md) §Appendix · [`../Notifications/FeedPosts/`](../Notifications/FeedPosts/).

---

## Earnings dashboard (nanny only)

**Canonical description:** The nanny's earnings dashboard shows current cycle commission (A$100/family/cycle), per-family breakdown, release dates, the 14-day safeguard window, past payouts, and Stripe Express dashboard link. States: pending → sending → sent → paid for each commission row. Frozen state for paused commissions (parent cancelled within the cycle); reclaimable on re-subscribe within 6 months.

**Parent lens:** She does NOT see this. The earnings counter is a nanny-side mechanism — a deliberate design choice. She knows from the receipt that half her payment goes to the nanny; she does not see the operational accounting.

**Nanny lens:** This is the page she opens every Monday morning. *"How much is pending? When does it release? Are any of my families frozen?"* The dashboard answers every question; the per-family breakdown means she sees the connection between her work with specific children and the money landing.

**Source:** [`../PAYMENTS/COPY-AND-FRAMING.md`](../PAYMENTS/COPY-AND-FRAMING.md) §9 (canonical copy) · [`../PAYMENTS/17-nanny-user-journey.md`](../PAYMENTS/17-nanny-user-journey.md).

---

## Stripe Connect onboarding (nanny only)

**Canonical description:** When a nanny's first family converts, she's prompted to "Apply for payouts". Embedded Stripe Connect Express onboarding runs inside the BB-app — ABN, legal name, DOB, address, ID document, bank details. Account Session created for the embed; her status moves through `30 → 31` (application in progress) → `32` (approved, awaiting first payout) → `33` (receiving payouts) as the webhook lifecycle plays out. Held commission flips to pending when approved.

**Parent lens:** She does NOT see this. Stripe Connect onboarding is entirely a nanny-side flow.

**Nanny lens:** A ~5-minute embedded form she completes once. Save-and-continue support. If Stripe needs more info, she's nudged to come back. If Stripe rejects (rare — usually fraud signals or document mismatch), the admin team gets a Slack alert and contacts her for resolution.

**Source:** [`../PAYMENTS/17-nanny-user-journey.md`](../PAYMENTS/17-nanny-user-journey.md) Stages 7-11 · [`../PAYMENTS/04-stripe-integration.md`](../PAYMENTS/04-stripe-integration.md).

---

## Subscription (parent only)

**Canonical description:** After the 30-day trial, the parent chooses Monthly (A$200/month) or Upfront (A$2,000 one-time, covers through age 3). Stripe Checkout handles the payment. On `checkout.session.completed`, the subscription activates immediately and family access continues without interruption. Subscription cycle = 30 days. Trial-period commission is scheduled for release 14 days after subscription start. Each subsequent cycle's commission is scheduled for release 14 days after cycle end.

**Parent lens:** A single decision at trial-end. Pick monthly or upfront, enter card, done. The receipt that arrives is informative (where the money goes) + emotional (a recap of the month). No surprises.

**Nanny lens:** Her A$100 / A$100 trial counter transitions to A$100 / A$100 cycle counter, with a release date. The countdown starts.

**Source:** [`../PAYMENTS/16-parent-user-journey.md`](../PAYMENTS/16-parent-user-journey.md) Stage 7 · [`../PAYMENTS/COPY-AND-FRAMING.md`](../PAYMENTS/COPY-AND-FRAMING.md) §1 (pricing) + §5 (receipt).

---

## Admin surfaces (Bailey + team only)

**Canonical description:** Admin routes under `/admin/*` — pipeline (parent + nanny status overviews), leads (nanny contact management — see T-032), verifications, subscriptions, payouts, support, users, positions, dashboard, analytics, katie-stats, katie-proposals.

**Parent + Nanny lens:** They do NOT see these. Admin surfaces are entirely backstage. The parent + nanny experience is shaped by what these tools enable (e.g. resolving refund requests, unblocking Stripe Connect issues, contacting nanny leads), not by the surfaces themselves.

**Source:** App-route audit (T-036 source survey).

---

## Cross-references

- [`01-the-product.md`](./01-the-product.md) — narrative description of the product.
- [`02-how-it-works.md`](./02-how-it-works.md) — end-to-end mechanics.
- [`41-milestone-library.md`](./41-milestone-library.md) — the 41-milestone catalogue.
- [`../USER-FLOWS.md`](../USER-FLOWS.md) — source of truth for in-app flows.
- [`../BUSINESS-LOGIC.md`](../BUSINESS-LOGIC.md) — source of truth for business decisions.
- [`../PAYMENTS/`](../PAYMENTS/) — source of truth for subscriptions + commission + refunds.
- [`../BLOOMBOT/`](../BLOOMBOT/) — source of truth for Katie.

---

<!-- audit
Last edited: 2026-05-22T16:30+10:00 — bbInfo220526
Notes: Info/40-feature-reference authored. Per-feature catalogue with canonical description + parent-lens + nanny-lens + source pointer for each. Covers: Education tab, two-deck layout, Feed, Progress radar, FAB, Plan Activity, Complete & Report (Report Cascade), Log Observation (3 types), Diary Entry (Food + Sleep), Katie, milestones + mastery scoring, Insights, notifications + emails, earnings dashboard, Stripe Connect onboarding, subscription, admin surfaces. Parent-lens framings highlight specific value moments; nanny-lens framings emphasise structure + cognitive-load relief + recognition.
-->
