// The `Actor` every lever on S-A-04 is called with.
//
// It is **not** a credential and this file does not pretend otherwise. `admin-on-behalf`'s gate builds the real
// actor from `auth.requireRole('admin')` — which also requires `aal2` (07 §5.4 rows 1–2) — and reads this object
// for one field only: `onBehalfOf`, the party the admin is acting for, which 07 §5.4 row 6 requires on every
// on-behalf write. The `id` here is a placeholder the gate discards (FIX-1; REVIEW-1 C-1).
import type { Actor, AdminId, UserId } from "@/modules/shared-types";

export function onBehalfOfParent(parentId: UserId): Actor {
  return Object.freeze({
    kind: "admin",
    id: "session" as AdminId,
    onBehalfOf: { role: "parent" as const, id: parentId },
  });
}
