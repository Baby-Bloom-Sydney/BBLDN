> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# A-05 — Parents can edit their profile picture

**Complexity:** Small
**Touches:** Parent profile/settings + storage upload + RLS
**Status:** Ready to hand off

## Intent

Parents can upload + change their own profile picture. Currently they cannot.

## Why

Basic identity feature. Parents see their nanny's profile picture and may want to reciprocate the personal touch. Also: a profile picture surfaces in the active placement card, in conversation surfaces, and (eventually) on Katie + the family feed — the absence of one is a visible gap.

## Scope

**In scope:**
- A parent-facing surface for uploading + previewing + saving a profile picture
- Storage bucket policy (RLS) allowing a parent to write their own avatar
- Display of the parent's profile picture in surfaces that already render avatar slots

**Out of scope:**
- Child profile pictures (covered by A-06 — separate amendment, but builds on the same upload mechanism)
- Nanny profile picture editing (already exists — this amendment mirrors that pattern, doesn't change it)
- Image cropping / sophisticated editing tooling (basic upload + preview only for v1)

## Files affected

| File | What changes |
|------|--------------|
| _NEW_ `app/src/app/parent/account/settings/page.tsx` (or similar) | Parent settings page — host the profile picture editor |
| _NEW_ `app/src/components/parent/ProfilePictureEditor.tsx` | Upload + preview + save UX |
| `app/src/lib/actions/parent.ts` (or `parent-leads.ts`) | Add `updateParentProfilePicture(file)` server action |
| Storage bucket policy (Supabase) | Allow `INSERT` + `UPDATE` on parent's own avatar path |
| `parents` table | Verify column for avatar URL exists; if not, add one |

**Heads-up — verify before writing:**
- Look at how nannies upload their profile picture. There's probably a pattern in `app/src/app/nanny/profile/NannyMyProfile.tsx` or similar. **Mirror that pattern**, don't reinvent.
- The avatar URL might be on `parents.avatar_url`, `user_profiles.avatar_url`, or similar. Verify which column is the source of truth and use it consistently.
- Cross-system note: PAYMENTS will add `/parent/account/settings` (for the account-closure flow). Coordinate the settings page so this amendment + payments share the surface — recommend creating it here in A-05 so payments can extend it later.

## Behaviour / acceptance criteria

### Upload + preview

1. Parent navigates to `/parent/account/settings` (or wherever profile lives).
2. Sees current profile picture (or placeholder initial-circle if none).
3. Click avatar / "Change photo" button → file picker.
4. Selects image → preview shown immediately client-side.
5. Click "Save" → uploads to storage, updates DB, refreshes display.
6. Click "Cancel" → discards preview, no DB change.

### Constraints

7. **Allowed file types:** JPEG, PNG, WEBP. Reject others with clear message.
8. **Max file size:** 5MB. Reject larger with message.
9. **Image validation:** verify the uploaded file is actually an image (not a renamed file). Defense against MIME-spoofing.
10. **Aspect ratio:** square crop on display side (CSS `object-cover`). No client-side crop tool in v1.

### Storage path

11. Path: `avatars/parents/{parent_user_id}/{timestamp}.{ext}` (or whatever the existing nanny pattern uses — mirror it).
12. Old avatar is NOT auto-deleted on replacement (storage lifecycle rule can clean up later — out of scope for this amendment).

### RLS

13. Parent can `INSERT` + `UPDATE` only their own avatar path.
14. Parent CANNOT read other parents' avatars from storage directly (avatar URLs surface only via app-controlled queries).
15. Public read for the avatar IS allowed (it's surfaced to the connected nanny, on the placement card, etc.).

### Display

16. Profile picture renders in places already wired for it:
   - Parent's view of their own settings
   - Nanny's view of the connected parent (e.g. on placement card from the nanny side)
   - Anywhere `<UserAvatar>` is rendered for the parent
17. If no avatar set → fallback to initials avatar (existing pattern).

## Edge cases

- **Upload fails mid-way** (network drop, storage outage): clear error message, don't update DB column, parent retains old avatar.
- **DB update succeeds, storage write fails** (or vice-versa): use existing pattern from nanny upload — likely a transaction wrapping or a "upload first, then DB update" sequence with rollback path.
- **Parent has no avatar set:** placeholder initials, no broken-image icon.
- **Parent sets, then deletes (clears) avatar:** "Remove photo" button → sets URL to null in DB, falls back to initials.

## Test scenarios

```
1. Parent uploads valid JPEG → preview → save → display refreshed
2. Parent uploads 6MB file → rejected with size message
3. Parent uploads .exe renamed to .png → rejected (MIME validation)
4. Parent uploads, save fails mid-way → clear error, old avatar retained
5. Parent removes existing avatar → falls back to initials
6. Parent A tries to write to parent B's avatar path → RLS blocks
7. Profile picture surfaces in placement card (nanny side) after parent saves
8. Mobile upload from camera roll → works at 320 / 768 / 1024 widths
```

## Notes for the implementing agent

- **Mirror the nanny pattern.** Nannies already upload profile pictures somewhere. Read that code first — same patterns for storage path, RLS policy, server action signature, UI component shape.
- **Coordinate the settings page** with future payments work. PAYMENTS will add an account-closure surface to `/parent/account/settings`. Build the settings page generously so it can host both the avatar editor (A-05) AND the closure trigger (PAYMENTS). Use sectioned layout — "Profile" section + "Account" section + "Privacy" section, etc.
- `security-reviewer` agent on the storage policy + upload server action — file-upload is a classic XSS/RCE/SSRF surface.
- a11y-architect on the upload component — file picker, preview, error messaging all need keyboard + screen reader treatment.
- Use the existing `<UserAvatar>` component (`app/src/components/dashboard/UserAvatar.tsx`) as the display layer wherever possible — don't reinvent.

## Definition of done

- [ ] Parent settings page exists with a profile picture editor section
- [ ] Upload + preview + save + cancel + remove flows work
- [ ] File type + size + MIME validation enforced
- [ ] Storage RLS policies prevent cross-user writes
- [ ] Avatar surfaces in all places the existing UserAvatar pattern is rendered
- [ ] Visual regression at 320 / 768 / 1024 / 1440
- [ ] a11y verified (keyboard, screen reader, contrast on error messaging)
- [ ] `code-reviewer` + `typescript-reviewer` + `security-reviewer` + `a11y-architect` passed
- [ ] Manual smoke: upload from real iPhone camera roll → confirm display refresh
