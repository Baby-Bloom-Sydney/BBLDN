> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# A-07 — Bottom-tab Katie / BabyBloom split with chrome-tab swipe animation

**Complexity:** Large
**Status:** NEEDS DISCUSSION before specccing for handoff

## What you said

> Currently Katie is accessed via a text icon button on the top navigation and it will switch between Katie and the BabyBloom app when toggling this button and a hamburger icon.
>
> I want this to change to be 2 clear tabs at the bottom of the page — "Katie" on the left and "BabyBloom" on the right.
>
> These will be clearly distinguished by Katie adopting a background colour of 'scrapbook beige' and the Baby Bloom app side maintaining its current colour scheme.
>
> This will look similar to how tabs appear at the top of a Google Chrome tab — where the active tab has no border between the content and the tab — and there is to be an animation of swiping sideways to the other tab when the opposite one is clicked. Almost as though they were both already loaded on the same screen, just that one of them is always off the screen to the side.

## Why this needs discussion before spec

Big architectural shift in how the BB-app shell works. Several decisions before I can write a clean spec:

### 1. Always-loaded performance pattern

"As though they were both already loaded on the same screen" implies both surfaces stay mounted simultaneously, just translated off-screen.

- Pro: animation is buttery, no remount cost on toggle, scroll positions preserved.
- Con: double the rendered tree, double the API calls on first load (Katie hooks + BB-app hooks both fire).

**Question:** is "always loaded" required, or is it OK if the inactive tab is cheaply mounted (e.g. virtualised, render-on-first-visit)? Different complexity profile.

### 2. Animation library + technique

CSS transform + transition is sufficient for a sideways translate. Or we could use a motion library (Framer Motion is already common in Next stacks) for richer easing + gesture support.

**Question:** are we OK with pure CSS, or do you want gesture support (drag to swipe)? Drag adds complexity but is more "native app" feeling.

### 3. Color theme split — scope

Katie tab adopts "scrapbook beige" background. BB-app keeps current scheme.

**Question:** does the beige apply only to the Katie surface body, or also to elements that surface across (status bar, top nav within the Katie tab, etc.)? Do we need a Katie-specific theme variant in the design tokens, or is it just one background-color CSS var per tab?

### 4. Existing top-nav button + hamburger

These currently toggle between Katie and BB-app. With the bottom-tabs replacing that mechanism:

**Question:** does the top-nav button + hamburger go away entirely, or do they get repurposed (e.g. hamburger becomes the menu within the active tab; Katie button is removed)?

### 5. Mobile-vs-desktop

Bottom tabs are a mobile-native pattern. On desktop the same UI feels awkward (you'd expect side nav or top tabs).

**Question:** is this mobile-only, or does desktop get the bottom tabs too? If desktop differs, what's the desktop pattern?

### 6. What happens when the parent isn't subscribed (cross-system with PAYMENTS)

PAYMENTS will gate Katie behind a subscription tier. When the parent is on free tier:
- Does the Katie tab show but with a paywall inside?
- Is the Katie tab hidden entirely?
- Is the tab visible but disabled/locked-icon?

This decision affects the bottom-tab UX significantly.

### 7. What happens during account closure (cross-system with PAYMENTS)

If a parent has triggered an account closure request, the bottom-tabs may need to surface that pending state somehow. Probably not — but worth confirming.

## What I need from you

When you're ready, walk me through your thinking on:
1. Performance pattern (always-loaded vs lazy)
2. Animation pattern (CSS-only vs gesture-enabled)
3. Theme scope (one var vs full Katie-side theme variant)
4. Top-nav cleanup (what stays, what goes)
5. Desktop behaviour
6. Cross-system: Katie tier-gating behaviour
7. Anything else you've been mulling about how the two surfaces should feel together

Once we have that, I'll write the full spec like the others.

## What's clear already (will go straight into the spec when written)

- Two tabs at the bottom: "Katie" on left, "BabyBloom" on right
- Active tab visually contiguous with content above (no border)
- Beige background for Katie side, current scheme for BB-app side
- Sideways swipe animation between tabs
- Replaces existing top-nav Katie/BB toggle mechanism

## Files that will be affected (preliminary)

- `app/src/components/bapp/BAppLayout.tsx` — major rebuild (this is currently the BB-app shell)
- `app/src/components/katie/` — Katie shell changes
- `app/src/components/layout/Navbar.tsx`, `MobileNav.tsx`, `DashboardNav.tsx` — top nav cleanup
- New: `app/src/components/bapp/BottomTabSwitcher.tsx` (or similar) — the two-tab shell + animation
- Design tokens (CSS custom properties) — possible additions for Katie-side theme
