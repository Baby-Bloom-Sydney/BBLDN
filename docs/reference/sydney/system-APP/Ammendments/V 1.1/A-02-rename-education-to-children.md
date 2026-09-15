> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# A-02 — Rename "Education" tab → "Children"

**Complexity:** Small (but needs careful scoping)
**Touches:** Parent hub, nanny hub, BB-app layout, URL params, types
**Status:** Ready to hand off

## Intent

The tab currently labelled "Education" (visible to both parents and nannies) should be renamed "Children" universally. The label "Education" misframes what the tab does — it's where users see + manage the children they're connected with, not an educational content area.

## Why

"Education" is misleading copy. Users see the tab and don't know what it does. "Children" is direct + universally applicable across both roles.

## Scope

**In scope:**
- Tab label text change in both parent + nanny hubs
- Tab `id` value (currently `"education"`) — see decision below
- URL query param (`?t=education`) — see decision below
- Any analytics events tracking the tab name
- TypeScript types referencing `"education"`

**Out of scope:**
- ANY OTHER use of the word "education" in the codebase. Specifically: nanny qualifications/credentials sections that legitimately reference "education history" (school, university, etc.) MUST NOT be touched. This is a TAB rename only.

## Files affected

Confirmed references found via `grep -rn 't=education\|"education"'`:

| File | Line(s) | What changes |
|------|---------|--------------|
| `app/src/app/nanny/NannyHubClient.tsx` | 136, 951, 1045 | `MainTabId` type union, tab definition object, conditional render |
| `app/src/app/parent/ParentHubClient.tsx` | 303, 2002 | Tab definition (`{ id: "education", label: "Education" }`), conditional render |
| `app/src/components/bapp/BAppLayout.tsx` | 44 | URL construction: `` `/${role}?t=education` `` |

**Agent must verify with a fresh grep** before editing — there may be additional references that landed since this spec was written. Run:
```
grep -rn '"education"\|t=education\|Education' BB/nanny-platform/app/src/
```
…and apply judgment to distinguish "Education" the TAB from "Education" the nanny credential field.

## Decision: rename URL param too, or just label?

**Recommendation: rename both the label AND the tab id (URL param).**

- Label: `"Education"` → `"Children"`
- Tab id: `"education"` → `"children"`
- URL: `?t=education` → `?t=children`

**Plus add a redirect / fallback** — any incoming request with `?t=education` should map to `?t=children` so existing bookmarks, email links, and deep-links don't break. Implement as a check in `BAppLayout.tsx` (or wherever the tab param is parsed): if `?t=education`, treat as `?t=children` (no redirect needed if just internal — just normalize on read).

Reason: clean URLs are worth the small migration cost. The fallback covers user-facing breakage.

**Alternative:** label only, keep `id = "education"` and `?t=education` URL param. Simpler change but leaves a permanent code-smell where the tab is internally named one thing and shown as another. Not recommended.

## Behaviour / acceptance criteria

1. Both parent + nanny hubs show "Children" as the tab label.
2. Tab id is `"children"` in TypeScript types + tab definition objects.
3. URL deep-links use `?t=children`.
4. Old `?t=education` URLs still land on the tab (treated as alias).
5. No leftover "Education" references in the rendered UI on either role's hub.
6. Nanny qualifications / credentials sections that legitimately reference "education history" remain unchanged.

## Edge cases

- **Nanny registration steps** (`StepEducation.tsx` if it exists, or sections in `StepQualifications.tsx`) — these refer to formal education history (school, university). DO NOT TOUCH.
- **Mock data / test fixtures** referencing `"education"` as a tab id should also be updated to `"children"` so tests don't break.
- **Analytics events** — if the tab name appears in analytics dispatches (e.g. `track('tab_view', { tab: 'education' })`), update to `'children'`. Note this in PR so analytics dashboards can be updated to handle both names during transition.

## Test scenarios

```
1. Parent navigates to hub → sees "Children" tab → clicks → tab content loads
2. Nanny navigates to hub → sees "Children" tab → clicks → tab content loads
3. Direct visit to /parent?t=education → tab renders correctly (back-compat)
4. Direct visit to /parent?t=children → tab renders correctly
5. No "Education" string appears in hub UI on either role
6. Nanny profile section showing formal education credentials still says "Education" (untouched)
```

## Notes for the implementing agent

- **Be surgical with the grep results.** "Education" appears in many contexts (nanny credentials, mock data, type unions). Distinguish tab-related from credential-related case-by-case.
- This is a small but high-touchpoint change. Recommend doing this BEFORE A-03 / A-04 (which modify other parts of the parent hub) so the rename diff doesn't tangle with those layout changes.

## Definition of done

- [ ] Tab labelled "Children" on both parent + nanny hubs
- [ ] Tab id renamed in TypeScript types
- [ ] URL param renamed (`?t=children`) with `?t=education` alias maintained
- [ ] No regressions in nanny qualifications/credentials sections
- [ ] All tests pass after grep-and-update of test fixtures
- [ ] `code-reviewer` + `typescript-reviewer` agents passed
- [ ] Manual smoke: navigate to tab from both roles + verify deep-link backwards compat
