// Who a `createChild` call writes the row **for**, resolved from the verified actor and never from input
// (02 §4.6; 04 §3 row 22 and §4.4 c1). Two shapes, because `children` has two legitimate births:
//
//   family    — a parent adds her own child. `parent_user_id` is hers, and so is the creator column.
//   unclaimed — a nanny adds a family she already works for (S-N-01). `parent_user_id` stays `null` until that
//               family claims the token she passes them, and the creator column is what `0019`'s fourth arm of
//               `user_has_child_access()` reads to let her see the row at all.
//
// An admin acts **on behalf of a named person or not at all** (03 §2.5; the rule `invite-authorisation.ts`
// carries for the mint and the revoke): an admin session with no `onBehalfOf` creates nothing, because a child
// row with no traceable author is one nobody can answer a support call about.
import type { Actor } from "@/modules/shared-types";

export type ChildCreator =
  | {
      readonly kind: "family";
      readonly parentUserId: string;
      readonly creatorUserId: string;
    }
  | { readonly kind: "unclaimed"; readonly creatorUserId: string };

const forRole = (role: string, id: string): ChildCreator | null => {
  if (role === "parent")
    return { kind: "family", parentUserId: id, creatorUserId: id };
  if (role === "nanny") return { kind: "unclaimed", creatorUserId: id };
  return null;
};

export function childCreatorOf(actor: Actor): ChildCreator | null {
  if (actor.kind === "user") return forRole(actor.role, actor.id as string);
  if (actor.kind === "admin" && actor.onBehalfOf !== undefined)
    return forRole(actor.onBehalfOf.role, actor.onBehalfOf.id as string);
  return null;
}
