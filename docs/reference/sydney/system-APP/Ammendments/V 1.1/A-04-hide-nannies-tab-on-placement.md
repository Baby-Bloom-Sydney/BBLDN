> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# A-04 — Hide "Browse Nannies" tab when parent has active placement

**Complexity:** Small
**Touches:** Parent hub tab visibility + `PlacementCard.tsx`
**Status:** Ready to hand off (sequence after A-03)

## Intent

When a parent has an active nanny placement, hide the "Browse Nannies" tab (the one that shows all nannies on the site). Replace its discoverability with a small inline hyperlink **under the active nanny tile** that says "see all nannies" and routes to the same destination.

## Why

A parent with a nanny doesn't need to be distracted by other nannies. Showing the browse-nannies tab implicitly suggests "you might want to switch", which is a poor experience for a settled relationship. But total removal would lose the discoverability for legitimate cases (parent wants to compare for a future placement, parent is replacing nanny, etc.) — so a quiet inline link preserves access without distracting.

## Scope

**In scope:**
- Conditional hide of the "Browse Nannies" tab when an active placement exists
- Inline "see all nannies" link under the active nanny tile
- Link routes to the same destination the tab navigates to (i.e. `/nannies` or whatever the existing browse-nannies surface is)

**Out of scope:**
- Removing the browse-nannies surface itself — it stays accessible via the link
- Changing the browse-nannies tab content or behaviour when shown
- Anything about how placement-end transitions back to showing the tab (handled automatically by the conditional)

## Files affected

| File | What changes |
|------|--------------|
| `app/src/app/parent/ParentHubClient.tsx` | Conditional rendering of the browse-nannies tab in the tab definition list |
| `app/src/components/parent/PlacementCard.tsx` | Add inline "see all nannies" link under the card (default variant only — compact stays clean) |
| `app/src/components/parent/BrowseNanniesTab.tsx` | No changes (component itself unchanged) |
| `app/src/components/parent/MyChildcareTab.tsx` | No changes — but verify the placement card rendering area gives space for the inline link |

## Behaviour / acceptance criteria

### Tab visibility

1. **Parent has zero active placements:** browse-nannies tab is shown (current behaviour).
2. **Parent has one or more active placements:** browse-nannies tab is hidden from the parent hub tab nav.
3. Tab visibility is checked at hub render time — recomputes naturally when placement state changes (cancel, end, reconnect).

### Inline link

4. **Visual:** small, subtle hyperlink-styled text under the active nanny tile. Not a button. Plain text underline-on-hover or similar restrained treatment.
5. **Copy:** "see all nannies" (lowercase, exact). Could also surface as "Looking for someone else? See all nannies" if Bailey prefers slightly more context — flag for Bailey's choice during implementation.
6. **Destination:** routes to the same URL the browse-nannies tab would navigate to. Likely `/nannies` or `/parent?t=browse` — verify by inspecting current tab routing.
7. **Position:** directly under the placement card. Centered or left-aligned per the card's existing alignment.

### Edge case: pending placement

8. A pending placement (not yet active) does NOT count as "has placement" for this purpose. Browse tab is visible until placement is `active`.

### Edge case: ended placement

9. After a placement ends, the parent has no active placements → browse tab returns naturally. No special handling needed.

## Test scenarios

```
1. Parent signs up, no placements yet → browse-nannies tab visible
2. Parent has a pending placement (invite sent, not yet connected) → browse tab still visible
3. Parent has active placement → browse tab hidden, inline link visible under card
4. Parent clicks inline link → navigates to browse-nannies surface
5. Parent's placement ends → browse tab visible again
6. Parent in compact placement card view (used elsewhere) → no inline link added (compact stays unchanged)
```

## Notes for the implementing agent

- **Sequence after A-03.** A-03 redesigns `PlacementCard.tsx` significantly. Adding the inline link is much cleaner once the redesign has landed.
- **Do not** add the link in compact variant. Compact is used in other surfaces where the link would be out of place.
- The placement-detection logic likely already exists in `ParentHubClient` (it's how the My Nanny tab knows what to show). Reuse that signal rather than fetching afresh.
- Consider analytics: if you track tab views, the browse-nannies tab will show fewer views once this lands. Make sure that's not interpreted as a regression in dashboards.

## Definition of done

- [ ] Browse-nannies tab hidden when active placement exists
- [ ] Inline "see all nannies" link rendered under default-variant placement card
- [ ] Compact variant unchanged
- [ ] Tab visibility recomputes correctly on placement state changes
- [ ] All test scenarios pass
- [ ] `code-reviewer` + `typescript-reviewer` + `a11y-architect` passed (link is keyboard-accessible)
- [ ] Manual smoke: end placement → tab returns; create new placement → tab disappears
