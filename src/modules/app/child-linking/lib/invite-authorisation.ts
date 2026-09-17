// Who may mint and who may revoke a child invite — pure, and the **only** place either question is answered.
//
// ★ It carries more weight than it looks like it should. 07 §5.2 says links and invites are written only by
// definer RPCs, and `0012` ships RPCs for the claim and the unlinks but **none for the mint or the revoke**;
// `child_invites` therefore has a SELECT policy and no client INSERT or UPDATE at all, and this module writes
// those two through the service scope. That makes this file the authorisation — there is no second check in
// SQL behind it. A `0019` should add `create_child_invite` / `revoke_child_invite` as SECURITY DEFINER
// functions asserting the same two rules, at which point this becomes the belt and Postgres the braces. Until
// then it is pinned by test and the store's header names the functions owed.
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
// ★ CONTRADICTION, stopped on rather than guessed (model-marking rule). 04 §4.4 c1 has a nanny create a child
// for an existing client and mint a `nanny_to_parent` token to pass to that family — but `children` has no
// creator column, and `user_has_child_access` admits only the parent, an **actively linked** nanny, or an
// admin. A nanny therefore cannot read back the child she just created, let alone mint an invite for it: there
// is nothing in the schema that says the row is hers. So `nanny_to_parent` is authorised here for a linked
// nanny or an admin, the unlinked-creator path is pinned `it.fails`, and the owner is 02 §4.6 (`children` wants
// a `created_by_user_id`, or `user_has_child_access` wants a fourth arm). Path E still runs end to end from the
// admin's side (S-A-11, `09.28`) and from a linked nanny's, which is what `1i` needed of it.
import type { Actor, UserId } from "@/modules/shared-types";
import type { InviteDirection } from "../types";

type ChildFacts = {
  readonly parentUserId: UserId | null;
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
    if (actor.kind === "admin") return true;
    if (actor.kind !== "user") return false;
    const id = userId(actor);
    if (id === null) return false;
    if (direction === "parent_to_nanny")
      return actor.role === "parent" && child.parentUserId === id;
    return (
      actor.role === "nanny" &&
      child.parentUserId === null &&
      child.linkedNannyUserIds.includes(id as UserId)
    );
  },
  mayRevoke: (actor: Actor, createdByUserId: UserId | null): boolean => {
    if (actor.kind === "admin") return true;
    if (actor.kind !== "user" || createdByUserId === null) return false;
    return userId(actor) === (createdByUserId as string);
  },
});
