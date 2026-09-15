> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# 01 — The Product

> What the Baby Bloom development app literally is, from the perspective of someone who opens it. Distillation of [`USER-FLOWS.md`](../USER-FLOWS.md), [`BUSINESS-LOGIC.md`](../BUSINESS-LOGIC.md), [`MILESTONE-LIBRARY.md`](../MILESTONE-LIBRARY.md), and [`BLOOMBOT/README.md`](../BLOOMBOT/README.md).

---

## What the dev app is

The Baby Bloom development app is a child-development application for the 0–3 age range, used jointly by a nanny and a parent caring for the same child. It supports daily developmental work with the child, captures the resulting observations and milestone progress, and renders them as a continuously evolving record that both parties contribute to and learn from.

It is **not** a tracking app. We **follow** a child's development. We **support** the adults doing that work. The verb matters — see [`50-glossary.md`](./50-glossary.md).

It runs as an authenticated surface inside babybloomsydney.com.au. It is reached through the **Education tab** in either the nanny's or the parent's hub.

---

## What you see when you open it

The app is presented as **two equal decks side-by-side** on wider viewports (or a carousel on narrow viewports):

1. **The Katie Deck** — a conversation surface where Katie, the AI interface, sits. She has the full run of the platform: reads any tile, renders new tiles, writes to any surface, speaks unprompted when something is worth surfacing.
2. **The Main Deck** — the rest of the development app: feed, progress, milestones, the FAB action menu, the child's record.

This is **the** interface. Katie is not a chatbot bolted onto a separate UI; the app *is* the two decks. A user works in either deck and can move between them. The Katie Deck is the door the user opens Baby Bloom to walk through.

> **Naming rule.** User-facing surfaces refer to the AI as **Katie**. Code, schema, and internal docs call it **BloomBot**. Never invert. See [`../BLOOMBOT/BRANDING.md`](../BLOOMBOT/BRANDING.md).

---

## The Education tab — entry point

From either hub, the Education tab is the front door to the development app.

**Nanny view of the Education tab:**

- A grid of child cards — one per child the nanny is responsible for (where `under_three = true`).
- For matched children (Path A): the card may be a "shell" showing the approximate age + a "Set up" prompt until the nanny confirms name + DOB.
- For children created manually (Path B — bring your own parent): the card already has the child's name + DOB.
- An "Add New" button — the entry point for Path B, where the nanny enters the child's details + the parent's email address.

**Parent view of the Education tab:**

- A single child card — no selector, no "Add New". The child was added by the nanny (or auto-created from the placement). The parent's experience is simpler by design.
- Tapping the card enters the child's app view.

Tapping any child card opens that child's development app. From there, the experience is identical for parent and nanny: same Feed, same Progress view, same FAB actions, same Katie.

---

## The Main Deck — Feed + Progress

Inside a child's app view, two primary surfaces are reachable from the bottom navigation:

### Feed (home icon)

A timeline of everything that has happened in this child's developmental record:

- **Activities** — AI-planned developmental activities Katie has generated, targeting specific milestones. Each shows a creative name, recommended line, objectives, supplies needed, step-by-step guide, encouragement tips, and per-domain observation guides. After the activity is completed, the tile gets a Report with mastery ratings.
- **Observations** — three kinds:
  - **General** — a freeform note (no specific milestone) with optional photo.
  - **Focused** — observation tied to one or more developmental domains and optionally a specific milestone with a mastery score.
  - **Progress (bulk)** — explicit progress updates across multiple milestones at once, with a summary + optional note + optional photo.
- **Diary entries** — food (meal / snack / bottle) and sleep (start, end, auto-calculated duration, optional notes).
- **Insights** — Katie-generated insight tiles that surface patterns or moments worth noticing.
- **Custom tiles** — anything Katie or the team produces that doesn't fit a predefined type.

The feed supports five filter tabs: **All · Activities · Obs · Growth · Insights**. The "All" tab uses a context system to hide redundant child entries (e.g. the per-milestone observations that an Activity Report creates internally — they exist for data integrity but the Report tile already shows the ratings inline, so duplicating them would be noise). See [`BUSINESS-LOGIC.md`](../BUSINESS-LOGIC.md) §Feed Hierarchy for the full rule.

Every feed entry is **author-attributed**. You can see who logged it (nanny or parent) and when. The record is co-authored.

### Progress (chart icon)

A radar chart showing the child's standing across the seven EYLF-aligned developmental domains:

| Code | Domain | Short label |
|---|---|---|
| CL | Communication & Language | Communication |
| PSE | Personal, Social & Emotional | Social |
| PD | Physical Development | Physical |
| LIT | Literacy | Literacy |
| NUM | Numeracy | Numeracy |
| UW | Understanding the World | World |
| EAD | Expressive Arts & Design | Art |

