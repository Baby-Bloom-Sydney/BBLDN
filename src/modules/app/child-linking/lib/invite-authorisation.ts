// Who may mint and who may revoke a child invite — pure, and the **only** place either question is answered.
//
// ★ It carries more weight than it looks like it should — though less than it did. 07 §5.2 says links and
// invites are written only by definer RPCs; `0012` shipped RPCs for the claim and the unlinks and none for the
// mint or the revoke, so for a while this file *was* the authorisation. `0019` added `create_child_invite` /
// `revoke_child_invite` as SECURITY DEFINER functions asserting the same two rules under the caller's own
// session, so this is now the belt and Postgres the braces. Both must say the same thing: a rule that moves
// here and not there is a rule with two answers.
//
// The rules, from 04 §4.4 c1 (a nanny adds an existing client and passes a token to that family), 04 §3 row 22
// (the parent invites her nanny), and 04 §6.4 S-A-11 (`09.28`, the matchmaker does either on behalf):
//
//   parent_to_nanny  — the child's own parent, or an admin. A linked nanny may **not** mint one: she would be
//                      choosing the next nanny for a family that is not hers.
//   nanny_to_parent  — a nanny, for a child that has no parent yet (the one she created). Once a family has
//                      claimed the child there is nobody left to invite on that side.
//   revoke           — whoever created the row, or an admin. Revoking is the only invalidation path there is
//                      (memory: token stability), so it must not be reachable by the other party.
//
// ★ THE CONTRADICTION `1i` STOPPED ON IS CLOSED (`2g`; kickoff debt 8). 04 §4.4 c1 has a nanny create a child
// for an existing client and mint a `nanny_to_parent` token to pass to that family. `1i` could not authorise
// it: `children` had no creator column and `user_has_child_access` admitted only the parent, an **actively
// linked** nanny, or an admin, so a nanny could not read back the row she had just inserted, let alone prove
// it was hers. `0019` landed all three halves — `children.created_by_user_id` (stamped by
// `children_stamp_creator` from the session, never trusted from the caller), the fourth arm of
// `user_has_child_access()` for the creator of an **unclaimed** child, and `create_child_invite()`'s own
// `created_by_user_id = v_actor` branch. So `ChildFacts` carries the creator and `mayMint` reads it, which is
// this file saying in TypeScript exactly what the definer says in SQL.
//
// The narrowness is copied from `0019` deliberately: the creator arm **closes the moment `parent_user_id` is
// set**. From then on the child belongs to a family, and its creator needs an active `child_client` link like
// any other nanny — otherwise whoever first typed a child's name would hold a permanent road into that
// family's record.
import type { Actor, UserId } from "@/modules/shared-types";
import type { InviteDirection } from "../types";

type ChildFacts = {
  readonly parentUserId: UserId | null;
  /** `children.created_by_user_id` (`0019`). `null` for any row written before it, which authorises nobody. */
  readonly createdByUserId: UserId | null;
  readonly linkedNannyUserIds: ReadonlyArray<UserId>;
};

const userId = (actor: Actor): string | null =>
  actor.kind === "user"
    ? (actor.id as string)
    : actor.kind === "admin"
      ? ((actor.onBehalfOf?.id as string | undefined) ?? null)
      : null;

export const inviteAuthorisation = Object.freeze({
  mayMint: (
    actor: Actor,
    direction: InviteDirection,
    child: ChildFacts,
  ): boolean => {
    // ★ An admin acts **on behalf of a named person or not at all** (03 §2.5's actor rule; security review M1).
    // The first draft returned `true` for any admin, which minted a row whose `created_by_user_id` was `null` —
    // a live share link for somebody's child that could never be traced to a person and that only another admin
    // could revoke. `createChild` and `claimInvite` already required `onBehalfOf`; these two now do too.
    if (actor.kind === "admin") return actor.onBehalfOf !== undefined;
    if (actor.kind !== "user") return false;
    const id = userId(actor);
    if (id === null) return false;
    if (direction === "parent_to_nanny")
      return actor.role === "parent" && child.parentUserId === id;
    return (
      actor.role === "nanny" &&
      child.parentUserId === null &&
      (child.createdByUserId === (id as UserId) ||
        child.linkedNannyUserIds.includes(id as UserId))
    );
  },
  mayRevoke: (actor: Actor, createdByUserId: UserId | null): boolean => {
    if (actor.kind === "admin") return actor.onBehalfOf !== undefined;
    if (actor.kind !== "user" || createdByUserId === null) return false;
    return userId(actor) === (createdByUserId as string);
  },
});
