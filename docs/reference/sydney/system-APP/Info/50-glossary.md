> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# 50 — Glossary

> Vocabulary discipline + acronyms. The words Baby Bloom uses and the words it does not. Anything authored downstream of this folder — marketing copy, in-app strings, sales scripts, investor decks, internal docs — should respect these conventions.

---

## Vocabulary discipline — the words we use

### Follow / Support / Enhance / Record / Observe — instead of "track"

**RULE: never "track" / "tracking" / "tracker".** This is non-negotiable, codified in memory `feedback_never_use_tracking_terminology`. We are not surveillance. We are not a parental-monitoring product. We are an educational platform that *follows* a child's developmental journey alongside the adults caring for them.

| Wrong | Right |
|---|---|
| Track your child's milestones | Follow your child's milestone journey |
| Tracking app for parents | Development app for families |
| Track development | Support development |
| Milestone tracker | Milestone library / developmental record |
| Activity tracker | Activity log |
| Track what your nanny does | See what's happening with {{child}} |

Where the engineering layer uses "track" internally (e.g. `bbapp_status_history`, `track_event`), it stays as code. User-facing language never mirrors it.

The reason: *track* connotes surveillance. *Follow* connotes accompaniment. The verbs are not interchangeable, and the difference is the brand.

### Follows alongside / Co-authored / Contributes — instead of "logs" or "records" when describing the joint nature

The development app is **co-authored** by the parent and the nanny. They both *contribute* to the child's record. When we describe this in marketing or in-app:

| Less ideal | More ideal |
|---|---|
| Logs what the nanny does | Captures the day's developmental work |
| Records the child's progress | Builds the child's developmental record |
| Tracks who did what | Author-attribution on every entry |

"Records" and "logs" are still acceptable verbs internally and in the data model — but in consumer-facing text, the structural choice should foreground *contribution* and *authorship*.

### Develop / Develops / Developmental — instead of "grow"

Children "develop", in our register. "Grow" is also fine and natural; "develop" is the more precise verb because it pairs with the EYLF framework and the milestone language. Both are in scope.

### Support / Enhance / Strengthen — instead of "improve"

We do not "improve" children (that implies a deficit). We *support* their development. We *enhance* the daily caregiving work. We *strengthen* the parent-nanny collaboration. The verbs centre the child's already-existing trajectory; "improve" centres our intervention.

### Capture — instead of "monitor"

"Capture a moment" is on-brand. "Monitor activity" is off-brand. *Capture* implies preserving something that's already happening; *monitor* implies surveillance.

### The years that matter most — instead of "the critical window"

Both true. The first phrasing is the brand's preferred framing — it's gentle, it doesn't medicalise, it doesn't manufacture urgency. The second sounds like a hard-sell. Used in [`PAYMENTS/COPY-AND-FRAMING.md`](../PAYMENTS/COPY-AND-FRAMING.md) §1.

---

## Vocabulary discipline — the words we avoid

### "Tracking" / "Tracker" / "Track" — banned (see above)

### "Monitor" / "Surveillance" / "Watch" — avoided

For the same reason. We follow; we do not surveil.

### "Hack" / "Growth hack" / "Hacks" — banned

Off-brand. We do not "hack" growth. We build flywheels and structures.

### "Disruption" / "Disrupt" — banned

Off-brand. We do not disrupt anything. We exist at a level the existing market does not match.

### "Crushing it" / "Killing it" / "Smashing" — banned

Off-brand register entirely. Adolescent. Cheap.

### "Mama" / "Mama bear" / "Mum tribe" / "Mom guilt" / "Wifey" — banned

Patronising. Per [`WHY/04_THE_BRAND.md`](../../../WHY/04_THE_BRAND.md) §What Baby Bloom Never Does: "Never be cutesy or infantile. No baby talk, no excessive emojis, no cartoon aesthetic, no 'mama bear' language."

### "Hey besties!" / "Friends" (opening a sales email) — banned

Manufactured intimacy. We are not the parent's bestie. We are a serious service she chose.

### Excessive emojis in serious copy — banned

Brand inconsistency. A receipt with a 🎉 is theatrical. A milestone update with ✨ feels needy. Use emojis only where they're *information* (e.g. ☐ ◐ ☑ ✗ ⏸ status icons in operational tables internally), never as decoration on user-facing copy.

### "FOMO" / "Don't miss out" / "Only X left" — banned

Manufactured urgency. Brand-banned per `WHY/04_THE_BRAND.md` "Never be pushy or pully".

### "Studies show…" / "Research suggests…" (when used as guilt) — banned

Studies-as-guilt is a manipulation pattern. We do not say "studies show children who…" to make a parent feel inadequate. If we cite research, it is because the research is genuinely informative and presented respectfully — not as a guilt trigger.

