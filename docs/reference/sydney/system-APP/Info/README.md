> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Info — The development app, in context

> Foundational reference workspace for the **Baby Bloom development app**. Everything in this folder is *context documentation* — not consumer-facing copy and not in-app strings. When the team or a future agent drafts a marketing page, an in-app screen, a sales script, an investor deck, or a piece of social content, they pull *from* these docs.

---

## What's here

| File | Reading time | What it answers |
|---|---|---|
| [`00-the-why.md`](./00-the-why.md) | 5 min | Why Baby Bloom exists. The exponentiality belief. The trajectory from Sydney-nannies-0-to-3 to a lifelong learning aid for humankind. |
| [`01-the-product.md`](./01-the-product.md) | 7 min | What the dev app literally is — Feed, Progress, FAB actions, Katie, the 41 EYLF-aligned milestones. The actual surface a family or nanny touches. |
| [`02-how-it-works.md`](./02-how-it-works.md) | 12 min | End-to-end mechanics. Path A and Path B. Nanny → parent pull-in. 30-day trial → conversion → commission. Status pipelines for both audiences. |
| [`03-why-it-works.md`](./03-why-it-works.md) | 8 min | The incentive architecture — why every party's self-interest serves every other party's self-interest. The flywheel diagrammed and explained. |
| [`10-for-families.md`](./10-for-families.md) | 10 min | Parent audience deep dive. Who she is. What she's afraid of. What we give her. Why the receipt feels like a status object, not a bill. |
| [`11-for-nannies.md`](./11-for-nannies.md) | 10 min | Nanny audience deep dive. Who she is. Why daycares broke her. Why Baby Bloom restores her. The cognitive-load drop. The commission. The professional rehabilitation. |
| [`20-offer-architecture.md`](./20-offer-architecture.md) | 10 min | Hormozi *$100M Offers* applied through the aura discipline. Value equation, dream outcome, perceived likelihood, time delay, effort/sacrifice — all mapped onto Baby Bloom without violating the brand. |
| [`21-leads-architecture.md`](./21-leads-architecture.md) | 10 min | Hormozi *$100M Leads* applied through the aura discipline. Warm/cold leads, the four core lead-getters, viral loops — translated into Baby Bloom's existing acquisition mechanics. |
| [`30-presentation-principles.md`](./30-presentation-principles.md) | 12 min | Carnegie + Kahneman synthesised into operating principles for HOW we present anything and WHAT we choose to present. The brand's "never do" list and what's left when you remove it. |
| [`40-feature-reference.md`](./40-feature-reference.md) | 10 min | Per-feature catalogue — Feed, Progress, FAB (Plan Activity / Log Observation / Diary Entry), Katie, Reports, Milestone-progression mechanics. Each feature with parent-lens and nanny-lens framings. |
| [`41-milestone-library.md`](./41-milestone-library.md) | 6 min | The 41 milestones across 7 EYLF-aligned domains × 6 age brackets. ID scheme. How parents read them. How nannies use them. |
| [`50-glossary.md`](./50-glossary.md) | 4 min | Vocabulary discipline. The words we use (follow, support, enhance, observe, record). The words we never use (track, monitor, surveillance, growth-hack). Domain acronyms. |

---

## How to use this folder

**If you're drafting consumer-facing material** (a marketing page, an in-app screen, a sales script):

1. Identify the audience — parent or nanny.
2. Read [`00-the-why.md`](./00-the-why.md) to ground in philosophy.
3. Read the matching audience deep dive — [`10-for-families.md`](./10-for-families.md) or [`11-for-nannies.md`](./11-for-nannies.md).
4. Read [`30-presentation-principles.md`](./30-presentation-principles.md) to ground in how this brand presents.
5. If the material involves money, value, or conversion → also [`20-offer-architecture.md`](./20-offer-architecture.md).
6. If the material involves acquisition or distribution → also [`21-leads-architecture.md`](./21-leads-architecture.md).
7. Draft, then check the result against the "never do" list in [`30-presentation-principles.md`](./30-presentation-principles.md) and `WHY/04_THE_BRAND.md`.

**If you're describing a feature in technical or operational documentation** (a feature spec, an admin tool, a migration plan):

1. Use [`40-feature-reference.md`](./40-feature-reference.md) for the canonical feature description.
2. Use [`41-milestone-library.md`](./41-milestone-library.md) for the developmental content.
3. Use [`50-glossary.md`](./50-glossary.md) for vocabulary.

**If you're onboarding a new person to Baby Bloom** (Claude session, contractor, advisor, hire):

1. Send them the folder.
2. Reading order: 00 → 01 → 02 → 03 → 10 → 11 → 40. (~50 minutes.)
3. The Hormozi/Carnegie/Kahneman docs (20/21/30) are deeper material for anyone making decisions about presentation, pricing, acquisition, or messaging.

---

## What this folder is NOT

