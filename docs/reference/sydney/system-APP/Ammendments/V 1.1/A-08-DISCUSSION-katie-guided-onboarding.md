> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# A-08 — Add-child onboarding with Katie-guided initial actions

**Complexity:** Large
**Status:** NEEDS DISCUSSION before specccing for handoff
**Sequence:** spec AFTER A-07 lands (Katie's surface is changing — building this against the old Katie surface = rework)

## What you said

> We need to have a way as part of the add child flow that explains briefly what the nanny can do on the app visually, and guides them through their first few actions on the app so that it populates the feed — so that when the nanny and the parent lands on the feed, it is not completely empty.
>
> This will also explain Katie's role on the app. I am more inclined to have this experience completely guided through Katie to get the nanny more used to using Katie. So it will be more like Katie has guided them through setup.

## Why this needs discussion before spec

This is fundamentally a narrative-design + flow-design problem more than a technical one. Several decisions before I can write a spec.

### 1. Who is the audience — parent or nanny or both?

You mentioned "the nanny" multiple times when describing this. But the add-child flow starts when:
- A nanny creates a child entity (nanny-initiated; parent claims invite later), OR
- A parent creates a child entity (parent-initiated; can invite nanny later — does this even exist as a flow?)

**Question:** is the Katie-guided onboarding for:
- (a) The nanny only (the typical flow is nanny-creates-child → invites parent)?
- (b) Both nanny + parent, but with different scripts?
- (c) Whoever creates the child first, then again for the second person when they join?

### 2. What are the "first few actions" Katie guides them through?

To populate the feed, the user needs to seed it with something. Possible actions:
- Add the child's basics (DOB, dietary needs, allergies — currently in AddChildSheet?)
- Log a milestone ("first words" "first steps" — anything to fill the milestone library)
- Upload a child profile picture (overlaps with A-06)
- Log a daily-tracker entry ("had a great day at the park")
- Set up custom routines or schedules
- Connect with the other party (invite parent / claim invite)

**Question:** which of these are MUST-DOs in onboarding vs. "encouraged but skippable"? What's the minimum bar for "feed is populated enough to feel alive"?

### 3. How does Katie present the guidance?

You said "completely guided through Katie." But Katie is currently a chat interface. Several presentations possible:

- (a) Katie sends a series of chat messages with action buttons inline ("Tap here to add their birthday" → opens an inline picker → returns to chat).
- (b) Katie introduces each step as a chat message, then triggers the existing modal/sheet for that step (AddChildSheet, etc.), and reacts to completion.
- (c) Katie is purely conversational — asks questions, the user types or taps answers, Katie does the data writing on their behalf.
- (d) Some hybrid.

**Question:** which presentation style? Each has very different scope:
- (a) requires building inline-action chat tiles in Katie — bigger scope, smoother experience.
- (b) reuses existing modals — smaller scope, more disjointed.
- (c) asks Katie to do data writes via a tool/function — depends on what Katie's existing tool surface allows (per `system/APP/BLOOMBOT/TOOLS.md`).

### 4. Skippable? Resumeable?

**Question:**
- Can the user skip the guided onboarding entirely? (My instinct: yes — first-time guidance shouldn't be a wall.)
- If they skip, can they resume later? ("Show me that intro Katie offered.")
- Do we track whether each user has completed it?

### 5. How does this compose with existing AddChildSheet?

`AddChildSheet.tsx` and `AddChildSheetParent.tsx` already exist as the create-child surfaces.

**Question:** does the Katie-guided onboarding REPLACE these sheets, WRAP these sheets (Katie introduces them), or run AFTER these sheets (sheet creates child → Katie picks up post-creation to guide remaining steps)?

### 6. What if the nanny is creating their second/third child?

Once a nanny knows the app, the guided onboarding becomes friction. **Question:** is this only first-time, only first-child, or every new child?

### 7. Interaction with A-07 (Katie's new surface)

A-07 puts Katie on its own bottom-tab. The guided onboarding "lives in Katie" — so it's on the Katie tab. Does the user start on the BB-app side and get prompted to switch tabs? Or does the add-child flow open on the Katie side directly?

## What I need from you

When you're ready to discuss, walk me through:

1. Audience (nanny only, or both with different scripts)
2. The minimum feed-populating action set
3. Katie's presentation style (inline tiles vs. trigger-modals vs. fully conversational)
4. Skippable + resumeable behaviour
5. How this composes with existing AddChildSheet
6. First-child only or every child
7. Cross-system with A-07: which tab does the user land on, when?

Bonus: any examples from other apps you've used that capture the feeling you want? Onboarding flows like Headspace, Notion's first-page experience, Duolingo first lesson — knowing the reference helps a lot.

## What's clear already (will go into the spec when written)

- Onboarding happens as part of (or immediately after) add-child flow
- Goal: feed is non-empty when the parent + nanny first land on it
- Katie is the protagonist of the onboarding ("Katie has guided them through setup")
- This is also where Katie's role is introduced
- Lives within the Katie surface (so depends on A-07)

## Files that will be affected (preliminary)

- `app/src/components/bapp/AddChildSheet.tsx` + `AddChildSheetParent.tsx` — possibly wrapped or post-hooked
- `app/src/components/katie/` — major additions (scripted flow rendering, inline action tiles?)
- `app/src/lib/actions/bapp/` — possibly new actions for Katie to drive on the user's behalf
- `system/APP/BLOOMBOT/SCRIPTED-FLOWS.md` — onboarding script defined here
- `system/APP/BLOOMBOT/TOOLS.md` — tool additions if Katie needs to write data
- Possibly new: a "user has completed onboarding" flag on `user_profiles` to support skip + resume

## Why we should spec A-07 before this

A-07 changes the surface Katie lives on (top-nav button → bottom tab). If we spec A-08 against the current Katie shell, then ship A-07, A-08 has to be partially redone for the new shell. Ship order matters here.
