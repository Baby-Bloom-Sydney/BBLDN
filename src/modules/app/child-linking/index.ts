// app/child-linking connector (01 §2.5). Reached from outside through `@/modules/app`, never deep — the parent's
// connector re-exports what the outside may use.
export type * from "./types";

// The binding and its boot hook.
export { childLinking } from "./lib/default-child-linking";
export { configureChildLinking } from "./lib/configure-child-linking";
export { createChildLinking } from "./lib/create-child-linking";

// The two stores the boot file chooses between (03 §11 row 4).
export { dbChildLinkingStore } from "./lib/db-child-linking-store";
export { memoryChildLinkingStore } from "./lib/memory-child-linking-store";

// The token rules — one alphabet, one shape, one normaliser, no second copy.
export { normaliseInviteToken } from "./lib/normalise-invite-token";
export { mintInviteToken } from "./lib/mint-invite-token";
export { inviteAuthorisation } from "./lib/invite-authorisation";

// The screens of 04 §6.1 / §6.2 and their server reads + actions (05 §7 rule 5 — route files stay thin).
export { InviteLandingPage } from "./components/InviteLandingPage";
export { ChildrenCard } from "./components/ChildrenCard";
export { AppGateNotice } from "./components/AppGateNotice";
export { loadInviteLanding } from "./lib/load-invite-landing";
export { loadChildrenCard } from "./lib/load-children-card";
export { inviteLandingView } from "./lib/invite-landing-view";
export { childrenCardView } from "./lib/children-card-view";
export { appAccessView } from "./lib/app-access-view";
export { claimInviteAction } from "./actions/claim-invite-action";
export { startInviteSignupAction } from "./actions/start-invite-signup-action";
export { createChildAction } from "./actions/create-child-action";
export { createChildInviteAction } from "./actions/create-child-invite-action";
export { revokeChildInviteAction } from "./actions/revoke-child-invite-action";

export type { AccessFacts, AppAccessView } from "./lib/app-access-view";
export type { ChildrenCardView } from "./lib/children-card-view";
export type { InviteLandingView } from "./lib/invite-landing-view";
