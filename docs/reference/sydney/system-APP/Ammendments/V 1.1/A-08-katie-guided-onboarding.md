> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# A-08 — Katie-guided onboarding (proactive cascade on child creation)

**Complexity:** Medium-Large (writing real Katie prompts is the work; architecture is composing existing primitives)
**Status:** DRAFT v2 — restructured per Bailey's feedback. Prompts iterating.

---

## The vision

When a nanny adds a new child, **Katie proactively starts a conversation** — like a capable colleague meeting the family for the first time. Katie introduces herself, learns just enough to be useful (working schedule, loose routine, developmental baseline), backfills the feed with what the nanny has already done, and showcases what she does.

By the end:
- Feed has multiple real tiles (welcome, routine, dev snapshot, backfill activities, photos if any)
- Katie has memory + scheduling + milestone scores in place
- The nanny has seen Katie do everything she does, in context
- The parent (when they land post-claim) sees a populated feed + their own (lighter) Katie greeting

Bailey: *"It ought to feel like Katie and the nanny have just met for the first time and Katie is here to help with everything!"*

## Architecture (locked)

- Server-side on `createChild` success: create one celebration tile **immediately** + dispatch `child.created` proactive trigger to Katie.
- Katie's system prompt fragment (loaded only during onboarding, drops out when `onboarding_completed = true`) gives her topics, tone, tool guidance.
- Mode `ai-full` per `PROACTIVE-MESSAGES.md` — Katie generates messages from the prompt fragment, with full tool access + memory context.
- Tile-button options + free text rendered in Katie's deck per existing chat-tile pattern.
- Existing tools cover all actions: `write_memory`, `create_schedule`, `read_milestones`, `update_progress`, `create_tile`, `plan_activity`, plus A-06 photo path.

**Speed discipline (Bailey: "this has to be fast if possible"):**
- Server-side celebration tile = instant ($0, no AI roundtrip)
- Welcome message = template tier-1 ($0, ~1ms latency)
- Conversational steps = ai-full but kept SHORT (Katie speaks briefly, leans on tile-buttons over typed input where possible)
- Tools called in batches per turn (max 3 writes per turn per `TOOLS.md`)
- Onboarding total cost target: ≤ $0.02 per child

## What Katie covers (priority order)

| # | Topic | Captured via | Feed artifact |
|---|---|---|---|
| 0 | Celebration tile (server-side) | `create_tile` from server | "{{child}} has been added to BabyBloom, ready to start their journey" |
| 1 | Warm intro | Katie text only | (none — message in chat) |
| 2 | Working schedule (which days) | `write_memory` + `create_schedule` (recurring weekday flags) | (Katie may create a schedule-summary tile) |
| 3 | Loose routine elements (nap, meal, bottle if age-appropriate) | `write_memory` + `create_schedule` for time-anchored items | "Routine added for {{child}}" tile |
| 4 | Developmental snapshot via inference questions | `read_milestones` + `update_progress` (broad-fill prior brackets) | Single "{{child}}'s development has been updated" tile (NOT a list of every milestone) |
| 5 | Backfill 1-2 previous activities + photos | `create_tile` (custom: activity) + photo path | One tile per backfilled activity, photo if provided |
| 6 | Suggest planning a fresh activity (offer, not push) | `plan_activity` if accepted | Activity tile if user accepts |
| 7 | Child profile picture (last, not pushy) | A-06 photo path | Profile picture tile if uploaded |
| 8 | Wrap with direct link to the feed | (none) | (none — final chat message + sets `onboarding_completed = true`) |

User can skip any topic. Katie adapts. Steps 5 + 6 are "extras" — naturally optional.

---

## Draft Katie prompts (THIS IS THE ITERATION SPACE)

### Step 0 — Server-side celebration tile (immediate, no Katie)

When `createChild` succeeds, server fires `create_tile` with:

| Field | Value |
|---|---|
| heading | `{{child_first_name}} has been added to BabyBloom` |
| text | `Ready to start their journey.` |
| icon | `sparkles` |
| color | `violet` |

This tile lives in the feed before Katie says a word. Even if onboarding is skipped, the feed isn't empty.

### Message 1 — Welcome (template tier-1, instant)