- **Not consumer-facing copy.** Every doc here is internal. The frank descriptions of parent psychology (`02_WHO_WE_SERVE.md` style) belong inside the building, not on the website. When that content is translated to public surfaces, it goes through the aura discipline first.
- **Not a substitute for the canonical specs.** The PAYMENTS, BLOOMBOT, USER-FLOWS, and Nanny:Parent linking workspaces are the source of truth for product behaviour. Info/ summarises and frames; the specs *define*.
- **Not a marketing plan.** Strategy and channel-by-channel marketing plans belong in their own workspace when they exist. Info/ is the material those plans pull from.
- **Not in-app strings.** When we ship UI copy, it goes through [`PAYMENTS/COPY-AND-FRAMING.md`](../PAYMENTS/COPY-AND-FRAMING.md) and its successors. Info/ is one layer behind that.

---

## How this folder gets updated

- When the product evolves (new feature, retired feature, changed pricing): the relevant feature file (40-/41-) is updated first; the audience deep-dives (10-/11-) are updated where the change shifts the experience or value; the strategic docs (20-/21-/30-) usually don't need updates unless the offer itself changes.
- When the WHY changes (rare): every downstream doc gets re-grounded. 00-the-why is the canonical distillation; the rest follow.
- When the brand discipline evolves (rarer): `WHY/04_THE_BRAND.md` is the source; this folder's brand-respecting passages mirror it.

Each file carries an audit footer per [`../../OPERATIONS/PROTOCOLS/SIGN-OFF-FORMAT.md`](../../OPERATIONS/PROTOCOLS/SIGN-OFF-FORMAT.md). Honour it.

---

## Source material these docs distil

| Source | What it gives us |
|---|---|
| [`../../../WHY/01_THE_WHY.md`](../../../WHY/01_THE_WHY.md) | Founder's conviction. Exponentiality of education. Phase 1 → Endgame trajectory. |
| [`../../../WHY/02_WHO_WE_SERVE.md`](../../../WHY/02_WHO_WE_SERVE.md) | Parent + nanny psychological profiles. The three layers of parent drive. The nanny's industry trauma + the Baby Bloom restoration. |
| [`../../../WHY/03_THE_SYSTEM.md`](../../../WHY/03_THE_SYSTEM.md) | Acquisition mechanics. Free matchmaking → paid dev app → nanny affiliate flywheel. Viral loop. |
| [`../../../WHY/04_THE_BRAND.md`](../../../WHY/04_THE_BRAND.md) | The aura principle. 14 "never do" patterns. 4 operational checklists. |
| [`../BUSINESS-LOGIC.md`](../BUSINESS-LOGIC.md) | Revenue model, child-level access, dual-path RLS, status pipeline definitions, AI activity generation. |
| [`../USER-FLOWS.md`](../USER-FLOWS.md) | Both audiences' in-app flows — Plan Activity, Log Observation, Diary Entry, Progress view, modal patterns. |
| [`../MILESTONE-LIBRARY.md`](../MILESTONE-LIBRARY.md) | 41 milestones, 7 EYLF domains, 6 age brackets, ID scheme. |
| [`../ONBOARDING-LOGIC.md`](../ONBOARDING-LOGIC.md) | Path A / Path B onboarding. Trial timing. Notification → sign-up flow for parents. |
| [`../PAYMENTS/16-parent-user-journey.md`](../PAYMENTS/16-parent-user-journey.md) | 14 parent status stages with UI surface + system events + correspondence per stage. |
| [`../PAYMENTS/17-nanny-user-journey.md`](../PAYMENTS/17-nanny-user-journey.md) | 15 nanny status stages including Stripe Connect onboarding, multi-family scenarios, frozen earnings. |
| [`../PAYMENTS/COPY-AND-FRAMING.md`](../PAYMENTS/COPY-AND-FRAMING.md) | 763 lines of psychology-grounded sample copy across 11 commercial surfaces. The current voice baseline. |
| [`../BLOOMBOT/README.md`](../BLOOMBOT/README.md) · [`../BLOOMBOT/BRANDING.md`](../BLOOMBOT/BRANDING.md) | Katie = the front-door interface, not a bolt-on chatbot. Naming rule (Katie user-facing, BloomBot internal). |
| [`../../../Psychology/Thinking Fast and Slow/psychological-principles-reference.md`](../../../Psychology/Thinking%20Fast%20and%20Slow/psychological-principles-reference.md) | 120KB always-invert + ethics-flagged catalogue of every relevant decision-making principle. |

---

<!-- audit
Last edited: 2026-05-22T14:15+10:00 — bbInfo220526
Notes: Info/README authored as entry point + navigation map. 12 downstream docs listed with reading times + topics. Source-material table reflects survey done in T-036 sub-task 1. (Originally drafted as T-035; renamed to T-036 at sign-off after detecting collision with existing T-035-nanny-postcode-suburb-resolution research task — INDEX had been stale on that.)
-->