Each axis is calculated as `round((sum_of_scores / (milestone_count × 4)) × 100)` — a percentage that aggregates mastery scores across the milestones in the domain. The chart updates live as observations and reports come in.

Alongside the radar, a stats grid shows: total activities, total observations, days active, strongest domain.

This is the visible developmental progression — the artefact the parent looks at to confirm their decision to use Baby Bloom is paying off.

---

## The FAB — three primary actions

A floating action button anchored to the bottom-right opens a three-action menu. These are the moves that *create* developmental record:

### Plan Activity

The nanny (or parent) browses the milestone library, selects up to three milestones to target, and taps "Create Activity". Katie sends the request to the AI activity generator, which returns a full plan: creative name, objectives, intention, supplies, step-by-step guide, encouragement tips, per-domain observation guides.

The plan appears in the feed first as a "Generating…" pending tile, then resolves into a full Activity tile with a "Complete & Report" CTA. (See [`02-how-it-works.md`](./02-how-it-works.md) §AI activity generation for the technical detail.)

### Log Observation

The user picks one of three observation types — General, Focused, Progress — and fills out the appropriate form:

- **General:** photo + freeform text.
- **Focused:** domain dropdown (multi-select), optional milestone + score, optional photo, observation text.
- **Progress:** full milestone accordion → tap milestones → choose mastery score per milestone → optional note + photo → submit.

### Diary Entry

The user picks Food or Sleep:

- **Food:** Meal / Snack / Bottle. For meals + snacks: "what did they have?" + time. For bottles: quantity (30ml–240ml in 30ml increments) + time.
- **Sleep:** start time, end time, auto-calculated duration (handles overnight), optional notes.

The FAB is intentionally compact — three actions, no more. It is the throat of the contribution funnel.

---

## Katie

Katie is the user-facing name of BloomBot, the AI agent that powers the conversation surface and acts as the proactive intelligence layer for the whole platform.

She is positioned as a **capable teammate**, not a bot:

- She has her own deck — peer to the rest of the site, not a sidebar.
- She has the full run of the platform — reads, curates, renders, and writes tiles. She can plan activities, log observations, surface patterns, generate insights, prompt about overdue developmental focuses, summarise the week.
- She has a tiered memory model — five layers, with daily/weekly/monthly compaction, that lets her hold context across every child a user cares for.
- She speaks **proactively** when site events fire — templated for cheap confirmations, AI-minimal for nuanced responses, AI-full for substantive ones. Scheduled triggers (e.g. weekly overview) also fire.
- She has a **restrained voice**. She does not perform warmth. She does not open every sentence with "As an AI…". When asked what she is, she says "I'm Katie, your assistant on Baby Bloom" — never "I'm a bot" or "I'm just an AI".

What this means in product terms:

- Katie is the *first thing* a parent or nanny sees when they enter the app. Her empty-state line is the brand's opening sentence.
- Katie's tiles are first-class — they appear in the feed alongside human entries with author attribution.
- Katie's proactive messages are budgeted (cost cap per day) and quality-gated (templates first, AI only when warranted).
- Katie is rendered consistently in dark, minimal, Gemini-style aesthetic; the Main Deck retains the platform's visual language. The two decks contrast deliberately.

See [`../BLOOMBOT/`](../BLOOMBOT/) for the full architecture, module system, system prompt rules, memory model, and module catalogue.

---

## The 41 milestones

The developmental content the app references is a hardcoded library of 41 milestones spanning 7 EYLF-aligned domains and 6 age brackets.

**Age brackets:** 0–3 months, 3–6 months, 6–12 months, 12–18 months, 18–24 months, 24–32 months.

**ID format:** `{DOMAIN}-{AGE_CODE}-{LETTER}` — e.g. `CL-03-A`, `PSE-2432-D`, `NUM-612-D`.

Each milestone is a concrete behavioural marker — "Expresses needs through cries" (CL-03-A), "Pretends to be someone else" (UW-1824-A), "Pedals tricycle" (PD-2432-D). These are the things the activities target, the observations record, and the progress radar aggregates.

The library is currently a curated subset (not exhaustive coverage of every age × domain cell). The schema and ID scheme allow arbitrary extension. See [`41-milestone-library.md`](./41-milestone-library.md) for the catalogue and [`MILESTONE-LIBRARY.md`](../MILESTONE-LIBRARY.md) for the source.

---

## Mastery scoring

For each milestone the child is being followed on, the app records mastery on a four-step ladder:

1. **Introduced** — the child has been exposed to the skill.
2. **Assisted** — the child can perform it with help.
3. **Guided** — the child can perform it with prompts or scaffolding.
4. **Independent** — the child performs it on their own.

