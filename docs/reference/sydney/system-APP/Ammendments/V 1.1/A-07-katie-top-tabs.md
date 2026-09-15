> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# A-07 — Top-tab Katie / BabyBloom split (Chrome-tab style)

**Complexity:** Small-Medium
**Touches:** `KatieShell.tsx`, `KatieHeader.tsx`, `KatieSwapButton.tsx`, design tokens
**Status:** Ready to hand off

## Intent

Replace the current header-icon swap controls with **two visual tabs at the top of the screen, just under the header bar** (mobile only) — emulating how Chrome browser tabs look. Katie tab adopts a scrapbook beige background; BabyBloom tab keeps the current scheme.

## Why this is smaller than it looks

Per `system/APP/BLOOMBOT/LAYOUT.md` and the existing implementation:

- `KatieShell.tsx` already implements the Katie ↔ Main deck split + carousel swap at the shell layer (every authenticated page).
- `KatieContext.tsx` already manages active-deck state for narrow viewports.
- The 300ms ease-out horizontal translate animation, swipe gesture, and default-land-on-Katie behaviour are already specified + working.

**A-07 is the visual redesign of the swap CONTROLS, not the swap mechanism.** The functions don't change; the UI does. Bailey explicitly: "the current app already handles the split correctly, it just isn't laid out well yet … the functions don't need changing, this is just visual."

**Animation is deferred.** Bailey: "We can work on the animation afterwards." For v1, the existing carousel swap animation continues to fire on tab-tap — no new tab-specific transitions.

## Scope

**In scope (mobile only — narrow viewport / carousel mode):**
- Replace the header-icon swap controls with a two-tab strip directly under the header bar
- Two tabs: "Katie" (left), "BabyBloom" (right) — equal width
- Chrome-browser-tab visual metaphor: active tab visually merges with the body below (no border/seam); inactive tab is slightly recessed/muted
- Katie tab body: scrapbook beige background (NEW design token)
- BabyBloom tab body: existing colour scheme (unchanged)
- Tap inactive tab → swap (calls existing `KatieContext` swap function)
- Top-nav Katie/hamburger swap controls REMOVED on BB-app surfaces; standard header bar stays

**Desktop (wide viewport):**
- Side-by-side layout per `BLOOMBOT/LAYOUT.md` — UNCHANGED
- Optional: Katie deck adopts beige bg to match new mobile styling (see open item below)

**Out of scope:**
- Any new animation work (deferred — existing carousel swap animation keeps firing as today)
- Anything inside Katie's chat (tiles, messages, input bar — all unchanged)
- The swap mechanism / `KatieContext` state — unchanged
- Default-land-on-Katie behaviour — unchanged
- Tier-gating logic — Katie always available per PAYMENTS spec; not an A-07 concern
- Unread-badge architecture — still works; just rendered on the new tab instead of the old swap icon

## Files affected

| File | What changes |
|---|---|
| `app/src/components/katie/KatieShell.tsx` | Render the new two-tab strip in carousel mode (just under the header). Remove existing header-icon swap UI in carousel mode. |
| `app/src/components/katie/KatieHeader.tsx` | Drop the hamburger-as-swap behaviour in carousel mode. Header keeps wordmark + any non-swap functions. |
| `app/src/components/katie/KatieSwapButton.tsx` | Likely delete (or scope to non-BB-app surfaces if it's used elsewhere — grep before removing). The new tab strip replaces it. |
| `app/src/contexts/KatieContext.tsx` | NO CHANGE — active-deck state already exists; the new tabs read + write to the same context. |
| Design tokens (likely `app/src/app/globals.css`) | Add `--color-katie-bg-beige` token. See open item for the value. |

## Behaviour / acceptance criteria

### Tab strip visual

1. Tab strip sits directly under the header bar (no margin / gap — visually adjacent).
2. Two tabs, equal width, no gap between them.
3. Active tab head colour matches the body below it → no visible seam (Chrome-tab merge effect).
4. Inactive tab head: muted variant of the OTHER deck's colour. Slight visual recession so it reads as "behind" the active tab.
5. Tab labels: "Katie" on left, "BabyBloom" on right. No icons in v1 (keep clean).

### Colour split

6. **Katie tab active:** tab head + body both `--color-katie-bg-beige`.
7. **BabyBloom tab active:** tab head + body both `bg-slate-50` (existing main deck background per LAYOUT.md).
8. **Inactive Katie tab** (when BabyBloom is active): muted beige variant.
9. **Inactive BabyBloom tab** (when Katie is active): muted slate variant.

### Interaction

10. Tap inactive tab → swap to that deck. Uses existing `KatieContext` swap function.
11. Existing swipe-gesture-to-swap continues to work (already in carousel mode per LAYOUT.md).
12. Existing 300ms ease-out horizontal translate animation continues to fire on swap (no change).
13. NO new animation work in v1. No sliding tab indicator, no chrome-tab-shape morph, etc. — those are deferred per Bailey.

### Top-nav cleanup

14. On BB-app surfaces, remove the Katie button + the hamburger that toggled to Katie from the top-nav header.
15. Standard header bar (DashboardHeader / Navbar / etc.) remains intact.
16. If the hamburger has non-swap functions (e.g. opens a menu), preserve those. If swap was its only purpose in carousel mode, it goes away in carousel mode.

### Unread badge

17. Unread proactive-message badge currently shown on the swap icon (per LAYOUT.md `[💬²] BabyBloom`). Migrate the badge to the Katie tab head. Badge styling unchanged (`bg-violet-600 text-white rounded-full`, count visible up to 9 then "9+").

### Desktop

18. No top tabs on desktop — side-by-side layout unchanged per LAYOUT.md.
19. The two header-icon swap controls (`KatieSwapButton`, hamburger swap) are already hidden in side-by-side mode per LAYOUT.md — keep that.

### Reduced motion

20. Per `web/performance.md` + LAYOUT.md: respect `prefers-reduced-motion` — existing carousel swap already does. No new motion concerns since we're not adding animations.

## Open items needing Bailey input

These don't block the spec but should be answered during implementation:

1. **Exact "scrapbook beige" value.** The token doesn't exist anywhere yet (grepped — it's only mentioned in this spec). Recommend a muted warm beige in OKLCH like `oklch(96% 0.02 80)` (very pale, warm, low chroma) — flag for Bailey to approve or specify their own. The implementing agent should confirm with Bailey before locking it in.
2. **Desktop Katie deck background.** Bailey: "the desktop view does not need changing except for maybe colour changes to match new styling." Sounds like beige is also applied to the desktop Katie deck so the visual identity is consistent. Confirm during implementation.

