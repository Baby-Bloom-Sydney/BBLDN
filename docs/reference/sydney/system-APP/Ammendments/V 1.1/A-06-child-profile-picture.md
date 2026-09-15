> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# A-06 — Child profile picture editable by nanny + parent

**Complexity:** Medium
**Touches:** Child entity, storage, RLS, two surfaces (nanny + parent), shared upload component
**Status:** Ready to hand off (sequence after A-05)

## Intent

Both the connected nanny AND the parent of a child entity can upload + change that child's profile picture.

## Why

Currently the child entity has no visual identity. Profile pictures personalise the BB-app experience, surface in the daily feed, on tiles, in Katie conversations. Either party (parent or nanny) might be the one with a good photo on hand — both should be able to upload.

## Scope

**In scope:**
- A new "Edit photo" surface on the child entity, accessible from both nanny and parent sides
- Storage bucket policy allowing both connected users to write to the same child avatar path
- Display of the child's profile picture in surfaces that already render child avatar slots (placement card, child cards, BB-app feed, etc.)
- Audit trail: log who uploaded each photo + when (so we can reason about who changed it last)

**Out of scope:**
- Approval flow ("nanny uploaded; parent must approve") — both have equal write rights in v1
- Image cropping / sophisticated editing tooling
- Multiple photos / gallery (one current photo only in v1)

## Files affected

| File | What changes |
|------|--------------|
| `app/src/components/bapp/ChildManagementCard.tsx` | Add "Edit photo" affordance |
| `app/src/components/bapp/AddChildSheet.tsx` + `AddChildSheetParent.tsx` | Add upload step in the create-child flow (optional — can skip and add later) |
| _NEW_ shared component (e.g. `app/src/components/bapp/ChildPhotoEditor.tsx`) | Upload + preview + save UX, used from both nanny and parent surfaces |
| `app/src/lib/actions/bapp/` (new file or existing) | Add `updateChildProfilePicture(childId, file)` server action |
| Storage bucket policy (Supabase) | Allow `INSERT` + `UPDATE` on child's avatar path by either connected user |
| `child_client` table | Verify column for avatar URL exists; if not, add one |
| `activity_logs` | Log each photo update with `action_type = 'child_photo_updated'` |

**Reuse heavily from A-05** — the upload component, file validation, storage path conventions should mirror the parent profile picture work. Recommend extracting a shared `<PhotoUploadSurface>` component during A-05 implementation that A-06 can consume.

## Behaviour / acceptance criteria

### Permissions

1. **Connected nanny** of the child can upload + change.
2. **Parent** linked to the child can upload + change.
3. **Either party** sees the same "Edit photo" affordance on their respective child management surfaces.
4. **Other users** (unconnected nannies, other parents) cannot read or write — RLS enforced server-side.

### Upload + preview

5. Same UX pattern as A-05: tap avatar → file picker → preview → save / cancel.
6. Same file constraints: JPEG/PNG/WEBP, 5MB max, MIME validation.

### Audit

7. Each upload writes an `activity_logs` row: `action_type = 'child_photo_updated'`, `actor_user_id = uploader`, `subject_child_id = childId`.
8. Both parties can see WHO uploaded the current photo (subtle UI hint: "Photo by [name] · [time ago]").

### Storage path

9. Path: `avatars/children/{child_id}/{timestamp}.{ext}`.
10. Old photos NOT auto-deleted on replacement (storage lifecycle handles cleanup later).

### Display

11. Child profile picture renders in:
    - Child management cards (both nanny + parent side)
    - BB-app feed entries that reference the child
    - Add-child preview / confirmation
    - Anywhere `<ChildAvatar>` (or whatever pattern) is rendered

## Edge cases

- **Concurrent uploads** (parent + nanny upload at the same time): last-write-wins. The audit log records both, so it's recoverable + the displayed photo is whoever wrote last.
- **Child has no parent connected yet** (just nanny + invite-pending): nanny can still upload. When parent claims invite, they see the photo nanny uploaded.
- **Child unlinked from one party** (e.g. parent ends placement): the remaining party retains write access via their connection. The departed party loses access.
- **Photo deleted by one party:** falls back to initials. Other party can re-upload.

## Test scenarios

```
1. Connected nanny uploads photo → photo displays on parent's child card
2. Parent uploads photo → photo displays on nanny's child card
3. Both parties see "Photo by [name]" attribution
4. Unconnected nanny tries to upload via API → RLS blocks
5. Other parent tries to upload via API → RLS blocks
6. Concurrent uploads → last-write-wins, both logged in activity_logs
7. Photo upload during AddChildSheet → child created with photo in one flow
8. Photo upload after child exists → updates correctly
9. Mobile upload from camera roll on both nanny + parent device → works
```

## Notes for the implementing agent

- **Sequence after A-05.** A-05 creates the upload pattern + shared component. A-06 should consume that, not duplicate.
- **Permissions are the trickiest part.** RLS needs to allow EITHER the connected nanny OR the linked parent — but no one else. Use a SECURITY DEFINER function or a careful policy clause. Verify with `security-reviewer`.
- **Audit is non-trivially valuable.** Without "Photo by [name]" attribution, the surface feels like a black box. Include the attribution in v1.
- The existing `<UserAvatar>` pattern is for users (parents/nannies). Children may need a separate `<ChildAvatar>` component (or a shared component with a `kind='child'` prop). Read the existing pattern + decide.
- `database-reviewer` on the RLS policy.
- a11y-architect on the upload component.

## Definition of done

- [ ] Nanny + parent can both upload child photos
- [ ] RLS blocks unconnected users from reading or writing
- [ ] Photo displays on all existing child-avatar surfaces
- [ ] Attribution ("Photo by [name]") shown on edit surface
- [ ] Activity log captures every upload
- [ ] File validation (type, size, MIME) enforced
- [ ] All test scenarios pass
- [ ] Visual regression captured
- [ ] `code-reviewer` + `typescript-reviewer` + `security-reviewer` + `database-reviewer` + `a11y-architect` passed
- [ ] Manual smoke from BOTH nanny + parent device on the same child