> ✦ Hi {{user_first_name}} — I'm Katie. Welcome {{child_first_name}} to the app.
>
> I'm here to help across everything Baby Bloom does — for {{child_first_name}}, your other children if any, and your account in general. I'll keep an eye on the day, suggest activities, log meals + sleep when you ask, post updates the parent will see, and quietly track {{child_first_name}}'s development so you don't have to write reports.
>
> If you've got a few minutes, I'd love to set things up properly. Otherwise I'll be here when you need me.
>
> **[Let's go]   [Maybe later]**

If `Maybe later` → Katie acknowledges briefly, exits. Banner appears in feed for resume. Sets `onboarding_dismissed = false`.

### Message 2 — Working schedule (which days)

> ✦ When are you with {{child_first_name}}? The days that come up regularly.
>
> **[Mon] [Tue] [Wed] [Thu] [Fri] [Sat] [Sun] [Different each week]**
>
> Or type your pattern (e.g. *"Mon-Fri 8 to 4, Saturday mornings sometimes"*).

Katie writes the schedule to memory + creates a recurring schedule entry if there's a clear pattern. Doesn't require time-of-day yet — just which days. Brief response, moves on.

### Message 3 — Loose routine elements

> ✦ Anything that anchors {{child_first_name}}'s day? Routines change, so just rough is fine — nap times, meal times, that kind of thing.
>
> **[+ Nap time]   [+ Meal time]   [+ Bottle]\*   [+ Other]   [Done — move on]**
>
> Or type it out.
>
> *\* Bottle option only shows for children under ~2 years.*

Katie reads {{child_age_months}} from context and DOES NOT show "Bottle" if older than ~24 months — a 3yo doesn't have bottles. Same intelligence applies elsewhere (don't ask about milk feeds for older kids).

**Important: NO BATH option.** Bailey: too intimate, should not be mentioned.

User taps a button → time picker + brief label inline → Katie processes + creates schedule entries + writes routine to memory. After "Done" or natural exit, Katie creates a "Routine added for {{child_first_name}}" tile summarising what was captured.

### Message 4 — Developmental snapshot via inference questions

> ✦ Quick one — I'd love a sense of where {{child_first_name}} is developmentally. I'll ask a couple of age-appropriate questions and infer the rest, so this should be fast.
>
> *(Katie generates 2-4 smart questions based on {{child_age_months}}. Examples for an 18-month-old:)*
>
> Is {{child_first_name}} walking on their own?
> **[Yes] [Almost — cruising / a few steps] [Not yet]**

Wait for answer. Then next:

> ✦ How's their talking? Any words yet?
> **[Lots of babble, no words] [A few words] [Many words / starting phrases] [Short sentences]**

Wait. Then maybe one more question on social/self-care depending on age.

Then Katie infers across all 7 EYLF domains and bulk-calls `update_progress`:
- Walking → mastered ⇒ crawling, cruising, standing, sitting all mastered (PD)
- Few words → mastered ⇒ babbling, sounds mastered (CL)
- Mark majority of milestones from PRIOR age brackets as `Independent (4)`
- Mark current-bracket milestones as inferred level (`Introduced` / `Assisted` / `Guided` / `Independent`)

Katie may ask one clarifying question if uncertain on a domain.

Single feed tile created: **"{{child_first_name}}'s development has been updated"** (icon: lightbulb, color: amber). No list of every milestone — could be hundreds — just the summary tile. The detailed scores live in the Progress tab where the user can drill in.

### Message 5 — Activity backfill + photos

> ✦ What's something fun you've already done with {{child_first_name}}? An outing, an activity, anything memorable.
>
> (User types — e.g. *"We went to Centennial Park yesterday and fed the ducks."*)

Katie processes → creates a custom tile for it. Then:

> ✦ Lovely. Got a photo from that?
>
> **[Add photo]   [Skip]**

If photo → Katie attaches it to the activity tile she just created.

> ✦ Anything else you'd like to add to the feed? Otherwise I'll move on.
>
> **[+ Another]   [Move on]**

Up to 2-3 backfill activities — past that, diminishing returns. Each gets its own tile. Photos welcome but optional.

### Message 6 — Suggest a fresh activity (offer, don't push)

> ✦ Want me to plan an activity for {{child_first_name}} you could run together this week? I can target a developmental area you want to focus on.
>
> **[Yes — suggest one]   [Save for later]**

Bailey explicitly: *"users may decline, because they are unlikely to be setting up babybloom for the first time whilst on shift."* So this is genuinely a take-it-or-leave-it offer.

If `Yes` → Katie asks which domain → calls `plan_activity` → activity tile appears in feed.
If `Save for later` → Katie acknowledges + moves on.

### Message 7 — Child profile picture (last, not pushy)

> ✦ One last thing — got a photo of {{child_first_name}} for their profile? Helps everything feel more personal. No pressure.
>
> **[Add photo]   [Skip — add it later]**

If upload → A-06 child-photo path + small celebration tile.
If skip → Katie acknowledges + moves on. No follow-up nudge.

### Message 8 — Wrap with direct link

> ✦ You're set. Here's {{child_first_name}}'s feed — **[Open feed →]**
>
> I'll keep adding to it as we go. Lovely meeting you, {{user_first_name}}. ✦

The link goes to `/{{role}}/development/{{child_id}}` — the BB-app feed for that child. Sets `bloombot.settings.onboarding_completed = true`.

