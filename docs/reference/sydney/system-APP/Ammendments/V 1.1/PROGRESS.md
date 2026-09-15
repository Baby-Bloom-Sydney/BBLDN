> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# V 1.1 Progress

> Live tracker for the implementing agent. Update after each amendment lands.

**Started:** 2026-05-06
**Sequence:** Ships before PAYMENTS.

---

## Quick fixes

- [x] **A-01** — Welcome email variant for child-invite signups (shipped 2026-05-06)
  - Three templates extracted from inline HTML in auth/actions.ts: `welcome-parent.ts` + `welcome-nanny.ts` (verbatim) + new `welcome-invite-parent.ts` (per spec §3 — nanny + child name, Katie callout, child-feed CTA, no "find a nanny" CTA, deep-links to `/invite/{token}?auto=1`).
  - `lookupValidInvite` extended to surface inviter's first name + child's first name + child_client_id. CRITICAL fix mid-flight: the first attempt embedded `user_profiles` directly, but `child_invites.created_by_user_id` references `auth.users(id)` (no direct FK to `user_profiles`) so PostgREST silently dropped the embed. Switched to a two-step query (child_invites + child_client embed, then a separate user_profiles lookup keyed on created_by_user_id).
  - emailType strings: existing `welcome` preserved for back-compat with email_logs; new `welcome-invite-parent` distinguishes the variant for analytics.
  - Subject degrades gracefully when nannyFirstName is null (omits the name rather than printing "your nanny" merge-error wording).
  - Token URL-encoded in CTA href (defence-in-depth).
  - Shared `EmailTemplate` type extracted to `templates/types.ts`.
  - **Verification:** typecheck 0 · 667/667 tests pass · code-reviewer + typescript-reviewer ran in parallel twice; second pass approved.

