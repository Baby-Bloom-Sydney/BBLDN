// The connector object the parent `app` re-exports (01 §2.5 — sub-modules are reached through the parent).
// Every method resolves the registry **per call**, so a boot that runs after a module was first imported still
// takes effect, and an unconfigured binding refuses rather than succeeding emptily.
import type { ChildLinking } from "../types";
import { CHILD_LINKING_REGISTRY } from "./child-linking-registry";

export const childLinking: ChildLinking = Object.freeze({
  linkedChildren: (familyId) =>
    CHILD_LINKING_REGISTRY.get().linkedChildren(familyId),
  youngestChildDateOfBirth: (familyId) =>
    CHILD_LINKING_REGISTRY.get().youngestChildDateOfBirth(familyId),
  childrenOfFamily: (familyId) =>
    CHILD_LINKING_REGISTRY.get().childrenOfFamily(familyId),
  appLinkFacts: (familyId) =>
    CHILD_LINKING_REGISTRY.get().appLinkFacts(familyId),
  invitePreview: (token) => CHILD_LINKING_REGISTRY.get().invitePreview(token),
  pendingInvites: (userId) =>
    CHILD_LINKING_REGISTRY.get().pendingInvites(userId),
  invitesForChild: (childId, actor) =>
    CHILD_LINKING_REGISTRY.get().invitesForChild(childId, actor),
  createChild: (input, actor) =>
    CHILD_LINKING_REGISTRY.get().createChild(input, actor),
  createInvite: (childId, direction, actor) =>
    CHILD_LINKING_REGISTRY.get().createInvite(childId, direction, actor),
  revokeInvite: (inviteId, reason, actor) =>
    CHILD_LINKING_REGISTRY.get().revokeInvite(inviteId, reason, actor),
  claimInvite: (token, actor) =>
    CHILD_LINKING_REGISTRY.get().claimInvite(token, actor),
});