## Edge cases

- `KatieSwapButton.tsx` may be referenced from non-Katie surfaces. Grep for usages before deleting; conditionally render where needed.
- `KatieHeader.tsx` may have non-swap functions (per LAYOUT.md: "v1 keeps it as the swap control" but desktop hint is "can open conversation controls"). Preserve non-swap functions; only remove the swap behaviour.
- The Katie deck currently has its own header (`KatieHeader`). With tabs added, decide whether the deck-internal header stays (could feel double-headered) or is removed in carousel mode (since the tab itself is the deck identity). Recommend: keep the deck-internal header for now (consistency with desktop), revisit in a polish pass if it feels heavy.

## Test scenarios

```
1. Mobile (320–1279) → top tabs visible just under header bar
2. Active tab head matches body colour with no visible border
3. Inactive tab head visually recessed/muted
4. Tap inactive tab → swap to that deck (existing animation fires)
5. Swipe gesture → swap (existing behaviour preserved)
6. Desktop (1280+) → side-by-side, no top tabs visible
7. Unread proactive message → badge appears on Katie tab head
8. BB-app surface → no Katie button or swap hamburger in top nav
9. Standard header bar still renders + functions
10. prefers-reduced-motion → no new motion concerns; existing carousel respects it
```

## Notes for the implementing agent

- This is fundamentally a visual redesign of an existing mechanism. **Read `BLOOMBOT/LAYOUT.md` end-to-end first** — it's the canonical spec for how Katie ↔ Main works. A-07 only changes the swap-control UI; the rest of LAYOUT.md still applies.
- **Read `KatieShell.tsx`, `KatieHeader.tsx`, `KatieSwapButton.tsx`, `KatieContext.tsx` together** before changing anything. The carousel swap mechanism is already well-formed; don't reinvent.
- **Don't add animation work in v1.** Bailey explicitly deferred it. The existing 300ms slide on swap continues to fire — leave it alone.
- For the design tokens: add the new beige to `globals.css` (or wherever existing CSS custom properties live) following the existing token-naming convention. If there's no existing convention for "feature theme" colours, create one — `--color-katie-bg-beige` is a reasonable name.
- Per `web/coding-style.md`: animate only compositor-friendly properties; semantic HTML; no hardcoded palette repetitions.
- Per `web/design-quality.md`: this is a focal element — give it intentional hierarchy + spacing rhythm. Chrome-tab visual is opinionated, not generic.
- a11y: proper `role="tablist"` / `role="tab"` / `aria-selected` ARIA pattern on the new tab strip. Keyboard nav: arrow keys to move between tabs, Enter to activate.

## Definition of done

- [ ] Top-tab strip rendered in carousel mode under header bar
- [ ] Two tabs, "Katie" and "BabyBloom", equal width, chrome-tab merge with body
- [ ] Old header-icon swap controls removed on BB-app surfaces (with grep-check for other usages)
- [ ] Scrapbook beige design token added + applied to Katie tab body
- [ ] Active tab visually contiguous with body
- [ ] Tab tap → swap via existing `KatieContext` function
- [ ] Swipe-to-swap still works (existing behaviour)
- [ ] Existing carousel swap animation still fires (no new animation work)
- [ ] Unread badge migrated to Katie tab head
- [ ] Desktop layout unchanged (or beige applied to Katie deck if Bailey confirms)
- [ ] ARIA tab pattern correct (`tablist`, `tab`, `aria-selected`)
- [ ] Visual regression at 320 / 768 / 1024 / 1440
- [ ] `code-reviewer` + `typescript-reviewer` + `a11y-architect` agents passed
- [ ] Manual smoke on real iPhone

## Future work (deferred)

- Tab-tap animation polish (sliding active indicator, chrome-tab shape morph, etc.)
- Tab swipe-drag (if we want users to drag tabs around like browser tabs — probably not needed)
- Desktop visual treatment unification with the new beige theme