- [x] **A-02** — Rename "Education" tab → "Children" (shipped 2026-05-06, nanny-platform `9884688`)
  - Tab id "education" → "children" in MainTabId / TabId unions, tab def objects, conditionals; URL deep-link `/${role}?t=children` in BAppLayout.
  - `TAB_ID_ALIASES` + `resolveTabAlias` in ParentHubClient maps old `?t=education` to "children" for back-compat — no redirect needed.
  - Added "children" to validTabs (closed a pre-existing gap: the old tab id wasn't in the resolved-tab fallthrough either).
  - New `isTabId` type predicate replaces the previous `as TabId` cast at the resolved-tab call site.
  - Doc-only updates in types/bapp.ts (file header) + nanny/page.tsx (comment).
  - Out of scope per spec: nanny qualifications/credentials code paths legitimately reference "Education" (school, university, certificates) — untouched. Data-prop name `educationChildren` kept (rename was tab-only).
  - **Verification:** typecheck 0 · 667/667 tests pass · code-reviewer + typescript-reviewer parallel; first round flagged 3 MEDIUM (file-header comment, alias return type, cast-after-guard) — all addressed.

- [x] **A-03** — Active nanny tile redesign (shipped 2026-05-06, nanny-platform `a10378e`)
  - Default variant rebuilt as a mobile-first vertical hero card: large centred avatar (h-28 sm:h-32, ring-4 ring-violet-50), full first name + last initial + age, suburb + Verified badge centred, 3-cell stats grid for Rate/Hours/Start (`grid-cols-1 sm:grid-cols-3` so embedded edit inputs get full width on 320px), View Profile button at bottom.
  - Truncation removed — `break-words` lets long names wrap.
  - Compact variant byte-for-byte unchanged (compactBody is the prior implementation, intentionally duplicated for variant isolation per spec hard-constraint).
  - a11y findings addressed pre-commit: text-slate-400 → text-slate-500 on Stat labels + last initial + age (WCAG AA on slate-50 / white); icon contrast fix on stat icons; min-w-0 per cell so inputs can shrink.
  - **Spec gap recorded:** position name, schedule summary, children covered are not in PlacementData. Spec's "out of scope: changing data the card receives" wins over the wishlist. Future follow-up if the data layer extends.
  - **Verification:** typecheck 0 · 667/667 tests pass · a11y-architect + code-reviewer + typescript-reviewer parallel.

- [x] **A-04** — Hide Browse Nannies tab on placement + inline link (shipped 2026-05-06, nanny-platform `27bc43e`)
  - PlacementCard: new `showBrowseNanniesLink` prop renders a small inline "see all nannies" link under View Profile (default variant only).
  - ParentHubClient: dropped "nannies" from the placement-true subTabs branch. Placement-null branch unchanged.
  - PositionPageClient: wires `showBrowseNanniesLink` at the existing render site (card only mounts inside `{placement && ...}` so the link appears exactly when the tab is hidden).
  - Code-reviewer HIGH addressed: init-time guard suppresses `?s=nannies` when placement is active so stale bookmarks can't mount the keep-alive BrowseNanniesTab; defensive `!placement` companion guard on the keep-alive render block.
  - a11y-architect HIGH addressed: persistent underline on the inline link (WCAG 1.4.1) + py-2 padding so the touch target clears WCAG 2.5.8.
  - **Verification:** typecheck 0 · 667/667 tests pass · code-reviewer + a11y-architect + typescript-reviewer parallel.

- [x] **A-05** — Parent profile picture editing (shipped 2026-05-06, nanny-platform `a181ffc`)
  - Click-to-edit pattern: tap the hero avatar in ParentHubClient → small dialog with Add/Replace + Remove actions. NO dedicated settings page (per user clarification — entry point is the avatar itself, not a separate page).
  - Mirrors the existing nanny upload mechanism: same `uploadFile("profile-pictures", userId, file)` helper, same 5MB / image-MIME limits, same bucket. Only the entry point differs.
  - New server action `updateParentProfilePictureUrl` validates the URL: must be on our Supabase Storage origin, in `profile-pictures` bucket, in the caller's own UUID folder. Length-capped at 2048 chars, parsed via `new URL()` so `..` traversal is normalised before the check.
  - Security hardenings: explicit MIME allowlist (excludes SVG); orphan cleanup if DB write fails after upload; replace-cleanup deletes the previous blob so the bucket doesn't grow unbounded.
  - a11y: aria-label personalised with first name; camera-icon overlay scrim bumped to clear WCAG 1.4.11; error alert keyed by message text for re-announce reliability.
  - **Verification:** typecheck 0 · 677/677 tests pass · security-reviewer + a11y-architect + code-reviewer + typescript-reviewer parallel; HIGH/MED findings closed.
  - Latent bug noted out-of-scope: `lib/supabase/storage.ts:85` `uploadFileWithProgress` builds a private-object URL for public buckets. Flagged for a separate follow-up.

## Medium

- [x] **A-06** — Child profile picture editing (shipped 2026-05-06, nanny-platform `fc45329`)
  - Click-to-edit on the BB-app child-feed hero. Either the linked parent or the linked nanny can add/replace/remove the child's avatar.
  - New `child_client.profile_picture_url` column (migration A-06-child-profile-picture-column.sql; idempotent IF NOT EXISTS, no RLS changes).
  - New server action `updateChildProfilePictureUrl(childId, url|null)`. Authorisation gate: caller must be parent_user_id OR nanny_user_id of the child. URL validator binds to caller's own storage folder (each role can only persist URLs they uploaded themselves), length-capped at 2048, parsed via `new URL()` for path-traversal normalisation. UUID-format guard on childClientId before the DB query.
  - New `ChildAvatarEditor` component (mirrors A-05 ParentAvatarEditor; emerald palette, h-20 w-20 sized for the BB-app hero).
  - Pre-commit fixes from parallel review: handleRemove now closes dialog + refreshes immediately after DB success (cleanup runs fire-and-forget) on BOTH editors; aria-label disambiguator for sibling children with no first name; explicit width/height on avatar `<img>` for CLS.
  - **Spec-noted out-of-scope:** orphaned blobs in the OTHER role's folder when one role replaces the other's avatar. Storage RLS prevents cross-user delete, and the cost is bounded — accepted with a note for a future storage-lifecycle cleanup job.
  - **Verification:** typecheck 0 · 687/687 tests pass · security-reviewer + code-reviewer + a11y-architect + typescript-reviewer parallel; HIGH/MED findings closed.
  - **Polish from earlier feedback (commit `089e459`):** dropped DialogDescription on the parent editor — title-only header per user request.
  - **Operator hand-off:** apply `system/APP/Ammendments/V 1.1/migration/A-06-child-profile-picture-column.sql` to live Supabase before smoke testing.

## Medium (specced + ready)

- [x] **A-07** — Top-tab Katie / BabyBloom split (shipped 2026-05-06, nanny-platform `bf2ea98`)
  - New `KatieTabs` component renders a two-tab strip at the top of the carousel viewport (xl:hidden). Active tab head colour matches the body below it (Chrome-tab merge); inactive recessed.
  - New design tokens: `--color-katie-bg-beige` (HSL `38 40% 96%`, ≈ `oklch(96% 0.02 80)` from spec) + `--color-katie-bg-beige-muted` for inactive head. Bailey-confirmed values in this session.
  - Beige applied to Katie aside on BOTH mobile AND desktop (per Bailey's confirmation). Main deck unchanged.
  - Removed `KatieSwapButton` (deleted) + `DashboardNav` import + `KatieHeader` hamburger (was swap-only). Wordmark preserved.
  - ARIA: tablist + role=tab + aria-selected + roving tabindex + aria-controls/labelledby linkage to tabpanels (aside + main wrapper). Keyboard nav: Arrow swaps + moves focus, Home/End jump to ends. Automatic Activation per WAI-ARIA APG (annotated).
  - Unread proactive-message badge migrated from the old swap icon to the Katie tab head with sr-only count + plural agreement.
  - Layout contract pre-empts the iOS Safari `h-dvh` clipping bug class: outer container `h-dvh` on narrow / `min-h-dvh` on desktop; inner row `flex-1 min-h-0`; aside `h-full` on narrow / `xl:h-dvh` on desktop.
  - **Verification:** typecheck 0 · 701/701 tests pass (added 14) · a11y-architect + code-reviewer + typescript-reviewer parallel; HIGH/MED findings closed before commit.
  - Future work deferred per spec: tab-tap animation polish (sliding indicator, chrome-tab shape morph), tab swipe-drag.

- [ ] **A-08** — Katie-guided add-child onboarding (populate the feed)
  - Status: DRAFT — architectural framing locked, UX choices in discussion with Bailey
  - Spec: `A-08-katie-guided-onboarding.md`
  - Sequence: AFTER A-07 lands (A-08 wrap-step copy references the new top-tab UI)
  - Notes:

---

## Decisions made during implementation

Format:
```
**YYYY-MM-DD — [Amendment ID] [topic]**
- Decision:
- Why:
- Trade-off:
```

_(empty)_

---

## Issues / blockers

Format:
```
**YYYY-MM-DD — [issue]**
- Status: open / waiting on Bailey / resolved
- Need:
```

_(empty)_
