// The connector object the parent `app` re-exports (01 §2.5 — sub-modules are reached through the parent).
import type { ChildLinkingReads } from "../types";
import { CHILD_LINKING_REGISTRY } from "./child-linking-registry";

export const childLinking: ChildLinkingReads = Object.freeze({
  linkedChildren: (familyId) =>
    CHILD_LINKING_REGISTRY.get().linkedChildren(familyId),
  youngestChildDateOfBirth: (familyId) =>
    CHILD_LINKING_REGISTRY.get().youngestChildDateOfBirth(familyId),
});
