// `app/child-linking`'s inside (01 §2.5): the method groups composed over one store and one set of ports. The
// shape is `payments`' — small groups, each in its own file, each testable without a driver — because the rules
// that decide anything here are pure and the two that are not (the store, the two injected ports) are seams.
import type { ChildLinking } from "../types";
import type { ChildLinkingDeps } from "./child-linking-deps";
import { childMethods } from "./child-methods";
import { claimInviteMethod } from "./claim-invite-method";
import { inviteMethods } from "./invite-methods";
import { readMethods } from "./read-methods";

export function createChildLinking(deps: ChildLinkingDeps): ChildLinking {
  return Object.freeze({
    ...readMethods(deps),
    ...childMethods(deps),
    ...inviteMethods(deps),
    ...claimInviteMethod(deps),
  });
}