---

## Draft system prompt fragment

Loaded into Katie's context only during onboarding. Drops out once `onboarding_completed = true`.

```
You are guiding {{user_first_name}} ({{user_role}}) through onboarding for {{child_first_name}} ({{child_age_months}} months old), who was just added to the app. This is your first conversation with this user. Your job is to capture the foundation you need to be useful AND show them what you do, in real time, by doing it.

You have access to all of your normal tools — use them naturally during this conversation. Read TOOLS.md for the full list. Notable ones for this flow:
- write_memory (capture schedule, routine, child basics — scope=shared, priority=medium-high)
- create_schedule (anchor day-of-week working pattern + time-of-day routine items, 15-min cron grain)
- read_milestones + update_progress (developmental snapshot — read first to know what milestones exist for {{child_age_months}}, then bulk-update via inference)
- create_tile (welcome / routine / dev / activity / photo / showcase tiles)
- plan_activity (only if user accepts the offer in step 6)

Topics to cover, in this rough order (be flexible — let the user lead, return to topics):

1. Welcome (already handled by the proactive tier-1 template — your first response continues from there)
2. WORKING SCHEDULE — which days the user is with {{child_first_name}}. NOT firm time-of-day yet. Just the pattern.
3. LOOSE ROUTINE — nap times, meal times, bottle (only if {{child_age_months}} < 24). Roughly. Routines change.
   ⚠️ DO NOT mention or offer "bath time" — too intimate, never surface this.
4. DEVELOPMENTAL SNAPSHOT — call read_milestones for {{child_age_months}} bracket first. Then ask 2-4 SMART, age-appropriate questions (e.g. "Is {{child}} walking on her own?"). From the answers, INFER cascading milestones — if walking, then crawling/cruising/standing all mastered. Mark majority of prior-bracket milestones as Independent (score 4). Mark current-bracket per inferred level. After all inferences, call update_progress in one or two bulk calls covering all 7 EYLF domains. Then create ONE summary tile: "{{child}}'s development has been updated" — DO NOT list every milestone, could be hundreds.
5. ACTIVITY BACKFILL — ask what fun things they've already done with {{child}}. Create a custom activity tile per item. Ask for photos. Up to 2-3 activities, then move on.
6. SUGGEST FRESH ACTIVITY — offer to plan an activity. ACCEPT decline gracefully — they're likely setting up while on shift, won't want to run something now.
7. CHILD PROFILE PICTURE — last. Light ask. Don't push. Skip is fine.
8. WRAP — final message with direct link to {{child_first_name}}'s feed: /{{user_role}}/development/{{child_id}}. Set bloombot.settings.onboarding_completed = true.

Throughout:
- Use {{child_first_name}} every time you reference the child. Make it personal.
- Offer tile-button options where the answer space is bounded (days of week, milestone-level questions, yes/no). Free text for everything else.
- Keep messages SHORT. Pace matters — this is supposed to be fast. The user is likely on shift.
- Mention BENEFITS naturally: development tracking the parent sees automatically, less manual reporting, you working in the background.
- Mention you'll populate the feed proactively + the user can also do it manually anytime — partnership framing.
- If user opts out at any topic, accept gracefully + move on. Do NOT push.
- If user fully exits ("maybe later"), acknowledge + end. Set onboarding_dismissed = false (so resume banner appears).
- Adapt to age intelligently: don't ask about bottles for a 3-year-old, don't ask about words for a 4-month-old, etc.

Remember you are the user's assistant for their WHOLE account, not just for {{child_first_name}}. If they ask about job search, BSR, profile, schedule etc. mid-onboarding, switch context naturally — your tools cover all of it.

Tone (per BLOOMBOT/BRANDING.md):
- Capable colleague meeting the family for the first time.
- Warm + genuinely curious. Not chirpy. Not deferential. Not overly formal.
- Brief — not chatty. Tile-button options reduce typed friction.
- No emojis except the ✦ sparkle accent at the start of your messages (per LAYOUT.md).
- Never refer to yourself as a bot, AI, or assistant in conversation. You're Katie.
```

---

## Subsequent children (full flow with returning-user context)

Bailey: *"The flow can be done again but with the added context that it is not the nannies first time, so they already know what to do, Remember that for the nanny Katie is the assistant for their whole account not just for children."*

Same cascade, but the welcome message is shorter and frames the user as returning. Katie can be quicker because the user knows the system:

> ✦ Hi {{user_first_name}} — {{child_first_name}}'s been added. You know the drill — want to set them up the same way? I'll be quick.
>
> **[Let's go]   [I'll do it later]**

If `Let's go` → run topics 2-7 directly. Skip the long intro about benefits — they already know.
If `I'll do it later` → graceful exit. Banner for resume.

The system prompt fragment notes the user is returning (`onboarding_completed = true`, this is not their first child) so Katie tunes accordingly.

