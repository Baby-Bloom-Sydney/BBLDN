// A `FamilyId` **is** the parent's user id — 02 §4.5 keys `parent_subscriptions` on `parent_user_id`, and 03
// §5.2 names the same value `FamilyId` on every purchase method. The two brands never cross implicitly, which is
// the point of `Brand`; this is the one place the identity is asserted, with the document that makes it true, so
// a `as unknown as` never appears at a call site and a future split of the two ids has exactly one file to change.
import type { FamilyId, Uuid } from "@/modules/shared-types";

export function familyUuid(familyId: FamilyId): Uuid {
  return familyId as string as Uuid;
}