### "Click here" — banned (a11y as well as brand)

Cheap copy + poor accessibility (screen readers read "click here" without context). Use descriptive link text: "View your subscription", "See {{child_first_name}}'s recent observations".

### "Submit" as a CTA — usually avoided

Robotic. Prefer descriptive: "Save observation", "Log diary entry", "Add progress". "Submit" stays in admin/legal/refund-request forms where formality is appropriate.

### Stock-photo language ("happy family", "joyful childhood", "magical moments") — avoided

Empty signifiers. We use specifics: "the moment {{nanny_first_name}} caught {{child_first_name}}'s first independent steps" beats "a magical moment". Specificity per [`30-presentation-principles.md`](./30-presentation-principles.md) §4.

### "AI-powered" / "AI-driven" as a marketing claim — used carefully

Baby Bloom *is* AI-powered (Katie + activity generation + insights). But "AI-powered childcare!" reads as a tech claim. We let the AI work be visible through the *product* — Katie's voice, the activity quality, the surfaced patterns — rather than claiming the capability as a marketing feature.

When AI capability is named directly, it's accurately and specifically: "Katie plans activities tailored to {{child_first_name}}'s exact developmental stage" (concrete) beats "AI-powered developmental tracking" (abstract claim).

---

## Names + capitalisation

### Baby Bloom (two words, capitalised)

Always two words. Always capitalised. Not "BabyBloom", not "babybloom", not "Baby bloom".

The brand name in code/URL contexts is sometimes `babybloom` (lowercase, joined) — e.g. `babybloomsydney.com.au`, `bloombot`, `bapp_logs`. That is a separate naming convention for code. **User-facing copy is "Baby Bloom".**

### Baby Bloom Sydney

The full name, used in legal contexts and where geographic clarity matters. Most consumer-facing copy uses just "Baby Bloom".

### Katie (user-facing) / BloomBot (internal only)

Per [`../BLOOMBOT/BRANDING.md`](../BLOOMBOT/BRANDING.md): **Katie** is what every user sees. **BloomBot** is what the code calls her. Never invert. If a user-facing string says "BloomBot", it's a bug; fix it.

Katie refers to herself as "Katie". Never "the bot", "the AI assistant", "the chatbot". When asked what she is, she says "I'm Katie, your assistant on Baby Bloom" — never "I'm just an AI" or "I'm BloomBot".

### The dev app / The development app / The BB-app

All three are acceptable internally for the development application surface. User-facing copy generally avoids naming it specifically — it's just "Baby Bloom" (the product is the brand). When distinction is needed, "the development app" or "the BB-app" works.

The internal term "dev app" is convenient for these context docs and operational discussion; we don't say "dev app" to users.

---

## Acronyms + domain terms

### EYLF — Early Years Learning Framework

The Australian developmental framework Baby Bloom aligns to. Source for the 7 domains and the milestone structure. Cited where credibility helps; not explained in detail in consumer copy (parents who care about EYLF know what it is; parents who don't don't need the acronym shoved at them).

### Path A / Path B

Internal taxonomy for the two nanny-entry paths.
- **Path A** — matched nanny (parent comes via Baby Bloom matchmaking).
- **Path B** — BYO (nanny brings her own existing client / parent).

Used in internal docs and in this folder. Not user-facing terminology.

### `under_three`

The boolean flag on `child_client` that gates Education-tab visibility. Set once at child creation; not auto-recalculated. A child who turns 3 does not lose their record; the flag was set when they were entered. Stays in code; not a user-facing concept.

### `bbapp_status`

The integer status code (0–99) on `parents` and `nannies` tables that drives the per-user state machine. Stays in code + admin surfaces only. Not user-facing.

### Aura / Aura principle

The brand's governing principle. Documented fully in [`WHY/04_THE_BRAND.md`](../../../WHY/04_THE_BRAND.md). Internal term; not used in consumer-facing copy.

### Path A / Shell child

A "shell" is a child auto-created from a placement (Path A) that has approximate age + nanny but no name + DOB yet. The nanny "sets up" the shell by confirming the child's details. Internal term.

### The aligned-incentive matrix

The 4×3 framework documented in [`03-why-it-works.md`](./03-why-it-works.md). Internal language for the structural argument behind every product decision.

### `bapp_logs`

The Postgres table that stores every feed entry — activities, observations, diary entries, reports, insights, custom tiles. Schema-level term; not user-facing.

### `child_client`

The core platform entity representing a child as a client of Baby Bloom. Schema-level term; not user-facing. Documented in [`../BUSINESS-LOGIC.md`](../BUSINESS-LOGIC.md) §`child_client` as Central Entity.