The four-step ladder appears wherever a milestone is being rated:

- After completing an activity, the Report drawer asks for a mastery rating per targeted milestone (2×2 grid of buttons: Introduced / Assisted / Guided / Independent).
- In a Focused or Progress observation, the same scale is used when the user attaches a milestone.

Scores accumulate in `bapp_progress_history`. The radar chart computes the per-domain percentage from the current scores.

This four-step scale is the bedrock of the visible developmental progression. It is also the source of the peak-end moments parents look for ("she just moved from Assisted to Guided on three-step instructions"). See [`30-presentation-principles.md`](./30-presentation-principles.md) §Peak-end + [`Psychology/.../deferred-product-amendments.md`](../../../Psychology/Thinking%20Fast%20and%20Slow/deferred-product-amendments.md) Amendment 2.

---

## Under-3 scope

Phase 1 is 0–3 years only. The `under_three` boolean on `child_client` is a one-time flag set at child creation:

- `true` if the child is under 36 months at creation → they appear in the Education tab and the dev app is available for them.
- `false` if the child is 3+ at creation → they exist on the platform as a `child_client` (for completeness) but the Education tab does not surface them.

**A child turning 3 does not suddenly disappear.** The flag is set once, at creation. Continuity is by design.

In future phases (3-6 per [`00-the-why.md`](./00-the-why.md)), the age scope extends. The architecture is age-bracket-flexible; the visible Phase 1 surface is constrained to 0–3 deliberately, to focus where the developmental return is highest.

---

## What the product does NOT do (yet)

These are not failures — they are deferrals. Documenting them prevents the team accidentally promising things the product does not yet deliver:

- **Automated nanny outreach for Path B.** Currently a manual phone-call process. Documented in [`BUSINESS-LOGIC.md`](../BUSINESS-LOGIC.md) §What Is NOT Being Built Yet.
- **Multiple children per parent at full equity.** A parent can have up to 3 children covered by one subscription, but the experience is optimised for the one-child case.
- **A complete EYLF coverage of every age × domain.** The 41 milestones are a curated subset; expansion is straightforward via the ID scheme.
- **A printable end-of-3-years deliverable.** A book or PDF of the child's 0–3 record is on the deferred-amendments list (Amendment 5 in [`Psychology/.../deferred-product-amendments.md`](../../../Psychology/Thinking%20Fast%20and%20Slow/deferred-product-amendments.md)).
- **Phase 2+ surfaces** (nurseries, daycares, primary, secondary) — these are roadmap, not product.

Be precise with this list when external parties ask what Baby Bloom does. The Phase 1 surface is rich and credible; do not overstate.

---

## Where the product lives technically

- **Stack:** Next.js 14 + Supabase + Vercel. See [`../ARCHITECTURE.md`](../ARCHITECTURE.md).
- **AI:** OpenAI for activity generation; Gemini 3 Flash for Katie. (See [`../BLOOMBOT/COST-MODEL.md`](../BLOOMBOT/COST-MODEL.md).)
- **Domain:** `babybloomsydney.com.au`.
- **Authenticated routes:** `/parent`, `/nanny/*`, `/invite/[token]`, `/subscribe-for/[token]`, `/bb` (the dev app surface), `/admin/*`.
- **Public routes:** `/`, `/about`, `/how-it-works`, `/pricing`, `/contact`, `/nannies`, `/nanny/apply`, `/matchmaking/onboarding`, `/childcare-professionals`, plus position and babysitting browsing surfaces and the legal sub-tree.

The public surfaces (under `(public)`) are matchmaking-focused. There is presently no public marketing surface dedicated to the development app itself; building one is a downstream task this Info folder will inform.

---

## Cross-references

- [`02-how-it-works.md`](./02-how-it-works.md) — end-to-end mechanics, both paths, both audiences.
- [`40-feature-reference.md`](./40-feature-reference.md) — per-feature catalogue with parent-lens and nanny-lens framings.
- [`41-milestone-library.md`](./41-milestone-library.md) — the 41-milestone catalogue.
- [`../USER-FLOWS.md`](../USER-FLOWS.md) — the source of truth for in-app flows.
- [`../BLOOMBOT/`](../BLOOMBOT/) — Katie's full technical and operational design.

---

<!-- audit
Last edited: 2026-05-22T14:30+10:00 — bbInfo220526
Notes: Info/01-the-product authored. Covers: two-deck UI, Education tab entry, Feed + Progress + FAB, Katie, 41 milestones, mastery scoring, under-3 scope, what the product does NOT do yet. Author attribution preserved per Bailey vocabulary rule (never "track"; uses "follow / record / contribute").
-->
