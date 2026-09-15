> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# 41 — Milestone Library

> The 41 EYLF-aligned developmental milestones the dev app references. Source: [`../MILESTONE-LIBRARY.md`](../MILESTONE-LIBRARY.md). This doc adds parent-lens and nanny-lens framings for how to talk *about* the milestones — never as a checklist of "things your child should do by X months", always as a vocabulary for the developmental journey.

---

## The seven domains

Baby Bloom aligns to the Australian **Early Years Learning Framework (EYLF)**. The seven domains:

| Code | Full name | Short label | What it covers |
|---|---|---|---|
| **CL** | Communication & Language | Communication | Sounds, words, comprehension, conversation, expression |
| **PSE** | Personal, Social & Emotional | Social | Self-regulation, relationships, identity, independence, empathy |
| **PD** | Physical Development | Physical | Gross motor, fine motor, body awareness, coordination |
| **LIT** | Literacy | Literacy | Pre-reading, mark-making, books, rhymes, print awareness |
| **NUM** | Numeracy | Numeracy | Numbers, patterns, sizes, shapes, sequences, comparison |
| **UW** | Understanding the World | World | Curiosity, exploration, cause-effect, nature, role-play |
| **EAD** | Expressive Arts & Design | Art | Music, movement, mark-making, creativity, dramatic play |

Each domain is one axis of the Progress radar. Each child's standing is calculated as `round((sum_of_scores / (milestone_count × 4)) × 100)` — a percentage that aggregates the mastery scores across milestones in that domain at the child's age.

---

## The six age brackets

| Code | Range |
|---|---|
| `03` | 0–3 months |
| `36` | 3–6 months |
| `612` | 6–12 months |
| `1218` | 12–18 months |
| `1824` | 18–24 months |
| `2432` | 24–32 months |

The bracket spans cover the under-3 developmental window. Children near a bracket boundary are looked at against both sides (a 12-month-old works against both `612` and `1218` milestones during the transitional weeks).

---

## The ID scheme

```
{DOMAIN}-{AGE_CODE}-{LETTER}
```

- Domain — 2 or 3 letter code (CL, PSE, PD, LIT, NUM, UW, EAD).
- Age code — bracket without the dash (`03`, `36`, `612`, `1218`, `1824`, `2432`).
- Letter — sequential within domain × age cell (A, B, C, D…).

Examples: `CL-03-A` (Communication & Language, 0–3mo, first milestone), `PSE-2432-D` (Personal Social Emotional, 24–32mo, fourth milestone), `NUM-612-D` (Numeracy, 6–12mo, fourth milestone).

The scheme supports arbitrary extension — add new milestones with the next letter. The current 41-milestone library is a curated subset; many age × domain cells have gaps (e.g. CL has 0–3mo and 24–32mo coverage but limited in between).

---

## The complete 41-milestone catalogue

### Communication & Language (CL) — 4 milestones

| ID | Age | Milestone |
|---|---|---|
| CL-03-A | 0–3 months | Expresses needs through cries |
| CL-03-B | 0–3 months | Makes throaty noises when content |
| CL-03-C | 0–3 months | Soothed by familiar voices |
| CL-2432-D | 24–32 months | Uses plurals/past tense |

### Personal, Social & Emotional (PSE) — 6 milestones

| ID | Age | Milestone |
|---|---|---|
| PSE-03-A | 0–3 months | Smiles at people |
| PSE-03-B | 0–3 months | Makes eye contact |
| PSE-03-C | 0–3 months | Startles at loud noises |
| PSE-1218-C | 12–18 months | Has tantrums when frustrated |
| PSE-2432-C | 24–32 months | Asserts independence (e.g. 'I do it!') |
| PSE-2432-D | 24–32 months | Has imaginary friends/pretend play |

### Physical Development (PD) — 5 milestones

| ID | Age | Milestone |
|---|---|---|
| PD-03-A | 0–3 months | Lifts head and chest when on stomach |
| PD-03-B | 0–3 months | Moves arms and legs actively |
| PD-03-C | 0–3 months | Grasps finger when placed in palm |
| PD-2432-C | 24–32 months | Climbs playground equipment |
| PD-2432-D | 24–32 months | Pedals tricycle |

### Literacy (LIT) — 6 milestones

| ID | Age | Milestone |
|---|---|---|
| LIT-03-A | 0–3 months | Listens to voices and sounds |
| LIT-03-B | 0–3 months | Recognises familiar voices |
| LIT-03-C | 0–3 months | Enjoys simple songs/rhymes |
| LIT-2432-B | 24–32 months | Scribbles own name with help |
| LIT-2432-C | 24–32 months | Sits through longer stories |
| LIT-2432-D | 24–32 months | Understands print has meaning |

### Numeracy (NUM) — 6 milestones