### Mastery scale — Introduced / Assisted / Guided / Independent

The four-step mastery ladder. User-facing terminology — these are the exact words shown in the Report drawer and the milestone observation guides. See [`41-milestone-library.md`](./41-milestone-library.md) §Mastery scale.

### Context system — `adhoc` / `activity` / `assessment`

The `context` column on `bapp_logs` that gates whether a child observation appears in the "All" feed. Schema-level term; documented in [`02-how-it-works.md`](./02-how-it-works.md) §Feed hierarchy. Not user-facing — the user just experiences a clean feed.

### FAB

Floating Action Button. Standard UI term. Used internally; user-facing copy refers to it as "the + button" or just describes its actions (Plan Activity, Log Observation, Diary Entry).

### Stripe Connect / Connect Express

Stripe's marketplace payout product. Nanny-facing copy might mention "set up your payout details" — without naming Stripe in the leading position. Stripe is named in receipts and in the help text where useful, but the BB-side flow doesn't lead with the integration partner.

### ACL — Australian Consumer Law

The legal framework that governs refunds, unfair contract terms, and consumer rights in Australia. Mentioned explicitly in refund-policy contexts to signal compliance + competence. See [`../PAYMENTS/07-refund-policy.md`](../PAYMENTS/07-refund-policy.md).

### ABN — Australian Business Number

Required for the nanny's Stripe Connect onboarding. Standard Australian business term; used as-is.

### EOFY — End of Financial Year

Australian tax-year reference (30 June). Used in nanny annual statements. Standard.

---

## Tone register — quick reference

When in doubt about whether a piece of copy is on-brand:

| Register | When to use |
|---|---|
| **Internal frank** (this folder, the WHY docs, sales scripts for the phone team) | Operational truths. Three-layer parent drive. Industry trauma. The aligned-incentive matrix's blunt reality. |
| **Operational** (the data model, admin surfaces, internal logs) | Code terms, schema names, status codes. Precise and technical. |
| **Consumer aura** (the website, the app, the emails, the in-product Katie messages) | Restraint, post-struggle voice, specificity, "show don't tell". Never preachy, never pushy, never over-explained. |
| **Katie's voice** (the AI agent's user-facing messages) | A capable teammate. Names the child. Specifics. Warmth through restraint, not performance. Never says "I'm just an AI". |

The consumer aura is the production register. The other three exist *inside the building*. Confusing them — leaking internal frank language into consumer surfaces, or letting Katie sound like an internal sales doc — is the most common failure mode.

---

## Quick-check phrases

Phrases to use when calibrating new copy:

**On-brand:**
- "Choose how you support {{child_first_name}}'s development."
- "Pay once. Done until {{child_first_name}} is 3."
- "No card required."
- "We'll keep your records safe."
- "Thank you for the past month."
- "Your A$X has been released."
- "Hi {{parent_first_name}}, just a note —"

**Off-brand:**
- "Don't miss out!"
- "Tag a friend!"
- "Click here to claim!"
- "Studies show…"
- "Only 3 spots left!"
- "Trusted by 10,000+ Sydney parents!" (until / unless the number is real and material)
- "Hey besties, big news today —"
- "Hack your child's development with AI!"

If a piece of copy reads more like the second list than the first, redesign.

---

## Cross-references

- [`30-presentation-principles.md`](./30-presentation-principles.md) — the ten principles + Carnegie/Kahneman tables.
- [`WHY/04_THE_BRAND.md`](../../../WHY/04_THE_BRAND.md) — the full "never do" patterns + 4 canonical checklists.
- [`../PAYMENTS/COPY-AND-FRAMING.md`](../PAYMENTS/COPY-AND-FRAMING.md) — sample copy that embodies these conventions.
- [`../BLOOMBOT/BRANDING.md`](../BLOOMBOT/BRANDING.md) — Katie / BloomBot naming rule.
- Memory `feedback_never_use_tracking_terminology` — codifies the most important vocabulary discipline.

---

<!-- audit
Last edited: 2026-05-22T17:00+10:00 — bbInfo220526
Notes: Info/50-glossary authored. Vocabulary discipline (the verbs we use — follow/support/enhance/record/observe — and the words we never use — track/monitor/hack/disrupt/mama/click here/FOMO/etc). Names + capitalisation rules (Baby Bloom two words, Katie vs BloomBot). Acronyms + domain terms (EYLF, Path A/B, under_three, bbapp_status, ACL, ABN, EOFY, mastery scale, context system, FAB). Tone register table (4 registers). Quick-check on-brand vs off-brand phrase lists. Memory `feedback_never_use_tracking_terminology` cross-referenced as the primary vocabulary anchor.
-->