## Parent post-invite-claim experience (showcase + flipped perspective)

Bailey: *"Similar, but flipped perspective and with mention of what {{nannyName}} has already done. remember that it is a showcase"*

When the parent claims the invite + opens the BB app for the first time, the feed is already populated by {{nanny}}'s onboarding. Katie greets them with a similar cascade — but flipped:

### Message 1 — Welcome (parent variant)

> ✦ Hi {{parent_first_name}} — I'm Katie. Lovely to meet you.
>
> {{nanny_first_name}} has set things up for {{child_first_name}}, so you'll see the feed already has some content — schedule, a few activities they've done, where {{child_first_name}}'s at developmentally.
>
> I'll keep adding to it automatically as {{nanny_first_name}} and {{child_first_name}} go through their day — no need to ask. But I can also help you directly with anything Baby Bloom does. Want a quick tour of what I can do for you?
>
> **[Yes, show me]   [I'll explore]**

If `I'll explore` → exits cleanly. Parent gets to dig into the populated feed.

### Message 2 — Showcase what Katie does for the parent

If `Yes`, Katie creates 3-4 showcase tiles in quick succession (similar to the nanny showcase but parent-flavoured):

| Tile | Heading | Content |
|---|---|---|
| 1 | Updates without asking | "I'll post a daily summary of {{child_first_name}}'s day so you don't have to ask. Tap any tile to dig in." |
| 2 | Ask anything about {{child_first_name}} | "What did they have for lunch? When did they nap? How's their development tracking? Just ask me." |
| 3 | Family memory | "I'll remember photos, milestones, special moments — all in one place you can come back to." |
| 4 | Anything else | "Reminders, schedules, even questions about parenting. If I don't know, I'll tell you." |

### Message 3 — Profile picture (parent's own — links to A-05)

> ✦ One last thing — got a profile picture for yourself? Helps {{nanny_first_name}} feel connected on the app too. No rush.
>
> **[Add photo]   [Skip]**

A-05 mechanism. Skippable.

### Message 4 — Wrap

> ✦ You're set. {{child_first_name}}'s feed is here — **[Open feed →]**
>
> Lovely meeting you. ✦

Sets parent's `onboarding_completed = true` flag.

## Skippability + resume

- Skippable at every step on both flows. Katie doesn't push.
- Resume affordance: "Continue setup with Katie" banner in the feed if `onboarding_completed = false` AND `onboarding_dismissed = false`.
- Banner click → re-fires the welcome message.
- Banner dismiss → `onboarding_dismissed = true`. Banner gone for good. User can always type "set me up" / "help me get started" to retrigger via Katie's normal pattern matching.

## What needs to happen next

Bailey reads the prompts above + reacts. We iterate. Once it feels right:
- Prompts → into the system prompt fragment file
- Server-side celebration tile → into `createChild`
- Tile-button affordances → use existing chat tile components
- Implementing agent has full context to ship.

## Files affected (when handoff happens)

| File | What changes |
|---|---|
| _NEW_ `app/src/lib/chat/modules/onboarding.ts` | Module — declares `child.created` proactive trigger + system prompt fragment |
| `app/src/lib/chat/modules/registry.ts` | One import + one array entry |
| `app/src/lib/actions/bapp/child-clients.ts` | `createChild` (a) creates server-side celebration tile, (b) dispatches `child.created` proactive event |
| `app/src/lib/chat/proactive/dispatcher.ts` | Register `child.created` as a recognised event |
| `app/src/components/bapp/BAppFeedView.tsx` | "Continue setup with Katie" banner when onboarding incomplete |

No new tools, no new tables, no schema changes. New keys in existing `bloombot.settings` JSONB: `onboarding_completed`, `onboarding_dismissed`.

## Notes for the implementing agent (when finalised)

- This is an AI-led conversation, NOT a scripted flow. Don't try to hardcode the message tree. The system prompt fragment + Katie's existing intelligence drive it.
- Welcome message uses tier-1 template (fast, $0). Rest is tier-3 ai-full.
- Tile-button options inside Katie's messages use existing chat-tile rendering pattern (per `LAYOUT.md` "Tile Rendering in Katie"). No new UI components.
- Server-side celebration tile fires SYNCHRONOUSLY with `createChild` — must succeed for child creation to be considered complete. (User should never see an empty feed.)
- Cost target: ≤ $0.02 per child for the full cascade. Monitor in `chat_cost_daily`.
- Subsequent-child variant + parent variant share the same module, just with different system prompt fragments selected based on `onboarding_completed` + `user_role`.
- Read these in order before writing code: `BLOOMBOT/MODULES.md` → `PROACTIVE-MESSAGES.md` → `TOOLS.md` → `BRANDING.md` → `LAYOUT.md`.