| ID | Age | Milestone |
|---|---|---|
| NUM-03-A | 0–3 months | Notices patterns and routines (e.g. feeding times) |
| NUM-03-B | 0–3 months | Recognises faces and objects |
| NUM-03-C | 0–3 months | Responds to number songs (rhythm) |
| NUM-612-D | 6–12 months | Explores nesting toys/shape sorters |
| NUM-2432-C | 24–32 months | Understands size/weight/length |
| NUM-2432-D | 24–32 months | Uses number words in context |

### Understanding the World (UW) — 7 milestones

| ID | Age | Milestone |
|---|---|---|
| UW-03-A | 0–3 months | Alert to faces and voices |
| UW-03-B | 0–3 months | Follows objects with eyes |
| UW-03-C | 0–3 months | Reaches for dangling objects |
| UW-36-D | 3–6 months | May imitate simple actions |
| UW-1824-A | 18–24 months | Pretends to be someone else |
| UW-2432-C | 24–32 months | Shows interest in nature |
| UW-2432-D | 24–32 months | Follows three-step instructions |

### Expressive Arts & Design (EAD) — 7 milestones

| ID | Age | Milestone |
|---|---|---|
| EAD-03-A | 0–3 months | Coos as early musical expression |
| EAD-03-B | 0–3 months | Moves arms/legs rhythmically |
| EAD-03-C | 0–3 months | Shows pleasure in sounds |
| EAD-1218-B | 12–18 months | Plays with playdough/clay |
| EAD-1824-D | 18–24 months | Sings songs, may create own |
| EAD-2432-C | 24–32 months | Sings songs with actions |
| EAD-2432-D | 24–32 months | Enjoys role-playing/dressing up |

---

## Mastery scale — the four-step ladder

Every milestone is rated on a four-step ladder:

1. **Introduced** — The child has been exposed to the skill. They've encountered it; they haven't yet attempted it themselves.
2. **Assisted** — The child can perform the skill with full help. An adult provides the action; the child is part of it.
3. **Guided** — The child can perform the skill with prompts or scaffolding. They're doing the work; an adult is hinting, demonstrating, or supporting.
4. **Independent** — The child performs the skill on their own.

The scale is consistent across every milestone. A score of 3 on `CL-2432-D` ("Uses plurals/past tense") means the child uses plurals and past tense with prompting; a score of 4 means they use them spontaneously.

**Why four steps and not five.** Three is too coarse to capture development; five introduces a "neutral middle" that becomes the default rating and loses meaning. Four forces the rater to commit to a direction (closer to Assisted or closer to Independent).

**Why these labels and not "1/5, 2/5, …".** Numbers feel like grades. The four labels are descriptions of the *child's relationship to the skill*, not a school-style rating. They are also the basis of Katie's per-domain observation guides — each milestone's `keyObservations[]` (returned by the AI activity generator) describes what each of the four levels looks like in practice.

---

## Parent-lens framing — how to talk about milestones to a parent

The parent reads milestones as *evidence her decision is working*. Three rules:

### Rule 1 — Specific milestones land harder than generic claims

Generic claim: *"Your child is developing well in communication."* Empty.

Specific milestone: *"Sofia just moved from Assisted to Guided on CL-1218-A — she's starting to use single words with adult prompting."* Concrete. Memorable.

This is exactly the specificity principle from [`30-presentation-principles.md`](./30-presentation-principles.md) §4 — and the milestone library is what makes the specificity possible.

### Rule 2 — Frame as movement, not as a checklist

Wrong: *"Sofia hasn't reached CL-1218-B yet."* Reads as a deficiency.

Right: *"Sofia's communication is in a verbal-leap phase. She's working on CL-1218-A right now — single words with prompts. Next up will be CL-1218-B."* Reads as a journey.

This matters because the parent's deepest layer of drive ([`10-for-families.md`](./10-for-families.md) §The three layers) responds to a child's superiority — and a child *moving forward* is superior to a child *meeting a checklist*. The framing matters.

### Rule 3 — Never compare to other children

Brand-banned ([`WHY/04_THE_BRAND.md`](../../../WHY/04_THE_BRAND.md) §What Baby Bloom Never Does + memory `feedback_never_use_tracking_terminology`).

Wrong: *"Most children Sofia's age have already reached Guided on this milestone."* Triggers anxiety.

Right: *"Sofia is currently working on this milestone. Her progress is her own."* Honest, dignified, not preachy.

The Progress radar is **not** "Sofia vs other children". It is "Sofia at month 1 vs Sofia at month 6". Her own past is her anchor. (This is the Kahneman-style honest anchoring per [`Psychology/.../psychological-principles-reference.md`](../../../Psychology/Thinking%20Fast%20and%20Slow/psychological-principles-reference.md) §2.2.)

---

## Nanny-lens framing — how the nanny uses the library

For the nanny, the library is a **toolkit**, not a report card. Three things she uses it for:

