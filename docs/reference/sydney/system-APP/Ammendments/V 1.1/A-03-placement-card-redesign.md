> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# A-03 — Active nanny tile redesign

**Complexity:** Small-Medium
**Touches:** `PlacementCard.tsx` (parent surfaces)
**Status:** Ready to hand off

## Intent

The active-nanny tile on the "My Nanny" tab is currently:
- Visually congested
- Truncates the nanny's full first name
- Doesn't show the full placement details (start date, schedule, position info, etc.)
- Too narrow vertically — feels like a sidebar widget rather than the focal element of the tab

Redesign it as a **tall, full-width-on-mobile, fits-the-viewport-without-scrolling** card. Mobile-first.

## Why

The active nanny is the most important relationship a parent has on the platform. The tile is the primary surface where they interact with that relationship. It deserves to be the focal element of the tab, not a compact widget.

## Scope

**In scope:**
- Layout redesign of `PlacementCard.tsx`
- Show full first name (no truncation)
- Show full placement details
- Mobile-first vertical layout that fills viewport without scroll
- Keep the "compact" density variant intact (it's used elsewhere — see Notes)

**Out of scope:**
- Changing what data the placement card receives
- Changing the placement data model
- The "see all nannies" inline link — that's A-04, which builds on this redesign

## Files affected

| File | What changes |
|------|--------------|
| `app/src/components/parent/PlacementCard.tsx` | Layout rebuild for default density; preserve compact variant |
| `app/src/components/parent/MyChildcareTab.tsx` | The tab that renders the placement card — verify the parent container gives the card vertical space to fill |

**Existing card structure (per code grep):**
- Has `compact` boolean prop with two density modes (line 46 reference)
- Avatar sizing varies by compact: `w-14 h-14` vs `w-20 h-20` (line 165)
- Avatar initial sizing: `text-lg` vs `text-2xl` (line 166)
- Has Link to `/nannies/${placement.nannyId}` at line 246

The compact variant is used in other surfaces — DO NOT remove or change its behaviour. Only redesign the **default (non-compact) variant** for the My Nanny tab.

## Behaviour / acceptance criteria

### Layout (mobile-first, default variant only)

1. **Vertical fill:** card fills the available viewport height under the tab navigation, without needing the user to scroll.
2. **Full first name visible:** no truncation. If the name is unusually long, wrap to a second line rather than truncate. Min font size still readable.
3. **Avatar prominent:** larger than current `w-20 h-20`. Recommend `w-32 h-32` or larger on mobile, scale up on tablet/desktop.
4. **Full placement details visible:**
   - Nanny full first name + last initial
   - Position name / role
   - Start date of placement
   - Schedule summary (hours per week, days, etc. — whatever fields exist in the placement record)
   - Children covered (names from `position_children` linkage)
   - Status (active / pending / etc.)
5. **Primary action:** "Open BB app for [child name]" or equivalent — clear next-step CTA.
6. **Secondary actions:** view full nanny profile (existing link to `/nannies/{id}`), message nanny, etc.

### Compact variant

7. Compact variant **unchanged** in look + feel + sizing. Other consumers of `<PlacementCard compact={true} />` should see no visual difference.

### Responsive

8. **Mobile (320–640):** card fills viewport, single-column.
9. **Tablet (641–1023):** card still vertical but allows side padding; max-width to avoid stretching too wide on awkward sizes.
10. **Desktop (1024+):** card is the focal element on the My Nanny tab; consider a two-column layout (avatar/identity on left, details/actions on right) IF it serves the design — but mobile-first stays the default.

## Edge cases

- **No active placement:** This card doesn't render. The empty state for "no active nanny" is a different component — out of scope here.
- **Pending placement** (parent has accepted but nanny hasn't fully connected, or vice versa): card renders with a "Pending" badge or muted style. Behaviour mostly same as active.
- **Multiple positions on the same parent:** Currently single-active-nanny per family per business rule (see PAYMENTS DECISIONS.md D-13). Card is one-per-parent.
- **Very long names:** wrap, don't truncate. Set a minimum font size.

## Test scenarios

```
1. Parent with active placement → My Nanny tab → card fills viewport, all details visible without scroll on iPhone SE (375x667) and Pixel 5 (393x851)
2. Parent's nanny has long name (e.g. "Christopher" or "Maximilian") → name displays in full, wraps if needed
3. Compact variant rendered elsewhere → unchanged from before
4. Tablet (768x1024) → layout adapts, no awkward stretching
5. Desktop (1440x900) → card is focal element, optional two-column layout
6. All a11y: keyboard focus visible, screen reader announces all data, color contrast passes
```

## Notes for the implementing agent

- Reference the global `web/coding-style.md` rules: no animating layout-bound properties, semantic HTML, CSS custom properties for tokens.
- Reference `web/design-quality.md`: avoid generic-template look. This card is a focal element — give it intentional hierarchy + spacing rhythm.
- Visual-regression test the new card at 320 / 768 / 1024 / 1440 per `web/testing.md`.
- a11y-architect agent on this surface — the avatar + identity + actions need proper landmark + label structure.
- `compact` variant tests should remain green to confirm you didn't accidentally change it.

## Definition of done

- [ ] Default-variant `PlacementCard` redesigned per spec
- [ ] Compact variant unchanged (tests still pass)
- [ ] Fills viewport on mobile (verified on iPhone SE + Pixel 5)
- [ ] Full first name visible with wrap fallback
- [ ] All placement details visible without scroll
- [ ] Visual regression at 320 / 768 / 1024 / 1440 captured
- [ ] a11y: keyboard nav + screen reader + contrast verified
- [ ] `code-reviewer` + `typescript-reviewer` + `a11y-architect` passed
- [ ] Manual review on real device (your iPhone)