### Use 1 — Activity planning

When she taps "Plan Activity" and selects milestones, she's picking the targets for the next 20-30 minutes of work. The AI engine returns an activity tailored to those targets. The library is her vocabulary for what she's working on.

### Use 2 — Observation tagging

When she logs a Focused observation, she can tag it to a specific milestone. *"Just saw Sofia stack three blocks — that's PD-1218-B at Guided."* This makes her observation searchable, scoreable, and connected to the Progress radar.

### Use 3 — Conversation with the parent

When the parent asks "what are you working on with her?", she has a precise answer. *"This week, mostly Communication — CL-1218-A and CL-1218-C. She's in a verbal-leap phase."* She sounds like a structured professional because she *is* one.

The library transforms her work from "I played with the baby today" to "I worked on three Communication milestones this week, two at Guided, one at Assisted". Same work, transformed expression.

---

## How milestones become AI activities

The AI activity generator takes the targeted milestone IDs and the child's exact age (in months) as input. The system prompt instructs it to:

1. Produce an age-appropriate activity that targets every selected milestone.
2. Generate a `creativeName` (the activity title) and a `recommendedLine` (the one-sentence pitch).
3. Provide `objectivesList[]` — what the child will learn.
4. Provide `intention` — the developmental purpose.
5. Provide `supplies[]` (with a disclaimer if specific items might not be available).
6. Provide `activityGuide[]` — the step-by-step.
7. Provide `encouragementTips[]` — how to respond when the child is engaging.
8. Provide `keyObservations[]` — per-targeted-milestone observation guide, with descriptions of what each of the four mastery levels would look like in this activity.

The last point is the bridge: the AI doesn't just plan the activity, it tells the nanny what to watch for at each mastery level. When the nanny submits the Report, she's choosing between four concrete options the AI has already described — not making up a definition on the spot.

This is how the library becomes operational. The milestones are abstract; the activities are concrete; the per-mastery-level descriptions in `keyObservations[]` close the loop.

---

## How to talk about gaps in the library

The 41 milestones do not cover every cell of the 7 × 6 grid. CL has 4 (gaps in 3–6 and 6–24 months). PSE has 6 (gap in 6–12 months). The Progress radar accounts for milestone count per domain so gaps don't make a domain look artificially low — but the gaps exist.

When asked about gaps (internally or by sophisticated users):

- Honest answer: *"The library is currently a curated subset. The ID scheme supports arbitrary expansion. We're expanding coverage as we go."*
- Roadmap framing: *"Future product investment includes aligning the full library to comprehensive EYLF coverage."*

What we do NOT do:

- Pretend the library is exhaustive when it isn't.
- Manufacture coverage by stretching descriptions.
- Hide the gaps from the parent — she can see them in the milestone accordion.

---

## How the library will evolve

Three planned directions:

1. **Comprehensive EYLF coverage.** Fill the gaps so every age × domain cell has multiple milestones. (Currently in [`../BUSINESS-LOGIC.md`](../BUSINESS-LOGIC.md) §What Is NOT Being Built Yet.)
2. **Database-managed library.** Move from hardcoded `js/library.js` (prototype legacy) to an admin-editable database table. Allows updates without code deploys.
3. **Beyond 0–3.** As Phase 2-6 surfaces ship (nurseries, primary, secondary), the library extends upward — same scheme (`{DOMAIN}-{AGE_CODE}-{LETTER}`) with new age codes.

Each direction preserves the four-step mastery scale, the EYLF alignment, and the ID scheme. The architecture is built for this kind of expansion.

---

## Cross-references

- [`01-the-product.md`](./01-the-product.md) — where milestones fit in the product as a whole.
- [`40-feature-reference.md`](./40-feature-reference.md) — the Plan Activity / Complete & Report / Progress radar features that reference milestones.
- [`30-presentation-principles.md`](./30-presentation-principles.md) §4 — the specificity principle, of which milestone references are an example.
- [`../MILESTONE-LIBRARY.md`](../MILESTONE-LIBRARY.md) — the source of truth.
- [`../USER-FLOWS.md`](../USER-FLOWS.md) §Plan Activity — how milestone selection drives activity generation.

---

<!-- audit
Last edited: 2026-05-22T16:45+10:00 — bbInfo220526
Notes: Info/41-milestone-library authored. The 7 EYLF domains + 6 age brackets + ID scheme + full 41-milestone catalogue (CL ×4, PSE ×6, PD ×5, LIT ×6, NUM ×6, UW ×7, EAD ×7). The four-step mastery scale with rationale (why four, why these labels). Parent-lens framing (3 rules — specificity, frame-as-movement, never-compare). Nanny-lens framing (3 uses — planning, tagging, professional conversation). How milestones become AI activities (the keyObservations bridge). Honest treatment of library gaps. Planned evolution.
-->
